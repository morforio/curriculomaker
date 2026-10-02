import type { Resume, Row, Section } from './schemas/resume'

const join = (parts: string[], sep: string) => parts.map((p) => p.trim()).filter(Boolean).join(sep)

export function rowsToText(rows: Row[]): string {
  return rows
    .map((r) => (r.topic.trim() ? `${r.topic.trim().replace(/:\s*$/, '')}: ${r.text.trim()}` : r.text.trim()))
    .filter(Boolean)
    .join('\n')
}

function sectionBody(s: Section): string {
  switch (s.type) {
    case 'summary':
    case 'skills':
    case 'languages':
    case 'custom':
      return rowsToText(s.data.rows)
    case 'experience':
      return s.data.items
        .map((i) => [join([join([i.role, i.company], ', '), i.period, i.location], ' | '), rowsToText(i.rows)].filter(Boolean).join('\n'))
        .filter(Boolean)
        .join('\n')
    case 'education':
      return s.data.items
        .map((i) => [join([join([i.degree, i.institution], ', '), i.period], ' | '), rowsToText(i.rows)].filter(Boolean).join('\n'))
        .filter(Boolean)
        .join('\n')
  }
}

/** Currículo em texto puro para enviar à IA. Não inclui nome, e-mail, telefone, local nem links. */
export function resumeToText(resume: Resume): string {
  const blocks = resume.sections
    .map((s) => ({ title: s.title.trim(), body: sectionBody(s) }))
    .filter((b) => b.body)
    .map((b) => `${b.title}\n${b.body}`)
  const headline = resume.header.headline.trim()
  return [headline, ...blocks].filter(Boolean).join('\n\n')
}

/** Texto atual da introdução (primeiro bloco do tipo "summary"). */
export function summaryTextOf(resume: Resume): string {
  const s = resume.sections.find((x) => x.type === 'summary')
  return s && s.type === 'summary' ? rowsToText(s.data.rows) : ''
}
