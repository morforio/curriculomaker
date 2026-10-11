import type { ApiErrorCode } from '../../lib/schemas/analysis'
import { authHeaders } from '../auth/token'
import { ApiError } from '../job-match/api'
import { useCreditsStore } from '../credits/creditsStore'

const KNOWN: ApiErrorCode[] = ['invalid_request', 'invalid_cpf', 'payment_unavailable', 'already_subscribed', 'no_subscription', 'rate_limited_ip', 'unauthorized', 'auth_unavailable']

async function call(path: string, body?: unknown): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('network')
  }
  const data = (await res.json().catch(() => null)) as { error?: string } | null
  if (!res.ok) throw new ApiError(KNOWN.find((c) => c === data?.error) ?? 'payment_unavailable')
  return data
}

/** Cria a cobrança no Asaas e devolve o endereço da fatura, onde a pessoa paga (Pix, cartão ou boleto). */
export async function startCheckout(name: string, cpf: string): Promise<string> {
  const data = (await call('/api/checkout', { name, cpf })) as { url?: unknown } | null
  if (typeof data?.url !== 'string' || !data.url.startsWith('https://')) throw new ApiError('payment_unavailable')
  return data.url
}

/** Cancela a assinatura (o plano segue até o fim do período já pago). */
export async function cancelSubscription(): Promise<void> {
  await call('/api/billing/cancel')
  void useCreditsStore.getState().refresh()
}
