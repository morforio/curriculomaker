import { useTranslation } from 'react-i18next'
import { useLocked } from './useLocked'

/** Aviso fixo (sem botão de fechar) enquanto a conta está travada: explica o que está bloqueado. */
export function LockedBanner() {
  const { t } = useTranslation()
  if (!useLocked()) return null
  return (
    <div role="status" className="mx-4 mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 print:hidden">
      {t('lock.banner')}
    </div>
  )
}
