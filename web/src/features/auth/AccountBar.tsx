import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconUser } from '../../components/Icons'
import { useSyncStatus } from '../sync/syncStatus'
import { useAuthStore } from './authStore'

/** Conta no canto direito: estado do salvamento e um avatar que abre o e-mail e o botão Sair. Some sem login configurado. */
export function AccountBar() {
  const { t } = useTranslation()
  const status = useAuthStore((s) => s.status)
  const email = useAuthStore((s) => s.email)
  const signOut = useAuthStore((s) => s.signOut)
  const sync = useSyncStatus((s) => s.status)
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  // Fecha o menu ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (status !== 'signedIn') return null

  const label = sync === 'saving' ? t('sync.saving') : sync === 'saved' ? t('sync.saved') : sync === 'saveError' ? t('sync.saveError') : ''
  return (
    <div ref={box} className="relative flex items-center gap-2">
      {label && (
        <span role="status" className={`hidden text-xs sm:inline ${sync === 'saveError' ? 'text-red-700' : 'text-gray-400'}`}>
          {label}
        </span>
      )}
      <button
        type="button"
        aria-label={t('auth.account')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-gray-600 hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <IconUser />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-10 z-30 w-64 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
          <p className="px-2 pt-1 text-xs text-gray-500">{t('auth.signedInAs')}</p>
          <p className="truncate px-2 pb-2 text-sm font-medium text-gray-900" title={email ?? ''}>
            {email}
          </p>
          <button
            type="button"
            role="menuitem"
            className="w-full rounded-md px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100"
            onClick={() => {
              setOpen(false)
              void signOut()
            }}
          >
            {t('auth.signOut')}
          </button>
        </div>
      )}
    </div>
  )
}
