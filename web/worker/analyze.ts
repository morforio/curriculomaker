import {
  analysisSchema,
  analyzeRequestSchema,
  type Analysis,
  type AnalyzeRequest,
  type ApiErrorCode,
  type Lang,
} from '../src/lib/schemas/analysis.ts'
import { createProvider, DEFAULT_MODEL, LLMError, type LLMProvider } from './llm.ts'
import { buildUserPrompt, SYSTEM_PROMPT } from './prompt.ts'

export type RateLimiter = { check(ipKey: string): Promise<'ok' | 'ip' | 'daily'> }

export type AnalyzeDeps = {
  env: { LLM_API_KEY?: string; LLM_BASE_URL?: string; LLM_MODEL?: string }
  ip: string
  limiter: RateLimiter
  /** Só para testes. */
  provider?: LLMProvider
}

const MAX_BODY_CHARS = 80_000

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

function fail(status: number, error: ApiErrorCode, message: string): Response {
  return json(status, { error, message })
}

async function hashIp(ip: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip))
  return [...new Uint8Array(buf)]
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Extrai o objeto JSON de uma resposta que pode vir com cercas de markdown ou texto em volta. */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, '')
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('sem objeto JSON')
  return JSON.parse(cleaned.slice(start, end + 1))
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** A evidência precisa existir no currículo enviado (citação literal, tolerando pequenas variações). */
export function evidenceInResume(evidence: string, resumeNorm: string): boolean {
  const ev = normalize(evidence)
  if (!ev) return false
  if (resumeNorm.includes(ev)) return true
  const tokens = [...new Set(ev.split(' '))]
  if (tokens.length < 3) return false
  const words = new Set(resumeNorm.split(' '))
  return tokens.filter((t) => words.has(t)).length / tokens.length >= 0.8
}

/** Regras que não dependem do modelo: idiomas pedidos, habilidades sem duplicata e evidência verificada. */
export function postProcess(raw: Analysis, req: AnalyzeRequest): { analysis: Analysis; downgraded: number } {
  const resumeNorm = normalize(req.resumeText)
  let downgraded = 0
  const seen = new Set<string>()
  const skills: Analysis['skills'] = []
  for (const s of raw.skills) {
    const key = normalize(s.name)
    if (!key || seen.has(key)) continue
    seen.add(key)
    if (s.status !== 'missing' && !(s.evidence && evidenceInResume(s.evidence, resumeNorm))) {
      downgraded++
      skills.push({ ...s, status: 'missing', evidence: undefined })
    } else {
      skills.push(s.status === 'missing' ? { ...s, evidence: undefined } : s)
    }
  }
  const suggested: Analysis['summary']['suggested'] = { pt: undefined, en: undefined }
  for (const lang of req.languages) suggested[lang] = raw.summary.suggested[lang]
  return { analysis: { ...raw, skills, summary: { ...raw.summary, suggested } }, downgraded }
}

function missingLanguages(a: Analysis, languages: Lang[]): Lang[] {
  return languages.filter((l) => !a.summary.suggested[l])
}

export async function handleAnalyze(request: Request, deps: AnalyzeDeps): Promise<Response> {
  if (request.method !== 'POST') return fail(405, 'invalid_request', 'Use POST.')

  const origin = request.headers.get('Origin')
  if (origin && origin !== new URL(request.url).origin) return fail(403, 'forbidden_origin', 'Origem não permitida.')

  const bodyText = await request.text()
  if (bodyText.length > MAX_BODY_CHARS) return fail(400, 'invalid_request', 'Requisição grande demais.')
  let parsedBody: unknown
  try {
    parsedBody = JSON.parse(bodyText)
  } catch {
    return fail(400, 'invalid_request', 'JSON inválido.')
  }
  const parsed = analyzeRequestSchema.safeParse(parsedBody)
  if (!parsed.success) return fail(400, 'invalid_request', 'Dados inválidos (texto da vaga, currículo ou idiomas).')
  const req = parsed.data

  if (!deps.provider && !deps.env.LLM_API_KEY) return fail(503, 'not_configured', 'O serviço de IA não está configurado.')

  const verdict = await deps.limiter.check(await hashIp(deps.ip))
  if (verdict === 'ip') return fail(429, 'rate_limited_ip', 'Limite de análises por hora atingido.')
  if (verdict === 'daily') return fail(429, 'rate_limited_daily', 'O limite diário de análises do serviço foi atingido.')

  const provider = deps.provider ?? createProvider(deps.env)
  const user = buildUserPrompt(req)
  let lastProblem = ''

  for (let attempt = 0; attempt < 2; attempt++) {
    let text: string
    try {
      text = await provider.complete({
        system: SYSTEM_PROMPT,
        user: attempt === 0 ? user : `${user}\n\nYour previous reply was invalid (${lastProblem}). Reply again with ONLY the JSON object, following the shape exactly.`,
      })
    } catch (e) {
      if (e instanceof LLMError && e.kind === 'empty') {
        lastProblem = 'empty reply'
        continue
      }
      return fail(502, 'llm_unavailable', 'O serviço de IA está indisponível no momento.')
    }

    let candidate: unknown
    try {
      candidate = extractJson(text)
    } catch {
      lastProblem = 'not valid JSON'
      continue
    }
    const checked = analysisSchema.safeParse(candidate)
    if (!checked.success) {
      lastProblem = `schema error at ${checked.error.issues[0]?.path.join('.') || 'root'}`
      continue
    }
    const absent = missingLanguages(checked.data, req.languages)
    if (absent.length > 0) {
      lastProblem = `missing suggested summary for: ${absent.join(', ')}`
      continue
    }

    const { analysis, downgraded } = postProcess(checked.data, req)
    return json(200, { analysis, meta: { model: deps.env.LLM_MODEL || DEFAULT_MODEL, downgraded } })
  }

  console.error(`Resposta do LLM rejeitada após 2 tentativas: ${lastProblem}`)
  return fail(502, 'bad_llm_output', 'A IA devolveu uma resposta fora do formato. Tente novamente.')
}
