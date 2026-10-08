import { authMode, type AuthEnv } from './auth.ts'

/** TURNSTILE_SITE_KEY é a chave PÚBLICA do captcha (a secreta fica só no painel do Supabase). Sem ela, a tela de login não mostra captcha. */
export type ConfigEnv = AuthEnv & { TURNSTILE_SITE_KEY?: string }

/**
 * Configuração pública servida em /api/config: endereço e chave pública do Supabase (e a chave pública do captcha, se houver).
 * Sem login configurado, o site só abre com AUTH_OPTIONAL=true; senão devolve 503.
 */
export function publicConfig(env: ConfigEnv): { status: number; body: unknown } {
  const mode = authMode(env)
  if (mode === 'optional') return { status: 200, body: {} }
  if (mode === 'broken') return { status: 503, body: { error: 'auth_unavailable', message: 'O login não está configurado.' } }
  const site = env.TURNSTILE_SITE_KEY?.trim()
  return {
    status: 200,
    body: {
      supabaseUrl: env.SUPABASE_URL!.trim(),
      supabaseAnonKey: env.SUPABASE_ANON_KEY!.trim(),
      ...(site ? { turnstileSiteKey: site } : {}),
    },
  }
}
