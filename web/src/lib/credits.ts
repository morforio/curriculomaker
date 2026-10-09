/** Estado dos créditos da conta, como o banco devolve em get_my_account() (supabase/migrations/20261008000000_credits.sql). */
export type Account = {
  plan: 'free' | 'paid'
  paid: boolean
  /** Créditos válidos agora (0 se venceram). */
  credits: number
  /** Conta não paga e sem crédito válido: o site fica só para ver e editar texto. */
  locked: boolean
  credits_expire_at: string | null
  paid_until: string | null
}

/** Confere a resposta do banco; devolve null se vier algo fora do formato (o contador então não aparece, em vez de mostrar lixo). */
export function parseAccount(raw: unknown): Account | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if ((r.plan !== 'free' && r.plan !== 'paid') || typeof r.paid !== 'boolean' || typeof r.locked !== 'boolean') return null
  if (typeof r.credits !== 'number' || !Number.isInteger(r.credits) || r.credits < 0) return null
  const date = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null)
  return { plan: r.plan, paid: r.paid, credits: r.credits, locked: r.locked, credits_expire_at: date(r.credits_expire_at), paid_until: date(r.paid_until) }
}
