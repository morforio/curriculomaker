import { handleAnalyze } from './analyze.ts'
import { authenticate, authMode } from './auth.ts'
import type { Limiter } from './limiter.ts'
import { withSecurityHeaders } from './security.ts'
import { handleTranslate } from './translate.ts'

export { Limiter } from './limiter.ts'

interface Env {
  ASSETS: Fetcher
  LIMITER: DurableObjectNamespace<Limiter>
  /** Secret: chave do provedor de LLM (nunca vai ao navegador). */
  LLM_API_KEY?: string
  LLM_BASE_URL?: string
  LLM_MODEL?: string
  LLM_FALLBACK_MODEL?: string
  LLM_REASONING_EFFORT?: string
  /** Secret: chave do Jev (TypeSafe), que confere a introdução sugerida. Sem ela, a conferência é pulada. */
  TYPESAFE_API_KEY?: string
  TYPESAFE_BASE_URL?: string
  TYPESAFE_MODEL?: string
  /** Públicos (a chave "anon" do Supabase é pública por desenho): vão ao navegador em /api/config. Sem eles, não há login. */
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
  /** "true" só para testar localmente sem login. Em produção NÃO existe: sem login configurado, a API recusa tudo. */
  AUTH_OPTIONAL?: string
  RATE_PER_IP_HOUR?: string
  DAILY_CAP?: string
  TRANSLATE_PER_IP_HOUR?: string
  TRANSLATE_DAILY_CAP?: string
}

const number = (v: string | undefined, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)

  // Configuração pública do login. Sem ela, o site só abre se AUTH_OPTIONAL=true; senão o site mostra erro (a API também recusa).
  if (url.pathname === '/api/config') {
    const mode = authMode(env)
    if (mode === 'configured') return json(200, { supabaseUrl: env.SUPABASE_URL!.trim(), supabaseAnonKey: env.SUPABASE_ANON_KEY!.trim() })
    if (mode === 'optional') return json(200, {})
    return json(503, { error: 'auth_unavailable', message: 'O login não está configurado.' })
  }

  if (url.pathname === '/api/analyze' || url.pathname === '/api/translate') {
    // Com o login configurado, só quem está logado usa a IA; o limite passa a ser por usuário (não por IP).
    const auth = await authenticate(request, env)
    if (!auth.ok) return json(auth.status, { error: auth.error, message: auth.status === 401 ? 'Entre na sua conta para continuar.' : 'Não foi possível conferir o login agora.' })
    const who = auth.userId ?? request.headers.get('CF-Connecting-IP') ?? 'unknown'

    if (url.pathname === '/api/analyze') {
      const perIp = number(env.RATE_PER_IP_HOUR, 20)
      const cap = number(env.DAILY_CAP, 200)
      const limiter = env.LIMITER.getByName('global')
      return handleAnalyze(request, { env, ip: who, limiter: { check: (key) => limiter.check(key, perIp, cap) } })
    }

    // Contadores próprios (outro objeto), para traduzir não gastar as análises de vaga.
    const perIp = number(env.TRANSLATE_PER_IP_HOUR, 20)
    const cap = number(env.TRANSLATE_DAILY_CAP, 200)
    const limiter = env.LIMITER.getByName('translate')
    return handleTranslate(request, { env, ip: who, limiter: { check: (key) => limiter.check(key, perIp, cap) } })
  }

  if (url.pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
  }

  // Todo o resto é o site (arquivos estáticos, com fallback de SPA).
  return env.ASSETS.fetch(request)
}

export default {
  // Toda resposta (site e API) sai com os cabeçalhos de segurança (worker/security.ts).
  async fetch(request, env): Promise<Response> {
    return withSecurityHeaders(await route(request, env), env)
  },
} satisfies ExportedHandler<Env>
