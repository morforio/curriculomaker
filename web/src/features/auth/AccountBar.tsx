import { useTranslation } from 'react-i18next'
import { useSyncStatus } from '../sync/syncStatus'
import { useAuthStore } from './authStore'

/** Conta no topo: e-mail, estado do salvamento e botão Sair. Some quando o login não está configurado. */
export function AccountBar() {
  const { t } = useTranslation()
  const status = useAuthStore((s) => s.status)
  const email = useAuthStore((s) => s.email)
  const signOut = useAuthStore((s) => s.signOut)
  const sync = useSyncStatus((s) => s.status)
  if (status !== 'signedIn') return null

  const label = sync === 'saving' ? t('sync.saving') : sync === 'saved' ? t('sync.saved') : sync === 'saveError' ? t('sync.saveError') : ''
  return (
    <div className="flex items-center gap-2 text-sm">
      {label && (
        <span role="status" className={sync === 'saveError' ? 'text-red-700' : 'text-gray-500'}>
          {label}
        </span>
      )}
      <span className="hidden max-w-[12rem] truncate text-gray-600 sm:inline" title={email ?? ''}>
        {email}
      </span>
      <button type="button" className="rounded border border-gray-300 px-3 py-1.5 text-gray-700 hover:bg-gray-100" onClick={() => void signOut()}>
        {t('auth.signOut')}
      </button>
    </div>
  )
}
