import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from './authStore'

/** Tela de entrada (e-mail e senha). O mesmo formulário cria a conta. */
export function LoginScreen() {
  const { t } = useTranslation()
  const { signIn, signUp } = useAuthStore()
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    const result = mode === 'signIn' ? await signIn(email.trim(), password) : await signUp(email.trim(), password)
    setBusy(false)
    if (result === 'check-email') setNotice(t('auth.checkEmail'))
    else if (result) setError(t(`auth.err.${result}`))
    // Sem erro: o estado de login muda e esta tela some.
  }

  const input =
    'w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={(e) => void submit(e)} className="w-full max-w-sm space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t('app.name')}</h1>
          <p className="mt-1 text-sm text-gray-600">{mode === 'signIn' ? t('auth.signInIntro') : t('auth.signUpIntro')}</p>
        </div>

        <label className="block">
          <span className="mb-0.5 block text-xs font-medium text-gray-600">{t('auth.email')}</span>
          <input className={input} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-xs font-medium text-gray-600">{t('auth.password')}</span>
          <input
            className={input}
            type="password"
            autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {mode === 'signUp' && <span className="mt-0.5 block text-xs text-gray-500">{t('auth.passwordHint')}</span>}
        </label>

        {error && (
          <p role="alert" className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="rounded border border-blue-200 bg-blue-50 p-2 text-sm text-blue-900">
            {notice}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {busy ? t('auth.wait') : mode === 'signIn' ? t('auth.signIn') : t('auth.signUp')}
        </button>

        <button
          type="button"
          className="w-full text-center text-sm text-blue-700 hover:underline"
          onClick={() => {
            setMode(mode === 'signIn' ? 'signUp' : 'signIn')
            setError(null)
            setNotice(null)
          }}
        >
          {mode === 'signIn' ? t('auth.toSignUp') : t('auth.toSignIn')}
        </button>
      </form>
    </div>
  )
}
