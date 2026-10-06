import type { Resume, Row, Section } from '../../lib/schemas/resume'

/**
 * Percorre os textos do currículo que devem ser traduzidos, sempre na mesma ordem.
 * Ficam de fora (nunca vão ao serviço de tradução): nome, e-mail, telefone, links, empresas e instituições.
 */
function mapTexts(resume: Resume, fn: (text: string) => string): Resume {
  const tr = (text: string) => (text.trim() ? fn(text) : text)
  const mapRows = (rows: Row[]): Row[] => rows.map((r) => ({ topic: tr(r.topic), text: tr(r.text) }))

  const sections = resume.sections.map((s): Section => {
    const title = tr(s.title)
    switch (s.type) {
      case 'summary':
      case 'skills':
      case 'languages':
      case 'custom':
        return { ...s, title, data: { rows: mapRows(s.data.rows) } }
      case 'experience':
        return {
          ...s,
          title,
          data: { items: s.data.items.map((i) => ({ ...i, role: tr(i.role), period: tr(i.period), location: tr(i.location), rows: mapRows(i.rows) })) },
        }
      case 'education':
        return { ...s, title, data: { items: s.data.items.map((i) => ({ ...i, degree: tr(i.degree), period: tr(i.period), rows: mapRows(i.rows) })) } }
    }
  })

  return { ...resume, header: { ...resume.header, headline: tr(resume.header.headline), location: tr(resume.header.location) }, sections }
}

export type TranslationPlan = {
  /** Textos não vazios a enviar para tradução. */
  texts: string[]
  /** Monta o currículo da outra aba com os textos traduzidos, na mesma ordem de `texts`. */
  apply: (translated: string[]) => Resume
}

export function planTranslation(resume: Resume): TranslationPlan {
  const texts: string[] = []
  mapTexts(resume, (text) => {
    texts.push(text)
    return text
  })
  return {
    texts,
    apply: (translated) => {
      let i = 0
      return mapTexts(resume, () => translated[i++])
    },
  }
}
