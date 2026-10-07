import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconDownload, IconTrash, IconUpload, IconWand } from './components/Icons'
import { AccountBar } from './features/auth/AccountBar'
import { useAuthStore } from './features/auth/authStore'
import { Editor } from './features/editor/Editor'
import { ImportDialog } from './features/import-pdf/ImportDialog'
import { ResumePreview } from './features/preview/ResumePreview'
import { useSyncStatus } from './features/sync/syncStatus'
import { useResumeSync } from './features/sync/useResumeSync'
import { WizardDialog } from './features/wizard/WizardDialog'
import { LanguageStripe, LanguageTabs } from './features/translate/LanguageTabs'
import { PullTranslationButton } from './features/translate/PullTranslationButton'
import { LANG_NAMES, setLang } from './lib/i18n'
import { useResumeStore } from './store/resumeStore'

const btnSecondary =
  'inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50'

function App() {
  const { t } = useTranslation()
  const { lang, resume, reset } = useResumeStore()
  const [importing, setImporting] = useState(false)
  const [wizard, setWizard] = useState(false)

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
    // Quem escolher a aba errada só descobre depois: avisa antes de abrir o envio do arquivo.
    if (window.confirm(t('import.langWarning', { lang: LANG_NAMES[lang] }))) setImporting(true)
  }

  return (
    <div className="min-h-screen">
      <div className="print:hidden">
        <header className="sticky top-0 z-20 bg-white">
          {/* Telas menores: logo e botões em cima, abas na linha de baixo (sempre encostadas na faixa). A partir de lg, tudo numa linha só. */}
          <div className="grid grid-cols-[auto_1fr] items-end gap-x-6 gap-y-1 px-4 pt-2 lg:flex">
            <h1 className="col-start-1 row-start-1 pb-2 text-lg font-bold text-gray-900">{t('app.name')}</h1>
            <div className="col-span-2 row-start-2 flex items-end gap-3 lg:col-auto lg:row-auto">
              <LanguageTabs />
              <div className="pb-2">
                <PullTranslationButton />
              </div>
            </div>
            <div className="col-start-2 row-start-1 flex flex-wrap items-center justify-end gap-2 pb-2 lg:ml-auto lg:col-auto lg:row-auto">
              <button type="button" className={btnSecondary} onClick={() => setWizard(true)}>
                <IconWand />
                {t('wizard.button')}
              </button>
              <button type="button" className={btnSecondary} onClick={startImport}>
                <IconUpload />
                {t('import.button')}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-gray-500 hover:bg-red-50 hover:text-red-700"
                onClick={() => {
                  if (window.confirm(t('toolbar.confirmReset'))) reset()
                }}
              >
                <IconTrash />
                {t('toolbar.reset')}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
                onClick={() => window.print()}
              >
                <IconDownload />
                {t('toolbar.exportPdf')}
              </button>
              <AccountBar />
            </div>
          </div>
          <LanguageStripe />
        </header>
      </div>

      {importing && <ImportDialog onClose={() => setImporting(false)} />}
      {wizard && <WizardDialog onClose={() => setWizard(false)} />}

      <main className="grid grid-cols-1 gap-6 p-4 lg:grid-cols-2 print:block print:p-0">
        <div className="print:hidden">
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
