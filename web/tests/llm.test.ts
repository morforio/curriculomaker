import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createProvider, LLMError } from '../worker/llm.ts'

/** Testes do envio de reasoning_effort e do tratamento de HTTP 429 (worker/llm.ts), com fetch simulado. */

type Sent = Record<string, unknown>
type Reply = number | { status: number; headers?: Record<string, string> }

function mockFetch(replies: Reply[]): { sent: Sent[]; restore: () => void } {
  const original = globalThis.fetch
  const sent: Sent[] = []
  const queue = [...replies]
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)) as Sent)
    const next = queue.shift() ?? 200
    const { status, headers } = typeof next === 'number' ? { status: next, headers: undefined } : next
    const body = status === 200 ? { choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } } : { error: { message: 'limite de teste' } }
    return new Response(JSON.stringify(body), { status, headers })
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

test('o max_tokens padrão é 4000 (a Groq reserva esse valor no limite por minuto)', async () => {
  const m = mockFetch([200])
  try {
    await createProvider({ LLM_API_KEY: 'k' }).complete({ system: 's', user: 'u' })
    assert.equal(m.sent[0].max_tokens, 4000)
  } finally {
    m.restore()
  }
})

test('HTTP 429 com espera curta: espera e tenta de novo uma vez', async () => {
  const m = mockFetch([{ status: 429, headers: { 'retry-after': '0.01' } }, 200])
  try {
    assert.equal(await createProvider({ LLM_API_KEY: 'k' }).complete({ system: 's', user: 'u' }), 'ok')
    assert.equal(m.sent.length, 2)
  } finally {
    m.restore()
  }
})

test('HTTP 429 de novo na segunda tentativa: erro "busy"', async () => {
  const m = mockFetch([
    { status: 429, headers: { 'retry-after': '0.01' } },
    { status: 429, headers: { 'retry-after': '0.01' } },
  ])
  try {
    await assert.rejects(
      createProvider({ LLM_API_KEY: 'k' }).complete({ system: 's', user: 'u' }),
      (e: unknown) => e instanceof LLMError && e.kind === 'busy',
    )
    assert.equal(m.sent.length, 2)
  } finally {
    m.restore()
  }
})

test('HTTP 429 com espera longa: não espera, devolve "busy" na hora', async () => {
  const m = mockFetch([{ status: 429, headers: { 'retry-after': '60' } }])
  try {
    await assert.rejects(
      createProvider({ LLM_API_KEY: 'k' }).complete({ system: 's', user: 'u' }),
      (e: unknown) => e instanceof LLMError && e.kind === 'busy',
    )
    assert.equal(m.sent.length, 1)
  } finally {
    m.restore()
  }
})

test('HTTP 413 (pedido grande demais): erro "unavailable", sem nova tentativa', async () => {
  const m = mockFetch([413])
  try {
    await assert.rejects(
      createProvider({ LLM_API_KEY: 'k' }).complete({ system: 's', user: 'u' }),
      (e: unknown) => e instanceof LLMError && e.kind === 'unavailable',
    )
    assert.equal(m.sent.length, 1)
  } finally {
    m.restore()
  }
})
