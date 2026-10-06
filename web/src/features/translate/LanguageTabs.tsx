import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LANG_NAMES, type Lang } from '../../lib/i18n'
import { LANGS } from '../../lib/schemas/analysis'
import { hasContent, useResumeStore } from '../../store/resumeStore'
import { ApiError } from '../job-match/api'
import { requestTranslation } from './api'
import { planTranslation } from './resumeTranslation'

/** Abas de idioma do currículo (como no LinkedIn). Trocar de aba muda o currículo e a interface. */
export function LanguageTabs() {
  const { t } = useTranslation()
  const { lang, resume, saved, switchLang } = useResumeStore()
  const [target, setTarget] = useState<Lang | null>(null)
  const [busy, setBusy] = useState(false)
  const [errorCode, setErrorCode] = useState<string | null>(null)

  function select(next: Lang) {
    if (next === lang) return
    // Aba já aberta antes, ou currículo ainda vazio: troca direto, sem perguntar.
    if (saved[next] || !hasContent(resume)) {
      switchLang(next)
      return
    }
    setErrorCode(null)
    setTarget(next)
  }

  function answerNo() {
    if (target) switchLang(target)
    setTarget(null)
  }

  async function answerYes() {
    if (!target) return
    const plan = planTranslation(resume)
    setBusy(true)
    setErrorCode(null)
    try {
      const translated = plan.texts.length > 0 ? await requestTranslation(lang, target, plan.texts) : []
      switchLang(target, plan.apply(translated))
      setTarget(null)
    } catch (e) {
      setErrorCode(e instanceof ApiError ? e.code : 'network')
    } finally {
      setBusy(false)
    }
  }

  const btn = 'rounded px-4 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50'

  return (
    <>
      <div role="tablist" aria-label={t('tabs.label')} className="flex rounded-lg border border-gray-300 bg-gray-50 p-0.5">
        {LANGS.map((l) => (
          <button
            key={l}
            type="button"
            role="tab"
            aria-selected={l === lang}
            onClick={() => select(l)}
            className={`rounded-md px-3 py-1 text-sm font-medium ${l === lang ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
          >
            {LANG_NAMES[l]}
          </button>
        ))}
      </div>

      {target && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4 print:hidden">
          <div role="dialog" aria-modal="true" aria-labelledby="translate-title" className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
            <h2 id="translate-title" className="text-base font-semibold text-gray-900">
              {t('tabs.askTitle')}
            </h2>
            <p className="mt-2 text-sm text-gray-700">{t('tabs.ask', { from: LANG_NAMES[lang], to: LANG_NAMES[target] })}</p>
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
              <button type="button" disabled={busy} className={`${btn} border border-gray-300 text-gray-700 hover:bg-gray-100`} onClick={answerNo}>
                {t('tabs.no')}
              </button>
              <button type="button" disabled={busy} className={`${btn} bg-blue-600 text-white hover:bg-blue-700`} onClick={() => void answerYes()}>
                {t('tabs.yes')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
