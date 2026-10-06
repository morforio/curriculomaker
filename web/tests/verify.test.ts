import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Analysis, AnalyzeRequest } from '../src/lib/schemas/analysis.ts'
import type { JevAnswer, JevQuestion, Verifier } from '../worker/jev.ts'
import type { LLMProvider } from '../worker/llm.ts'
import { MAX_REDOS, refineSummaries } from '../worker/verify.ts'

/**
 * Testes da conferência da introdução (worker/verify.ts), com LLM e Jev simulados:
 * validam a lógica do ciclo (notas, limite de refações, escolha da melhor tentativa), não a qualidade do Jev real.
 */

const GOOD = 'Desenvolvedor com experiência em APIs REST Node.js e React.'
const EXAGGERATED = 'Desenvolvedor que liderei APIs REST Node.js e React.'

const req: AnalyzeRequest = {
  jobText: 'x'.repeat(100),
  resumeText: 'Desenvolvedor\n\nExperiência\nDev, Acme | 2021 - 2024\nConstruí APIs em Node.js e React.\n\nHabilidades\nJavaScript, TypeScript, Node.js, React',
  summaryText: 'Desenvolvedor com experiência em APIs Node.js e React.',
  language: 'pt',
}

function analysisWith(suggested: string, changes: Analysis['summary']['changes'] = [{ from: 'APIs', to: 'APIs REST', reason: 'termo da vaga' }]): Analysis {
  return {
    job: {},
    summary: { suggested, changes },
    skills: [{ name: 'Kubernetes', importance: 'required', status: 'missing', evidence: undefined }],
    keywords: [],
  }
}

/**
 * Jev simulado. "liderei" reprova a consistência com o currículo; a adequação sobe quando o texto traz "APIs REST".
 * Guarda cada chamada para os testes inspecionarem.
 */
function fakeVerifier() {
  const calls: { state: Record<string, unknown>; ids: string[] }[] = []
  const verifier: Verifier = {
    async ask(state, questions: Record<string, JevQuestion>) {
      const s = state as Record<string, unknown>
      calls.push({ state: s, ids: Object.keys(questions) })
      const text = String(s.rewritten_summary)
      const out: Record<string, JevAnswer> = {}
      for (const id of Object.keys(questions)) {
        if (id === 'adequacy') out[id] = { type: 'score', score: /APIs REST/.test(text) ? 3 : 1 }
        else if (id === 'consistent_with_resume') out[id] = { type: 'noul', noul: /liderei/.test(text) ? 0.1 : 0.97 }
        else out[id] = { type: 'noul', noul: 0.95 }
      }
      return out
    },
  }
  return { verifier, calls }
}

/** LLM simulado: devolve as respostas na ordem; sem resposta, falha. */
function fakeProvider(replies: { text: string; changes?: Analysis['summary']['changes'] }[]): { provider: LLMProvider; remaining: () => number } {
  const queue = [...replies]
  return {
    provider: {
      async complete() {
        const next = queue.shift()
        if (!next) throw new Error('sem resposta')
        return JSON.stringify({ text: next.text, changes: next.changes ?? [] })
      },
    },
    remaining: () => queue.length,
  }
}

test('passa de primeira: nenhuma refação', async () => {
  const { verifier } = fakeVerifier()
  const { provider } = fakeProvider([])
  const r = await refineSummaries({ analysis: analysisWith(GOOD), req, provider, verifier })
  assert.equal(r.verification.state, 'checked')
  assert.equal(r.verification.version?.status, 'verified')
  assert.equal(r.verification.version?.redos, 0)
})

test('texto reprovado é refeito e a versão refeita passa', async () => {
  const { verifier } = fakeVerifier()
  const { provider } = fakeProvider([{ text: GOOD }])
  const r = await refineSummaries({ analysis: analysisWith(EXAGGERATED), req, provider, verifier })
  assert.equal(r.verification.version?.redos, 1)
  assert.equal(r.verification.version?.status, 'verified')
  assert.equal(r.analysis.summary.suggested, GOOD)
})

test('número inventado e habilidade ausente são barrados no código, sem chamar o Jev', async () => {
  const { verifier, calls } = fakeVerifier()
  const bad = 'Desenvolvedor com 10 anos de experiência com Kubernetes.'
  const { provider } = fakeProvider(Array.from({ length: MAX_REDOS }, () => ({ text: bad })))
  const r = await refineSummaries({ analysis: analysisWith(bad), req, provider, verifier })
  assert.equal(calls.length, 0)
  assert.equal(r.verification.version?.status, 'best_effort')
  assert.equal(r.verification.version?.redos, MAX_REDOS)
})

test('no máximo MAX_REDOS refações; sem aprovação, vale a tentativa de maior nota', async () => {
  const { verifier } = fakeVerifier()
  const v1 = 'Desenvolvedor liderei APIs Node.js e React.' // exagera e não usa os termos da vaga
  const v2 = 'Desenvolvedor com experiência em APIs Node.js e React.' // fiel, mas pouco ajustada (adequação 1/3)
  const replies = [{ text: v2 }, { text: v2 }, { text: v2 }, { text: GOOD }]
  const { provider, remaining } = fakeProvider(replies)
  const r = await refineSummaries({ analysis: analysisWith(v1), req, provider, verifier })
  const q = r.verification.version
  assert.equal(q?.redos, MAX_REDOS)
  assert.equal(q?.status, 'best_effort')
  assert.equal(r.analysis.summary.suggested, v2)
  assert.equal(remaining(), replies.length - MAX_REDOS, 'respostas além do limite não podem ser usadas')
})

test('Jev fora do ar não derruba a análise', async () => {
  const down: Verifier = {
    async ask() {
      throw new Error('rede')
    },
  }
  const { provider } = fakeProvider([])
  const r = await refineSummaries({ analysis: analysisWith(GOOD), req, provider, verifier: down })
  assert.equal(r.verification.state, 'failed')
  assert.equal(r.analysis.summary.suggested, GOOD)
})

test('sem verificador (chave ausente): conferência pulada', async () => {
  const { provider } = fakeProvider([])
  const r = await refineSummaries({ analysis: analysisWith(GOOD), req, provider })
  assert.equal(r.verification.state, 'skipped')
  assert.equal(r.analysis.summary.suggested, GOOD)
})

test('não penaliza mudar muito o texto: não pergunta se manteve o original', async () => {
  const { verifier, calls } = fakeVerifier()
  const { provider } = fakeProvider([])
  await refineSummaries({ analysis: analysisWith(GOOD), req, provider, verifier })
  const fidelityCall = calls.find((c) => c.ids.includes('no_invention'))
  assert.ok(fidelityCall)
  assert.ok(!fidelityCall.ids.includes('faithful_to_original'))
  assert.ok(!('current_summary' in fidelityCall.state))
})

test('com versão refeita, a lista de alterações descarta as que não valem mais', async () => {
  const { verifier } = fakeVerifier()
  const { provider } = fakeProvider([{ text: GOOD, changes: [{ from: 'APIs', to: 'APIs REST', reason: 'termo da vaga' }] }])
  const stale = { from: 'experiência em APIs', to: 'liderei APIs', reason: 'texto antigo' }
  const r = await refineSummaries({ analysis: analysisWith(EXAGGERATED, [stale]), req, provider, verifier })
  assert.equal(r.analysis.summary.suggested, GOOD)
  assert.deepEqual(
    r.analysis.summary.changes.map((c) => c.to),
    ['APIs REST'],
  )
})
