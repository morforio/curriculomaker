import { textToRows, type RowLike } from './rows.ts'

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** Descrições antigas (uma linha por tópico) viram uma linha de texto com marcadores. */
function descriptionToRows(description: unknown): RowLike[] {
  const lines = str(description)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (/^(?:[•▪·●■◦▫‣]|[-–—]\s)/u.test(l) ? l : `• ${l}`))
  return lines.length ? [{ topic: '', text: lines.join('\n') }] : []
}

function migrateSection(section: unknown): unknown {
  if (!isRec(section) || !isRec(section.data)) return section
  const data = section.data
  if (Array.isArray(data.rows)) return section // já está no formato novo

  switch (section.type) {
    case 'summary':
      return { ...section, data: { rows: str(data.text).trim() ? [{ topic: '', text: str(data.text) }] : [] } }
    case 'custom':
      return { ...section, data: { rows: textToRows(str(data.markdown)) } }
    case 'skills': {
      const groups = Array.isArray(data.groups) ? data.groups : []
      const rows = groups.filter(isRec).map((g) => ({
        topic: str(g.label),
        text: Array.isArray(g.items) ? g.items.filter((i) => typeof i === 'string').join(', ') : '',
      }))
      return { ...section, data: { rows } }
    }
    case 'languages': {
      const items = Array.isArray(data.items) ? data.items : []
      return { ...section, data: { rows: items.filter(isRec).map((i) => ({ topic: str(i.name), text: str(i.level) })) } }
    }
    case 'experience':
    case 'education': {
      const items = Array.isArray(data.items) ? data.items : []
      return {
        ...section,
        data: {
          items: items.filter(isRec).map((item) => {
            const { description, ...rest } = item
            return { ...rest, rows: Array.isArray(item.rows) ? item.rows : descriptionToRows(description) }
          }),
        },
      }
    }
    default:
      return section
  }
}

/** Converte currículos salvos no formato antigo (texto único por bloco) para tópico + texto. */
export function migrateResume(resume: unknown): unknown {
  if (!isRec(resume) || !Array.isArray(resume.sections)) return resume
  return { ...resume, sections: resume.sections.map(migrateSection) }
}
