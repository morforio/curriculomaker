import { parseSeller } from '../src/lib/seller.ts'

/**
 * Dados do fornecedor para as páginas /termos e /privacidade. Vêm dos segredos da Cloudflare (SELLER_*), nunca do repositório:
 * ele é público. A rota é pública de propósito (as páginas abrem sem login e a lei exige que estes dados fiquem visíveis).
 * Se faltar algum campo ou o CPF for inválido, responde 503 e a página mostra que os dados estão indisponíveis, em vez de
 * publicar um texto legal incompleto.
 */
export type SellerEnv = { SELLER_NAME?: string; SELLER_CPF?: string; SELLER_ADDRESS?: string; SELLER_EMAIL?: string }

export function sellerResponse(env: SellerEnv): { status: number; body: unknown } {
  const seller = parseSeller({ name: env.SELLER_NAME, cpf: env.SELLER_CPF, address: env.SELLER_ADDRESS, email: env.SELLER_EMAIL })
  if (!seller) return { status: 503, body: { error: 'seller_unavailable', message: 'Os dados do fornecedor não estão configurados.' } }
  return { status: 200, body: { seller } }
}
