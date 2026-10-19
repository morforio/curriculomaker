import { normalize } from './text.ts'

/**
 * Travas em código contra o modelo "rebatizar" fatos do currículo (o prompt sozinho não impediu): número ou duração que passa a se referir
 * a outra coisa ("7+ anos de experiência em projetos fotovoltaicos" virando "7+ anos de experiência em automação" ou "200+ projetos de
 * software"), e cargo trocado pelo da vaga/pedido ("Engenheiro Eletricista" virando "Engenheiro de Software").
 */

const FUNC = new Set(['para', 'com', 'sem', 'uma', 'que', 'por', 'dos', 'das', 'sobre', 'entre', 'with', 'from', 'that', 'this', 'your', 'the', 'and'])
const stem = (w: string) => w.slice(0, 5)
const CORTE = /\s+(?:e|com|que|usando|para|and|with|to|for|from|using)\s+/i
const NUM = /(\d+)\s*[+%]?\s*([^,.;:•\n]*)/g

type Segmento = { n: string; w: string[] }

/** "número + palavras seguintes até o fim da oração", linha a linha. */
function segmentos(texto: string): Segmento[] {
  const out: Segmento[] = []
  for (const linha of texto.split('\n')) {
    for (const m of linha.matchAll(NUM)) {
      out.push({ n: m[1], w: normalize(m[2].split(CORTE)[0]).split(' ').filter(Boolean) })
    }
  }
  return out
}

/**
 * Números do texto sugerido que mudaram de assunto. Só vale quando a palavra logo depois do número é a mesma do currículo (mesma unidade:
 * "anos", "projetos"): aí o resto da frase tem de ser o mesmo, ou só ficar mais longo sem trazer palavra do pedido que o currículo não tem.
 * Devolve descrições curtas, vazio se estiver tudo certo.
 */
export function numberContextIssues(text: string, source: string, request: string): string[] {
  const src = segmentos(source)
  const srcStems = new Set(normalize(source).split(' ').map(stem))
  const reqStems = new Set(normalize(request).split(' ').map(stem))
  const bad: string[] = []
  for (const j of segmentos(text)) {
    if (j.w.length === 0) continue
    const same = src.filter((s) => s.n === j.n && s.w.length > 0 && s.w[0] === j.w[0])
    if (same.length === 0) continue // número novo ou outra unidade: outras checagens cuidam
    let ok = false
    for (const s of same) {
      const k = j.w.findIndex((t, i) => i >= s.w.length || t !== s.w[i])
      if (k === -1) {
        ok = true
        break
      }
      if (k >= s.w.length) {
        const ext = j.w.slice(s.w.length)
        const trouxeDoPedido = ext.some((t) => t.length > 3 && !FUNC.has(t) && reqStems.has(stem(t)) && !srcStems.has(stem(t)))
        if (!trouxeDoPedido) {
          ok = true
          break
        }
      }
    }
    if (!ok) bad.push(`${j.n} ${j.w.slice(0, 6).join(' ')}`)
  }
  return bad
}

function primeiraLinha(texto: string): string {
  return texto.split('\n').map((l) => l.trim()).find(Boolean) ?? ''
}

/** Cargo do primeiro tópico: as palavras antes de " com ", " with " ou da primeira vírgula. */
function cargo(linha: string): string[] | null {
  const limpa = linha.replace(/^[•\-*\s]+/, '').replace(/\*\*/g, '')
  const w = normalize(limpa.split(/\s+(?:com|with)\s+|,/i)[0]).split(' ').filter(Boolean)
  return w.length >= 1 && w.length <= 6 ? w : null
}

/**
 * O cargo foi trocado por outro que usa palavra do pedido que o currículo não tem? No primeiro tópico vale qualquer cargo diferente; nos
 * demais, só os que começam pela mesma palavra do cargo original ("Engenheiro Eletricista" x "Engenheiro de Software"), para não pegar
 * um tópico legítimo como "Pós-graduação em Engenharia de Software". Devolve "novo no lugar de antigo", ou null se está tudo certo
 * (cargo igual, mais longo ou mais curto, ou sem introdução original).
 */
export function roleTitleIssue(text: string, currentSummary: string, source: string, request: string): string | null {
  const antes = cargo(primeiraLinha(currentSummary))
  if (!antes) return null
  const prefixo = (a: string[], b: string[]) => a.every((t, i) => b[i] === t)
  const srcStems = new Set(normalize(source).split(' ').map(stem))
  const reqStems = new Set(normalize(request).split(' ').map(stem))
  const linhas = text.split('\n').map((l) => l.trim()).filter(Boolean)
  for (const [i, linha] of linhas.entries()) {
    const depois = cargo(linha)
    if (!depois || prefixo(antes, depois) || prefixo(depois, antes)) continue
    if (i > 0 && depois[0] !== antes[0]) continue
    const veioDoPedido = depois.some((t) => t.length > 3 && !FUNC.has(t) && reqStems.has(stem(t)) && !srcStems.has(stem(t)))
    if (veioDoPedido) return `${depois.join(' ')} instead of ${antes.join(' ')}`
  }
  return null
}
