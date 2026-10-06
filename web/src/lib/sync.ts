import type { Lang } from './schemas/analysis.ts'
import { resumeSchema, type Resume } from './schemas/resume.ts'

/** Regras de sincronização do currículo com a conta (puras, para testar sem navegador nem banco). */

export type InitialSync = 'load-remote' | 'upload-local' | 'start-empty'

/**
 * O que fazer ao entrar na conta:
 * - a conta já tem currículo: vale o da conta (o do navegador era só uma cópia);
 * - a conta está vazia e o navegador tem um currículo que é de antes do login ou desta mesma conta: sobe para a conta;
 * - a conta está vazia e o currículo do navegador é de OUTRA conta: começa vazio (nunca vaza dados entre contas).
 */
export function planInitialSync(args: { userId: string; ownerId: string | null; localHasContent: boolean; remoteCount: number }): InitialSync {
  if (args.remoteCount > 0) return 'load-remote'
  const mine = args.ownerId === null || args.ownerId === args.userId
  return mine && args.localHasContent ? 'upload-local' : 'start-empty'
}

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
