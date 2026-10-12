import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FREE_CREDITS, FREE_DAYS, PRO_ACCESS_DAYS, PRO_CREDITS, PRO_PRICE_BRL } from '../src/lib/plans.ts'
import { buildPrivacy, buildTerms, type Block, type LegalDoc } from '../src/legal/content.ts'
import { parseSeller } from '../src/lib/seller.ts'
import { sellerResponse } from '../worker/seller.ts'

/**
 * Termos de uso e Política de privacidade (src/legal/): textos ligados às constantes do sistema e dados do fornecedor vindos dos
 * segredos SELLER_* da Cloudflare (nunca do repositório, que é público). Os valores abaixo são fictícios (CPF de teste válido).
 */
const SELLER = { name: 'Maria de Souza Teste', cpf: '529.982.247-25', address: 'Rua das Flores, 100, Centro, Cidade Exemplo - MG, CEP 30000-000', email: 'contato@exemplo.com.br' }
const TERMS = buildTerms(SELLER)
const PRIVACY = buildPrivacy(SELLER)

const text = (doc: LegalDoc) =>
  [...doc.intro, ...doc.sections.flatMap((s) => [s.title, ...s.blocks.flatMap((b: Block) => (typeof b === 'string' ? [b] : b.list))])].join('\n')

test('os dados do fornecedor entram nos dois textos', () => {
  for (const doc of [TERMS, PRIVACY]) {
    const t = text(doc)
    assert.ok(t.includes(SELLER.name) && t.includes(SELLER.cpf) && t.includes(SELLER.address) && t.includes(SELLER.email))
  }
})

test('o fornecedor só é aceito completo: nome, CPF válido, endereço completo e e-mail', () => {
  assert.deepEqual(parseSeller({ ...SELLER, cpf: '52998224725', name: ' Maria de Souza Teste ' }), SELLER)
  assert.equal(parseSeller(undefined), null)
  for (const bad of [{ name: '' }, { cpf: '' }, { cpf: '529.982.247-24' }, { address: 'Rua A' }, { email: 'sem-arroba' }, { email: '' }]) {
    assert.equal(parseSeller({ ...SELLER, ...bad }), null, JSON.stringify(bad))
  }
})

test('/api/seller: 200 com os segredos SELLER_* completos; 503 se faltar algum campo ou o CPF for inválido', () => {
  const env = { SELLER_NAME: SELLER.name, SELLER_CPF: '52998224725', SELLER_ADDRESS: SELLER.address, SELLER_EMAIL: SELLER.email }
  assert.deepEqual(sellerResponse(env), { status: 200, body: { seller: SELLER } })
  assert.equal(sellerResponse({}).status, 503)
  assert.equal(sellerResponse({ ...env, SELLER_EMAIL: undefined }).status, 503)
  assert.equal(sellerResponse({ ...env, SELLER_CPF: '11111111111' }).status, 503)
  assert.equal((sellerResponse({}).body as { error: string }).error, 'seller_unavailable')
})

test('nenhum dado pessoal do fornecedor fica no código: o arquivo src/legal/seller.ts não existe mais (o repositório é público)', async () => {
  const { existsSync } = await import('node:fs')
  assert.ok(!existsSync(new URL('../src/legal/seller.ts', import.meta.url)))
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
