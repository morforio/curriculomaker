/**
 * Cliente do Jev (TypeSafe System One). O Jev não gera texto: responde perguntas tipadas
 * (sim/não com probabilidade, ou nota numa escala). Aqui ele confere o que o LLM escreveu.
 * Contrato: https://docs.typesafe.ai/api
 */
export type JevQuestion =
  | { type: 'noul'; instructions: string; criteria?: { true?: string; false?: string } }
  | { type: 'score'; instructions: string; criteria: string[] }

export type JevAnswer = { type: 'noul'; noul: number } | { type: 'score'; score: number }

export interface Verifier {
  /** Avalia todas as perguntas sobre o mesmo `state`, em uma única chamada. */
  ask(state: unknown, questions: Record<string, JevQuestion>): Promise<Record<string, JevAnswer>>
}

export class JevError extends Error {}

export type JevEnv = { TYPESAFE_API_KEY?: string; TYPESAFE_BASE_URL?: string; TYPESAFE_MODEL?: string }

export const DEFAULT_JEV_URL = 'https://api.typesafe.ai'
/** Versão fixa (não o alias jev-latest): os limites de nota foram pensados para ela. */
export const DEFAULT_JEV_MODEL = 'jev-1.13.0'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function readAnswer(raw: unknown, question: JevQuestion): JevAnswer {
  const a = raw as { noul?: unknown; score?: unknown } | null | undefined
  if (question.type === 'noul' && typeof a?.noul === 'number') return { type: 'noul', noul: a.noul }
  if (question.type === 'score' && typeof a?.score === 'number') return { type: 'score', score: a.score }
  throw new JevError('Resposta do Jev fora do formato esperado.')
}

export function createVerifier(env: JevEnv): Verifier {
  const base = (env.TYPESAFE_BASE_URL || DEFAULT_JEV_URL).replace(/\/+$/, '')
  const model = env.TYPESAFE_MODEL || DEFAULT_JEV_MODEL
  const apiKey = env.TYPESAFE_API_KEY ?? ''

  return {
    async ask(state, questions) {
      for (let attempt = 0; ; attempt++) {
        let res: Response
        try {
          res = await fetch(`${base}/v1/systemone`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ state, model, questions }),
            signal: AbortSignal.timeout(30_000),
          })
        } catch {
          throw new JevError('Falha de rede ou tempo esgotado ao chamar o Jev.')
        }
        // 429 (limite de uso) e 529 (sobrecarga): tenta de novo, com espera crescente.
        if ((res.status === 429 || res.status === 529) && attempt < 2) {
          await sleep(400 * 3 ** attempt)
          continue
        }
        if (!res.ok) {
          console.error(`Jev HTTP ${res.status} (modelo: ${model})`)
          throw new JevError(`O Jev respondeu HTTP ${res.status}.`)
        }
        const data = (await res.json().catch(() => null)) as { answers?: Record<string, unknown> } | null
        const out: Record<string, JevAnswer> = {}
        for (const [id, question] of Object.entries(questions)) out[id] = readAnswer(data?.answers?.[id], question)
        return out
      }
    },
  }
}
