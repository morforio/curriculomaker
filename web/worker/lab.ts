import { createVerifier, JevError, type JevEnv, type JevQuestion, type Verifier } from './jev.ts'
import { createProvider, LLMError, type LLMEnv, type LLMProvider } from './llm.ts'

/**
 * TEMPORÁRIO: laboratório de prompts. Roda um prompt qualquer no mesmo provedor de LLM da produção (kind "llm", o padrão) ou faz perguntas
 * ao Jev (kind "jev"), usando os segredos LLM_API_KEY e TYPESAFE_API_KEY (que só o Worker enxerga), para comparar versões do prompt e testar
 * perguntas de conferência. Não é parte do produto e será REMOVIDO.
 *
 * Proteções: exige o cabeçalho x-lab-token (aqui só vai o hash SHA-256 do token; o token em si não está no repositório) e deixa de
 * responder sozinho depois de LAB_EXPIRA_EM. Nunca devolve as chaves: só o texto do modelo ou as respostas do Jev.
 */
export const LAB_TOKEN_SHA256 = '2ec8d00fbad36fb3606613b2f86e72e10b60c432a7ae6d790a441e4401d03d3d'
/** 21/10/2026 11:23 (GMT-3). */
export const LAB_EXPIRA_EM = 1792592586128

const MAX_SYSTEM = 30_000
const MAX_USER = 60_000
const MAX_JEV_STATE = 60_000
const MAX_JEV_QUESTIONS = 6

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Comparação em tempo constante (mesmo tamanho: os dois são hex de 64 caracteres). */
function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export type LabDeps = {
  env: LLMEnv & JevEnv
  now?: number
  /** Só para testes. */
  provider?: (env: LLMEnv) => LLMProvider
  /** Só para testes. */
  verifier?: (env: JevEnv) => Verifier
  /** Só para testes: hash do token aceito (o padrão é LAB_TOKEN_SHA256). */
  tokenSha256?: string
}

/** Perguntas do Jev vindas do cliente: só o formato que o cliente do Jev entende, com limites de tamanho. */
function lerPerguntas(raw: unknown): Record<string, JevQuestion> | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const entradas = Object.entries(raw as Record<string, unknown>)
  if (entradas.length === 0 || entradas.length > MAX_JEV_QUESTIONS) return null
  const out: Record<string, JevQuestion> = {}
  for (const [id, q] of entradas) {
    const x = q as { type?: unknown; instructions?: unknown; criteria?: unknown } | null
    if (!x || typeof x.instructions !== 'string' || x.instructions.length === 0 || x.instructions.length > 4000) return null
    if (x.type === 'noul') {
      const c = x.criteria as { true?: unknown; false?: unknown } | undefined
      out[id] = { type: 'noul', instructions: x.instructions, ...(c && (typeof c.true === 'string' || typeof c.false === 'string') ? { criteria: { true: typeof c.true === 'string' ? c.true : undefined, false: typeof c.false === 'string' ? c.false : undefined } } : {}) }
    } else if (x.type === 'score' && Array.isArray(x.criteria) && x.criteria.length > 0 && x.criteria.length <= 8 && x.criteria.every((s) => typeof s === 'string')) {
      out[id] = { type: 'score', instructions: x.instructions, criteria: x.criteria as string[] }
    } else return null
  }
  return out
}

export async function handleLab(request: Request, deps: LabDeps): Promise<Response> {
  // Depois da data, a rota some (404, como qualquer rota que não existe).
  if ((deps.now ?? Date.now()) > LAB_EXPIRA_EM) return json(404, { error: 'not_found' })
  if (request.method !== 'POST') return json(405, { error: 'invalid_request' })

  const token = request.headers.get('x-lab-token') ?? ''
  if (!iguais(await sha256Hex(token), deps.tokenSha256 ?? LAB_TOKEN_SHA256)) return json(401, { error: 'unauthorized' })

  let body: { kind?: unknown; system?: unknown; user?: unknown; effort?: unknown; maxTokens?: unknown; state?: unknown; questions?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return json(400, { error: 'invalid_request' })
  }

  if (body.kind === 'jev') {
    const questions = lerPerguntas(body.questions)
    const state = body.state
    if (!questions || typeof state !== 'object' || state === null || JSON.stringify(state).length > MAX_JEV_STATE) return json(400, { error: 'invalid_request' })
    try {
      const answers = await (deps.verifier ?? createVerifier)(deps.env).ask(state, questions)
      return json(200, { answers })
    } catch (e) {
      return json(502, { error: e instanceof JevError ? 'jev_unavailable' : 'unavailable' })
    }
  }

  const { system, user } = body
  if (typeof system !== 'string' || typeof user !== 'string' || !system || !user || system.length > MAX_SYSTEM || user.length > MAX_USER) {
    return json(400, { error: 'invalid_request' })
  }
  const effort = typeof body.effort === 'string' && ['low', 'medium', 'high'].includes(body.effort) ? body.effort : undefined
  const maxTokens = typeof body.maxTokens === 'number' && body.maxTokens > 0 && body.maxTokens <= 8000 ? body.maxTokens : undefined

  const provider = (deps.provider ?? createProvider)({ ...deps.env, LLM_REASONING_EFFORT: effort ?? deps.env.LLM_REASONING_EFFORT })
  try {
    const text = await provider.complete({ system, user, maxTokens })
    return json(200, { text, fallback: provider.fallbackUsed?.() ?? false })
  } catch (e) {
    const kind = e instanceof LLMError ? e.kind : 'unavailable'
    return json(kind === 'busy' ? 503 : 502, { error: kind })
  }
}
