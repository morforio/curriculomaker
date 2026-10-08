/**
 * Confere o login do Supabase nas chamadas à API. O navegador manda o token da sessão em
 * "Authorization: Bearer ..."; aqui o Supabase diz de quem é (GET /auth/v1/user). Usa só a chave PÚBLICA (anon).
 * Sem SUPABASE_URL e SUPABASE_ANON_KEY a API FALHA FECHADA (503): se essas duas variáveis sumirem por engano, a IA não pode
 * ficar aberta a qualquer pessoa. O modo sem login só existe com AUTH_OPTIONAL=true (para testar localmente).
 */
export type AuthEnv = { SUPABASE_URL?: string; SUPABASE_ANON_KEY?: string; AUTH_OPTIONAL?: string }

/** O login está configurado? Se não, só o modo explícito AUTH_OPTIONAL=true deixa o site funcionar sem login. */
export function authMode(env: AuthEnv): 'configured' | 'optional' | 'broken' {
  if (env.SUPABASE_URL?.trim() && env.SUPABASE_ANON_KEY?.trim()) return 'configured'
  return env.AUTH_OPTIONAL?.trim().toLowerCase() === 'true' ? 'optional' : 'broken'
}

export type AuthResult =
  | { ok: true; userId: string | null }
  | { ok: false; status: 401 | 503; error: 'unauthorized' | 'auth_unavailable' }

export async function authenticate(request: Request, env: AuthEnv): Promise<AuthResult> {
  const base = env.SUPABASE_URL?.trim().replace(/\/+$/, '')
  const anon = env.SUPABASE_ANON_KEY?.trim()
  if (!base || !anon) {
    if (authMode(env) === 'optional') return { ok: true, userId: null }
    console.error('Login não configurado (SUPABASE_URL ou SUPABASE_ANON_KEY ausentes): a API recusa os pedidos.')
    return { ok: false, status: 503, error: 'auth_unavailable' }
  }

  const header = request.headers.get('Authorization') ?? ''
  const token = header.match(/^Bearer\s+(\S+)$/i)?.[1]
  if (!token) return { ok: false, status: 401, error: 'unauthorized' }

  let res: Response
  try {
    res = await fetch(`${base}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) })
  } catch (e) {
    console.error(`Supabase Auth inacessível: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`)
    return { ok: false, status: 503, error: 'auth_unavailable' }
  }
  if (res.status === 401 || res.status === 403) return { ok: false, status: 401, error: 'unauthorized' }
  if (!res.ok) {
    console.error(`Supabase Auth respondeu HTTP ${res.status}`)
    return { ok: false, status: 503, error: 'auth_unavailable' }
  }
  const user = (await res.json().catch(() => null)) as { id?: unknown } | null
  if (typeof user?.id !== 'string' || !user.id) return { ok: false, status: 401, error: 'unauthorized' }
  return { ok: true, userId: user.id }
}
