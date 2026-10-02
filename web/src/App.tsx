import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Editor } from './features/editor/Editor'
import { ImportDialog } from './features/import-pdf/ImportDialog'
import { ResumePreview } from './features/preview/ResumePreview'
import { setLang, type Lang } from './lib/i18n'
import { useResumeStore } from './store/resumeStore'

function App() {
  const { t, i18n } = useTranslation()
  const { resume, reset } = useResumeStore()
  const [importing, setImporting] = useState(false)

  // O título do documento vira o nome sugerido do PDF e o metadado "Title".
  const fullName = resume.header.fullName.trim()
  useEffect(() => {
    const suffix = i18n.language.startsWith('pt') ? 'Currículo' : 'Resume'
    document.title = fullName ? `${fullName} - ${suffix}` : t('app.name')
  }, [fullName, i18n.language, t])

  return (
    <div className="min-h-screen">
      <div className="print:hidden">
        <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-white px-4 py-3">
          <h1 className="text-lg font-bold text-gray-900">{t('app.name')}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 text-sm text-gray-600">
              {t('toolbar.language')}
              <select
                className="rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900"
                value={i18n.language.startsWith('pt') ? 'pt' : 'en'}
                onChange={(e) => setLang(e.target.value as Lang)}
              >
                <option value="pt">Português</option>
                <option value="en">English</option>
              </select>
            </label>
            <button
              type="button"
              className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
              onClick={() => setImporting(true)}
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
