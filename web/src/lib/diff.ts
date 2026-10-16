export type DiffToken = { text: string; kind: 'same' | 'add' | 'del' }

/** Palavras; a quebra de linha conta como um item à parte, para a introdução em tópicos continuar um tópico por linha. */
const words = (s: string) => s.split(/(\n)|[^\S\n]+/).filter(Boolean)

/**
 * Chave de comparação de uma palavra: sem maiúsculas, acentos, marcadores de negrito (**) e pontuação nas pontas.
 * "Python," e "**python**" são a mesma palavra; só uma palavra de fato diferente pode ser marcada como retirada ou acrescentada.
 */
export function wordKey(w: string): string {
  if (w === '\n') return w
  const k = w
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\*+/g, '')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
  return k || w
}

/**
 * Diferença palavra a palavra (maior subsequência comum), comparando pela chave da palavra. Depois, uma palavra que aparece nos dois textos
 * mas em outro lugar (frase reordenada) também não é marcada: "retirada" é só o que não existe mais no texto novo e "acrescentada" é só o que não
 * existia no original.
 */
export function wordDiff(original: string, suggested: string): { original: DiffToken[]; suggested: DiffToken[] } {
  const a = words(original)
  const b = words(suggested)
  const ka = a.map(wordKey)
  const kb = b.map(wordKey)
  const n = a.length
  const m = b.length
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = ka[i] === kb[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  const outA: DiffToken[] = []
  const outB: DiffToken[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (ka[i] === kb[j]) {
      outA.push({ text: a[i], kind: 'same' })
      outB.push({ text: b[j], kind: 'same' })
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      outA.push({ text: a[i++], kind: 'del' })
    } else {
      outB.push({ text: b[j++], kind: 'add' })
    }
  }
  while (i < n) outA.push({ text: a[i++], kind: 'del' })
  while (j < m) outB.push({ text: b[j++], kind: 'add' })

  // Palavra "retirada" que também está (em outro lugar) entre as "acrescentadas": só mudou de posição, então não é marcada em nenhum dos lados.
  const added = new Map<string, DiffToken[]>()
  for (const tk of outB) {
    if (tk.kind !== 'add') continue
    const k = wordKey(tk.text)
    added.set(k, [...(added.get(k) ?? []), tk])
  }
  for (const tk of outA) {
    if (tk.kind !== 'del' || tk.text === '\n') continue
    const twin = added.get(wordKey(tk.text))?.pop()
    if (twin) {
      tk.kind = 'same'
      twin.kind = 'same'
    }
  }
  return { original: outA, suggested: outB }
}
