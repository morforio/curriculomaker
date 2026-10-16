import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ThemeToggle } from '../theme/ThemeToggle'
import { useAuthStore } from './authStore'

const MIN_PASSWORD = 6

/** Tela de "criar nova senha": aparece quando a pessoa abre o link do e-mail de "Esqueci minha senha". Só depois de salvar ela entra no site. */
export function ResetPasswordScreen() {
  const { t } = useTranslation()
  const updatePassword = useAuthStore((s) => s.updatePassword)
  const signOut = useAuthStore((s) => s.signOut)
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < MIN_PASSWORD) return setError(t('auth.err.weakPassword'))
    if (password !== repeat) return setError(t('auth.passwordsDiffer'))
    setBusy(true)
    const failed = await updatePassword(password)
    setBusy(false)
    if (failed) setError(t(`auth.err.${failed}`))
    // Sem erro: o estado muda para "entrou" e esta tela some.
  }

  const input =
    'w-full rounded border border-gray-300 bg-white/5 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="fixed right-4 top-4 z-30">
        <ThemeToggle />
      </div>
      <form onSubmit={(e) => void submit(e)} className="w-full max-w-sm glass space-y-4 rounded-lg border border-gray-200 p-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t('auth.newPasswordTitle')}</h1>
          <p className="mt-1 text-sm text-gray-600">{t('auth.newPasswordIntro')}</p>
        </div>

        <label className="block">
          <span className="mb-0.5 block text-xs font-medium text-gray-600">{t('auth.newPassword')}</span>
          <input className={input} type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} value={password} onChange={(e) => setPassword(e.target.value)} />
          <span className="mt-0.5 block text-xs text-gray-500">{t('auth.passwordHint')}</span>
        </label>
        <label className="block">
          <span className="mb-0.5 block text-xs font-medium text-gray-600">{t('auth.repeatPassword')}</span>
          <input className={input} type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} value={repeat} onChange={(e) => setRepeat(e.target.value)} />
        </label>

        {error && (
          <p role="alert" className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded btn-prism px-3 py-2 text-sm font-medium disabled:cursor-not-allowed"
        >
          {busy ? t('auth.wait') : t('auth.saveNewPassword')}
        </button>
        <button type="button" className="w-full text-center text-sm text-blue-300 hover:underline" onClick={() => void signOut()}>
          {t('auth.cancel')}
        </button>
      </form>
    </div>
  )
}
