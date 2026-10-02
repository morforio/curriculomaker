export type DiffToken = { text: string; kind: 'same' | 'add' | 'del' }

const words = (s: string) => s.split(/\s+/).filter(Boolean)

/** Diferença palavra a palavra (maior subsequência comum). Textos de introdução são curtos. */
export function wordDiff(original: string, suggested: string): { original: DiffToken[]; suggested: DiffToken[] } {
  const a = words(original)
  const b = words(suggested)
  const n = a.length
  const m = b.length
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  const outA: DiffToken[] = []
  const outB: DiffToken[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
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
  return { original: outA, suggested: outB }
}
