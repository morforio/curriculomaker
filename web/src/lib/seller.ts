import { formatCpf, isValidCpf } from './plans.ts'

/**
 * Dados do fornecedor, mostrados nos Termos de uso e na Política de privacidade.
 * A lei do comércio eletrônico (Decreto 7.962/2013) exige, em local de destaque no site: nome, CPF ou CNPJ, endereço físico e
 * eletrônico e meios de contato do fornecedor.
 *
 * Os valores NÃO ficam no código nem no Git (o repositório é público): vêm dos segredos SELLER_NAME, SELLER_CPF, SELLER_ADDRESS e
 * SELLER_EMAIL da Cloudflare, e o Worker os serve em /api/seller (worker/seller.ts). Esta função só valida e padroniza.
 */
export type Seller = { name: string; cpf: string; address: string; email: string }

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** O fornecedor completo e válido (CPF com os dígitos verificadores certos, endereço completo, e-mail), ou null se faltar ou estiver inválido. */
export function parseSeller(input: unknown): Seller | null {
  if (typeof input !== 'object' || input === null) return null
  const raw = input as Record<string, unknown>
  const name = text(raw.name)
  const cpf = text(raw.cpf)
  const address = text(raw.address)
  const email = text(raw.email)
  if (name.length <= 5 || address.length < 15) return null
  if (!isValidCpf(cpf) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  return { name, cpf: formatCpf(cpf), address, email }
}
