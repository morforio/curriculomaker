import { createProvider, LLMError, type LLMEnv, type LLMProvider } from './llm.ts'

/**
 * TEMPORÁRIO: laboratório de prompts. Roda um prompt qualquer no mesmo provedor de LLM da produção, usando o segredo LLM_API_KEY
 * (que só o Worker enxerga), para comparar versões do prompt. Não é parte do produto e será REMOVIDO no PR seguinte.
 *
 * Proteções: exige o cabeçalho x-lab-token (aqui só vai o hash SHA-256 do token; o token em si não está no repositório) e deixa de
 * responder sozinho depois de LAB_EXPIRA_EM (48 h). Nunca devolve a chave: só o texto do modelo.
 */
export const LAB_TOKEN_SHA256 = '2ec8d00fbad36fb3606613b2f86e72e10b60c432a7ae6d790a441e4401d03d3d'
/** 21/10/2026 11:23 (GMT-3). */
export const LAB_EXPIRA_EM = 1792592586128

const MAX_SYSTEM = 30_000
const MAX_USER = 60_000

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

export type LabDeps = { env: LLMEnv; now?: number; provider?: (env: LLMEnv) => LLMProvider }

export async function handleLab(request: Request, deps: LabDeps): Promise<Response> {
  // Depois da data, a rota some (404, como qualquer rota que não existe).
  if ((deps.now ?? Date.now()) > LAB_EXPIRA_EM) return json(404, { error: 'not_found' })
  if (request.method !== 'POST') return json(405, { error: 'invalid_request' })

  const token = request.headers.get('x-lab-token') ?? ''
  if (!iguais(await sha256Hex(token), LAB_TOKEN_SHA256)) return json(401, { error: 'unauthorized' })

  let body: { system?: unknown; user?: unknown; effort?: unknown; maxTokens?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return json(400, { error: 'invalid_request' })
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
