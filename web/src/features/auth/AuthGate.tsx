import { useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { LoginScreen } from './LoginScreen'
import { useAuthStore } from './authStore'

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center p-4 text-center text-sm text-gray-600">{children}</div>
}

/** Só deixa passar quem está logado. Com o login não configurado, o site abre direto (como antes de existir login). */
export function AuthGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const status = useAuthStore((s) => s.status)
  const init = useAuthStore((s) => s.init)

  useEffect(() => {
    void init()
  }, [init])

  if (status === 'loading') return <Centered>{t('auth.loading')}</Centered>
  if (status === 'error')
    return (
      <Centered>
        <div className="space-y-3">
          <p role="alert">{t('auth.configError')}</p>
          <button type="button" className="rounded border border-gray-300 px-3 py-1.5 text-gray-700 hover:bg-gray-100" onClick={() => window.location.reload()}>
            {t('auth.retry')}
          </button>
        </div>
      </Centered>
    )
  if (status === 'signedOut') return <LoginScreen />
  return <>{children}</>
}
