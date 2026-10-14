import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconDownload, IconTrash, IconUpload } from './components/Icons'
import { AccountBar } from './features/auth/AccountBar'
import { LockedBanner } from './features/credits/LockedBanner'
import { useCreditsStore } from './features/credits/creditsStore'
import { useLocked } from './features/credits/useLocked'
import { useAuthStore } from './features/auth/authStore'
import { Editor } from './features/editor/Editor'
import { exportPdf, usePrintGuard } from './features/export/exportPdf'
import { NoticeBanner } from './features/notice/NoticeBanner'
import { ImportDialog } from './features/import-pdf/ImportDialog'
import { ResumePreview } from './features/preview/ResumePreview'
import { useSyncStatus } from './features/sync/syncStatus'
import { useResumeSync } from './features/sync/useResumeSync'
import { LanguageCaption, LanguageStripe, LanguageTabs } from './features/translate/LanguageTabs'
import { PullTranslationButton } from './features/translate/PullTranslationButton'
import { LANG_NAMES, setLang } from './lib/i18n'
import { useResumeStore } from './store/resumeStore'

// Botões de ação do lado direito: tom azulado, para se distinguirem do botão Traduzir (cinza), que fica junto das abas de idioma.
const btnAction =
  'inline-flex items-center gap-1.5 rounded-md border border-blue-400/30 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-300 transition duration-200 hover:-translate-y-0.5 hover:border-blue-300/70 hover:bg-blue-500/20 hover:shadow-[0_6px_20px_rgba(100,170,255,0.3)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:bg-blue-500/10 disabled:hover:shadow-none'

function App() {
  const { t } = useTranslation()
  const { lang, resume, reset } = useResumeStore()
  const [importing, setImporting] = useState(false)
  const locked = useLocked()
  const account = useCreditsStore((s) => s.account)

  // A aba ativa define o idioma da interface.
  useEffect(() => setLang(lang), [lang])

  // O título do documento vira o nome sugerido do PDF e o metadado "Title".
  const fullName = resume.header.fullName.trim()
  useEffect(() => {
    // "CurriMaker" primeiro: é o que o usuário procura entre as abas abertas.
    document.title = fullName ? `${t('app.name')} - ${fullName}` : t('app.name')
    // Ao sair (a tela de login substitui o editor), o nome da pessoa não pode ficar na aba.
    return () => {
      document.title = t('app.name')
    }
  }, [fullName, t])

  // Com login, o currículo vem da conta antes de aparecer; se não carregar, nada é mostrado (nem gravado por cima).
  useResumeSync()
  usePrintGuard()
  const signedIn = useAuthStore((s) => s.status === 'signedIn')
  const sync = useSyncStatus((s) => s.status)
  if (signedIn && (sync === 'idle' || sync === 'loading')) {
    return <div className="flex min-h-screen items-center justify-center p-4 text-sm text-gray-600">{t('sync.loading')}</div>
  }
  if (signedIn && sync === 'loadError') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 text-center text-sm text-gray-600">
        <div className="space-y-3">
          <p role="alert">{t('sync.loadError')}</p>
          <button type="button" className="rounded border border-gray-300 px-3 py-1.5 text-gray-700 hover:bg-gray-100" onClick={() => window.location.reload()}>
            {t('auth.retry')}
          </button>
        </div>
      </div>
    )
  }

  function startImport() {
    if (locked) return
    // Quem escolher a aba errada só descobre depois: avisa antes de abrir o envio do arquivo.
    if (window.confirm(t('import.langWarning', { lang: LANG_NAMES[lang] }))) setImporting(true)
  }

  return (
    <div className="min-h-screen">
      <div className="print:hidden">
        <header className="sticky top-0 z-20 bg-[#07102a]/70 backdrop-blur-md">
          {/* Uma só linha no computador: logo, Traduzir, abas e, à direita, Salvo, ações, Planos e avatar.
              Cada grupo tem 37 px de altura (a das abas) e encosta embaixo, então todos ficam centralizados na mesma linha. Em telas menores quebra em duas. */}
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2 px-5 pt-[26px] xl:gap-x-10">
            {/* O emblema é mais alto que a linha (37 px): fica com a base logo acima da linha colorida e sobe pelo espaço de cima; o nome fica centralizado na linha. */}
            <h1 className="order-1 flex items-end gap-2.5 text-gray-900" aria-label={t('app.name')}>
              <img src="/emblem.png" alt="" aria-hidden="true" className="emblem mb-[3px]" />
              <span aria-hidden="true" className="flex h-[37px] items-center">
                <span className="block leading-none">
                  <span className="block text-lg tracking-wide">
                    <span className="font-light">Curri</span>
                    <span className="font-semibold">Maker</span>
                  </span>
                  <span className="mt-0.5 block text-[8px] uppercase tracking-[0.22em] text-gray-500">Career intelligence</span>
                </span>
              </span>
            </h1>
            <div className="order-3 w-full xl:order-2 xl:w-auto">
              <LanguageTabs before={<PullTranslationButton />} />
            </div>
            <div className="order-2 ml-auto flex flex-wrap items-center justify-end gap-3 xl:order-3 xl:h-[37px] xl:flex-nowrap">
              <AccountBar>
                <button type="button" className={btnAction} onClick={startImport} disabled={locked} title={locked ? t('lock.tooltip') : undefined}>
                  <IconUpload />
                  {t('import.button')}
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:bg-red-50 hover:text-red-700"
                  onClick={() => {
                    if (window.confirm(t('toolbar.confirmReset'))) reset()
                  }}
                >
                  <IconTrash />
                  {t('toolbar.reset')}
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-md btn-prism px-3.5 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => void exportPdf()}
                  disabled={locked}
                  title={locked ? t('lock.tooltip') : account && !account.paid ? t('toolbar.exportCost') : undefined}
                >
                  <IconDownload />
                  {t('toolbar.exportPdf')}
                </button>
              </AccountBar>
            </div>
          </div>
          <LanguageStripe />
        </header>
        <NoticeBanner />
        <LockedBanner />
        {/* Legenda das abas: no corpo da página, abaixo das abas e antes do primeiro bloco (e não na barra, que fica com uma só linha). */}
        <LanguageCaption />
      </div>

      {importing && <ImportDialog onClose={() => setImporting(false)} />}

      <main className="grid grid-cols-1 gap-6 p-4 lg:grid-cols-2 print:block print:p-0">
        <div className="float-block print:hidden">
          <Editor />
        </div>
        <div className="relative min-w-0">
          <ResumePreview resume={resume} />
        </div>
      </main>
    </div>
  )
}

export default App
