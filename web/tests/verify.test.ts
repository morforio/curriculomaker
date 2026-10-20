import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Analysis, AnalyzeRequest } from '../src/lib/schemas/analysis.ts'
import type { JevAnswer, JevQuestion, Verifier } from '../worker/jev.ts'
import type { LLMProvider } from '../worker/llm.ts'
import { BULLET_MIN_SCORE, MAX_REDOS, refineSummaries } from '../worker/verify.ts'

/**
 * Testes da conferência da introdução (worker/verify.ts), com LLM e Jev simulados: validam a lógica do ciclo (nota por tópico, refação dirigida,
 * retirada do que não tem apoio, volta ao texto original, conferência das habilidades), não a qualidade do Jev real.
 */

const GOOD = 'Desenvolvedor com experiência em APIs REST Node.js e React.'
const EXAGGERATED = 'Desenvolvedor que liderei APIs REST Node.js e React.'

const req: AnalyzeRequest = {
  jobText: 'x'.repeat(100),
  resumeText: 'Desenvolvedor\n\nExperiência\nDev, Acme | 2021 - 2024\nConstruí APIs em Node.js e React.\n\nHabilidades\nJavaScript, TypeScript, Node.js, React',
  summaryText: 'Desenvolvedor com experiência em APIs Node.js e React.',
  language: 'pt',
}

function analysisWith(suggested: string, changes: Analysis['summary']['changes'] = [{ from: 'APIs', to: 'APIs REST', reason: 'termo da vaga' }], skills: Analysis['skills'] = [{ name: 'Kubernetes', importance: 'required', status: 'missing', evidence: undefined }]): Analysis {
  return { inputKind: 'posting', job: {}, summary: { suggested, changes }, skills, keywords: [] }
}

/**
 * Jev simulado. Texto inteiro: "liderei" reprova a consistência (0,1) e "coordenei" a deixa fraca (0,5). Por tópico (nota 0 a 3): "liderei" = 0,
 * "coordenei" = 1, "design" = 1 (enfeite), o resto = 3. Habilidade: "Kubernetes" = 0, "Liderança" = 1, o resto = 3. Adequação: 3 com "APIs REST".
 * Guarda cada chamada para os testes inspecionarem.
 */
function fakeVerifier() {
  const calls: { state: Record<string, unknown>; ids: string[]; questions: Record<string, JevQuestion> }[] = []
  const verifier: Verifier = {
    async ask(state, questions: Record<string, JevQuestion>) {
      const s = state as Record<string, unknown>
      calls.push({ state: s, ids: Object.keys(questions), questions })
      const out: Record<string, JevAnswer> = {}
      for (const id of Object.keys(questions)) {
        const text = String(s.rewritten_summary ?? s[id] ?? '')
        if (id === 'adequacy') out[id] = { type: 'score', score: /APIs REST/.test(text) ? 3 : 1 }
        else if (id.startsWith('bullet_')) out[id] = { type: 'score', score: /liderei/.test(text) ? 0 : /coordenei|design/.test(text) ? 1 : 3 }
        else if (id.startsWith('skill_')) out[id] = { type: 'score', score: /Kubernetes/.test(text) ? 0 : /Liderança/.test(text) ? 1 : 3 }
        else if (id === 'impersonal') out[id] = { type: 'noul', noul: /Treinei|Construo/.test(String(s.rewritten_summary)) ? 0.1 : 0.95 }
        else if (id === 'consistent_with_resume') out[id] = { type: 'noul', noul: /liderei/.test(text) ? 0.1 : /coordenei/.test(text) ? 0.5 : 0.97 }
        else out[id] = { type: 'noul', noul: 0.95 }
      }
      return out
    },
  }
  return { verifier, calls }
}

/** LLM simulado: devolve as respostas na ordem; sem resposta, falha. Guarda os pedidos de refação. */
function fakeProvider(replies: { text: string; changes?: Analysis['summary']['changes'] }[]): { provider: LLMProvider; remaining: () => number; prompts: string[] } {
  const queue = [...replies]
  const prompts: string[] = []
  return {
    provider: {
      async complete({ user }) {
        prompts.push(user)
        const next = queue.shift()
        if (!next) throw new Error('sem resposta')
        return JSON.stringify({ text: next.text, changes: next.changes ?? [] })
      },
    },
    remaining: () => queue.length,
    prompts,
  }
}

test('passa de primeira: nenhuma refação, tópicos conferidos no Jev', async () => {
  const { verifier, calls } = fakeVerifier()
  const { provider } = fakeProvider([])
  const r = await refineSummaries({ analysis: analysisWith(GOOD), req, provider, verifier })
  assert.equal(r.verification.state, 'checked')
  assert.equal(r.verification.version?.status, 'verified')
  assert.equal(r.verification.version?.redos, 0)
  assert.equal(r.verification.version?.removed, undefined)
  assert.equal(r.verification.version?.adequacy, 1, 'adequação 3 de 3 = 1 (100%)')
  const topicos = calls.find((c) => c.ids.includes('bullet_1'))
  assert.ok(topicos, 'cada tópico vai ao Jev')
  assert.equal(topicos.state.resume, req.resumeText)
  assert.equal(topicos.state.bullet_1, GOOD.replace(/^•\s*/, ''))
})

test('adequação baixa NÃO reprova nem refaz: só a fidelidade decide, e a adequação é apenas informada', async () => {
  const { verifier } = fakeVerifier()
  const fiel = 'Desenvolvedor com experiência em APIs Node.js e React.' // fiel, mas pouco ajustada à vaga (adequação 1 de 3)
  const { provider, remaining } = fakeProvider([{ text: GOOD }])
  const r = await refineSummaries({ analysis: analysisWith(fiel), req, provider, verifier })
  assert.equal(r.verification.version?.status, 'verified')
  assert.equal(r.verification.version?.redos, 0)
  assert.equal(remaining(), 1, 'o LLM não foi chamado de novo')
  assert.equal(r.analysis.summary.suggested, fiel)
  assert.ok(Math.abs((r.verification.version?.adequacy ?? 0) - 1 / 3) < 1e-9, 'a nota é informada como veio (1/3)')
})

test('tópico reprovado volta ao LLM com o tópico e as palavras que não estão no currículo; a versão refeita passa', async () => {
  const { verifier } = fakeVerifier()
  const { provider, prompts } = fakeProvider([{ text: GOOD }])
  const r = await refineSummaries({ analysis: analysisWith(EXAGGERATED), req, provider, verifier })
  assert.equal(r.verification.version?.redos, 1)
  assert.equal(r.verification.version?.status, 'verified')
  assert.equal(r.analysis.summary.suggested, `• ${GOOD}`, 'a versão refeita sai em tópicos')
  assert.match(prompts[0], /<problems>/)
  assert.match(prompts[0], /not supported by the resume/)
  assert.match(prompts[0], /que liderei APIs REST Node\.js e React\./, 'o tópico reprovado está na mensagem')
  assert.match(prompts[0], /words not found in the resume: .*liderei/, 'as palavras que não estão no currículo vão junto')
  assert.match(prompts[0], /Keep every bullet that is not listed exactly as it is/)
})

test('número inventado e habilidade ausente são barrados no código, sem chamar o Jev; sem saída, volta o texto original do usuário', async () => {
  const { verifier, calls } = fakeVerifier()
  const bad = 'Desenvolvedor com 10 anos de experiência com Kubernetes.'
  const { provider } = fakeProvider(Array.from({ length: MAX_REDOS }, () => ({ text: bad })))
  const r = await refineSummaries({ analysis: analysisWith(bad), req, provider, verifier })
  assert.equal(calls.filter((c) => c.ids.includes('no_invention')).length, 0, 'texto barrado no código não chega à fidelidade do Jev')
  assert.equal(r.verification.version?.redos, MAX_REDOS)
  assert.equal(r.analysis.summary.suggested, `• ${req.summaryText}`, 'nada inventado chega ao usuário: vale a introdução original')
  assert.equal(r.verification.version?.status, 'verified')
  assert.ok((r.verification.version?.removed ?? 0) > 0)
})

test('depois das refações, o tópico sem apoio é RETIRADO e os bons ficam', async () => {
  const { verifier } = fakeVerifier()
  const v1 = `• ${GOOD}\n• Desenvolvedor liderei APIs Node.js e React.`
  const { provider, remaining } = fakeProvider(Array.from({ length: MAX_REDOS }, () => ({ text: v1 })))
  const r = await refineSummaries({ analysis: analysisWith(v1), req, provider, verifier })
  const q = r.verification.version
  assert.equal(q?.redos, MAX_REDOS)
  assert.equal(q?.status, 'verified')
  assert.equal(q?.removed, 1)
  assert.equal(r.analysis.summary.suggested, `• ${GOOD}`)
  assert.equal(remaining(), 0)
})

test('se todos os tópicos reprovam e há introdução original, vale a original; sem original, a melhor tentativa fica com aviso', async () => {
  const { verifier } = fakeVerifier()
  const ruim = '• Desenvolvedor liderei APIs Node.js e React.'
  const a = fakeProvider(Array.from({ length: MAX_REDOS }, () => ({ text: ruim })))
  const r1 = await refineSummaries({ analysis: analysisWith(ruim), req, provider: a.provider, verifier })
  assert.equal(r1.analysis.summary.suggested, `• ${req.summaryText}`)
  assert.equal(r1.verification.version?.status, 'verified')
  const b = fakeProvider(Array.from({ length: MAX_REDOS }, () => ({ text: ruim })))
  const r2 = await refineSummaries({ analysis: analysisWith(ruim), req: { ...req, summaryText: '' }, provider: b.provider, verifier })
  assert.equal(r2.analysis.summary.suggested, ruim)
  assert.equal(r2.verification.version?.status, 'best_effort')
})

test('a nota mínima por tópico é 1,5: um tópico com nota 1 (enfeite) reprova e 2 ou mais passa', () => {
  assert.equal(BULLET_MIN_SCORE, 1.5)
})

test('tópico enfeitado ("design") reprova mesmo sem nenhuma palavra proibida', async () => {
  const { verifier } = fakeVerifier()
  const enfeitado = '• Construiu APIs em Node.js, demonstrando habilidades de design de interface'
  const { provider, prompts } = fakeProvider([{ text: `• ${GOOD}` }])
  const r = await refineSummaries({ analysis: analysisWith(enfeitado), req, provider, verifier })
  assert.equal(r.verification.version?.redos, 1)
  assert.match(prompts[0], /adds a purpose, result, quality, skill or link the resume does not state/)
  assert.equal(r.analysis.summary.suggested, `• ${GOOD}`)
})

test('habilidades: "possui" sem apoio vira "parcial" ou "não possui" e a tela recebe a contagem', async () => {
  const { verifier } = fakeVerifier()
  const { provider } = fakeProvider([])
  const skills: Analysis['skills'] = [
    { name: 'Node.js', importance: 'required', status: 'has', evidence: 'Construí APIs em Node.js' },
    { name: 'Liderança técnica', importance: 'required', status: 'has', evidence: 'Construí APIs' },
    { name: 'Kubernetes', importance: 'preferred', status: 'partial', evidence: 'Construí APIs' },
    { name: 'Docker', importance: 'preferred', status: 'missing', evidence: undefined },
  ]
  const r = await refineSummaries({ analysis: analysisWith(GOOD, [], skills), req, provider, verifier })
  const por = Object.fromEntries(r.analysis.skills.map((s) => [s.name, s.status]))
  assert.deepEqual(por, { 'Node.js': 'has', 'Liderança técnica': 'partial', Kubernetes: 'missing', Docker: 'missing' })
  assert.equal(r.analysis.skills.find((s) => s.name === 'Kubernetes')?.evidence, undefined, 'sem evidência quando vira "não possui"')
  assert.equal(r.verification.skillsAdjusted, 2)
})

test('com pedido, o Jev recebe o pedido e o texto da formação declarada vale como apoio', async () => {
  const { verifier, calls } = fakeVerifier()
  const { provider } = fakeProvider([])
  const analysis: Analysis = { ...analysisWith(GOOD), inputKind: 'request' }
  await refineSummaries({ analysis, req: { ...req, jobText: 'Possuo pós-graduação em engenharia de software e quero vagas de dev.' }, provider, verifier })
  const topicos = calls.find((c) => c.ids.includes('bullet_1'))!
  assert.equal(topicos.state.candidate_request, 'Possuo pós-graduação em engenharia de software e quero vagas de dev.')
  assert.match((topicos.questions.bullet_1 as { instructions: string }).instructions, /candidate_request/)
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
  assert.equal(r.analysis.summary.suggested, `• ${GOOD}`)
  assert.deepEqual(
    r.analysis.summary.changes.map((c) => c.to),
    ['APIs REST'],
  )
})

test('tópico que o usuário já tinha na introdução não é conferido pelo Jev (é afirmação dele); só o tópico novo é', async () => {
  const { verifier, calls } = fakeVerifier()
  const { provider } = fakeProvider([])
  const texto = `• ${req.summaryText}\n• ${GOOD}`
  const r = await refineSummaries({ analysis: analysisWith(texto), req, provider, verifier })
  const topicos = calls.filter((c) => c.ids.some((id) => id.startsWith('bullet_')))
  assert.equal(topicos.length, 1)
  assert.deepEqual(topicos[0].ids, ['bullet_1'], 'só um tópico foi perguntado')
  assert.equal(topicos[0].state.bullet_1, GOOD)
  assert.equal(r.verification.version?.status, 'verified')
})

test('texto só com tópicos do próprio usuário não faz consulta por tópico', async () => {
  const { verifier, calls } = fakeVerifier()
  const { provider } = fakeProvider([])
  await refineSummaries({ analysis: analysisWith(`• ${req.summaryText}`), req, provider, verifier })
  assert.equal(calls.filter((c) => c.ids.some((id) => id.startsWith('bullet_'))).length, 0)
})

test('primeira pessoa: a pergunta de estilo vai na mesma consulta da fidelidade e pede refação com a instrução certa', async () => {
  const { verifier, calls } = fakeVerifier()
  const primeira = '• Treinei novos atendentes'
  const { provider, prompts } = fakeProvider([{ text: '• Treinamento de novos atendentes' }])
  const r = await refineSummaries({ analysis: analysisWith(primeira), req, provider, verifier })
  const fid = calls.find((c) => c.ids.includes('no_invention'))
  assert.ok(fid && fid.ids.includes('impersonal'), 'mesma consulta da fidelidade, sem consulta nova')
  assert.equal(r.verification.version?.redos, 1)
  assert.match(prompts[0], /written in the first person/)
  assert.match(prompts[0], /keep every other bullet exactly as it is/)
  assert.equal(r.analysis.summary.suggested, '• Treinamento de novos atendentes')
  assert.equal(r.verification.version?.removed, undefined)
})

test('primeira pessoa que o LLM não corrige depois das refações: o texto segue, sem retirar tópico e sem aviso', async () => {
  const { verifier } = fakeVerifier()
  const primeira = '• Treinei novos atendentes'
  const { provider } = fakeProvider(Array.from({ length: MAX_REDOS }, () => ({ text: primeira })))
  const r = await refineSummaries({ analysis: analysisWith(primeira), req, provider, verifier })
  assert.equal(r.verification.version?.redos, MAX_REDOS)
  assert.equal(r.verification.version?.status, 'verified', 'forma não é falsidade: nada de aviso âmbar')
  assert.equal(r.verification.version?.removed, undefined, 'nada é retirado por causa do estilo')
  assert.equal(r.analysis.summary.suggested, primeira)
})

test('o regulamento de formato proíbe a primeira pessoa em qualquer forma verbal, nos dois prompts', async () => {
  const { SYSTEM_PROMPT, REDO_SYSTEM_PROMPT } = await import('../worker/prompt.ts')
  for (const prompt of [SYSTEM_PROMPT, REDO_SYSTEM_PROMPT]) {
    assert.match(prompt, /Never the first person, in ANY verb form/)
    assert.match(prompt, /Treinamento de 3 atendentes/)
  }
})
