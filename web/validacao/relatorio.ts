import { wordDiff, type DiffToken } from '../src/lib/diff.ts'
import { contemTermo, type Achado, type Resposta, type Veredito } from './checks.ts'
import type { Caso } from './casos.ts'
import { normalize } from '../worker/text.ts'

/** Resultado de um caso: o que a IA devolveu (ou o erro), as checagens automáticas e as medidas de execução. */
export type Resultado = {
  caso: Caso
  /** Código HTTP do handleAnalyze (200 = análise devolvida). */
  http: number
  erro?: string
  resposta?: Resposta
  achados: Achado[]
  veredito: Veredito
  /** Duração total do caso (LLM + Jev), em milissegundos. */
  ms: number
  chamadasLlm: number
  chamadasJev: number
}

export type Execucao = {
  simulado: boolean
  iniciadoEm: Date
  modelo: string
  jevAtivo: boolean
  resultados: Resultado[]
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const pct = (n: number | null | undefined) => (n == null ? '—' : `${Math.round(n * 100)} %`)
const seg = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`
const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

/** Data e hora no horário de Brasília (GMT-3). */
export const horaBrasilia = (d: Date) => `${d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (GMT-3)`

const NOME_VEREDITO: Record<Veredito, string> = { ok: 'OK', alerta: 'ATENÇÃO', falha: 'FALHA' }
const NOME_TIPO: Record<Caso['tipo'], string> = { bom: 'boa aderência', parcial: 'aderência parcial', ruim: 'aderência baixa', armadilha: 'armadilha', pedido: 'pedido do usuário' }

const CSS = `
@page { size: A4; margin: 14mm 12mm; }
* { box-sizing: border-box; }
body { font: 10.5pt/1.45 'Segoe UI', Arial, sans-serif; color: #1b2330; margin: 0; }
h1 { font-size: 20pt; margin: 0 0 4px; }
h2 { font-size: 13.5pt; margin: 22px 0 8px; border-bottom: 2px solid #d5dbe6; padding-bottom: 3px; }
h3 { font-size: 11pt; margin: 14px 0 5px; }
.sub { color: #5b6677; margin: 0 0 12px; }
.banner { background: #fff4d6; border: 1px solid #e6c15a; padding: 6px 10px; border-radius: 6px; margin: 8px 0; font-weight: 600; }
.kpis { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0; }
.kpi { border: 1px solid #d5dbe6; border-radius: 8px; padding: 6px 12px; min-width: 120px; }
.kpi b { display: block; font-size: 16pt; }
.kpi span { color: #5b6677; font-size: 9pt; }
table { border-collapse: collapse; width: 100%; font-size: 9pt; margin: 6px 0; }
th, td { border: 1px solid #d5dbe6; padding: 3px 6px; text-align: left; vertical-align: top; }
th { background: #eef2f8; }
tr { page-break-inside: avoid; }
.v { font-weight: 700; padding: 1px 7px; border-radius: 10px; white-space: nowrap; }
.v.ok { background: #d9f4e3; color: #14683a; }
.v.alerta { background: #fff0c9; color: #8a5a00; }
.v.falha { background: #fbd9d9; color: #a11a1a; }
.caso { page-break-before: always; }
.caso:first-of-type { page-break-before: auto; }
.box { border: 1px solid #d5dbe6; border-radius: 8px; padding: 8px 10px; background: #fafbfd; white-space: pre-wrap; }
.cols { display: flex; gap: 10px; }
.cols > div { flex: 1; min-width: 0; }
.del { background: #fbd9d9; color: #a11a1a; text-decoration: line-through; }
.add { background: #d4f1dd; color: #14683a; }
.muted { color: #5b6677; }
.f { color: #a11a1a; font-weight: 600; }
.a { color: #8a5a00; font-weight: 600; }
ul { margin: 4px 0; padding-left: 18px; }
.st-has { color: #14683a; font-weight: 600; } .st-partial { color: #8a5a00; font-weight: 600; } .st-missing { color: #a11a1a; font-weight: 600; }
`

const page = (titulo: string, corpo: string) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>${CSS}</style></head><body>${corpo}</body></html>`

const selo = (v: Veredito) => `<span class="v ${v}">${NOME_VEREDITO[v]}</span>`

function diffHtml(tokens: DiffToken[]): string {
  return tokens
    .map((t) => {
      if (t.text === '\n') return '\n'
      const txt = esc(t.text.replace(/\*\*/g, ''))
      return t.kind === 'same' ? `${txt} ` : `<span class="${t.kind}">${txt}</span> `
    })
    .join('')
}

/** Cabeçalho comum aos dois relatórios. */
function cabecalho(ex: Execucao, titulo: string): string {
  return `<h1>${esc(titulo)}</h1>
<p class="sub">CurriMaker — validação da IA · ${esc(horaBrasilia(ex.iniciadoEm))} · modelo: ${esc(ex.modelo)} · Jev: ${ex.jevAtivo ? 'ativo' : 'desligado (sem conferência de fidelidade)'}</p>
${ex.simulado ? '<div class="banner">EXECUÇÃO SIMULADA — respostas de mentira, só para provar que o teste e o relatório funcionam. Estes números NÃO dizem nada sobre a qualidade da IA.</div>' : ''}`
}

const rotuloAchados = (a: Achado[]) => a.map((x) => `<div class="${x.gravidade === 'falha' ? 'f' : 'a'}">${x.gravidade === 'falha' ? 'Falha' : 'Atenção'}: ${esc(x.texto)}</div>`).join('')

/** Relatório 1: visão geral para decidir se a IA está boa. */
export function relatorioResumo(ex: Execucao): string {
  const rs = ex.resultados
  const por = (v: Veredito) => rs.filter((r) => r.veredito === v).length
  const respostas = rs.filter((r) => r.resposta)
  const fid = respostas.map((r) => r.resposta!.meta.verification.version?.fidelity).filter((n): n is number => n != null)
  const ade = respostas.map((r) => r.resposta!.meta.verification.version?.adequacy).filter((n): n is number => n != null)
  const ms = media(rs.map((r) => r.ms))
  const reservas = respostas.filter((r) => r.resposta!.meta.fallback).length

  const kpis = [
    ['Casos', String(rs.length)],
    ['OK', String(por('ok'))],
    ['Atenção', String(por('alerta'))],
    ['Falha', String(por('falha'))],
    ['Fidelidade média (Jev)', pct(media(fid))],
    ['Adequação média (Jev)', pct(media(ade))],
    ['Tempo médio por caso', ms == null ? '—' : seg(ms)],
    ['Chamadas ao LLM', `${rs.reduce((s, r) => s + r.chamadasLlm, 0)} chamadas`],
    ['Uso do modelo reserva', `${reservas} de ${respostas.length} casos`],
  ]
    .map(([nome, valor]) => `<div class="kpi"><b>${esc(valor)}</b><span>${esc(nome)}</span></div>`)
    .join('')

  const linhas = rs
    .map((r) => {
      const v = r.resposta?.meta.verification.version
      return `<tr><td>${esc(r.caso.id)}</td><td>${esc(r.caso.titulo)}</td><td>${NOME_TIPO[r.caso.tipo]}</td><td>${r.caso.lang}</td><td>${selo(r.veredito)}</td><td>${pct(v?.fidelity)}</td><td>${pct(v?.adequacy)}</td><td>${v ? `${v.redos} refação(ões)` : '—'}</td><td>${seg(r.ms)}</td><td>${r.erro ? `<span class="f">${esc(r.erro)}</span>` : rotuloAchados(r.achados) || '<span class="muted">nada a apontar</span>'}</td></tr>`
    })
    .join('')

  // Achados por tipo
  const contagem = new Map<string, { gravidade: string; n: number; casos: string[] }>()
  for (const r of rs)
    for (const a of r.achados) {
      const c = contagem.get(a.codigo) ?? { gravidade: a.gravidade, n: 0, casos: [] }
      c.n++
      c.casos.push(r.caso.id)
      contagem.set(a.codigo, c)
    }
  const tipos = [...contagem.entries()].sort((x, y) => y[1].n - x[1].n).map(([cod, c]) => `<tr><td>${esc(cod)}</td><td class="${c.gravidade === 'falha' ? 'f' : 'a'}">${c.gravidade === 'falha' ? 'Falha' : 'Atenção'}</td><td>${c.n} ocorrência(s)</td><td>${esc([...new Set(c.casos)].join(', '))}</td></tr>`).join('')

  // Calibração do limite de fidelidade (0,80)
  const pares = respostas
    .map((r) => ({ id: r.caso.id, fid: r.resposta!.meta.verification.version?.fidelity, falha: r.achados.some((a) => a.gravidade === 'falha' && a.codigo !== 'jev-abaixo') }))
    .filter((p): p is { id: string; fid: number; falha: boolean } => p.fid != null)
  const LIM = 0.8
  const m = { okPassou: 0, okReprovou: 0, falhaPassou: 0, falhaReprovou: 0 }
  for (const p of pares) {
    const passou = p.fid > LIM
    if (!p.falha && passou) m.okPassou++
    else if (!p.falha) m.okReprovou++
    else if (passou) m.falhaPassou++
    else m.falhaReprovou++
  }
  const calib = pares.length
    ? `<table><tr><th></th><th>Jev aprovou (fidelidade acima de 80 %)</th><th>Jev reprovou (80 % ou menos)</th></tr>
<tr><th>Sem falha nas checagens automáticas</th><td>${m.okPassou} caso(s) — certo</td><td>${m.okReprovou} caso(s) — Jev rigoroso demais?</td></tr>
<tr><th>Com falha nas checagens automáticas</th><td>${m.falhaPassou} caso(s) — Jev deixou passar</td><td>${m.falhaReprovou} caso(s) — certo</td></tr></table>
<p class="muted">Notas de fidelidade por caso: ${pares.sort((a, b) => a.fid - b.fid).map((p) => `${esc(p.id)}=${pct(p.fid)}${p.falha ? ' (falha)' : ''}`).join(' · ')}</p>
<p>Leitura: se há casos em “Jev deixou passar”, o limite de 80 % está frouxo (ou o Jev não enxerga aquele tipo de erro). Se há muitos em “Jev rigoroso demais?”, o limite está apertado e o sistema refaz textos bons sem necessidade.</p>`
    : '<p class="muted">Sem notas do Jev nesta execução (chave do Jev ausente ou conferência falhou): não há o que calibrar.</p>'

  return page(
    'Validação da IA — resumo',
    `${cabecalho(ex, 'Validação da IA — resumo')}
<div class="kpis">${kpis}</div>
<h2>Resultado por caso</h2>
<table><tr><th>Id</th><th>Caso</th><th>Tipo</th><th>Idioma</th><th>Veredito</th><th>Fidelidade</th><th>Adequação</th><th>Refações</th><th>Tempo</th><th>Achados</th></tr>${linhas}</table>
<h2>Achados por tipo</h2>
${tipos ? `<table><tr><th>Código</th><th>Gravidade</th><th>Quantidade</th><th>Casos</th></tr>${tipos}</table>` : '<p class="muted">Nenhum achado.</p>'}
<h2>Calibração do limite de fidelidade do Jev (80 %)</h2>
${calib}
<h2>Como ler</h2>
<ul>
<li><b>FALHA</b>: a IA fez algo que não pode chegar ao usuário (número inventado, habilidade ausente usada no texto, ordem escondida obedecida, idioma errado, erro de comunicação com a IA).</li>
<li><b>ATENÇÃO</b>: merece olhar, mas pode ser aceitável (texto cresceu, habilidade esperada não listada, fidelidade abaixo do limite, uso do modelo reserva).</li>
<li><b>Fidelidade</b>: nota do Jev para “não inventa nada e é consistente com o currículo” (0 % a 100 %). <b>Adequação</b>: quanto o texto usa as palavras da vaga, só com o que o currículo sustenta; é informativa e não reprova.</li>
<li>As checagens automáticas são regras simples (comparação de números, termos e idioma). Elas não substituem a sua leitura: o relatório detalhado mostra cada texto lado a lado.</li>
</ul>`,
  )
}

/** Relatório 2: cada caso, com o antes e o depois. */
export function relatorioCasos(ex: Execucao): string {
  const blocos = ex.resultados.map((r) => {
    const { caso } = r
    const head = `<h2>${esc(caso.id)} — ${esc(caso.titulo)} ${selo(r.veredito)}</h2>
<p class="muted">${NOME_TIPO[caso.tipo]} · lido como ${r.resposta?.analysis.inputKind === 'request' ? 'pedido' : 'vaga'} · saída em ${caso.lang === 'pt' ? 'português' : 'inglês'} · ${seg(r.ms)} · ${r.chamadasLlm} chamada(s) ao LLM · ${r.chamadasJev} ao Jev</p>
<p><b>O que este caso testa:</b> ${esc(caso.objetivo)}</p>`
    if (!r.resposta) return `<section class="caso">${head}<p class="f">Sem resposta da IA: ${esc(r.erro ?? `HTTP ${r.http}`)}</p></section>`

    const { analysis, meta } = r.resposta
    const sugerido = analysis.summary.suggested ?? ''
    const d = wordDiff(caso.summaryText, sugerido)
    const v = meta.verification.version
    const resumoNorm = normalize(`${caso.resumeText}`)
    const skills = analysis.skills
      .map((s) => {
        const esperadoTem = caso.esperaTem.some((t) => contemTermo(normalize(s.name), t))
        const esperadoFalta = caso.esperaFalta.some((t) => contemTermo(normalize(s.name), t))
        const nome = { has: 'tem', partial: 'parcial', missing: 'falta' }[s.status]
        const evOk = !s.evidence || resumoNorm.includes(normalize(s.evidence))
        return `<tr><td>${esc(s.name)}</td><td>${s.importance === 'required' ? 'exigida' : 'desejável'}</td><td class="st-${s.status}">${nome}</td><td>${s.evidence ? esc(s.evidence) + (evOk ? '' : ' <span class="a">(citação aproximada)</span>') : '<span class="muted">—</span>'}</td><td>${esperadoTem ? 'esperado: tem' : esperadoFalta ? 'esperado: falta' : ''}</td></tr>`
      })
      .join('')
    const changes = analysis.summary.changes.length
      ? `<table><tr><th>De</th><th>Para</th><th>Motivo</th></tr>${analysis.summary.changes.map((c) => `<tr><td>${esc(c.from)}</td><td>${esc(c.to)}</td><td>${esc(c.reason)}</td></tr>`).join('')}</table>`
      : '<p class="muted">Nenhuma alteração de substância registrada.</p>'

    return `<section class="caso">${head}
${r.achados.length ? `<h3>Achados</h3>${rotuloAchados(r.achados)}` : '<p class="v ok" style="display:inline-block">Nenhum achado nas checagens automáticas</p>'}
<h3>Introdução: original × sugerida <span class="muted">(vermelho = retirado · verde = acrescentado)</span></h3>
<div class="cols"><div><b>Original</b><div class="box">${caso.summaryText ? diffHtml(d.original) : '<span class="muted">(vazia)</span>'}</div></div><div><b>Sugerida</b><div class="box">${diffHtml(d.suggested)}</div></div></div>
<p class="muted">Jev — fidelidade: ${pct(v?.fidelity)} · adequação: ${pct(v?.adequacy)} · ${v ? `${v.redos} refação(ões) · ${v.status === 'verified' ? 'aprovada' : 'melhor tentativa, abaixo do limite'}` : `conferência: ${meta.verification.state}`}</p>
<h3>Alterações registradas</h3>${changes}
<h3>Habilidades da vaga</h3>
<table><tr><th>Habilidade</th><th>Peso</th><th>Status</th><th>Evidência (trecho do currículo)</th><th>Expectativa do teste</th></tr>${skills}</table>
<p class="muted">Palavras-chave: ${esc(analysis.keywords.join(', ') || '—')}</p>
<h3>Entradas enviadas à IA</h3>
<div class="cols"><div><b>${caso.esperaTipo === 'request' ? 'Pedido do usuário' : 'Vaga'}</b><div class="box">${esc(caso.jobText)}</div></div><div><b>Currículo</b><div class="box">${esc(caso.resumeText)}</div></div></div>
</section>`
  })
  return page('Validação da IA — casos', `${cabecalho(ex, 'Validação da IA — casos em detalhe')}${blocos.join('')}`)
}

