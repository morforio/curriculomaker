import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createProvider, LLMError, resetFallbackState } from '../worker/llm.ts'

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

/** Modelo reserva: quando o principal recusa (HTTP 503 do Google) ou não responde, o reserva responde e o usuário é avisado. */

const env = { LLM_API_KEY: 'k', LLM_MODEL: 'principal', LLM_FALLBACK_MODEL: 'reserva' }
const models = (sent: Sent[]) => sent.map((s) => s.model)

test('principal responde: o reserva não é usado nem avisado', async () => {
  resetFallbackState()
  const m = mockFetch([200])
  try {
    const provider = createProvider(env)
    await provider.complete({ system: 's', user: 'u' })
    assert.deepEqual(models(m.sent), ['principal'])
    assert.equal(provider.fallbackUsed?.(), false)
  } finally {
    m.restore()
  }
})

test('principal recusa (HTTP 503): o reserva responde e fica registrado que foi usado', async () => {
  resetFallbackState()
  const m = mockFetch([503, 200])
  try {
    const provider = createProvider(env)
    assert.equal(await provider.complete({ system: 's', user: 'u' }), 'ok')
    assert.deepEqual(models(m.sent), ['principal', 'reserva'])
    assert.equal(provider.fallbackUsed?.(), true)
  } finally {
    m.restore()
  }
})

test('depois da falha, os próximos pedidos vão direto ao reserva (sem esperar o principal de novo)', async () => {
  resetFallbackState()
  const m = mockFetch([503, 200, 200])
  try {
    await createProvider(env).complete({ system: 's', user: 'u' })
    const second = createProvider(env)
    await second.complete({ system: 's', user: 'u' })
    assert.deepEqual(models(m.sent), ['principal', 'reserva', 'reserva'])
    assert.equal(second.fallbackUsed?.(), true, 'o aviso vale também para os pedidos que já nascem no reserva')
  } finally {
    m.restore()
  }
})

test('principal em excesso de pedidos (429 mesmo após a nova tentativa): usa o reserva', async () => {
  resetFallbackState()
  const m = mockFetch([{ status: 429, headers: { 'retry-after': '0.01' } }, { status: 429, headers: { 'retry-after': '0.01' } }, 200])
  try {
    await createProvider(env).complete({ system: 's', user: 'u' })
    assert.deepEqual(models(m.sent), ['principal', 'principal', 'reserva'])
  } finally {
    m.restore()
  }
})

test('os dois falham: o erro do reserva sobe, sem laço', async () => {
  resetFallbackState()
  const m = mockFetch([503, 503])
  try {
    await assert.rejects(createProvider(env).complete({ system: 's', user: 'u' }), (e: unknown) => e instanceof LLMError && e.kind === 'unavailable')
    assert.deepEqual(models(m.sent), ['principal', 'reserva'])
  } finally {
    m.restore()
  }
})

test('sem modelo reserva configurado: comportamento de antes (erro direto, sem aviso)', async () => {
  resetFallbackState()
  const m = mockFetch([503])
  try {
    const provider = createProvider({ LLM_API_KEY: 'k', LLM_MODEL: 'principal' })
    await assert.rejects(provider.complete({ system: 's', user: 'u' }), (e: unknown) => e instanceof LLMError)
    assert.deepEqual(models(m.sent), ['principal'])
    assert.equal(provider.fallbackUsed?.(), false)
  } finally {
    m.restore()
  }
})

test('o parâmetro reasoning_effort recusado por um modelo não é cortado do outro', async () => {
  resetFallbackState()
  const m = mockFetch([503, 400, 200])
  try {
    await createProvider({ ...env, LLM_REASONING_EFFORT: 'minimal' }).complete({ system: 's', user: 'u' })
    assert.deepEqual(models(m.sent), ['principal', 'reserva', 'reserva'])
    assert.equal(m.sent[1].reasoning_effort, 'minimal')
    assert.ok(!('reasoning_effort' in m.sent[2]))
  } finally {
    m.restore()
  }
})
