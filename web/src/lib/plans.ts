/**
 * Planos e preço. Valores usados pelo site (página de planos) e pelo Worker (cobrança), para nunca divergirem.
 * Para mudar preço ou tamanho do pacote, é só mudar aqui (e a assinatura nova passa a valer; assinaturas já criadas no Asaas
 * continuam no valor antigo até serem refeitas).
 */
export const FREE_CREDITS = 5
export const FREE_DAYS = 30

export const PRO_PRICE_BRL = 39.9
/** Preço do "plano fantasma" de teste (só para o e-mail configurado em BILLING_TEST_EMAIL). R$ 5,00 é o mínimo por cobrança do Asaas. */
export const PRO_TEST_PRICE_BRL = 5

/** Créditos de IA e tradução por pagamento mensal (exportar o PDF não gasta crédito no plano pro). */
export const PRO_CREDITS = 60
/** Dias de acesso por pagamento: 31 (e não 30) para o pagamento do mês seguinte ter folga de um dia antes de a conta travar. */
export const PRO_ACCESS_DAYS = 31

export const onlyDigits = (s: string): string => s.replace(/\D/g, '')

/** CPF válido: 11 dígitos, não todos iguais, com os dois dígitos verificadores corretos. */
export function isValidCpf(raw: string): boolean {
  const d = onlyDigits(raw)
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const check = (len: number) => {
    let sum = 0
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i)
    const rest = (sum * 10) % 11
    return rest === 10 ? 0 : rest
  }
  return check(9) === Number(d[9]) && check(10) === Number(d[10])
}

/** 12345678909 → 123.456.789-09 (aceita digitação parcial). */
export function formatCpf(raw: string): string {
  const d = onlyDigits(raw).slice(0, 11)
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2')
}
