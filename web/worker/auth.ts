/**
 * Confere o login do Supabase nas chamadas à API. O navegador manda o token da sessão em
 * "Authorization: Bearer ..."; aqui o Supabase diz de quem é (GET /auth/v1/user). Usa só a chave PÚBLICA (anon).
 * Sem SUPABASE_URL e SUPABASE_ANON_KEY, o login não é exigido (como era antes de existir login).
 */
export type AuthEnv = { SUPABASE_URL?: string; SUPABASE_ANON_KEY?: string }

export type AuthResult =
  | { ok: true; userId: string | null }
  | { ok: false; status: 401 | 503; error: 'unauthorized' | 'auth_unavailable' }

export async function authenticate(request: Request, env: AuthEnv): Promise<AuthResult> {
  const base = env.SUPABASE_URL?.trim().replace(/\/+$/, '')
  const anon = env.SUPABASE_ANON_KEY?.trim()
  if (!base || !anon) return { ok: true, userId: null }

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
