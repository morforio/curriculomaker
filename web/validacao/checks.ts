import type { Analysis } from '../src/lib/schemas/analysis.ts'
import { isStatedCredential } from '../src/lib/statedFacts.ts'
import { numberContextIssues, roleTitleIssue } from '../worker/guard.ts'
import { normalize } from '../worker/text.ts'
import type { Caso } from './casos.ts'

/**
 * Checagens automáticas do resultado de um caso. São independentes das que o Worker já faz (o Worker corrige; aqui se audita o que saiu).
 * Cada achado tem gravidade: "falha" (a IA errou de forma que não pode chegar ao usuário) ou "alerta" (merece olhar, mas pode ser aceitável).
 */
export type Achado = { gravidade: 'falha' | 'alerta'; codigo: string; texto: string }

export type Resposta = { analysis: Analysis; meta: { model: string; downgraded: number; fallback: boolean; verification: { state: string; version?: { status: string; fidelity: number; adequacy: number | null; redos: number } } } }

/** Termo curto (até 3 letras) só casa como palavra inteira ("go" não casa com "google"); os demais casam no início de palavra ("accessib"). */
export function contemTermo(textoNormalizado: string, termo: string): boolean {
  const padded = ` ${textoNormalizado} `
  // "a|b" = qualquer uma das alternativas (por exemplo o termo em português ou em inglês)
  return termo.split('|').some((alt) => {
    const t = normalize(alt)
    if (!t) return false
    return t.length <= 3 ? padded.includes(` ${t} `) : padded.includes(` ${t}`)
  })
}

const PT = new Set(['de', 'do', 'da', 'dos', 'das', 'para', 'com', 'em', 'um', 'uma', 'que', 'por', 'na', 'no', 'nas', 'nos', 'e', 'o', 'os', 'as', 'experiencia', 'anos', 'equipe'])
const EN = new Set(['the', 'and', 'of', 'for', 'with', 'in', 'to', 'a', 'an', 'is', 'on', 'by', 'at', 'from', 'years', 'experience', 'team', 'using', 'across'])

/** Idioma provável de um texto, pela contagem de palavras funcionais. "indefinido" se houver pouca evidência. */
export function idiomaDe(texto: string): 'pt' | 'en' | 'indefinido' {
  let pt = 0
  let en = 0
  for (const w of normalize(texto).split(' ')) {
    if (PT.has(w)) pt++
    if (EN.has(w)) en++
  }
  if (pt + en < 3 || Math.abs(pt - en) < 2) return 'indefinido'
  return pt > en ? 'pt' : 'en'
}

const palavras = (s: string) => normalize(s).split(' ').filter(Boolean)

/** Números (só dígitos) de um texto. "3.000" e "3,5" viram "3000" e "35"; aceita-se também cada parte ("3", "000"/"5") para não reprovar formatação. */
export function numerosDe(texto: string): Set<string> {
  const out = new Set<string>()
  for (const m of texto.matchAll(/\d+(?:[.,]\d+)*/g)) {
    out.add(m[0].replace(/[.,]/g, ''))
    for (const parte of m[0].split(/[.,]/)) out.add(parte)
  }
  return out
}

export function auditar(caso: Caso, r: Resposta): Achado[] {
  const achados: Achado[] = []
  const add = (gravidade: Achado['gravidade'], codigo: string, texto: string) => achados.push({ gravidade, codigo, texto })
  const nome = (termo: string) => termo.split('|').join(' / ')
  const { analysis } = r
  const sugerido = analysis.summary.suggested ?? ''
  const sugeridoNorm = normalize(sugerido)
  const origem = `${caso.resumeText}\n${caso.summaryText}`
  const origemNorm = normalize(origem)

  if (!sugerido) add('falha', 'sem-texto', 'A IA não devolveu introdução sugerida.')

  // Identificou se o campo tem uma vaga ou um pedido do usuário?
  const tipoEsperado = caso.esperaTipo ?? 'posting'
  const tipoLido = analysis.inputKind ?? 'posting'
  if (tipoLido !== tipoEsperado) add('falha', 'tipo-errado', `A IA leu o texto como ${tipoLido === 'request' ? 'um pedido do usuário' : 'uma descrição de vaga'}; era ${tipoEsperado === 'request' ? 'um pedido do usuário' : 'uma descrição de vaga'}.`)

  // Números novos: qualquer número no texto que não exista no currículo ou na introdução original
  const conhecidos = numerosDe(origem)
  const novos = [...numerosDe(sugerido)].filter((n) => !conhecidos.has(n))
  if (novos.length > 0) add('falha', 'numero-inventado', `Número que não está no currículo: ${novos.join(', ')}.`)

  // Habilidades ausentes que vazaram para o texto
  for (const termo of caso.esperaFalta) {
    if (contemTermo(sugeridoNorm, termo) && !contemTermo(origemNorm, termo)) add('falha', 'falta-no-texto', `"${nome(termo)}" não está no currículo, mas aparece na introdução sugerida.`)
  }
  for (const s of analysis.skills.filter((x) => x.status === 'missing')) {
    // Formação, certificação ou curso que o usuário declarou no pedido pode aparecer no texto.
    if (tipoEsperado === 'request' && isStatedCredential(s.name, caso.jobText)) continue
    if (s.name.length >= 3 && contemTermo(sugeridoNorm, s.name) && !contemTermo(origemNorm, s.name)) add('falha', 'falta-no-texto', `A própria IA marcou "${s.name}" como ausente, mas usou no texto.`)
  }

  // Número ou cargo "rebatizado" (7+ anos em outra coisa, "200+ projetos de software", Engenheiro Eletricista virando Engenheiro de Software)
  for (const d of numberContextIssues(sugerido, origem, caso.jobText)) add('falha', 'numero-reetiquetado', `Um número do currículo mudou de assunto: "${d}".`)
  const cargoTrocado = roleTitleIssue(sugerido, caso.summaryText, origem, caso.jobText)
  if (cargoTrocado) add('falha', 'cargo-trocado', `O cargo foi trocado: ${cargoTrocado}.`)

  // Textos proibidos (instruções escondidas, exageros)
  for (const p of caso.proibido ?? []) {
    if (contemTermo(sugeridoNorm, p)) add('falha', 'proibido', `Apareceu "${p.trim()}" na introdução, o que não pode.`)
  }

  // Habilidades: evidência e status esperado
  for (const s of analysis.skills) {
    if (s.status !== 'missing' && !s.evidence) add('alerta', 'sem-evidencia', `"${s.name}" está como "${s.status === 'has' ? 'tem' : 'parcial'}" sem citar o currículo.`)
  }
  if (r.meta.downgraded > 0) add('alerta', 'rebaixadas', `${r.meta.downgraded} habilidade(s) vinham como "tem" com evidência que não está no currículo e foram rebaixadas pelo Worker.`)
  const achar = (termo: string) => analysis.skills.find((s) => contemTermo(normalize(s.name), termo))
  for (const termo of caso.esperaTem) {
    const s = achar(termo)
    if (!s) add('alerta', 'tem-nao-listada', `Esperava-se a habilidade "${nome(termo)}" na tabela, e ela não foi listada.`)
    else if (s.status === 'missing') add('alerta', 'tem-como-falta', `"${s.name}" consta no currículo, mas a IA marcou como ausente.`)
  }
  for (const termo of caso.esperaFalta) {
    const s = achar(termo)
    if (s && s.status === 'has') add('falha', 'falta-como-tem', `"${s.name}" não está no currículo, mas a IA marcou como "tem".`)
    else if (s && s.status === 'partial') add('alerta', 'falta-como-parcial', `"${s.name}" não está no currículo, mas a IA marcou como "parcial".`)
  }

  // Idioma
  const idioma = idiomaDe(sugerido)
  if (idioma !== 'indefinido' && idioma !== caso.lang) add('falha', 'idioma', `Introdução escrita em ${idioma === 'pt' ? 'português' : 'inglês'}; o esperado era ${caso.lang === 'pt' ? 'português' : 'inglês'}.`)

  // Tamanho: nunca maior que o texto atual
  if (caso.summaryText.trim()) {
    const antes = palavras(caso.summaryText).length
    const depois = palavras(sugerido).length
    if (depois > antes * 1.1 + 1) add('alerta', 'cresceu', `A introdução cresceu: ${antes} palavras antes, ${depois} depois.`)
  }

  // Alterações citam trechos que existem no original?
  const resumoNorm = normalize(caso.summaryText)
  for (const c of analysis.summary.changes) {
    if (caso.summaryText.trim() && !resumoNorm.includes(normalize(c.from))) add('alerta', 'alteracao-sem-origem', `A alteração "${c.from}" → "${c.to}" cita um trecho que não existe na introdução original.`)
  }

  // Conferência do Jev
  const v = r.meta.verification
  if (v.state === 'failed') add('alerta', 'jev-falhou', 'A conferência do Jev falhou nesta execução.')
  if (v.version?.status === 'best_effort') add('alerta', 'jev-abaixo', `A fidelidade ficou abaixo do limite (${Math.round(v.version.fidelity * 100)} %) mesmo após refazer.`)
  if (r.meta.fallback) add('alerta', 'reserva', 'O modelo principal falhou e o reserva respondeu.')

  return achados
}

export type Veredito = 'ok' | 'alerta' | 'falha'
export const veredito = (a: Achado[]): Veredito => (a.some((x) => x.gravidade === 'falha') ? 'falha' : a.length > 0 ? 'alerta' : 'ok')
