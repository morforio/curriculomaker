/**
 * Créditos de uso (cobrança no servidor). O saldo vive no banco do Supabase (tabela credit_accounts, fechada para o público);
 * só o Worker, com a chave service_role, cobra e devolve créditos, chamando as funções SQL spend_credit e refund_credit.
 * Regras (supabase/migrations/20261008000000_credits.sql):
 *   - IA e tradução gastam 1 crédito; exportar gasta 1 na conta gratuita e nada na conta paga.
 *   - Sem crédito válido, a conta fica "travada": a API devolve 402 (no_credits).
 *   - Se o serviço falhar (IA fora do ar etc.), o crédito é devolvido.
 */
export type CreditKind = 'ai' | 'translate' | 'export'

export type CreditEnv = { SUPABASE_URL?: string; SUPABASE_SERVICE_KEY?: string }

export type CreditStatus = {
  plan: 'free' | 'paid'
  paid: boolean
  credits: number
  locked: boolean
  credits_expire_at: string
  paid_until: string | null
}

export type SpendResult = ({ ok: true; spent: number } | { ok: false; reason: 'no_credits' }) & CreditStatus

/** Não foi possível falar com o banco de créditos (chave ausente, rede, erro do Supabase). A API recusa em vez de liberar. */
export class CreditsUnavailable extends Error {}

async function rpc<T>(env: CreditEnv, fn: string, body: Record<string, unknown>): Promise<T> {
  const base = env.SUPABASE_URL?.trim().replace(/\/+$/, '')
  const key = env.SUPABASE_SERVICE_KEY?.trim()
  if (!base || !key) {
    console.error('Créditos: SUPABASE_URL ou SUPABASE_SERVICE_KEY ausentes.')
    throw new CreditsUnavailable('chave dos créditos ausente')
  }
  let res: Response
  try {
    res = await fetch(`${base}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    })
  } catch (e) {
    console.error(`Créditos (${fn}) inacessíveis: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`)
    throw new CreditsUnavailable('rede')
  }
  if (!res.ok) {
    // O corpo do erro pode citar o banco; vai só para o log (cortado), nunca para o usuário.
    console.error(`Créditos (${fn}) responderam HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
    throw new CreditsUnavailable(`HTTP ${res.status}`)
  }
  return (await res.json()) as T
}

export function spendCredit(env: CreditEnv, userId: string, kind: CreditKind): Promise<SpendResult> {
  return rpc<SpendResult>(env, 'spend_credit', { p_user: userId, p_kind: kind })
}

export function refundCredit(env: CreditEnv, userId: string): Promise<CreditStatus> {
  return rpc<CreditStatus>(env, 'refund_credit', { p_user: userId })
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })
}

export const noCreditsResponse = (status: CreditStatus): Response =>
  json(402, { error: 'no_credits', message: 'Seus créditos acabaram. Assine para continuar.', credits: status.credits, locked: status.locked })

export const creditsUnavailableResponse = (): Response =>
  json(503, { error: 'credits_unavailable', message: 'Não foi possível conferir os seus créditos agora. Tente de novo.' })

/**
 * Cobra 1 crédito, roda o serviço e devolve o crédito se o serviço não der certo (resposta de erro ou exceção).
 * Sem `userId` (modo local sem login, AUTH_OPTIONAL) não cobra nada.
 */
export async function withCredit(env: CreditEnv, userId: string | null, kind: CreditKind, run: () => Promise<Response>): Promise<Response> {
  if (!userId) return run()

  let spent: SpendResult
  try {
    spent = await spendCredit(env, userId, kind)
  } catch {
    return creditsUnavailableResponse()
  }
  if (!spent.ok) return noCreditsResponse(spent)

  const refund = () => refundCredit(env, userId).catch(() => undefined) // se o reembolso falhar, o erro já foi registrado no log
  let response: Response
  try {
    response = await run()
  } catch (e) {
    if (spent.spent > 0) await refund()
    throw e
  }
  if (!response.ok && spent.spent > 0) await refund()
  return response
}
