import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { handleLab, LAB_EXPIRA_EM, LAB_TOKEN_SHA256 } from '../worker/lab.ts'
import { JevError, type Verifier } from '../worker/jev.ts'
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

// ---------------------------------------------------------------- caminho feliz (com o hash do token injetado) e consultas ao Jev
const hashDeTeste = createHash('sha256').update(TOKEN).digest('hex')
const comToken = { 'x-lab-token': TOKEN }

test('com o token certo, kind "llm" (padrão) devolve só o texto do modelo', async () => {
  const provider = (): LLMProvider => ({ complete: async ({ system, user }) => `${system}|${user}` })
  const res = await handleLab(req(comToken, { system: 'S', user: 'U' }), { env: { LLM_API_KEY: 'segredo' }, provider, tokenSha256: hashDeTeste })
  assert.equal(res.status, 200)
  const texto = await res.text()
  assert.match(texto, /S\|U/)
  assert.ok(!texto.includes('segredo'))
})

test('kind "jev": repassa estado e perguntas ao Jev e devolve as respostas', async () => {
  const chamadas: { state: unknown; ids: string[] }[] = []
  const verifier = (): Verifier => ({ ask: async (state, questions) => (chamadas.push({ state, ids: Object.keys(questions) }), { ok: { type: 'noul', noul: 0.9 }, nota: { type: 'score', score: 2 } }) })
  const corpo = {
    kind: 'jev',
    state: { resume: 'r', rewritten_summary: 't' },
    questions: { ok: { type: 'noul', instructions: 'pergunta?', criteria: { true: 'sim', false: 'não' } }, nota: { type: 'score', instructions: 'quanto?', criteria: ['a', 'b', 'c'] } },
  }
  const res = await handleLab(req(comToken, corpo), { env: { TYPESAFE_API_KEY: 'segredo-jev' }, verifier, tokenSha256: hashDeTeste })
  assert.equal(res.status, 200)
  const dados = (await res.json()) as { answers: Record<string, unknown> }
  assert.deepEqual(dados.answers.ok, { type: 'noul', noul: 0.9 })
  assert.deepEqual(chamadas, [{ state: { resume: 'r', rewritten_summary: 't' }, ids: ['ok', 'nota'] }])
})

test('kind "jev": sem token é 401 e o Jev não é chamado; formato inválido é 400', async () => {
  let n = 0
  const verifier = (): Verifier => ({ ask: async () => (n++, {}) })
  const ok = { kind: 'jev', state: { a: 1 }, questions: { q: { type: 'noul', instructions: 'x' } } }
  assert.equal((await handleLab(req({}, ok), { env: {}, verifier, tokenSha256: hashDeTeste })).status, 401)
  for (const ruim of [
    { ...ok, questions: {} },
    { ...ok, questions: { q: { type: 'noul' } } },
    { ...ok, questions: { q: { type: 'score', instructions: 'x', criteria: [] } } },
    { ...ok, questions: Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`q${i}`, { type: 'noul', instructions: 'x' }])) },
    { ...ok, state: 'texto' },
    { ...ok, state: { grande: 'x'.repeat(70_000) } },
  ]) assert.equal((await handleLab(req(comToken, ruim), { env: {}, verifier, tokenSha256: hashDeTeste })).status, 400)
  assert.equal(n, 0)
})

test('kind "jev": falha do Jev vira 502 sem detalhes', async () => {
  const verifier = (): Verifier => ({ ask: async () => { throw new JevError('O Jev respondeu HTTP 500 com a chave segredo-jev') } })
  const res = await handleLab(req(comToken, { kind: 'jev', state: { a: 1 }, questions: { q: { type: 'noul', instructions: 'x' } } }), { env: {}, verifier, tokenSha256: hashDeTeste })
  assert.equal(res.status, 502)
  assert.ok(!(await res.text()).includes('segredo-jev'))
})
