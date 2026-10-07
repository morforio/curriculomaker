/**
 * Conversão de texto em linhas "tópico + texto". Usada na importação de PDF e na migração
 * de dados antigos. Nunca altera o texto: só separa o que vem antes do primeiro ":".
 */
export type RowLike = { topic: string; text: string }

const BULLET_START = /^\s*(?:[•▪·●■◦▫‣]\s*|[-–—]\s+)/u
// Tópico curto, seguido de ":" e espaço (não separa URLs como https://… nem horários como 10:30).
const TOPIC = /^([^:]{1,60}):\s+(\S.*)$/u

export function splitTopic(line: string): RowLike | null {
  const m = line.match(TOPIC)
  if (!m) return null
  const topic = m[1].trim()
  if (!/\p{L}/u.test(topic) || topic.split(/\s+/).length > 8) return null
  return { topic, text: m[2].trim() }
}

/**
 * Cada linha "Tópico: texto" (com ou sem marcador) vira uma linha com tópico.
 * Linhas seguidas sem tópico viram uma única linha de texto livre (quebras preservadas).
 */
export function linesToRows(lines: string[]): RowLike[] {
  const rows: RowLike[] = []
  let plain: string[] = []
  const flush = () => {
    if (plain.length > 0) rows.push({ topic: '', text: plain.join('\n') })
    plain = []
  }
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    const withoutBullet = line.replace(BULLET_START, '')
    const row = splitTopic(withoutBullet)
    if (row) {
      flush()
      rows.push(row)
    } else {
      plain.push(line)
    }
  }
  flush()
  return rows
}

export function textToRows(text: string): RowLike[] {
  return linesToRows(text.split('\n'))
}

/** Texto sem o marcador de tópico do começo ("• ", "- "...). */
export function stripBullet(text: string): string {
  return text.replace(BULLET_START, '')
}
