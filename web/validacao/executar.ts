import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { handleAnalyze } from '../worker/analyze.ts'
import { createVerifier, type JevEnv, type Verifier } from '../worker/jev.ts'
import { createProvider, DEFAULT_MODEL, type LLMEnv, type LLMProvider } from '../worker/llm.ts'
import { CASOS, type Caso } from './casos.ts'
import { auditar, veredito, type Achado, type Resposta } from './checks.ts'
import { htmlParaPdf } from './pdf.ts'
import { relatorioCasos, relatorioResumo, type Execucao, type Resultado } from './relatorio.ts'
import { jevSimulado, llmSimulado } from './simulado.ts'

export type Opcoes = {
  env: LLMEnv & JevEnv
  /** LLM e Jev de mentira: prova que o teste funciona sem usar as chaves. */
  simulado: boolean
  /** Pasta onde ficam JSON, HTML e PDF. */
  saida: string
  /** Ids dos casos a rodar; vazio = todos. */
  so?: string[]
  /** Espera entre casos, em ms, para não estourar o limite de uso do provedor. */
  pausaMs?: number
  /** Gerar os PDFs (precisa de Edge ou Chrome instalado). */
  pdf?: boolean
  log?: (linha: string) => void
}

const dorme = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Roda os casos pelo mesmo caminho do site (handleAnalyze), mede, audita e grava os relatórios. */
export async function executar(op: Opcoes): Promise<Execucao & { arquivos: string[] }> {
  const log = op.log ?? (() => {})
  const casos: Caso[] = op.so?.length ? CASOS.filter((c) => op.so!.includes(c.id)) : CASOS
  if (casos.length === 0) throw new Error('Nenhum caso corresponde ao filtro.')

  let chamadasLlm = 0
  let chamadasJev = 0
  const base: LLMProvider = op.simulado ? llmSimulado(CASOS) : createProvider(op.env)
  const provider: LLMProvider = {
    complete: (a) => {
      chamadasLlm++
      return base.complete(a)
    },
    fallbackUsed: () => base.fallbackUsed?.() ?? false,
  }
  const jev: Verifier | undefined = op.simulado ? jevSimulado() : op.env.TYPESAFE_API_KEY ? createVerifier(op.env) : undefined
  const verifier: Verifier | undefined = jev && {
    ask: (state, questions) => {
      chamadasJev++
      return jev.ask(state, questions)
    },
  }

  const iniciadoEm = new Date()
  const resultados: Resultado[] = []
  let modelo = op.simulado ? 'simulado' : op.env.LLM_MODEL || DEFAULT_MODEL
  for (const [i, caso] of casos.entries()) {
    if (i > 0 && op.pausaMs) await dorme(op.pausaMs)
    chamadasLlm = 0
    chamadasJev = 0
    const t0 = Date.now()
    const body = JSON.stringify({ jobText: caso.jobText, resumeText: caso.resumeText, summaryText: caso.summaryText, language: caso.lang })
    const res = await handleAnalyze(new Request('http://validacao.local/api/analyze', { method: 'POST', body }), {
      env: op.env,
      ip: '127.0.0.1',
      limiter: { check: async () => 'ok' },
      provider,
      verifier,
    })
    const ms = Date.now() - t0
    const dados = (await res.json()) as Resposta | { error?: string; message?: string }
    const resposta = res.status === 200 ? (dados as Resposta) : undefined
    if (resposta) modelo = resposta.meta.model
    const achados: Achado[] = resposta ? auditar(caso, resposta) : [{ gravidade: 'falha', codigo: 'sem-resposta', texto: `A análise não foi devolvida (HTTP ${res.status}).` }]
    const r: Resultado = {
      caso,
      http: res.status,
      erro: resposta ? undefined : `HTTP ${res.status}: ${(dados as { message?: string }).message ?? 'erro'}`,
      resposta,
      achados,
      veredito: veredito(achados),
      ms,
      chamadasLlm,
      chamadasJev,
    }
    resultados.push(r)
    const v = resposta?.meta.verification.version
    log(`${caso.id} ${r.veredito.toUpperCase().padEnd(6)} ${(ms / 1000).toFixed(1)} s  fidelidade ${v ? Math.round(v.fidelity * 100) + ' %' : '—'}  ${caso.titulo}${achados.length ? '  [' + [...new Set(achados.map((a) => a.codigo))].join(', ') + ']' : ''}`)
  }

  const execucao: Execucao = { simulado: op.simulado, iniciadoEm, modelo, jevAtivo: Boolean(verifier), resultados }
  mkdirSync(op.saida, { recursive: true })
  const arquivos: string[] = []
  const grava = (nome: string, conteudo: string) => {
    const p = join(op.saida, nome)
    writeFileSync(p, conteudo, 'utf-8')
    arquivos.push(p)
    return p
  }
  grava(
    'resultados.json',
    JSON.stringify({ simulado: op.simulado, iniciadoEm, modelo, jevAtivo: execucao.jevAtivo, resultados: resultados.map(({ caso, ...r }) => ({ id: caso.id, titulo: caso.titulo, ...r })) }, null, 2),
  )
  for (const [nome, html] of [
    ['01-resumo', relatorioResumo(execucao)],
    ['02-casos', relatorioCasos(execucao)],
  ] as const) {
    const h = grava(`${nome}.html`, html)
    if (op.pdf) {
      const pdf = join(op.saida, `${nome}.pdf`)
      if (htmlParaPdf(h, pdf)) arquivos.push(pdf)
      else log(`Não consegui gerar ${nome}.pdf (Edge/Chrome não encontrado). Abra o ${nome}.html no navegador e use Imprimir > Salvar como PDF.`)
    }
  }
  return { ...execucao, arquivos }
}
