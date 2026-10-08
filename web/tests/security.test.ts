import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { handleAnalyze } from '../worker/analyze.ts'
import { bodyTooLarge, contentSecurityPolicy, securityHeaders, withSecurityHeaders } from '../worker/security.ts'
import { handleTranslate } from '../worker/translate.ts'

/** Cabeçalhos de segurança e limite de tamanho do corpo (worker/security.ts). */

const env = { SUPABASE_URL: 'https://abc.supabase.co/' }

test('CSP: só o próprio site, o Supabase configurado e o Turnstile; nada de eval nem script inline', () => {
  const csp = contentSecurityPolicy(env)
  assert.match(csp, /default-src 'self'/)
  assert.match(csp, /connect-src 'self' https:\/\/challenges\.cloudflare\.com https:\/\/abc\.supabase\.co(;|$)/)
  assert.match(csp, /script-src 'self' https:\/\/challenges\.cloudflare\.com(;|$)/)
  assert.doesNotMatch(csp, /unsafe-eval/)
  const script = csp.split('; ').find((d) => d.startsWith('script-src'))!
  assert.doesNotMatch(script, /unsafe-inline/)
})

test('CSP: ninguém pode embutir a página, e plugins e <base> externo são proibidos', () => {
  const csp = contentSecurityPolicy(env)
  assert.match(csp, /frame-ancestors 'none'/)
  assert.match(csp, /object-src 'none'/)
  assert.match(csp, /base-uri 'self'/)
  assert.match(csp, /form-action 'self'/)
})

test('CSP: sem Supabase configurado (ou com endereço inválido ou sem https), nenhum domínio extra é liberado', () => {
  for (const url of [undefined, '', 'isto nao e url', 'http://abc.supabase.co']) {
    const csp = contentSecurityPolicy({ SUPABASE_URL: url })
    assert.doesNotMatch(csp, /supabase/)
  }
})

test('cabeçalhos: sempre os gerais; a CSP só em documentos HTML', () => {
  const html = securityHeaders(env, 'text/html; charset=utf-8')
  assert.ok(html['Content-Security-Policy'])
  assert.equal(html['X-Content-Type-Options'], 'nosniff')
  assert.equal(html['X-Frame-Options'], 'DENY')
  assert.match(html['Strict-Transport-Security'], /max-age=31536000/)
  assert.ok(html['Referrer-Policy'])
  assert.match(html['Permissions-Policy'], /camera=\(\)/)
  const json = securityHeaders(env, 'application/json')
  assert.equal(json['Content-Security-Policy'], undefined)
  assert.equal(json['X-Content-Type-Options'], 'nosniff')
})

test('withSecurityHeaders: mantém corpo, status e cabeçalhos da resposta (mesmo vinda com cabeçalhos imutáveis)', async () => {
  const original = Response.redirect('https://currimaker.test/outra', 302)
  const redirected = withSecurityHeaders(original, env)
  assert.equal(redirected.status, 302)
  assert.equal(redirected.headers.get('Location'), 'https://currimaker.test/outra')
  assert.equal(redirected.headers.get('X-Frame-Options'), 'DENY')

  const page = withSecurityHeaders(new Response('<h1>oi</h1>', { status: 200, headers: { 'Content-Type': 'text/html', 'Cache-Control': 'public, max-age=0' } }), env)
  assert.equal(await page.text(), '<h1>oi</h1>')
  assert.equal(page.headers.get('Cache-Control'), 'public, max-age=0')
  assert.match(page.headers.get('Content-Security-Policy') ?? '', /frame-ancestors 'none'/)
})

test('bodyTooLarge: só recusa quando o tamanho anunciado passa do limite (4 bytes por caractere)', () => {
  const req = (len?: string) => new Request('https://x.test/api/analyze', { method: 'POST', headers: len ? { 'Content-Length': len } : {} })
  assert.equal(bodyTooLarge(req('1000'), 80_000), false)
  assert.equal(bodyTooLarge(req(String(80_000 * 4)), 80_000), false)
  assert.equal(bodyTooLarge(req(String(80_000 * 4 + 1)), 80_000), true)
  assert.equal(bodyTooLarge(req(), 80_000), false, 'sem o cabeçalho, a checagem depois de ler o corpo continua valendo')
  assert.equal(bodyTooLarge(req('abc'), 80_000), false)
})

test('análise e tradução recusam corpo anunciado enorme (413) sem ler o corpo nem chamar a IA', async () => {
  let calls = 0
  const provider = {
    async complete() {
      calls++
      return '{}'
    },
  }
  const limiter = { check: async () => 'ok' as const }
  for (const handle of [handleAnalyze, handleTranslate]) {
    const request = new Request('https://x.test/api/x', { method: 'POST', headers: { 'Content-Length': '99999999', 'Content-Type': 'application/json' }, body: '{}' })
    const res = await handle(request, { env: {}, ip: '1.2.3.4', limiter, provider })
    assert.equal(res.status, 413)
  }
  assert.equal(calls, 0)
})

/** Os arquivos do site recebem os cabeçalhos pelo arquivo public/_headers; ele precisa seguir a política de worker/security.ts. */
test('public/_headers tem os mesmos cabeçalhos e a mesma CSP de worker/security.ts, com o SUPABASE_URL do wrangler.jsonc', () => {
  const headersFile = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8')
  const wrangler = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8')
  const supabaseUrl = wrangler.match(/"SUPABASE_URL"\s*:\s*"([^"]+)"/)?.[1]
  assert.ok(supabaseUrl, 'SUPABASE_URL não encontrado no wrangler.jsonc')

  const fromFile: Record<string, string> = {}
  for (const line of headersFile.split('\n')) {
    const m = line.match(/^\s+([A-Za-z-]+):\s*(.+)$/)
    if (m) fromFile[m[1]] = m[2].trim()
  }
  const expected = securityHeaders({ SUPABASE_URL: supabaseUrl }, 'text/html')
  assert.deepEqual(fromFile, expected)
  assert.match(headersFile, /^\/\*$/m, 'os cabeçalhos valem para todos os caminhos')
})
