import { create } from 'zustand'
import { loadSupabase, getSupabase } from '../../lib/supabase'
import { parseAuthLink, type AuthLink } from './recoveryLink'
import { useResumeStore } from '../../store/resumeStore'
import { syncControl } from '../sync/syncStatus'

/**
 * "disabled": login não configurado (o site funciona sem conta). "error": não deu para carregar a configuração.
 * "recovery": a pessoa abriu o link de "Esqueci minha senha" e precisa criar a nova senha antes de entrar no site.
 */
export type AuthStatus = 'loading' | 'disabled' | 'error' | 'signedOut' | 'signedIn' | 'recovery'

/** Chaves das mensagens de erro (i18n: auth.err.<chave>). */
export type AuthErrorKey = 'invalidCredentials' | 'alreadyExists' | 'weakPassword' | 'invalidEmail' | 'rateLimited' | 'notConfirmed' | 'captcha' | 'samePassword' | 'linkInvalid' | 'network' | 'generic'

type State = {
  status: AuthStatus
  userId: string | null
  email: string | null
  /** O link do e-mail estava expirado ou já tinha sido usado (aparece na tela de entrada). */
  linkError: boolean
  init: () => Promise<void>
  /** `captchaToken`: código do captcha (Turnstile), válido para uma única tentativa. */
  signIn: (email: string, password: string, captchaToken?: string) => Promise<AuthErrorKey | null>
  /** Devolve "check-email" se o projeto exigir confirmação por e-mail antes de entrar. */
  signUp: (email: string, password: string, captchaToken?: string) => Promise<AuthErrorKey | 'check-email' | null>
  /** Pede o e-mail com o link para criar uma nova senha. Não revela se o e-mail tem conta. */
  requestPasswordReset: (email: string, captchaToken?: string) => Promise<AuthErrorKey | null>
  /** Grava a nova senha (só vale depois de abrir o link do e-mail) e entra no site. */
  updatePassword: (password: string) => Promise<AuthErrorKey | null>
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
    case 'captcha_failed':
      return 'captcha'
    case 'same_password':
      return 'samePassword'
    case 'otp_expired':
    case 'session_not_found':
    case 'session_expired':
      return 'linkInvalid'
  }
  if (error.name === 'AuthSessionMissingError') return 'linkInvalid'
  if (error.name === 'AuthRetryableFetchError') return 'network'
  return 'generic'
}

let started = false
// O endereço é lido uma vez, antes de o cliente do Supabase abrir a sessão e apagar o trecho depois do "#".
let initialLink: AuthLink | undefined

export const useAuthStore = create<State>((set, get) => ({
  status: 'loading',
  userId: null,
  email: null,
  linkError: false,

  async init() {
    initialLink ??= parseAuthLink(window.location.hash)
    const link = initialLink
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
    const recovery = (user: { id: string; email?: string }) => set({ status: 'recovery', userId: user.id, email: user.email ?? null })
    const { data } = await client.auth.getSession()
    // Pelo link do e-mail a pessoa já chega com uma sessão aberta, mas só entra no site depois de criar a nova senha.
    if (link?.kind === 'recovery' && data.session) recovery(data.session.user)
    else apply(data.session?.user)
    if (link?.kind === 'error') {
      set({ linkError: true })
      history.replaceState(null, '', window.location.pathname + window.location.search)
    }
    client.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) return recovery(session.user)
      if (get().status === 'recovery' && event !== 'SIGNED_OUT') return // continua na tela da nova senha
      apply(session?.user)
    })
  },

  async signIn(email, password, captchaToken) {
    const supabase = getSupabase()
    if (!supabase) return 'generic'
    const { error } = await supabase.auth.signInWithPassword({ email, password, options: captchaToken ? { captchaToken } : undefined })
    return error ? errorKey(error) : null
  },

  async signUp(email, password, captchaToken) {
    const supabase = getSupabase()
    if (!supabase) return 'generic'
    const { data, error } = await supabase.auth.signUp({ email, password, options: captchaToken ? { captchaToken } : undefined })
    if (error) return errorKey(error)
    return data.session ? null : 'check-email'
  },

  async requestPasswordReset(email, captchaToken) {
    const supabase = getSupabase()
    if (!supabase) return 'generic'
    // O Supabase responde sucesso mesmo se o e-mail não tiver conta (para não revelar quem tem conta).
    const { error } = await supabase.auth.resetPasswordForEmail(email, captchaToken ? { captchaToken } : undefined)
    return error ? errorKey(error) : null
  },

  async updatePassword(password) {
    const supabase = getSupabase()
    if (!supabase) return 'generic'
    const { data, error } = await supabase.auth.updateUser({ password })
    if (error) return errorKey(error)
    history.replaceState(null, '', window.location.pathname + window.location.search)
    set(data.user ? { status: 'signedIn', userId: data.user.id, email: data.user.email ?? null } : { status: 'signedOut', userId: null, email: null })
    return null
  },

  async signOut() {
    const supabase = getSupabase()
    // Grava o que ficou pendente e só então sai; depois limpa o currículo deste navegador (o próximo usuário não pode vê-lo).
    await syncControl.flush().catch(() => {})
    await supabase?.auth.signOut()
    useResumeStore.getState().hydrate()
  },
}))
