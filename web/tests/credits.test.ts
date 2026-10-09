import assert from 'node:assert/strict'
import { test } from 'node:test'
import { refundCredit, spendCredit, withCredit, type CreditStatus } from '../worker/credits.ts'

/** Cobrança de créditos no Worker (worker/credits.ts), com o Supabase simulado. */

const env = { SUPABASE_URL: 'https://x.supabase.co/', SUPABASE_SERVICE_KEY: 'service-secret' }
const status = (credits: number, locked = false): CreditStatus => ({ plan: 'free', paid: false, credits, locked, credits_expire_at: '2026-11-07T00:00:00Z', paid_until: null })

type Call = { url: string; body: Record<string, unknown>; headers: Record<string, string> }

/** Simula o banco: `spend` decide a resposta de spend_credit; refund_credit sempre responde. */
function mockDb(spend: () => Response | Promise<Response>): { calls: Call[]; restore: () => void } {
  const original = globalThis.fetch
  const calls: Call[] = []
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)), headers: init?.headers as Record<string, string> })
    if (String(url).endsWith('/rpc/spend_credit')) return spend()
    return new Response(JSON.stringify(status(5)), { status: 200 })
  }) as typeof fetch
  return { calls, restore: () => (globalThis.fetch = original) }
}

const okSpend = (spent = 1, credits = 4) => () => new Response(JSON.stringify({ ok: true, spent, ...status(credits) }), { status: 200 })
const denied = () => new Response(JSON.stringify({ ok: false, reason: 'no_credits', ...status(0, true) }), { status: 200 })

test('spendCredit: chama a função do banco com a chave de serviço e só no endereço do Supabase', async () => {
  const db = mockDb(okSpend())
  try {
    const r = await spendCredit(env, 'user-1', 'ai')
    assert.ok(r.ok)
    assert.equal(db.calls[0].url, 'https://x.supabase.co/rest/v1/rpc/spend_credit')
    assert.deepEqual(db.calls[0].body, { p_user: 'user-1', p_kind: 'ai' })
    assert.equal(db.calls[0].headers.apikey, 'service-secret')
    assert.equal(db.calls[0].headers.Authorization, 'Bearer service-secret')
  } finally {
    db.restore()
  }
})

test('withCredit: com crédito, cobra, roda o serviço e NÃO devolve quando deu certo', async () => {
  const db = mockDb(okSpend())
  try {
    const res = await withCredit(env, 'u', 'ai', async () => new Response('{"ok":1}', { status: 200 }))
    assert.equal(res.status, 200)
    assert.deepEqual(db.calls.map((c) => c.url.split('/').pop()), ['spend_credit'])
  } finally {
    db.restore()
  }
})

test('withCredit: sem crédito, devolve 402 no_credits e nem chama o serviço (a IA não é gasta)', async () => {
  const db = mockDb(denied)
  let ran = false
  try {
    const res = await withCredit(env, 'u', 'translate', async () => ((ran = true), new Response('{}')))
    assert.equal(res.status, 402)
    const body = (await res.json()) as { error: string; locked: boolean }
    assert.equal(body.error, 'no_credits')
    assert.equal(body.locked, true)
    assert.equal(ran, false)
  } finally {
    db.restore()
  }
})

test('withCredit: se o serviço responde com erro (IA fora do ar, limite etc.), o crédito é devolvido', async () => {
  const db = mockDb(okSpend())
  try {
    for (const status of [429, 502, 503, 400]) {
      db.calls.length = 0
      const res = await withCredit(env, 'u', 'ai', async () => new Response('{}', { status }))
      assert.equal(res.status, status)
      assert.deepEqual(db.calls.map((c) => c.url.split('/').pop()), ['spend_credit', 'refund_credit'], `status ${status}`)
    }
  } finally {
    db.restore()
  }
})

test('withCredit: se o serviço lança exceção, devolve o crédito e repassa o erro', async () => {
  const db = mockDb(okSpend())
  try {
    await assert.rejects(
      withCredit(env, 'u', 'ai', async () => {
        throw new Error('boom')
      }),
      /boom/,
    )
    assert.deepEqual(db.calls.map((c) => c.url.split('/').pop()), ['spend_credit', 'refund_credit'])
  } finally {
    db.restore()
  }
})

test('withCredit: exportação de conta paga não gastou nada (spent 0), então não há o que devolver', async () => {
  const db = mockDb(okSpend(0, 60))
  try {
    await withCredit(env, 'u', 'export', async () => new Response('{}', { status: 500 }))
    assert.deepEqual(db.calls.map((c) => c.url.split('/').pop()), ['spend_credit'])
  } finally {
    db.restore()
  }
})

test('falha fechada: banco fora do ar, erro HTTP ou chave ausente = 503 credits_unavailable, e o serviço não roda', async () => {
  let ran = false
  const run = async () => ((ran = true), new Response('{}'))
  const original = globalThis.fetch
  try {
    globalThis.fetch = (async () => {
      throw new Error('rede')
    }) as typeof fetch
    assert.equal((await withCredit(env, 'u', 'ai', run)).status, 503)

    globalThis.fetch = (async () => new Response('erro', { status: 500 })) as typeof fetch
    const res = await withCredit(env, 'u', 'ai', run)
    assert.equal(res.status, 503)
    assert.equal(((await res.json()) as { error: string }).error, 'credits_unavailable')

    assert.equal((await withCredit({ SUPABASE_URL: env.SUPABASE_URL }, 'u', 'ai', run)).status, 503, 'sem a chave de serviço')
    assert.equal((await withCredit({ SUPABASE_SERVICE_KEY: 'k' }, 'u', 'ai', run)).status, 503, 'sem o endereço')
    assert.equal(ran, false)
  } finally {
    globalThis.fetch = original
  }
})

test('modo local sem login (userId nulo): não cobra e roda o serviço', async () => {
  const db = mockDb(okSpend())
  try {
    const res = await withCredit({}, null, 'ai', async () => new Response('{}', { status: 200 }))
    assert.equal(res.status, 200)
    assert.equal(db.calls.length, 0)
  } finally {
    db.restore()
  }
})

test('refundCredit: chama refund_credit para o usuário', async () => {
  const db = mockDb(okSpend())
  try {
    await refundCredit(env, 'user-9')
    assert.equal(db.calls[0].url, 'https://x.supabase.co/rest/v1/rpc/refund_credit')
    assert.deepEqual(db.calls[0].body, { p_user: 'user-9' })
  } finally {
    db.restore()
  }
})

test('a chave de serviço nunca aparece na resposta enviada ao usuário', async () => {
  const db = mockDb(denied)
  try {
    const res = await withCredit(env, 'u', 'ai', async () => new Response('{}'))
    assert.ok(!(await res.text()).includes('service-secret'))
  } finally {
    db.restore()
  }
})
