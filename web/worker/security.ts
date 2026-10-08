/**
 * Cabeçalhos de segurança de todas as respostas do Worker (site e API).
 *
 * A CSP (política de conteúdo) limita de onde a página carrega código e para onde ela envia dados. Assim, mesmo que um dia
 * alguém consiga injetar código no site, ele não consegue mandar o login ou o currículo para fora. A lista é curta de propósito:
 * o site só conversa com ele mesmo, com o Supabase (login e banco) e com o desafio Turnstile da Cloudflare (captcha do login).
 */
export type SecurityEnv = { SUPABASE_URL?: string }

const TURNSTILE = 'https://challenges.cloudflare.com'

/** Origem (esquema + domínio) do Supabase configurado, ou null se faltar ou estiver inválida. */
function supabaseOrigin(env: SecurityEnv): string | null {
  const raw = env.SUPABASE_URL?.trim()
  if (!raw) return null
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' ? url.origin : null
  } catch {
    return null
  }
}

export function contentSecurityPolicy(env: SecurityEnv): string {
  const supabase = supabaseOrigin(env)
  const connect = ["'self'", TURNSTILE, ...(supabase ? [supabase] : [])]
  return [
    "default-src 'self'",
    // Sem 'unsafe-inline' nem 'unsafe-eval' em scripts: só o código do próprio site e o desafio do Turnstile.
    `script-src 'self' ${TURNSTILE}`,
    // O React usa atributos style em alguns elementos (posições e tamanhos da prévia), por isso 'unsafe-inline' só em estilos.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connect.join(' ')}`,
    `frame-src ${TURNSTILE}`,
    // O leitor de PDF (pdf.js) roda num worker do próprio site.
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // Nenhum outro site pode embutir esta página (evita enganar cliques sobre a tela de login).
    "frame-ancestors 'none'",
  ].join('; ')
}

export function securityHeaders(env: SecurityEnv, contentType: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Strict-Transport-Security': 'max-age=31536000',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  }
  // A CSP só faz sentido em documentos; nos arquivos e na API ela só pesaria.
  if (contentType.toLowerCase().includes('text/html')) headers['Content-Security-Policy'] = contentSecurityPolicy(env)
  return headers
}

/** Cópia da resposta com os cabeçalhos de segurança (respostas vindas de ASSETS têm cabeçalhos imutáveis). */
export function withSecurityHeaders(response: Response, env: SecurityEnv): Response {
  const out = new Response(response.body, response)
  for (const [name, value] of Object.entries(securityHeaders(env, response.headers.get('Content-Type') ?? ''))) out.headers.set(name, value)
  return out
}

/** O corpo anunciado no cabeçalho já passa do limite? (O UTF-8 usa até 4 bytes por caractere.) Evita ler pedidos enormes. */
export function bodyTooLarge(request: Request, maxChars: number): boolean {
  const declared = Number(request.headers.get('Content-Length'))
  return Number.isFinite(declared) && declared > maxChars * 4
}
