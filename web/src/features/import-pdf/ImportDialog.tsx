import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Resume, Section } from '../../lib/schemas/resume'
import { hasContent, useResumeStore } from '../../store/resumeStore'
import { extractPdfLines, MAX_PDF_BYTES, MAX_PDF_PAGES } from './extractPdfText'
import { parseResumeText, type ParsedResume } from './parseResumeText'

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'review'; parsed: ParsedResume; pages: number; truncated: boolean }

function buildResume(parsed: ParsedResume, current: Resume): Resume {
  // Resumo, habilidades e idiomas mantêm o tipo; Experiência, Formação e outros entram como bloco livre.
  const sections = parsed.blocks.map((b) => {
    const type = b.type === 'summary' || b.type === 'skills' || b.type === 'languages' ? b.type : 'custom'
    return { id: crypto.randomUUID(), type, title: b.title, data: { rows: b.rows } } as Section
  })
  return {
    version: 1,
    header: { ...parsed.header, headline: '' },
    sections,
    settings: current.settings,
  }
}

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const { resume, importResume } = useResumeStore()
  const [state, setState] = useState<State>({ status: 'idle' })
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function onFile(file: File | undefined) {
    if (!file) return
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setState({ status: 'error', message: t('import.errType') })
      return
    }
    if (file.size > MAX_PDF_BYTES) {
      setState({ status: 'error', message: t('import.errSize') })
      return
    }
    setState({ status: 'loading' })
    try {
      const { lines, pages, truncated } = await extractPdfLines(await file.arrayBuffer())
      if (lines.length === 0) {
        setState({ status: 'error', message: t('import.errNoText') })
        return
      }
      setState({ status: 'review', parsed: parseResumeText(lines), pages, truncated })
    } catch {
      setState({ status: 'error', message: t('import.errRead') })
    }
  }

  function confirmImport(parsed: ParsedResume) {
    if (hasContent(resume) && !window.confirm(t('import.confirmReplace'))) return
    importResume(buildResume(parsed, resume))
    onClose()
  }

  const btn = 'rounded px-3 py-1.5 text-sm font-medium'

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/40 p-4 print:hidden" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
        className="glass-strong my-8 w-full max-w-2xl rounded-lg border border-gray-200 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id="import-title" className="text-base font-semibold text-gray-900">
            {t('import.title')}
          </h2>
          <button type="button" className="h-7 w-7 rounded text-gray-500 hover:bg-gray-100" onClick={onClose} aria-label={t('import.cancel')}>
            ✕
          </button>
        </div>

        <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />

        {(state.status === 'idle' || state.status === 'error') && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">{t('import.intro')}</p>
            {state.status === 'error' && (
              <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {state.message}
              </p>
            )}
            <button type="button" className={`${btn} bg-blue-600 text-white hover:bg-blue-700`} onClick={() => inputRef.current?.click()}>
              {t('import.choose')}
            </button>
          </div>
        )}

        {state.status === 'loading' && <p className="text-sm text-gray-600">{t('import.reading')}</p>}

        {state.status === 'review' && (
          <div className="space-y-4">
            <p className="rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-100">{t('import.recognized')}</p>
            {state.truncated && (
              <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                {t('import.truncated', { pages: state.pages, max: MAX_PDF_PAGES })}
              </p>
            )}

            <section>
              <h3 className="mb-1 text-sm font-semibold text-gray-900">{t('import.headerFound')}</h3>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm text-gray-800">
                {(
                  [
                    [t('header.fullName'), state.parsed.header.fullName],
                    [t('header.email'), state.parsed.header.email],
                    [t('header.phone'), state.parsed.header.phone],
                    [t('header.location'), state.parsed.header.location],
                    ...state.parsed.header.links.map((l) => [l.label, l.url] as [string, string]),
                  ] as [string, string][]
                ).map(([label, value]) => (
                  <div key={label} className="contents">
                    <dt className="font-medium text-gray-600">{label}</dt>
                    <dd className={value ? 'break-all' : 'text-gray-400'}>{value || '—'}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section>
              <h3 className="mb-1 text-sm font-semibold text-gray-900">
                {t('import.blocks')} ({state.parsed.blocks.length})
              </h3>
              {state.parsed.blocks.length === 0 && (
                <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{t('import.noSections')}</p>
              )}
              <div className="space-y-2">
                {state.parsed.blocks.map((b, i) => (
                  <details key={i} className="rounded border border-gray-200">
                    <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-gray-900">
                      {b.title} <span className="font-normal text-gray-500">· {t('import.rowsCount', { count: b.rows.length })}</span>
                    </summary>
                    <ul className="max-h-60 space-y-1.5 overflow-auto border-t border-gray-100 p-3 text-xs text-gray-700">
                      {b.rows.map((r, j) => (
                        <li key={j} className="whitespace-pre-wrap">
                          {r.topic && <strong className="text-gray-900">{r.topic}: </strong>}
                          {r.text}
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
            </section>

            {state.parsed.leftover.length > 0 && (
              <details className="rounded border border-gray-200">
                <summary className="cursor-pointer px-3 py-2 text-sm text-gray-700">{t('import.leftover')}</summary>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap border-t border-gray-100 p-3 text-xs text-gray-700">
                  {state.parsed.leftover.join('\n')}
                </pre>
              </details>
            )}

            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button type="button" className={`${btn} border border-gray-300 text-gray-700 hover:bg-gray-100`} onClick={() => inputRef.current?.click()}>
                {t('import.another')}
              </button>
              <button type="button" className={`${btn} border border-gray-300 text-gray-700 hover:bg-gray-100`} onClick={onClose}>
                {t('import.cancel')}
              </button>
              <button type="button" className={`${btn} bg-blue-600 text-white hover:bg-blue-700`} onClick={() => confirmImport(state.parsed)}>
                {t('import.confirm')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
