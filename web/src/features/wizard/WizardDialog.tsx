import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { linesToRows, textToRows } from '../../lib/rows'
import type { Resume, Section } from '../../lib/schemas/resume'
import { hasContent, newSection, useResumeStore } from '../../store/resumeStore'
import { TextAreaField, TextField } from '../editor/fields'

type ExperienceDraft = { role: string; company: string; period: string; location: string; description: string }
type EducationDraft = { degree: string; institution: string; period: string }

type Draft = {
  fullName: string
  headline: string
  email: string
  phone: string
  location: string
  linkedin: string
  github: string
  summary: string
  experiences: ExperienceDraft[]
  education: EducationDraft[]
  skills: string
  languages: string
}

const emptyExperience = (): ExperienceDraft => ({ role: '', company: '', period: '', location: '', description: '' })
const emptyEducation = (): EducationDraft => ({ degree: '', institution: '', period: '' })

const initialDraft = (): Draft => ({
  fullName: '',
  headline: '',
  email: '',
  phone: '',
  location: '',
  linkedin: '',
  github: '',
  summary: '',
  experiences: [emptyExperience()],
  education: [emptyEducation()],
  skills: '',
  languages: '',
})

const STEPS = ['personal', 'summary', 'experience', 'education', 'skills', 'languages'] as const
type Step = (typeof STEPS)[number]

const filled = (...values: string[]) => values.some((v) => v.trim())

/** Monta o currículo da aba ativa a partir das respostas. Só entra o que foi preenchido. */
function buildResumeFromDraft(d: Draft, current: Resume, lang: 'pt' | 'en'): Resume {
  const links = [
    { label: 'LinkedIn', url: d.linkedin.trim() },
    { label: 'GitHub', url: d.github.trim() },
  ].filter((l) => l.url)

  const sections: Section[] = []
  const add = (type: Section['type'], data: Section['data']) => sections.push({ ...newSection(type, lang), data } as Section)

  if (d.summary.trim()) add('summary', { rows: [{ topic: '', text: d.summary.trim() }] })

  const experiences = d.experiences.filter((e) => filled(e.role, e.company, e.period, e.location, e.description))
  if (experiences.length > 0) {
    add('experience', {
      items: experiences.map((e) => ({
        role: e.role.trim(),
        company: e.company.trim(),
        period: e.period.trim(),
        location: e.location.trim(),
        rows: linesToRows(e.description.split('\n')),
      })),
    })
  }

  const education = d.education.filter((e) => filled(e.degree, e.institution, e.period))
  if (education.length > 0) {
    add('education', {
      items: education.map((e) => ({ degree: e.degree.trim(), institution: e.institution.trim(), period: e.period.trim(), rows: [] })),
    })
  }

  if (d.skills.trim()) add('skills', { rows: textToRows(d.skills) })
  if (d.languages.trim()) add('languages', { rows: textToRows(d.languages) })

  return {
    version: 1,
    header: {
      fullName: d.fullName.trim(),
      headline: d.headline.trim(),
      email: d.email.trim(),
      phone: d.phone.trim(),
      location: d.location.trim(),
      links,
    },
    sections,
    settings: current.settings,
  }
}

/** Assistente de perguntas: monta o currículo base passo a passo, sem IA. */
export function WizardDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const { lang, resume, importResume } = useResumeStore()
  const [draft, setDraft] = useState<Draft>(initialDraft)
  const [index, setIndex] = useState(0)
  const step: Step = STEPS[index]
  const last = index === STEPS.length - 1

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }))

  function updateExperience(i: number, patch: Partial<ExperienceDraft>) {
    set(
      'experiences',
      draft.experiences.map((e, j) => (j === i ? { ...e, ...patch } : e)),
    )
  }

  function updateEducation(i: number, patch: Partial<EducationDraft>) {
    set(
      'education',
      draft.education.map((e, j) => (j === i ? { ...e, ...patch } : e)),
    )
  }

  function finish() {
    if (hasContent(resume) && !window.confirm(t('import.confirmReplace'))) return
    importResume(buildResumeFromDraft(draft, resume, lang))
    onClose()
  }

  const btn = 'rounded px-3 py-1.5 text-sm font-medium'
  const addBtn = 'rounded border border-dashed border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50'

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/40 p-4 print:hidden">
      <div role="dialog" aria-modal="true" aria-labelledby="wizard-title" className="my-8 w-full max-w-2xl rounded-lg bg-white p-5 shadow-xl">
        <div className="mb-1 flex items-center justify-between">
          <h2 id="wizard-title" className="text-base font-semibold text-gray-900">
            {t('wizard.title')}
          </h2>
          <button type="button" className="h-7 w-7 rounded text-gray-500 hover:bg-gray-100" onClick={onClose} aria-label={t('wizard.cancel')}>
            ✕
          </button>
        </div>
        <p className="text-xs text-gray-500">{t('wizard.intro')}</p>
        <p className="mt-2 text-xs font-medium text-blue-700">{t('wizard.step', { current: index + 1, total: STEPS.length })}</p>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-gray-100">
          <div className="h-full bg-blue-600" style={{ width: `${((index + 1) / STEPS.length) * 100}%` }} />
        </div>

        <h3 className="mt-4 text-sm font-semibold text-gray-900">{t(`wizard.${step}.title`)}</h3>

        <div className="mt-3 space-y-3">
          {step === 'personal' && (
            <>
              <TextField label={t('header.fullName')} value={draft.fullName} onChange={(v) => set('fullName', v)} />
              <TextField label={t('header.headline')} value={draft.headline} onChange={(v) => set('headline', v)} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <TextField label={t('header.email')} value={draft.email} onChange={(v) => set('email', v)} />
                <TextField label={t('header.phone')} value={draft.phone} onChange={(v) => set('phone', v)} />
              </div>
              <TextField label={t('header.location')} value={draft.location} onChange={(v) => set('location', v)} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <TextField label={t('wizard.personal.linkedin')} value={draft.linkedin} onChange={(v) => set('linkedin', v)} />
                <TextField label={t('wizard.personal.github')} value={draft.github} onChange={(v) => set('github', v)} />
              </div>
            </>
          )}

          {step === 'summary' && (
            <TextAreaField label={t('wizard.summary.label')} hint={t('wizard.summary.hint')} rows={6} value={draft.summary} onChange={(v) => set('summary', v)} />
          )}

          {step === 'experience' && (
            <>
              {draft.experiences.map((e, i) => (
                <fieldset key={i} className="space-y-3 rounded border border-gray-200 p-3">
                  <legend className="px-1 text-xs font-medium text-gray-600">{t('wizard.experience.item', { n: i + 1 })}</legend>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <TextField label={t('wizard.experience.role')} value={e.role} onChange={(v) => updateExperience(i, { role: v })} />
                    <TextField label={t('wizard.experience.company')} value={e.company} onChange={(v) => updateExperience(i, { company: v })} />
                    <TextField
                      label={t('wizard.experience.period')}
                      placeholder={t('wizard.periodExample')}
                      value={e.period}
                      onChange={(v) => updateExperience(i, { period: v })}
                    />
                    <TextField label={t('wizard.experience.location')} value={e.location} onChange={(v) => updateExperience(i, { location: v })} />
                  </div>
                  <TextAreaField
                    label={t('wizard.experience.description')}
                    hint={t('wizard.experience.hint')}
                    rows={4}
                    value={e.description}
                    onChange={(v) => updateExperience(i, { description: v })}
                  />
                  {draft.experiences.length > 1 && (
                    <button
                      type="button"
                      className="text-xs text-red-700 hover:underline"
                      onClick={() =>
                        set(
                          'experiences',
                          draft.experiences.filter((_, j) => j !== i),
                        )
                      }
                    >
                      {t('wizard.remove')}
                    </button>
                  )}
                </fieldset>
              ))}
              <button type="button" className={addBtn} onClick={() => set('experiences', [...draft.experiences, emptyExperience()])}>
                + {t('wizard.experience.add')}
              </button>
            </>
          )}

          {step === 'education' && (
            <>
              {draft.education.map((e, i) => (
                <fieldset key={i} className="space-y-3 rounded border border-gray-200 p-3">
                  <legend className="px-1 text-xs font-medium text-gray-600">{t('wizard.education.item', { n: i + 1 })}</legend>
                  <TextField label={t('wizard.education.degree')} value={e.degree} onChange={(v) => updateEducation(i, { degree: v })} />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <TextField label={t('wizard.education.institution')} value={e.institution} onChange={(v) => updateEducation(i, { institution: v })} />
                    <TextField
                      label={t('wizard.education.period')}
                      placeholder={t('wizard.periodExample')}
                      value={e.period}
                      onChange={(v) => updateEducation(i, { period: v })}
                    />
                  </div>
                  {draft.education.length > 1 && (
                    <button
                      type="button"
                      className="text-xs text-red-700 hover:underline"
                      onClick={() =>
                        set(
                          'education',
                          draft.education.filter((_, j) => j !== i),
                        )
                      }
                    >
                      {t('wizard.remove')}
                    </button>
                  )}
                </fieldset>
              ))}
              <button type="button" className={addBtn} onClick={() => set('education', [...draft.education, emptyEducation()])}>
                + {t('wizard.education.add')}
              </button>
            </>
          )}

          {step === 'skills' && (
            <TextAreaField label={t('wizard.skills.label')} hint={t('wizard.skills.hint')} rows={6} value={draft.skills} onChange={(v) => set('skills', v)} />
          )}

          {step === 'languages' && (
            <TextAreaField
              label={t('wizard.languages.label')}
              hint={t('wizard.languages.hint')}
              rows={4}
              value={draft.languages}
              onChange={(v) => set('languages', v)}
            />
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <button type="button" className={`${btn} border border-gray-300 text-gray-700 hover:bg-gray-100`} onClick={onClose}>
            {t('wizard.cancel')}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={index === 0}
              className={`${btn} border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40`}
              onClick={() => setIndex(index - 1)}
            >
              {t('wizard.back')}
            </button>
            {last ? (
              <button type="button" className={`${btn} bg-blue-600 text-white hover:bg-blue-700`} onClick={finish}>
                {t('wizard.finish')}
              </button>
            ) : (
              <button type="button" className={`${btn} bg-blue-600 text-white hover:bg-blue-700`} onClick={() => setIndex(index + 1)}>
                {t('wizard.next')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
