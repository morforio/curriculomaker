import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { wordDiff, type DiffToken } from '../../lib/diff'
import { LANG_NAMES, type Lang } from '../../lib/i18n'
import { resumeToText, summaryTextOf } from '../../lib/resumeText'
import { MAX_JOB_CHARS, MIN_JOB_CHARS, type Skill, type Verification } from '../../lib/schemas/analysis'
import type { Row, Section } from '../../lib/schemas/resume'
import { newSection, useResumeStore } from '../../store/resumeStore'
import { ApiError, requestAnalysis, type AnalysisResult } from './api'

type Result = AnalysisResult & { originalSummary: string; lang: Lang }
type Applied = { sectionId: string; previous: Row[] | null }

function Diff({ tokens }: { tokens: DiffToken[] }) {
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
      {tokens.map((tk, i) => (
        <span
          key={i}
          className={
            tk.kind === 'add'
              ? 'rounded bg-green-100 px-0.5 text-green-900 underline decoration-green-600'
              : tk.kind === 'del'
                ? 'rounded bg-red-100 px-0.5 text-red-800 line-through'
                : ''
          }
        >
          {tk.text}
          {tk.text !== '\n' && ' '}
        </span>
      ))}
    </p>
  )
}

function QualityBadge({ verification }: { verification: Verification | undefined }) {
  const { t, i18n } = useTranslation()
  const fmt = (n: number) => n.toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (!verification || verification.state === 'skipped') return null
  const q = verification.version
  if (verification.state === 'failed' || !q) {
    return <p className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">{t('analysis.quality.failed')}</p>
  }
  const scores = t('analysis.quality.scores', { fidelity: fmt(q.fidelity), adequacy: fmt(q.adequacy) })
  const redone = q.redos > 0 ? ` ${t('analysis.quality.redone', { count: q.redos })}` : ''
  return q.status === 'verified' ? (
    <p className="rounded border border-green-200 bg-green-50 p-2 text-xs text-green-900">
      ✔ {t('analysis.quality.verified')} {scores}
      {redone}
    </p>
  ) : (
    <p role="alert" className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
      ⚠ {t('analysis.quality.bestEffort')} {scores}
      {redone}
    </p>
  )
}

const STATUS_ORDER = { missing: 0, partial: 1, has: 2 } as const
const STATUS_STYLE = {
  has: 'bg-green-100 text-green-900',
  partial: 'bg-amber-100 text-amber-900',
  missing: 'bg-red-100 text-red-800',
} as const
const STATUS_ICON = { has: '✔', partial: '◐', missing: '✕' } as const

export function JobMatchPanel() {
  const { t } = useTranslation()
  const { lang, resume, updateSection, insertSection, removeSection } = useResumeStore()

  const [jobText, setJobText] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'done'>('idle')
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [stored, setStored] = useState<Result | null>(null)
  const [applied, setApplied] = useState<Applied | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())

  const resumeText = resumeToText(resume)
  const summary = summaryTextOf(resume)
  const jobLen = jobText.trim().length
  const resumeReady = resumeText.length >= 20
  const canAnalyze = status !== 'loading' && resumeReady && jobLen >= MIN_JOB_CHARS && jobLen <= MAX_JOB_CHARS

  // O resultado é no idioma da aba em que foi gerado: em outra aba, ele não é mostrado.
  const result = stored && stored.lang === lang ? stored : null

  async function analyze() {
    setStatus('loading')
    setErrorCode(null)
    try {
      const res = await requestAnalysis({ jobText: jobText.trim(), resumeText, summaryText: summary, language: lang })
      setStored({ ...res, originalSummary: summary, lang })
      setApplied(null)
      setAdded(new Set())
      setStatus('done')
    } catch (e) {
      setErrorCode(e instanceof ApiError ? e.code : 'network')
      setStatus('error')
    }
  }

  function applySummary(text: string) {
    const rows: Row[] = [{ topic: '', text }]
    const existing = resume.sections.find((s) => s.type === 'summary')
    if (existing && existing.type === 'summary') {
      // Guarda o texto original da primeira aplicação, para "Desfazer" voltar ao que o usuário tinha.
      const previous = applied && applied.sectionId === existing.id ? applied.previous : existing.data.rows
      updateSection(existing.id, { data: { rows } })
      setApplied({ sectionId: existing.id, previous })
    } else {
      const section = { ...newSection('summary'), data: { rows } } as Section
      insertSection(section, 0)
      setApplied({ sectionId: section.id, previous: null })
    }
  }

  function undoSummary() {
    if (!applied) return
    if (applied.previous) updateSection(applied.sectionId, { data: { rows: applied.previous } })
    else removeSection(applied.sectionId)
    setApplied(null)
  }

  function addSkill(skill: Skill) {
    const other = t('analysis.otherSkills')
    const skillsSection = resume.sections.find((s) => s.type === 'skills')
    if (!skillsSection || skillsSection.type !== 'skills') {
      const section = { ...newSection('skills'), data: { rows: [{ topic: other, text: skill.name }] } } as Section
      insertSection(section, resume.sections.length)
    } else {
      const rows = skillsSection.data.rows.filter((r) => r.topic.trim() || r.text.trim())
      const idx = rows.findIndex((r) => r.topic.trim().replace(/:\s*$/, '').toLowerCase() === other.toLowerCase())
      if (idx >= 0) {
        const text = rows[idx].text.trim()
        if (!text.toLowerCase().includes(skill.name.toLowerCase())) {
          rows[idx] = { ...rows[idx], text: text ? `${text}, ${skill.name}` : skill.name }
        }
      } else {
        rows.push({ topic: other, text: skill.name })
      }
      updateSection(skillsSection.id, { data: { rows } })
    }
    setAdded((prev) => new Set(prev).add(skill.name))
  }

  const analysis = result?.analysis
  const suggested = analysis?.summary.suggested
  const diff = result && suggested ? wordDiff(result.originalSummary, suggested) : null
  const skills = analysis
    ? [...analysis.skills].sort(
        (a, b) =>
          Number(a.importance !== 'required') - Number(b.importance !== 'required') || STATUS_ORDER[a.status] - STATUS_ORDER[b.status],
      )
    : []
  const requiredSkills = skills.filter((s) => s.importance === 'required')
  const covered = requiredSkills.filter((s) => s.status !== 'missing').length

  return (
    <section className="glass rounded-lg border border-gray-200 p-4" aria-labelledby="job-title">
      <h2 id="job-title" className="text-sm font-semibold text-gray-900">
        {t('analysis.title')}
      </h2>
      <p className="mt-1 text-xs text-gray-600">{t('analysis.intro')}</p>

      <label className="mt-3 block">
        <span className="mb-0.5 block text-xs font-medium text-gray-600">{t('analysis.jobLabel')}</span>
        <textarea
          className="w-full rounded border border-gray-300 bg-white/5 px-2 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          rows={7}
          maxLength={MAX_JOB_CHARS + 2000}
          placeholder={t('analysis.jobPlaceholder')}
          value={jobText}
          onChange={(e) => setJobText(e.target.value)}
        />
      </label>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
        <span className={jobLen > MAX_JOB_CHARS ? 'text-red-600' : ''}>{t('analysis.chars', { count: jobLen, max: MAX_JOB_CHARS })}</span>
        {jobLen > 0 && jobLen < MIN_JOB_CHARS && <span>{t('analysis.tooShort', { min: MIN_JOB_CHARS })}</span>}
      </div>

      <p className="mt-3 text-xs text-gray-600">{t('analysis.langNote', { lang: LANG_NAMES[lang] })}</p>

      {!resumeReady && <p className="mt-3 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">{t('analysis.needResume')}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!canAnalyze}
          onClick={() => void analyze()}
          className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {t('analysis.analyze')}
        </button>
        {status === 'loading' && (
          <span role="status" className="text-sm text-gray-600">
            {t('analysis.analyzing')}
          </span>
        )}
      </div>
      <p className="mt-2 text-xs text-gray-500">{t('analysis.privacy')}</p>

      {status === 'error' && errorCode && (
        <p role="alert" className="mt-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {t(`analysis.err.${errorCode}`)}
        </p>
      )}

      {analysis && result && (
        <div className="mt-5 space-y-6 border-t border-gray-200 pt-4">
          <h3 className="text-sm font-semibold text-gray-900">{t('analysis.result')}</h3>

          {(analysis.job.title || analysis.job.company || analysis.job.seniority) && (
            <p className="text-sm text-gray-700">
              <strong>{t('analysis.job')}:</strong> {[analysis.job.title, analysis.job.company, analysis.job.seniority].filter(Boolean).join(' · ')}
            </p>
          )}

          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-gray-900">{t('analysis.summaryTitle')}</h4>
            {suggested && (
              <div className="space-y-3 rounded border border-gray-200 p-3">
                <div className="flex items-center justify-end gap-2">
                  {applied && <span className="text-xs text-green-700">✔ {t('analysis.applied')}</span>}
                  {applied && (
                    <button type="button" onClick={undoSummary} className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100">
                      {t('analysis.undo')}
                    </button>
                  )}
                  {!applied && (
                    <button type="button" onClick={() => applySummary(suggested)} className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700">
                      {t('analysis.apply')}
                    </button>
                  )}
                </div>
                <QualityBadge verification={result.meta.verification} />
                <div>
                  <p className="mb-0.5 text-xs font-medium text-gray-500">{t('analysis.original')}</p>
                  {result.originalSummary && diff ? <Diff tokens={diff.original} /> : <p className="text-sm text-gray-400">{t('analysis.noOriginal')}</p>}
                </div>
                <div>
                  <p className="mb-0.5 text-xs font-medium text-gray-500">{t('analysis.suggested')}</p>
                  {diff && <Diff tokens={diff.suggested} />}
                </div>
              </div>
            )}

            {analysis.summary.changes.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-gray-600">{t('analysis.changes')}</p>
                <ul className="space-y-1.5 text-xs text-gray-700">
                  {analysis.summary.changes.map((c, i) => (
                    <li key={i} className="rounded bg-gray-50 p-2">
                      <span className="text-red-700 line-through">{c.from}</span> → <span className="text-green-800">{c.to}</span>
                      <span className="block text-gray-500">{c.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-gray-900">{t('analysis.skillsTitle')}</h4>
            {requiredSkills.length > 0 && (
              <p className="text-xs text-gray-600">{t('analysis.coverage', { have: covered, total: requiredSkills.length })}</p>
            )}
            {result.meta.downgraded > 0 && (
              <p className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">{t('analysis.downgraded', { count: result.meta.downgraded })}</p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-300 text-gray-600">
                    <th className="py-1.5 pr-2 font-medium">{t('analysis.skill')}</th>
                    <th className="py-1.5 pr-2 font-medium">{t('analysis.importance')}</th>
                    <th className="py-1.5 pr-2 font-medium">{t('analysis.situation')}</th>
                    <th className="py-1.5 pr-2 font-medium">{t('analysis.evidence')}</th>
                    <th className="py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {skills.map((s) => (
                    <tr key={s.name} className="border-b border-gray-100 align-top">
                      <td className="py-1.5 pr-2 font-medium text-gray-900">{s.name}</td>
                      <td className="py-1.5 pr-2 text-gray-700">{t(`analysis.${s.importance}`)}</td>
                      <td className="py-1.5 pr-2">
                        <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium ${STATUS_STYLE[s.status]}`}>
                          <span aria-hidden="true">{STATUS_ICON[s.status]}</span>
                          {t(`analysis.status.${s.status}`)}
                        </span>
                      </td>
                      <td className="py-1.5 pr-2 italic text-gray-600">{s.evidence ? `“${s.evidence}”` : ''}</td>
                      <td className="py-1.5 text-right">
                        {s.status !== 'has' &&
                          (added.has(s.name) ? (
                            <span className="text-green-700">✔ {t('analysis.added')}</span>
                          ) : (
                            <button type="button" onClick={() => addSkill(s)} className="whitespace-nowrap rounded border border-gray-300 px-2 py-1 text-gray-700 hover:bg-gray-100">
                              {t('analysis.addSkill')}
                            </button>
                          ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {analysis.keywords.length > 0 && (
            <div>
              <h4 className="mb-1 text-sm font-semibold text-gray-900">{t('analysis.keywords')}</h4>
              <ul className="flex flex-wrap gap-1.5">
                {analysis.keywords.map((k) => (
                  <li key={k} className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-100">
                    {k}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
