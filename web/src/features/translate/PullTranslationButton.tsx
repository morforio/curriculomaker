import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconLanguages } from '../../components/Icons'
import { LANG_NAMES, type Lang } from '../../lib/i18n'
import { hasContent, useResumeStore } from '../../store/resumeStore'
import { ApiError } from '../job-match/api'
import { requestTranslation } from './api'
import { planTranslation } from './resumeTranslation'

/**
 * "Traduzir": traz o conteúdo da OUTRA aba de idioma, traduzido, para a aba em que o usuário está.
 * Estou no português: pega o inglês e traz traduzido. Estou no inglês: pega o português e traz traduzido.
 * Substitui o conteúdo da aba atual (por isso pergunta antes). Complementa a pergunta que aparece só na primeira vez.
 */
export function PullTranslationButton() {
  const { t } = useTranslation()
  const { lang, saved } = useResumeStore()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [errorCode, setErrorCode] = useState<string | null>(null)

  const other: Lang = lang === 'pt' ? 'en' : 'pt'
  const source = saved[other]
  const enabled = Boolean(source && hasContent(source))
  const names = { from: LANG_NAMES[other], to: LANG_NAMES[lang] }

  async function confirm() {
    if (!source) return
    const plan = planTranslation(source)
    setBusy(true)
    setErrorCode(null)
    try {
      const translated = plan.texts.length > 0 ? await requestTranslation(other, lang, plan.texts) : []
      const result = plan.apply(translated)
      // Fica com as configurações desta aba (por exemplo, o tamanho da fonte); só o conteúdo vem da outra.
      const settings = useResumeStore.getState().resume.settings
      useResumeStore.getState().importResume({ ...result, settings })
      setOpen(false)
    } catch (e) {
      setErrorCode(e instanceof ApiError ? e.code : 'network')
    } finally {
      setBusy(false)
    }
  }

  const btn = 'rounded px-4 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50'

  return (
    <>
      <button
        type="button"
        disabled={!enabled}
        title={enabled ? t('tabs.pull.hint', names) : t('tabs.pull.empty', names)}
        onClick={() => {
          setErrorCode(null)
          setOpen(true)
        }}
        className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white/5 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <IconLanguages />
        {t('tabs.pull.button')}
      </button>

      {open && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4 print:hidden">
          <div role="dialog" aria-modal="true" aria-labelledby="pull-title" className="glass-strong w-full max-w-md rounded-lg border border-gray-200 p-5 shadow-xl">
            <h2 id="pull-title" className="text-base font-semibold text-gray-900">
              {t('tabs.pull.title')}
            </h2>
            <p className="mt-2 text-sm text-gray-700">{t('tabs.pull.ask', names)}</p>
            {busy && (
              <p role="status" className="mt-3 text-sm text-gray-600">
                {t('tabs.translating')}
              </p>
            )}
            {errorCode && (
              <p role="alert" className="mt-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {t(`tabs.err.${errorCode}`)}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" disabled={busy} className={`${btn} border border-gray-300 text-gray-700 hover:bg-gray-100`} onClick={() => setOpen(false)}>
                {t('tabs.no')}
              </button>
              <button type="button" disabled={busy} className={`${btn} bg-blue-600 text-white hover:bg-blue-700`} onClick={() => void confirm()}>
                {t('tabs.yes')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
