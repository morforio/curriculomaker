import { Trans, useTranslation } from 'react-i18next'
import { useLocked } from './useLocked'

/** Para onde vai o link "plano pro" do aviso: a página de planos. */
export const PRO_PLAN_URL = '/planos'

/** Aviso fixo (sem botão de fechar) enquanto a conta está travada: explica o que está bloqueado e convida ao plano pro. */
export function LockedBanner() {
  const { t } = useTranslation()
  if (!useLocked()) return null
  return (
    <div role="status" className="mx-4 mt-3 space-y-1 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 print:hidden">
      <p>{t('lock.banner1')}</p>
      <p>{t('lock.banner2')}</p>
      <p>
        <Trans
          i18nKey="lock.banner3"
          components={{ plan: <a href={PRO_PLAN_URL} className="font-semibold text-blue-300 underline hover:opacity-80" /> }}
        />
      </p>
    </div>
  )
}
