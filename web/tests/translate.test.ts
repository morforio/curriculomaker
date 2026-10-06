import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { LLMProvider } from '../worker/llm.ts'
import { handleTranslate } from '../worker/translate.ts'

/** Testes do endpoint de tradução (worker/translate.ts), com LLM e limite simulados. */

function request(body: unknown): Request {
  return new Request('https://currimaker.test/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function providerWith(replies: string[]): { provider: LLMProvider; calls: () => number } {
  const queue = [...replies]
  let calls = 0
  return {
    provider: {
      async complete() {
        calls++
        const next = queue.shift()
        if (next === undefined) throw new Error('sem resposta')
        return next
      },
    },
    calls: () => calls,
  }
}

const ok = { check: async () => 'ok' as const }
const base = { from: 'pt', to: 'en', texts: ['Desenvolvedor', '', 'Trabalho com **Node.js**'] }
const deps = (provider: LLMProvider, limiter: { check: () => Promise<'ok' | 'ip' | 'daily'> } = ok) => ({ env: {}, ip: '1.2.3.4', limiter, provider })

test('traduz e devolve os itens na mesma ordem', async () => {
  const { provider } = providerWith([JSON.stringify({ texts: ['Developer', '', 'I work with **Node.js**'] })])
  const res = await handleTranslate(request(base), deps(provider))
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { texts: ['Developer', '', 'I work with **Node.js**'] })
})

test('aceita a resposta dentro de cercas de markdown', async () => {
  const { provider } = providerWith(['```json\n' + JSON.stringify({ texts: ['Developer', '', 'I work with Node.js'] }) + '\n```'])
  const res = await handleTranslate(request(base), deps(provider))
  assert.equal(res.status, 200)
})

test('quantidade de itens errada: tenta de novo uma vez e aceita a correção', async () => {
  const { provider, calls } = providerWith([JSON.stringify({ texts: ['Developer'] }), JSON.stringify({ texts: ['Developer', '', 'I work with Node.js'] })])
  const res = await handleTranslate(request(base), deps(provider))
  assert.equal(res.status, 200)
  assert.equal(calls(), 2)
})

test('duas respostas inválidas: 502 bad_llm_output', async () => {
  const { provider } = providerWith([JSON.stringify({ texts: [] }), 'isto não é JSON'])
  const res = await handleTranslate(request(base), deps(provider))
  assert.equal(res.status, 502)
  assert.equal(((await res.json()) as { error: string }).error, 'bad_llm_output')
})

test('item que existia não pode voltar vazio', async () => {
  const empty = JSON.stringify({ texts: ['', '', 'I work with Node.js'] })
  const { provider } = providerWith([empty, empty])
  const res = await handleTranslate(request(base), deps(provider))
  assert.equal(res.status, 502)
})

test('mesmo idioma de origem e destino é recusado, sem chamar o LLM', async () => {
  const { provider, calls } = providerWith([])
  const res = await handleTranslate(request({ ...base, to: 'pt' }), deps(provider))
  assert.equal(res.status, 400)
  assert.equal(calls(), 0)
})

test('limite por IP: 429 sem chamar o LLM', async () => {
  const { provider, calls } = providerWith([])
  const res = await handleTranslate(request(base), deps(provider, { check: async () => 'ip' }))
  assert.equal(res.status, 429)
  assert.equal(calls(), 0)
})

test('origem diferente do site é recusada', async () => {
  const { provider } = providerWith([])
  const req = new Request('https://currimaker.test/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://outro-site.example' },
    body: JSON.stringify(base),
  })
  const res = await handleTranslate(req, deps(provider))
  assert.equal(res.status, 403)
})

test('LLM indisponível: 502 llm_unavailable', async () => {
  const { provider } = providerWith([])
  const res = await handleTranslate(request(base), deps(provider))
  assert.equal(res.status, 502)
  assert.equal(((await res.json()) as { error: string }).error, 'llm_unavailable')
})
