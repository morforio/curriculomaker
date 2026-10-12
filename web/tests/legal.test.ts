import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FREE_CREDITS, FREE_DAYS, isValidCpf, PRO_ACCESS_DAYS, PRO_CREDITS, PRO_PRICE_BRL } from '../src/lib/plans.ts'
import { PRIVACY, TERMS, type Block, type LegalDoc } from '../src/legal/content.ts'
import { SELLER } from '../src/legal/seller.ts'

/** Termos de uso e Política de privacidade (src/legal/): dados do fornecedor completos e textos ligados às constantes do sistema. */

const text = (doc: LegalDoc) =>
  [...doc.intro, ...doc.sections.flatMap((s) => [s.title, ...s.blocks.flatMap((b: Block) => (typeof b === 'string' ? [b] : b.list))])].join('\n')

test('dados do fornecedor completos: nome, CPF válido, endereço e e-mail (exigidos pela lei do comércio eletrônico)', () => {
  assert.ok(SELLER.name.trim().length > 5, 'nome')
  assert.ok(isValidCpf(SELLER.cpf), 'CPF vazio ou inválido em src/legal/seller.ts')
  assert.ok(SELLER.address.trim().length >= 15, 'endereço completo em src/legal/seller.ts')
  assert.match(SELLER.email, /^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'e-mail de contato em src/legal/seller.ts')
})

test('nenhum texto legal vai ao ar com marcador de campo a preencher', () => {
  assert.ok(!text(TERMS).includes('[A PREENCHER]'))
  assert.ok(!text(PRIVACY).includes('[A PREENCHER]'))
})

test('os termos citam os mesmos preços, créditos e prazos do sistema (não desatualizam sozinhos)', () => {
  const t = text(TERMS)
  const price = PRO_PRICE_BRL.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  assert.ok(t.includes(price), `preço ${price}`)
  assert.ok(t.includes(`${FREE_CREDITS} créditos, válidos por ${FREE_DAYS} dias`), 'plano gratuito')
  assert.ok(t.includes(`${PRO_CREDITS} créditos`), 'créditos do plano pro')
  assert.ok(t.includes(`${PRO_ACCESS_DAYS} dias`), 'dias de acesso por pagamento')
})

test('os termos trazem o direito de arrependimento de 7 dias e o canal de reembolso', () => {
  const t = text(TERMS)
  assert.match(t, /7 dias corridos/)
  assert.match(t, /art\. 49 do Código de Defesa do Consumidor/)
  assert.ok(t.includes(SELLER.email), 'e-mail de reembolso')
})

test('a política cita todos os prestadores que recebem dados do usuário', () => {
  const p = text(PRIVACY)
  for (const name of ['Supabase', 'Cloudflare', 'OpenRouter', 'TypeSafe', 'Resend', 'Asaas']) assert.ok(p.includes(name), name)
})

test('a política afirma que o CPF não é guardado e que o cartão não passa pelo servidor (o que o sistema faz)', () => {
  const p = text(PRIVACY)
  assert.match(p, /não guardamos o CPF/)
  assert.match(p, /não passam por nós/)
})

test('os títulos das seções são únicos e cada seção tem conteúdo', () => {
  for (const doc of [TERMS, PRIVACY]) {
    const titles = doc.sections.map((s) => s.title)
    assert.equal(new Set(titles).size, titles.length)
    for (const s of doc.sections) assert.ok(s.blocks.length > 0, s.title)
  }
})
