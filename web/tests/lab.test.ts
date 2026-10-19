import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { handleLab, LAB_EXPIRA_EM, LAB_TOKEN_SHA256 } from '../worker/lab.ts'
import type { LLMProvider } from '../worker/llm.ts'

/** Rota temporária do laboratório de prompts (worker/lab.ts): token obrigatório, expira sozinha e nunca devolve a chave. */

const TOKEN = 'token-de-teste'
// O caminho feliz (token certo) depende do token real, que não está no repositório: é conferido na prática, depois do deploy.

const req = (headers: Record<string, string> = {}, body: unknown = { system: 's', user: 'u' }, method = 'POST') =>
  new Request('http://x.test/api/lab', { method, headers: { 'Content-Type': 'application/json', ...headers }, body: method === 'POST' ? JSON.stringify(body) : undefined })

test('o hash guardado no repositório tem 64 caracteres hexadecimais (o token não está no código)', () => {
  assert.match(LAB_TOKEN_SHA256, /^[0-9a-f]{64}$/)
  assert.notEqual(LAB_TOKEN_SHA256, createHash('sha256').update(TOKEN).digest('hex'))
})

test('sem token ou com token errado: 401, e o provedor nunca é chamado', async () => {
  let calls = 0
  const provider = (): LLMProvider => ({ complete: async () => (calls++, 'x') })
  for (const h of [{}, { 'x-lab-token': 'errado' }, { 'x-lab-token': '' }]) {
    const res = await handleLab(req(h), { env: { LLM_API_KEY: 'k' }, provider })
    assert.equal(res.status, 401)
  }
  assert.equal(calls, 0)
})

test('depois da data de expiração a rota responde 404, mesmo com qualquer cabeçalho', async () => {
  const res = await handleLab(req({ 'x-lab-token': TOKEN }), { env: {}, now: LAB_EXPIRA_EM + 1 })
  assert.equal(res.status, 404)
})

test('só aceita POST', async () => {
  const res = await handleLab(req({}, undefined, 'GET'), { env: {} })
  assert.equal(res.status, 405)
})

test('a resposta de erro não traz a chave do provedor', async () => {
  const res = await handleLab(req({ 'x-lab-token': 'errado' }), { env: { LLM_API_KEY: 'segredo-do-provedor' } })
  assert.ok(!(await res.text()).includes('segredo-do-provedor'))
})
