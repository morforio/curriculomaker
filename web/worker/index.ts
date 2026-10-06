import { handleAnalyze } from './analyze.ts'
import type { Limiter } from './limiter.ts'
import { handleTranslate } from './translate.ts'

export { Limiter } from './limiter.ts'

interface Env {
  ASSETS: Fetcher
  LIMITER: DurableObjectNamespace<Limiter>
  /** Secret: chave do provedor de LLM (nunca vai ao navegador). */
  LLM_API_KEY?: string
  LLM_BASE_URL?: string
  LLM_MODEL?: string
  LLM_REASONING_EFFORT?: string
  /** Secret: chave do Jev (TypeSafe), que confere a introdução sugerida. Sem ela, a conferência é pulada. */
  TYPESAFE_API_KEY?: string
  TYPESAFE_BASE_URL?: string
  TYPESAFE_MODEL?: string
  RATE_PER_IP_HOUR?: string
  DAILY_CAP?: string
  TRANSLATE_PER_IP_HOUR?: string
  TRANSLATE_DAILY_CAP?: string
}

const number = (v: string | undefined, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/api/analyze') {
      const perIp = number(env.RATE_PER_IP_HOUR, 20)
      const cap = number(env.DAILY_CAP, 200)
      const limiter = env.LIMITER.getByName('global')
      return handleAnalyze(request, {
        env,
        ip: request.headers.get('CF-Connecting-IP') ?? 'unknown',
        limiter: { check: (ipKey) => limiter.check(ipKey, perIp, cap) },
      })
    }

    if (url.pathname === '/api/translate') {
      // Contadores próprios (outro objeto), para traduzir não gastar as análises de vaga.
      const perIp = number(env.TRANSLATE_PER_IP_HOUR, 20)
      const cap = number(env.TRANSLATE_DAILY_CAP, 200)
      const limiter = env.LIMITER.getByName('translate')
      return handleTranslate(request, {
        env,
        ip: request.headers.get('CF-Connecting-IP') ?? 'unknown',
        limiter: { check: (ipKey) => limiter.check(ipKey, perIp, cap) },
      })
    }

    if (url.pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
    }

    // Todo o resto é o site (arquivos estáticos, com fallback de SPA).
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
