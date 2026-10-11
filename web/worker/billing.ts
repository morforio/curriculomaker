import { z } from 'zod'
import { isValidCpf, onlyDigits, PRO_ACCESS_DAYS, PRO_CREDITS, PRO_PRICE_BRL } from '../src/lib/plans.ts'
import { rpc, type CreditEnv } from './credits.ts'
import { bodyTooLarge } from './security.ts'

/**
 * Pagamento do plano pro pelo Asaas. Fluxo:
 *  1. /api/checkout: cria o cliente (com o CPF, que só vai ao Asaas e nunca é guardado) e uma assinatura mensal; devolve o link da fatura,
 *     onde a pessoa escolhe Pix, cartão ou boleto.
 *  2. O Asaas avisa o pagamento em /api/payment/webhook (cabeçalho asaas-access-token); aí o plano pro é aplicado, uma vez por cobrança.
 *  3. /api/billing/cancel: cancela a assinatura (o acesso continua até o fim do período já pago).
 * Sem ASAAS_API_KEY (ou sem o token do aviso), tudo recusa (503): o pagamento falha fechado.
 */
export type BillingEnv = CreditEnv & {
  /** Secret: chave de API do Asaas (da conta de teste "sandbox" ou da de produção). */
  ASAAS_API_KEY?: string
  /** Secret: senha que o Asaas envia no cabeçalho asaas-access-token do aviso de pagamento (32 a 255 caracteres, sem espaços). */
  ASAAS_WEBHOOK_TOKEN?: string
  /** "production" usa a conta real; qualquer outro valor (ou vazio) usa a de teste (sandbox). */
  ASAAS_ENV?: string
  /** Só para testes locais: endereço alternativo da API do Asaas. */
  ASAAS_BASE_URL?: string
}

export type BillingErrorCode = 'invalid_request' | 'invalid_cpf' | 'payment_unavailable' | 'already_subscribed' | 'no_subscription' | 'unauthorized'

const SANDBOX_URL = 'https://api-sandbox.asaas.com/v3'
const PRODUCTION_URL = 'https://api.asaas.com/v3'

class PaymentUnavailable extends Error {}
class AsaasRejected extends Error {
  status: number
  constructor(status: number) {
    super(`Asaas HTTP ${status}`)
    this.status = status
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })
}

function fail(status: number, error: BillingErrorCode, message: string): Response {
  return json(status, { error, message })
}

const unavailable = () => fail(503, 'payment_unavailable', 'O pagamento não está disponível agora. Tente de novo em instantes.')

function baseUrl(env: BillingEnv): string {
  const override = env.ASAAS_BASE_URL?.trim().replace(/\/+$/, '')
  if (override) return override
  return env.ASAAS_ENV?.trim().toLowerCase() === 'production' ? PRODUCTION_URL : SANDBOX_URL
}

/** Chamada à API do Asaas. Falhas de rede e erros 5xx viram PaymentUnavailable; 4xx viram AsaasRejected (o pedido foi recusado). */
async function asaas<T>(env: BillingEnv, method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const key = env.ASAAS_API_KEY?.trim()
  if (!key) {
    console.error('Pagamento: ASAAS_API_KEY ausente.')
    throw new PaymentUnavailable('chave ausente')
  }
  let res: Response
  try {
    res = await fetch(`${baseUrl(env)}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', access_token: key, 'User-Agent': 'CurriMaker/1.0' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
  } catch (e) {
    console.error(`Pagamento: Asaas inacessível (${method} ${path}): ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`)
    throw new PaymentUnavailable('rede')
  }
  if (!res.ok) {
    // O corpo do erro vai só para o log (cortado); nunca para o usuário.
    console.error(`Pagamento: Asaas respondeu HTTP ${res.status} (${method} ${path}): ${(await res.text().catch(() => '')).slice(0, 300)}`)
    if (res.status >= 500 || res.status === 401 || res.status === 403 || res.status === 429) throw new PaymentUnavailable(`HTTP ${res.status}`)
    throw new AsaasRejected(res.status)
  }
  return (await res.json()) as T
}

type Billing = { customer_id: string; subscription_id: string | null } | null
type AsaasPayment = { id: string; status: string; invoiceUrl?: string }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Link da fatura a pagar (Pix, cartão ou boleto) da assinatura: a primeira cobrança pendente ou vencida. */
async function openInvoiceUrl(env: BillingEnv, subscriptionId: string, attempts: number): Promise<string | null> {
  for (let i = 0; i < attempts; i++) {
    const list = await asaas<{ data?: AsaasPayment[] }>(env, 'GET', `/subscriptions/${encodeURIComponent(subscriptionId)}/payments`)
    const open = (list.data ?? []).find((p) => (p.status === 'PENDING' || p.status === 'OVERDUE') && p.invoiceUrl)
    if (open?.invoiceUrl) return open.invoiceUrl
    if (i < attempts - 1) await sleep(1000) // a primeira cobrança pode levar um instante para existir
  }
  return null
}

const checkoutSchema = z.object({ name: z.string().trim().min(3).max(120), cpf: z.string().max(20) })

export type CheckoutDeps = { env: BillingEnv; userId: string; email: string | null }

export async function handleCheckout(request: Request, { env, userId, email }: CheckoutDeps): Promise<Response> {
  if (request.method !== 'POST') return fail(405, 'invalid_request', 'Use POST.')
  const origin = request.headers.get('Origin')
  if (origin && origin !== new URL(request.url).origin) return fail(403, 'invalid_request', 'Origem não permitida.')
  if (bodyTooLarge(request, 2_000)) return fail(413, 'invalid_request', 'Requisição grande demais.')

  let raw: unknown
  try {
    raw = JSON.parse(await request.text())
  } catch {
    return fail(400, 'invalid_request', 'JSON inválido.')
  }
  const parsed = checkoutSchema.safeParse(raw)
  if (!parsed.success) return fail(400, 'invalid_request', 'Informe o seu nome completo e o CPF.')
  if (!isValidCpf(parsed.data.cpf)) return fail(400, 'invalid_cpf', 'CPF inválido. Confira os números.')

  try {
    let billing = (await rpc<Billing>(env, 'billing_get', { p_user: userId })) ?? null

    if (!billing) {
      const customer = await asaas<{ id: string }>(env, 'POST', '/customers', {
        name: parsed.data.name,
        cpfCnpj: onlyDigits(parsed.data.cpf),
        ...(email ? { email } : {}),
        externalReference: userId,
      })
      await rpc(env, 'billing_save', { p_user: userId, p_customer: customer.id, p_subscription: null })
      billing = { customer_id: customer.id, subscription_id: null }
    }

    // Assinatura que já existe e está ativa: reaproveita a fatura em aberto (cliques repetidos não criam assinaturas a mais).
    if (billing.subscription_id) {
      const sub = await asaas<{ status?: string; deleted?: boolean }>(env, 'GET', `/subscriptions/${encodeURIComponent(billing.subscription_id)}`).catch((e) => {
        if (e instanceof AsaasRejected && e.status === 404) return null
        throw e
      })
      if (sub && sub.status === 'ACTIVE' && !sub.deleted) {
        const url = await openInvoiceUrl(env, billing.subscription_id, 1)
        if (url) return json(200, { url })
        return fail(409, 'already_subscribed', 'Você já tem uma assinatura ativa e em dia.')
      }
    }

    const subscription = await asaas<{ id: string }>(env, 'POST', '/subscriptions', {
      customer: billing.customer_id,
      billingType: 'UNDEFINED', // a pessoa escolhe Pix, cartão ou boleto na fatura
      value: PRO_PRICE_BRL,
      nextDueDate: new Date().toISOString().slice(0, 10),
      cycle: 'MONTHLY',
      description: `CurriMaker: plano pro (${PRO_CREDITS} créditos por mês)`,
      externalReference: userId,
    })
    await rpc(env, 'billing_save', { p_user: userId, p_customer: billing.customer_id, p_subscription: subscription.id })

    const url = await openInvoiceUrl(env, subscription.id, 4)
    if (!url) {
      console.error('Pagamento: assinatura criada, mas a primeira fatura não apareceu.')
      return unavailable()
    }
    return json(200, { url })
  } catch (e) {
    if (e instanceof AsaasRejected) return fail(400, 'invalid_cpf', 'Não foi possível criar a cobrança com estes dados. Confira o nome e o CPF.')
    return unavailable()
  }
}

/** Cancela a assinatura. O plano continua valendo até o fim do período já pago. */
export async function handleCancel(request: Request, { env, userId }: { env: BillingEnv; userId: string }): Promise<Response> {
  if (request.method !== 'POST') return fail(405, 'invalid_request', 'Use POST.')
  const origin = request.headers.get('Origin')
  if (origin && origin !== new URL(request.url).origin) return fail(403, 'invalid_request', 'Origem não permitida.')
  try {
    const billing = (await rpc<Billing>(env, 'billing_get', { p_user: userId })) ?? null
    if (!billing?.subscription_id) return fail(404, 'no_subscription', 'Você não tem uma assinatura para cancelar.')
    try {
      await asaas(env, 'DELETE', `/subscriptions/${encodeURIComponent(billing.subscription_id)}`)
    } catch (e) {
      if (!(e instanceof AsaasRejected && e.status === 404)) throw e // 404: já estava cancelada
    }
    return json(200, { ok: true })
  } catch {
    return unavailable()
  }
}

/** Compara dois textos sem revelar, pelo tempo, em que ponto eles diferem. */
async function sameSecret(a: string, b: string): Promise<boolean> {
  const hash = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))
  const [x, y] = await Promise.all([hash(a), hash(b)])
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

const webhookSchema = z.object({
  event: z.string(),
  payment: z.object({ id: z.string().min(1), customer: z.string().nullish(), subscription: z.string().nullish() }).passthrough(),
})

const GRANT_EVENTS = new Set(['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'])
const REVOKE_EVENTS = new Set(['PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED'])

/**
 * Aviso de pagamento do Asaas. Responde 200 só depois de gravar; se o banco falhar, responde 500 para o Asaas tentar de novo.
 * Cada cobrança vale uma vez (o aviso pode chegar repetido, e no cartão chega com 32 dias de diferença).
 */
export async function handleWebhook(request: Request, env: BillingEnv): Promise<Response> {
  if (request.method !== 'POST') return fail(405, 'invalid_request', 'Use POST.')
  const expected = env.ASAAS_WEBHOOK_TOKEN?.trim()
  if (!expected) {
    console.error('Pagamento: ASAAS_WEBHOOK_TOKEN ausente; o aviso de pagamento foi recusado.')
    return unavailable()
  }
  const sent = request.headers.get('asaas-access-token') ?? ''
  if (!(await sameSecret(sent, expected))) return fail(401, 'unauthorized', 'Não autorizado.')
  if (bodyTooLarge(request, 50_000)) return fail(413, 'invalid_request', 'Requisição grande demais.')

  let raw: unknown
  try {
    raw = JSON.parse(await request.text())
  } catch {
    return fail(400, 'invalid_request', 'JSON inválido.')
  }
  const parsed = webhookSchema.safeParse(raw)
  if (!parsed.success) return fail(400, 'invalid_request', 'Aviso fora do formato.')
  const { event, payment } = parsed.data

  try {
    if (GRANT_EVENTS.has(event)) {
      const owner = payment.customer ? await rpc<{ user_id: string; subscription_id: string | null } | null>(env, 'billing_user_by_customer', { p_customer: payment.customer }) : null
      // Só vale cobrança da assinatura que nós criamos para esse cliente (e não uma cobrança avulsa feita à mão no painel do Asaas).
      if (!owner || !payment.subscription || payment.subscription !== owner.subscription_id) {
        console.error(`Pagamento: aviso ${event} da cobrança ${payment.id} ignorado (cliente ou assinatura desconhecidos).`)
        return json(200, { ok: true, ignored: true })
      }
      const r = await rpc<{ granted: boolean }>(env, 'grant_paid_plan', { p_user: owner.user_id, p_payment: payment.id, p_credits: PRO_CREDITS, p_days: PRO_ACCESS_DAYS })
      return json(200, { ok: true, granted: r.granted })
    }
    if (REVOKE_EVENTS.has(event)) {
      const r = await rpc<{ revoked: boolean }>(env, 'revoke_paid_plan', { p_payment: payment.id })
      return json(200, { ok: true, revoked: r.revoked })
    }
    return json(200, { ok: true, ignored: true }) // outros eventos (cobrança criada, vencida...) não mudam o plano
  } catch {
    return json(500, { error: 'payment_unavailable', message: 'Não foi possível gravar agora.' })
  }
}
