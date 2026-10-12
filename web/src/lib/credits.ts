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

/**
 * O que fazer quando a impressão começa por um caminho que o site não controla (menu do navegador):
 *  - "blur": conta travada, ou saldo desconhecido (falha fechada): sai borrada;
 *  - "allow": conta paga: imprime à vontade;
 *  - "charge": conta gratuita com crédito: cobra 1 crédito e imprime.
 */
export type PrintDecision = 'blur' | 'allow' | 'charge'

export function printDecision(account: Account | null): PrintDecision {
  if (!account || account.locked) return 'blur'
  return account.paid ? 'allow' : 'charge'
}

/** Ctrl+P (ou Cmd+P, e a variante com Shift): o atalho de imprimir do navegador. */
export function isPrintShortcut(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): boolean {
  return (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'p'
}

/** Data curta no idioma da interface (dd/mm/aaaa em português). */
export const formatDate = (iso: string, lang: string): string => new Date(iso).toLocaleDateString(lang, { day: '2-digit', month: '2-digit', year: 'numeric' })
