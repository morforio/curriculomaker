import type { JevAnswer, JevQuestion, Verifier } from '../worker/jev.ts'
import type { LLMProvider } from '../worker/llm.ts'
import { SYSTEM_PROMPT } from '../worker/prompt.ts'
import { toBullets } from '../worker/text.ts'
import type { Caso } from './casos.ts'

/**
 * LLM e Jev de mentira (modo --simulado): respondem sempre bem, a partir do que o próprio caso espera.
 * Servem para provar que o teste, as checagens e o relatório funcionam sem gastar a chave. Não medem nada da IA real.
 */
function achaCaso(casos: Caso[], prompt: string): Caso {
  const caso = casos.find((c) => prompt.includes(c.resumeText.slice(0, 120)))
  if (!caso) throw new Error('simulado: caso não encontrado no prompt')
  return caso
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Termo com alternativas ("a|b"): procura qualquer uma no currículo; devolve a que achou e a linha (até 12 palavras) como evidência. */
function linhaCom(caso: Caso, termo: string): { nome: string; ev: string } | undefined {
  for (const alt of termo.split('|')) {
    const linha = caso.resumeText.split('\n').find((l) => l.toLowerCase().includes(alt.toLowerCase()))
    if (linha) return { nome: alt, ev: linha.split(/\s+/).slice(0, 12).join(' ') }
  }
  return undefined
}

export function llmSimulado(casos: Caso[]): LLMProvider {
  return {
    async complete({ system, user }) {
      const caso = achaCaso(casos, user)
      const texto = toBullets(caso.summaryText || caso.resumeText.split('\n')[0])
      if (system !== SYSTEM_PROMPT) return JSON.stringify({ text: texto, changes: [] })
      const tem = caso.esperaTem.map((t) => linhaCom(caso, t)).filter((x) => x !== undefined)
      return JSON.stringify({
        job: { title: caso.titulo, company: null, seniority: null },
        summary: { suggested: texto, changes: [] },
        skills: [
          ...tem.map((x) => ({ name: cap(x.nome), importance: 'required', status: 'has', evidence: x.ev })),
          ...caso.esperaFalta.map((t) => ({ name: cap(t.split('|')[0]), importance: 'required', status: 'missing', evidence: null })),
        ],
        keywords: [...caso.esperaTem, ...caso.esperaFalta].map((t) => t.split('|')[0]).slice(0, 15),
      })
    },
  }
}

export function jevSimulado(): Verifier {
  return {
    async ask(_state, questions: Record<string, JevQuestion>) {
      const out: Record<string, JevAnswer> = {}
      for (const [id, q] of Object.entries(questions)) out[id] = q.type === 'score' ? { type: 'score', score: 2 } : { type: 'noul', noul: 0.94 }
      return out
    },
  }
}
