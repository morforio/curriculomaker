import assert from 'node:assert/strict'
import { test } from 'node:test'
import { publicConfig } from '../worker/config.ts'

/** Configuração pública servida em /api/config (worker/config.ts). */

const base = { SUPABASE_URL: ' https://x.supabase.co ', SUPABASE_ANON_KEY: ' anon ' }

test('com login configurado: devolve o Supabase (sem espaços) e nenhuma chave de captcha se não houver', () => {
  assert.deepEqual(publicConfig(base), { status: 200, body: { supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon' } })
})

test('com a chave pública do Turnstile configurada, ela vai junto', () => {
  const r = publicConfig({ ...base, TURNSTILE_SITE_KEY: ' 0x4AAAA ' })
  assert.deepEqual(r, { status: 200, body: { supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon', turnstileSiteKey: '0x4AAAA' } })
})

test('chave de captcha em branco é ignorada', () => {
  const r = publicConfig({ ...base, TURNSTILE_SITE_KEY: '   ' })
  assert.ok(!('turnstileSiteKey' in (r.body as object)))
})

test('sem login configurado: 503, a não ser com AUTH_OPTIONAL=true (só para testes locais)', () => {
  assert.equal(publicConfig({}).status, 503)
  assert.equal(publicConfig({ SUPABASE_URL: 'https://x.supabase.co' }).status, 503)
  assert.deepEqual(publicConfig({ AUTH_OPTIONAL: 'true' }), { status: 200, body: {} })
})

test('a configuração pública nunca carrega segredos: só os campos esperados', () => {
  const r = publicConfig({ ...base, TURNSTILE_SITE_KEY: 'k', LLM_API_KEY: 'segredo', TURNSTILE_SECRET_KEY: 'segredo2' } as never)
  assert.deepEqual(Object.keys(r.body as object).sort(), ['supabaseAnonKey', 'supabaseUrl', 'turnstileSiteKey'])
})
