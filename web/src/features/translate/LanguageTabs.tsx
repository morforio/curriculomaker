import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { LANG_NAMES, type Lang } from '../../lib/i18n'
import { LANGS } from '../../lib/schemas/analysis'
import { hasContent, useResumeStore } from '../../store/resumeStore'
import { ApiError } from '../job-match/api'
import { requestTranslation } from './api'
import { LANG_THEME, STRIPE_HEIGHT } from './langTheme'
import { planTranslation } from './resumeTranslation'

/**
 * Abas de idioma do currículo (como no LinkedIn). Trocar de aba muda o currículo e a interface.
 * `above` (o botão Traduzir) fica acima da legenda "Idioma do currículo a ser gerado", à esquerda das abas.
 */
export function LanguageTabs({ above }: { above?: ReactNode }) {
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
      <div className="flex items-end gap-4">
        <div className="flex flex-col items-start gap-1.5 pb-2">
          {above}
          <span className="hidden text-xs text-gray-500 md:block">{t('tabs.caption')}</span>
        </div>
        <div role="tablist" aria-label={t('tabs.label')} className="flex items-end gap-1">
          {LANGS.map((l) => {
            const active = l === lang
            return (
              <button
                key={l}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => select(l)}
                // A aba ativa desce sobre a faixa colorida (margem negativa) e a esconde por baixo dela: parece uma aba de navegador.
                style={active ? { borderColor: LANG_THEME[l].color, marginBottom: -STRIPE_HEIGHT } : undefined}
                className={`rounded-t-lg border-x-2 border-t-[3px] px-4 pt-1.5 text-sm ${
                  active ? 'relative z-10 bg-[#0d1018] pb-2.5 font-semibold text-gray-900' : 'border-transparent pb-2 text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                {LANG_NAMES[l]}
              </button>
            )
          })}
        </div>
      </div>
      {target && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4 print:hidden">
          <div role="dialog" aria-modal="true" aria-labelledby="translate-title" className="glass-strong w-full max-w-md rounded-lg border border-gray-200 p-5 shadow-xl">
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

/** Faixa colorida sob a barra superior, na cor do idioma ativo (a aba ativa a atravessa). */
export function LanguageStripe() {
  const lang = useResumeStore((s) => s.lang)
  return <div aria-hidden="true" className="w-full" style={{ height: STRIPE_HEIGHT, background: LANG_THEME[lang].stripe }} />
}
