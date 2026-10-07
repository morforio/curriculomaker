import { getSupabase } from '../../lib/supabase'

/** Cabeçalho com o token da sessão para as chamadas à API (vazio se não houver login). */
export async function authHeaders(): Promise<Record<string, string>> {
  const supabase = getSupabase()
  if (!supabase) return {}
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}
