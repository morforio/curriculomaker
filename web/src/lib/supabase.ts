import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * O cliente do Supabase é criado com a configuração pública que o Worker serve em /api/config
 * (URL do projeto e chave "anon", que é pública por desenho: quem protege os dados é o RLS do banco).
 * Sem configuração, o site funciona sem login.
 */
export type SupabaseLoad = { client: SupabaseClient | null; failed: boolean }

let pending: Promise<SupabaseLoad> | null = null
let client: SupabaseClient | null = null
let turnstileSiteKey: string | null = null

async function create(): Promise<SupabaseLoad> {
  try {
    const res = await fetch('/api/config')
    if (!res.ok) return { client: null, failed: true }
    const cfg = (await res.json()) as { supabaseUrl?: string; supabaseAnonKey?: string; turnstileSiteKey?: string }
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return { client: null, failed: false }
    client = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey)
    turnstileSiteKey = cfg.turnstileSiteKey?.trim() || null
    return { client, failed: false }
  } catch {
    return { client: null, failed: true }
  }
}

/** Carrega a configuração (uma vez, a menos que tenha falhado). `client: null` sem falha = login não configurado. */
export function loadSupabase(): Promise<SupabaseLoad> {
  pending ??= create().then((r) => {
    if (r.failed) pending = null // permite tentar de novo
    return r
  })
  return pending
}

/** O cliente já carregado (null antes de `loadSupabase` terminar ou sem login configurado). */
export function getSupabase(): SupabaseClient | null {
  return client
}

/** Chave pública do captcha (Turnstile), ou null se o captcha não estiver configurado. */
export function getTurnstileSiteKey(): string | null {
  return turnstileSiteKey
}
