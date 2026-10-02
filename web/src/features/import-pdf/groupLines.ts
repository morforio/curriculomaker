export type Fragment = { str: string; x: number; y: number; width: number; height: number }

/** Agrupa os pedaços de texto de uma página em linhas, de cima para baixo e da esquerda para a direita. */
export function fragmentsToLines(fragments: Fragment[]): string[] {
  const sorted = [...fragments]
    .filter((f) => f.str.trim() !== '')
    .sort((a, b) => b.y - a.y || a.x - b.x)

  const rows: Fragment[][] = []
  for (const f of sorted) {
    const row = rows[rows.length - 1]
    const tolerance = Math.max(2, (f.height || 8) * 0.5)
    if (row && Math.abs(row[0].y - f.y) <= tolerance) row.push(f)
    else rows.push([f])
  }

  return rows.map((row) => {
    const items = [...row].sort((a, b) => a.x - b.x)
    let line = ''
    let prevEnd = 0
    items.forEach((f, i) => {
      const needSpace = i > 0 && !/\s$/.test(line) && !/^\s/.test(f.str) && f.x - prevEnd > (f.height || 8) * 0.15
      line += (needSpace ? ' ' : '') + f.str
      prevEnd = f.x + f.width
    })
    return line.trim()
  })
}
