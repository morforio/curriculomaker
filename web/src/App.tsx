import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Editor } from './features/editor/Editor'
import { ImportDialog } from './features/import-pdf/ImportDialog'
import { ResumePreview } from './features/preview/ResumePreview'
import { WizardDialog } from './features/wizard/WizardDialog'
import { LanguageTabs } from './features/translate/LanguageTabs'
import { LANG_NAMES, setLang } from './lib/i18n'
import { useResumeStore } from './store/resumeStore'

function App() {
  const { t, i18n } = useTranslation()
  const { lang, resume, reset } = useResumeStore()
  const [importing, setImporting] = useState(false)
  const [wizard, setWizard] = useState(false)

  // A aba ativa define o idioma da interface.
  useEffect(() => setLang(lang), [lang])

  // O título do documento vira o nome sugerido do PDF e o metadado "Title".
  const fullName = resume.header.fullName.trim()
  useEffect(() => {
    const suffix = i18n.language.startsWith('pt') ? 'Currículo' : 'Resume'
    document.title = fullName ? `${fullName} - ${suffix}` : t('app.name')
  }, [fullName, i18n.language, t])

  function startImport() {
    // Quem escolher a aba errada só descobre depois: avisa antes de abrir o envio do arquivo.
    if (window.confirm(t('import.langWarning', { lang: LANG_NAMES[lang] }))) setImporting(true)
  }

  return (
    <div className="min-h-screen">
      <div className="print:hidden">
        <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-white px-4 py-3">
          <h1 className="text-lg font-bold text-gray-900">{t('app.name')}</h1>
          <LanguageTabs />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
              onClick={() => setWizard(true)}
            >
              {t('wizard.button')}
            </button>
            <button
              type="button"
              className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
              onClick={startImport}
            >
              {t('import.button')}
            </button>
            <button
              type="button"
              className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
              onClick={() => {
                if (window.confirm(t('toolbar.confirmReset'))) reset()
              }}
            >
              {t('toolbar.reset')}
            </button>
            <button
              type="button"
              className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              onClick={() => window.print()}
            >
              {t('toolbar.exportPdf')}
            </button>
          </div>
        </header>
      </div>

      {importing && <ImportDialog onClose={() => setImporting(false)} />}
      {wizard && <WizardDialog onClose={() => setWizard(false)} />}

      <main className="grid grid-cols-1 gap-6 p-4 lg:grid-cols-2 print:block print:p-0">
        <div className="print:hidden">
          <Editor />
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold text-gray-900 print:hidden">{t('preview.title')}</h2>
          <ResumePreview resume={resume} />
        </div>
      </main>
    </div>
  )
}

export default App
