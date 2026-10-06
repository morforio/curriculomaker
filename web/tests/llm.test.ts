import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createProvider } from '../worker/llm.ts'

/** Testes do envio de reasoning_effort (worker/llm.ts), com fetch simulado. */

type Sent = Record<string, unknown>

function mockFetch(statuses: number[]): { sent: Sent[]; restore: () => void } {
  const original = globalThis.fetch
  const sent: Sent[] = []
  const queue = [...statuses]
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)) as Sent)
    const status = queue.shift() ?? 200
    const body = status === 200 ? { choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } } : { error: 'x' }
    return new Response(JSON.stringify(body), { status })
  }) as typeof fetch
  return { sent, restore: () => (globalThis.fetch = original) }
}

test('envia reasoning_effort quando configurado', async () => {
  const m = mockFetch([200])
  try {
    const provider = createProvider({ LLM_API_KEY: 'k', LLM_REASONING_EFFORT: 'low' })
    assert.equal(await provider.complete({ system: 's', user: 'u' }), 'ok')
    assert.equal(m.sent[0].reasoning_effort, 'low')
  } finally {
    m.restore()
  }
})

test('sem configuração, não envia o parâmetro', async () => {
  const m = mockFetch([200])
  try {
    const provider = createProvider({ LLM_API_KEY: 'k' })
    await provider.complete({ system: 's', user: 'u' })
    assert.ok(!('reasoning_effort' in m.sent[0]))
  } finally {
    m.restore()
  }
})

test('provedor recusa o parâmetro (HTTP 400): repete sem ele e responde', async () => {
  const m = mockFetch([400, 200])
  try {
    const provider = createProvider({ LLM_API_KEY: 'k', LLM_REASONING_EFFORT: 'low' })
    assert.equal(await provider.complete({ system: 's', user: 'u' }), 'ok')
    assert.equal(m.sent.length, 2)
    assert.equal(m.sent[0].reasoning_effort, 'low')
    assert.ok(!('reasoning_effort' in m.sent[1]))
  } finally {
    m.restore()
  }
})
