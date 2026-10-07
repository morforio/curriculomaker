import type { Lang } from './schemas/analysis.ts'
import { resumeSchema, type Resume } from './schemas/resume.ts'

/** Regras de sincronização do currículo com a conta (puras, para testar sem navegador nem banco). */

export type AccountData = { lang: Lang; resume: Resume; saved: Partial<Record<Lang, Resume>> }

const LANGS: Lang[] = ['pt', 'en']

/** Linhas da conta -> estado do editor. Linhas inválidas são ignoradas; sem nenhuma válida, devolve null. */
export function remoteToData(rows: { lang: string; content: unknown }[], preferred: Lang): AccountData | null {
  const byLang: Partial<Record<Lang, Resume>> = {}
  for (const row of rows) {
    if (row.lang !== 'pt' && row.lang !== 'en') continue
    const parsed = resumeSchema.safeParse(row.content)
    if (parsed.success) byLang[row.lang] = parsed.data
  }
  const lang = byLang[preferred] ? preferred : LANGS.find((l) => byLang[l])
  if (!lang) return null
  const other = LANGS.find((l) => l !== lang)!
  return { lang, resume: byLang[lang]!, saved: byLang[other] ? { [other]: byLang[other] } : {} }
}

/** Estado do editor -> linhas para gravar (uma por aba já aberta). */
export function dataToRows(userId: string, data: AccountData): { user_id: string; lang: Lang; content: Resume }[] {
  const rows = [{ user_id: userId, lang: data.lang, content: data.resume }]
  for (const l of LANGS) {
    const saved = data.saved[l]
    if (l !== data.lang && saved) rows.push({ user_id: userId, lang: l, content: saved })
  }
  return rows
}
