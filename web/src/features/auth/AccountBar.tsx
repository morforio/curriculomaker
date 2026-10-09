import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconUser } from '../../components/Icons'
import { useCreditsStore } from '../credits/creditsStore'
import { useSyncStatus } from '../sync/syncStatus'
import { useAuthStore } from './authStore'

const formatDate = (iso: string, lang: string) => new Date(iso).toLocaleDateString(lang, { day: '2-digit', month: '2-digit', year: 'numeric' })

/** Conta no canto direito: estado do salvamento e um avatar que abre o e-mail e o botão Sair. Some sem login configurado. */
export function AccountBar() {
  const { t, i18n } = useTranslation()
  const status = useAuthStore((s) => s.status)
  const email = useAuthStore((s) => s.email)
  const signOut = useAuthStore((s) => s.signOut)
  const sync = useSyncStatus((s) => s.status)
  const account = useCreditsStore((s) => s.account)
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

  // Mantém o contador em dia: lê ao entrar, ao voltar para a aba (pagamento, outro aparelho) e some ao sair.
  useEffect(() => {
    if (status !== 'signedIn') {
      useCreditsStore.getState().clear()
      return
    }
    const refresh = () => void useCreditsStore.getState().refresh()
    refresh()
    const onVisible = () => document.visibilityState === 'visible' && refresh()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [status])

  if (status !== 'signedIn') return null

  const label = sync === 'saving' ? t('sync.saving') : sync === 'saved' ? t('sync.saved') : sync === 'saveError' ? t('sync.saveError') : ''
  return (
    <div ref={box} className="relative flex items-center gap-2">
      {label && (
        <span role="status" className={`hidden text-xs sm:inline ${sync === 'saveError' ? 'text-red-700' : 'text-gray-400'}`}>
          {label}
        </span>
      )}
      <div className="relative">
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
        {account && (
          <span
            role="status"
            title={t('credits.count', { count: account.credits })}
            aria-label={t('credits.count', { count: account.credits })}
            className={`pointer-events-none absolute -top-2.5 left-1/2 min-w-5 -translate-x-1/2 rounded-full px-1.5 text-center text-[11px] font-bold leading-4 text-white ring-2 ring-[#07080c] ${account.locked ? 'bg-red-600' : account.paid ? 'bg-blue-600' : 'bg-amber-600'}`}
          >
            {account.credits}
          </span>
        )}
      </div>
      {open && (
        <div role="menu" className="absolute right-0 top-10 z-30 w-64 glass-strong rounded-lg border border-gray-200 p-2 shadow-lg">
          <p className="px-2 pt-1 text-xs text-gray-500">{t('auth.signedInAs')}</p>
          <p className="truncate px-2 pb-2 text-sm font-medium text-gray-900" title={email ?? ''}>
            {email}
          </p>
          {account && (
            <div className="mb-2 border-t border-gray-200 px-2 py-2 text-xs text-gray-500">
              <p className={`text-sm font-medium ${account.locked ? 'text-red-700' : 'text-gray-900'}`}>{account.paid ? t('credits.planPaid') : t('credits.planFree')}</p>
              <p>{t('credits.count', { count: account.credits })}</p>
              {account.credits > 0 && account.credits_expire_at && <p>{t('credits.validUntil', { date: formatDate(account.credits_expire_at, i18n.language) })}</p>}
              {account.paid && account.paid_until && <p>{t('credits.paidUntil', { date: formatDate(account.paid_until, i18n.language) })}</p>}
              {account.locked && <p className="mt-1 text-red-700">{t('credits.locked')}</p>}
            </div>
          )}
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
