/**
 * O link do e-mail ("Esqueci minha senha") volta ao site com a resposta do Supabase no trecho depois do "#":
 *  - link bom:  #access_token=...&refresh_token=...&type=recovery
 *  - link ruim (expirado ou já usado): #error=access_denied&error_code=otp_expired&error_description=...
 * Precisa ser lido ANTES de o cliente do Supabase abrir a sessão, porque ele apaga esse trecho do endereço.
 */
export type AuthLink = { kind: 'recovery' } | { kind: 'error' } | null

export function parseAuthLink(hash: string): AuthLink {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  if (params.get('error') || params.get('error_code')) return { kind: 'error' }
  if (params.get('type') === 'recovery' && params.get('access_token')) return { kind: 'recovery' }
  return null
}
