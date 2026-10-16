import { useLayoutEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { LANG_NAMES, type Lang } from '../../lib/i18n'
import { LANGS } from '../../lib/schemas/analysis'
import { hasContent, useResumeStore } from '../../store/resumeStore'
import { useLocked } from '../credits/useLocked'
import { ApiError } from '../job-match/api'
import { requestTranslation } from './api'
import { LANG_THEME, STRIPE_HEIGHT } from './langTheme'
import { planTranslation } from './resumeTranslation'

/**
 * Abas de idioma do currículo (como no LinkedIn). Trocar de aba muda o currículo e a interface.
 * `before` (o botão Traduzir) fica à esquerda das abas, na mesma linha delas. A legenda "Idioma do currículo a ser gerado" não fica na barra
 * (para ela ter uma só linha): é o LanguageCaption, no corpo da página, logo abaixo das abas e antes do primeiro bloco.
 */
export function LanguageTabs({ before }: { before?: ReactNode }) {
  const { t, i18n } = useTranslation()
  const tp = i18n.getFixedT('pt') // as abas ficam na barra superior: sempre em português
  const { lang, resume, saved, switchLang } = useResumeStore()
  const [target, setTarget] = useState<Lang | null>(null)
  const [busy, setBusy] = useState(false)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const locked = useLocked()

  function select(next: Lang) {
    if (next === lang || locked) return
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
      <div className="flex items-end gap-4 xl:h-full xl:items-center">
        {before && <div className="flex h-[37px] items-center xl:h-auto">{before}</div>}
        <div id="lang-tabs" role="tablist" aria-label={tp('tabs.label')} className="flex items-end gap-1 xl:h-full xl:items-stretch">
          {LANGS.map((l) => {
            const active = l === lang
            return (
              <button
                key={l}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => select(l)}
                disabled={locked && !active}
                title={locked && !active ? tp('lock.tooltip') : undefined}
                // A aba ativa desce sobre a faixa colorida (margem negativa) e a esconde por baixo dela: parece uma aba de navegador.
                style={active ? { borderColor: LANG_THEME[l].color, marginBottom: -STRIPE_HEIGHT } : undefined}
                className={`rounded-t-lg border-x-2 border-t-[3px] px-4 pt-1.5 text-sm xl:flex xl:items-center xl:py-0 ${
                  active ? 'relative z-10 bg-[var(--tab-bg)] pb-2.5 font-semibold text-gray-900' : 'border-transparent pb-2 text-gray-500 hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent'
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
              <button type="button" disabled={busy} className={`${btn} btn-prism`} onClick={() => void answerYes()}>
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
  const theme = LANG_THEME[lang]
  return <div aria-hidden="true" className="w-full" style={{ height: STRIPE_HEIGHT, background: theme.line, boxShadow: theme.glow }} />
}

/**
 * Legenda das abas: uma aba invertida (pendurada na linha colorida), no corpo da página (rola junto com o conteúdo), com a largura das abas juntas.
 * A posição e a largura vêm das próprias abas (medidas no navegador), então a legenda acompanha o espaço que sobra: se faltar, corta com reticências.
 */
export function LanguageCaption() {
  const { i18n } = useTranslation()
  const tp = i18n.getFixedT('pt') // legenda das abas: sempre em português, como a barra
  const lang = useResumeStore((s) => s.lang)
  const theme = LANG_THEME[lang]
  const [box, setBox] = useState<{ left: number; width: number } | null>(null)

  useLayoutEffect(() => {
    const tabs = document.getElementById('lang-tabs')
    if (!tabs) return
    const measure = () => {
      const r = tabs.getBoundingClientRect()
      setBox((old) => (old && Math.abs(old.left - r.left) < 0.5 && Math.abs(old.width - r.width) < 0.5 ? old : { left: r.left, width: r.width }))
    }
    measure()
    // As abas mudam de lugar quando a barra quebra em duas linhas, quando o emblema da logo termina de carregar ou quando o botão Traduzir muda
    // de largura: observa a página e cada grupo da barra (logo, abas, ações), e mede de novo quando as fontes e imagens terminam de carregar.
    const ro = new ResizeObserver(measure)
    ro.observe(tabs)
    ro.observe(document.documentElement)
    tabs.closest('header')?.querySelectorAll(':scope > div > *').forEach((group) => ro.observe(group))
    window.addEventListener('load', measure)
    void document.fonts?.ready.then(measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('load', measure)
    }
  }, [])

  return (
    <p
      style={{ ...(box ? { marginLeft: box.left, width: box.width } : {}), borderColor: theme.capBorder, background: theme.capBg }}
      className="truncate rounded-b-lg border-x-2 border-b-2 px-3 pb-1 pt-1 text-center text-xs text-gray-700 backdrop-blur-sm"
    >
      {tp('tabs.caption')}
    </p>
  )
}
