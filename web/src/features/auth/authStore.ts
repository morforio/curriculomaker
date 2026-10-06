import { create } from 'zustand'
import { loadSupabase, getSupabase } from '../../lib/supabase'
import { useResumeStore } from '../../store/resumeStore'
import { syncControl } from '../sync/syncStatus'

/** "disabled": login não configurado (o site funciona sem conta). "error": não deu para carregar a configuração. */
export type AuthStatus = 'loading' | 'disabled' | 'error' | 'signedOut' | 'signedIn'

/** Chaves das mensagens de erro (i18n: auth.err.<chave>). */
export type AuthErrorKey = 'invalidCredentials' | 'alreadyExists' | 'weakPassword' | 'invalidEmail' | 'rateLimited' | 'notConfirmed' | 'network' | 'generic'

type State = {
  status: AuthStatus
  userId: string | null
  email: string | null
  init: () => Promise<void>
  signIn: (email: string, password: string) => Promise<AuthErrorKey | null>
  /** Devolve "check-email" se o projeto exigir confirmação por e-mail antes de entrar. */
  signUp: (email: string, password: string) => Promise<AuthErrorKey | 'check-email' | null>
  signOut: () => Promise<void>
}

function errorKey(error: { code?: string; name?: string; message?: string }): AuthErrorKey {
  switch (error.code) {
    case 'invalid_credentials':
      return 'invalidCredentials'
    case 'user_already_exists':
    case 'email_exists':
      return 'alreadyExists'
    case 'weak_password':
      return 'weakPassword'
    case 'email_address_invalid':
    case 'validation_failed':
      return 'invalidEmail'
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'rateLimited'
    case 'email_not_confirmed':
      return 'notConfirmed'
  }
  if (error.name === 'AuthRetryableFetchError') return 'network'
  return 'generic'
}

let started = false

export const useAuthStore = create<State>((set) => ({
  status: 'loading',
  userId: null,
  email: null,

  async init() {
    const { client, failed } = await loadSupabase()
    if (failed) {
      set({ status: 'error' })
      return
    }
    if (!client) {
      set({ status: 'disabled' })
      return
    }
    if (started) return
    started = true
    const apply = (user: { id: string; email?: string } | null | undefined) =>
      set(user ? { status: 'signedIn', userId: user.id, email: user.email ?? null } : { status: 'signedOut', userId: null, email: null })
    const { data } = await client.auth.getSession()
    apply(data.session?.user)
    client.auth.onAuthStateChange((_event, session) => apply(session?.user))
  },

  async signIn(email, password) {
    const supabase = getSupabase()
    if (!supabase) return 'generic'
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? errorKey(error) : null
  },

  async signUp(email, password) {
    const supabase = getSupabase()
    if (!supabase) return 'generic'
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) return errorKey(error)
    return data.session ? null : 'check-email'
  },

  async signOut() {
    const supabase = getSupabase()
    // Grava o que ficou pendente e só então sai; depois limpa o currículo deste navegador (o próximo usuário não pode vê-lo).
    await syncControl.flush().catch(() => {})
    await supabase?.auth.signOut()
    useResumeStore.getState().hydrate(null)
  },
}))
