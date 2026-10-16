/** Extrai o objeto JSON de uma resposta que pode vir com cercas de markdown ou texto em volta. */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, '')
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('sem objeto JSON')
  return JSON.parse(cleaned.slice(start, end + 1))
}

/** Garante a introdução em tópicos: uma linha por tópico, todas com "• " (o modelo às vezes usa "-", "*" ou esquece o marcador). */
export function toBullets(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[•▪·●■◦▫‣]\s*|[-–—*]\s+)?/u, '').trim())
    .filter(Boolean)
    .map((line) => `• ${line}`)
    .join('\n')
}

/** Minúsculas, sem acentos e sem pontuação: base para comparar textos. */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * A alteração registrada muda alguma palavra de fato? "python, sql" → "Python, SQL" (ou só a ordem trocada) não é alteração:
 * as palavras, sem maiúsculas, acentos e pontuação, são as mesmas.
 */
export function isRealChange(change: { from: string; to: string }): boolean {
  const words = (s: string) => normalize(s).split(' ').filter(Boolean).sort().join(' ')
  return words(change.from) !== words(change.to)
}
