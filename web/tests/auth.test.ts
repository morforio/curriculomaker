import assert from 'node:assert/strict'
import { test } from 'node:test'
import { authenticate, authMode } from '../worker/auth.ts'

/** Testes da conferência do login (worker/auth.ts), com o Supabase simulado. */

const env = { SUPABASE_URL: 'https://x.supabase.co/', SUPABASE_ANON_KEY: 'anon' }
const req = (token?: string) => new Request('https://currimaker.test/api/analyze', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} })

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): { calls: { url: string; init?: RequestInit }[]; restore: () => void } {
  const original = globalThis.fetch
  const calls: { url: string; init?: RequestInit }[] = []
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    return handler(String(url), init)
  }) as typeof fetch
  return { calls, restore: () => (globalThis.fetch = original) }
}

test('sem Supabase configurado, a API falha fechada (503), sem chamar ninguém', async () => {
  const m = mockFetch(() => new Response('{}'))
  try {
    assert.deepEqual(await authenticate(req(), {}), { ok: false, status: 503, error: 'auth_unavailable' })
    assert.deepEqual(await authenticate(req('tok'), { SUPABASE_URL: 'https://x.supabase.co' }), { ok: false, status: 503, error: 'auth_unavailable' })
    assert.deepEqual(await authenticate(req('tok'), { SUPABASE_ANON_KEY: 'anon' }), { ok: false, status: 503, error: 'auth_unavailable' })
    assert.equal(m.calls.length, 0)
  } finally {
    m.restore()
  }
})

test('AUTH_OPTIONAL=true (só para testar localmente) libera o uso sem login', async () => {
  assert.deepEqual(await authenticate(req(), { AUTH_OPTIONAL: 'true' }), { ok: true, userId: null })
  assert.deepEqual(await authenticate(req(), { AUTH_OPTIONAL: 'TRUE ' }), { ok: true, userId: null })
  assert.deepEqual(await authenticate(req(), { AUTH_OPTIONAL: 'false' }), { ok: false, status: 503, error: 'auth_unavailable' })
})

test('authMode: configurado, opcional ou quebrado', () => {
  assert.equal(authMode(env), 'configured')
  assert.equal(authMode({ ...env, AUTH_OPTIONAL: 'true' }), 'configured', 'com login configurado, o modo opcional é ignorado')
  assert.equal(authMode({ AUTH_OPTIONAL: 'true' }), 'optional')
  assert.equal(authMode({}), 'broken')
})

test('com Supabase configurado e sem token: 401', async () => {
  const m = mockFetch(() => new Response('{}'))
  try {
    const r = await authenticate(req(), env)
    assert.deepEqual(r, { ok: false, status: 401, error: 'unauthorized' })
    assert.equal(m.calls.length, 0)
  } finally {
    m.restore()
  }
})

test('token válido: devolve o id do usuário e usa só a chave pública', async () => {
  const m = mockFetch(() => new Response(JSON.stringify({ id: 'user-1', email: 'a@b.c' }), { status: 200 }))
  try {
    assert.deepEqual(await authenticate(req('tok'), env), { ok: true, userId: 'user-1' })
    assert.equal(m.calls[0].url, 'https://x.supabase.co/auth/v1/user')
    const h = m.calls[0].init?.headers as Record<string, string>
    assert.equal(h.apikey, 'anon')
    assert.equal(h.Authorization, 'Bearer tok')
  } finally {
    m.restore()
  }
})

test('token recusado pelo Supabase: 401', async () => {
  const m = mockFetch(() => new Response('{}', { status: 401 }))
  try {
    assert.deepEqual(await authenticate(req('ruim'), env), { ok: false, status: 401, error: 'unauthorized' })
  } finally {
    m.restore()
  }
})

test('Supabase fora do ar: 503, e não 401', async () => {
  const m = mockFetch(() => {
    throw new Error('rede')
  })
  try {
    assert.deepEqual(await authenticate(req('tok'), env), { ok: false, status: 503, error: 'auth_unavailable' })
  } finally {
    m.restore()
  }
})

test('resposta sem id: 401', async () => {
  const m = mockFetch(() => new Response(JSON.stringify({}), { status: 200 }))
  try {
    assert.deepEqual(await authenticate(req('tok'), env), { ok: false, status: 401, error: 'unauthorized' })
  } finally {
    m.restore()
  }
})
