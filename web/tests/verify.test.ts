import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Analysis, AnalyzeRequest } from '../src/lib/schemas/analysis.ts'
import type { JevAnswer, JevQuestion, Verifier } from '../worker/jev.ts'
import type { LLMProvider } from '../worker/llm.ts'
import { BULLET_MIN_SCORE, MAX_REDOS, refineSummaries } from '../worker/verify.ts'

/**
 * Testes da conferência da introdução (worker/verify.ts), com LLM e Jev simulados: validam a lógica do ciclo (nota por tópico, refação dirigida,
 * retirada só do tópico sem apoio, a introdução original nunca usada, limite de refações, conferência das habilidades), não a qualidade do Jev real.
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
  const fiel = 'Desenvolvedor com experiência em Node.js e React.' // fiel, mas pouco ajustada à vaga (adequação 1 de 3)
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

test('número inventado e habilidade ausente são barrados no código, sem chamar o Jev; sem saída, vale a melhor versão gerada com aviso, nunca a original', async () => {
  const { verifier, calls } = fakeVerifier()
  const bad = 'Desenvolvedor com 10 anos de experiência com Kubernetes.'
  const { provider } = fakeProvider(Array.from({ length: MAX_REDOS }, () => ({ text: bad })))
  const r = await refineSummaries({ analysis: analysisWith(bad), req, provider, verifier })
  assert.equal(calls.filter((c) => c.ids.includes('no_invention')).length, 0, 'texto barrado no código não chega à fidelidade do Jev')
  assert.equal(r.verification.version?.redos, MAX_REDOS)
  assert.equal(r.analysis.summary.suggested, bad, 'é uma das versões geradas')
  assert.notEqual(r.analysis.summary.suggested, `• ${req.summaryText}`, 'a introdução original nunca é devolvida')
  assert.equal(r.verification.version?.status, 'best_effort', 'sem tópico novo aprovado: aviso')
})

test('problema de código em UM tópico retira só esse tópico: os outros seguem para o Jev e ficam', async () => {
  const { verifier, calls } = fakeVerifier()
  const ruim = 'Gestão de equipe de 10 pessoas com Kubernetes.' // número e habilidade que o currículo não tem
  const v1 = `• ${GOOD}
• Desenvolvedor com experiência em React.
• ${ruim}`
  const { provider } = fakeProvider(Array.from({ length: MAX_REDOS }, () => ({ text: v1 })))
  const r = await refineSummaries({ analysis: analysisWith(v1), req, provider, verifier })
  const q = r.verification.version
  assert.equal(q?.redos, MAX_REDOS)
  assert.equal(q?.status, 'verified')
  assert.equal(q?.removed, 1)
  assert.equal(r.analysis.summary.suggested, `• ${GOOD}
• Desenvolvedor com experiência em React.`)
  const fid = calls.filter((c) => c.ids.includes('no_invention'))
  assert.ok(fid.length > 0 && fid.every((c) => !String(c.state.rewritten_summary).includes('Kubernetes')), 'o tópico barrado não vai ao Jev')
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

test('se todos os tópicos reprovam, vale a melhor das versões geradas, com aviso; a introdução original nunca volta (com ou sem original)', async () => {
  const { verifier } = fakeVerifier()
  const ruim = '• Desenvolvedor liderei APIs Node.js e React.'
  for (const summaryText of [req.summaryText, '']) {
    const a = fakeProvider(Array.from({ length: MAX_REDOS }, () => ({ text: ruim })))
    const r = await refineSummaries({ analysis: analysisWith(ruim), req: { ...req, summaryText }, provider: a.provider, verifier })
    assert.equal(r.analysis.summary.suggested, ruim)
    assert.equal(r.verification.version?.status, 'best_effort')
    assert.equal(r.verification.version?.removed, undefined)
  }
})

test('entre as versões geradas vale a que tem tópico aprovado, mesmo quando a primeira era melhor "na média"', async () => {
  const { verifier } = fakeVerifier()
  const ruim = '• Desenvolvedor liderei APIs Node.js e React.'
  const meio = `• ${GOOD}
• Desenvolvedor liderei APIs Node.js e React.`
  const { provider } = fakeProvider([{ text: ruim }, { text: meio }])
  const r = await refineSummaries({ analysis: analysisWith(ruim), req, provider, verifier })
  assert.equal(r.analysis.summary.suggested, `• ${GOOD}`, 'a poda tira só o tópico reprovado da versão escolhida')
  assert.equal(r.verification.version?.removed, 1)
})

test('entre as versões vale a que MANTÉM mais tópicos aprovados depois da poda, não a que reprova menos (que favoreceria texto curto)', async () => {
  const { verifier } = fakeVerifier()
  const longa = `• ${GOOD}
• Desenvolvedor com experiência em Node.js.
• Desenvolvedor liderei APIs Node.js e React.` // 2 aprovados, 1 reprovado
  const curta = '• Desenvolvedor com experiência em React.' // limpa, mas só 1 tópico
  const { provider } = fakeProvider([{ text: curta }])
  const r = await refineSummaries({ analysis: analysisWith(longa), req, provider, verifier })
  assert.equal(r.analysis.summary.suggested, `• ${GOOD}
• Desenvolvedor com experiência em Node.js.`)
  assert.equal(r.verification.version?.removed, 1)
  assert.equal(r.verification.version?.status, 'verified')
})

test('o texto original não é uma versão: se o LLM o devolve, o Jev não o confere, a versão é recusada e refeita', async () => {
  const { verifier, calls } = fakeVerifier()
  const { provider, prompts } = fakeProvider([{ text: GOOD }])
  const r = await refineSummaries({ analysis: analysisWith(`• ${req.summaryText}`), req, provider, verifier })
  assert.equal(r.verification.version?.redos, 1)
  assert.match(prompts[0], /only repeats <current_summary> without rewriting it/)
  assert.equal(r.analysis.summary.suggested, `• ${GOOD}`)
  assert.ok(calls.every((c) => !String(c.state.rewritten_summary ?? '').includes(req.summaryText) && !Object.values(c.state).includes(req.summaryText)), 'o original nunca é enviado ao Jev como texto a conferir')
})

test('se todas as versões repetem o original, nenhuma é aprovada: aviso, sem consulta ao Jev', async () => {
  const { verifier, calls } = fakeVerifier()
  const igual = `• ${req.summaryText}`
  const { provider } = fakeProvider(Array.from({ length: MAX_REDOS }, () => ({ text: igual })))
  const r = await refineSummaries({ analysis: analysisWith(igual), req, provider, verifier })
  assert.equal(r.verification.version?.status, 'best_effort')
  assert.equal(calls.filter((c) => c.ids.includes('no_invention') || c.ids.some((id) => id.startsWith('bullet_'))).length, 0)
})

test('no máximo MAX_REDOS (2) refações = 3 versões geradas, mesmo com o LLM errando sempre', async () => {
  const { verifier, calls } = fakeVerifier()
  const ruim = '• Desenvolvedor liderei APIs Node.js e React.'
  const { provider, remaining, prompts } = fakeProvider(Array.from({ length: MAX_REDOS + 3 }, () => ({ text: ruim })))
  const r = await refineSummaries({ analysis: analysisWith(ruim), req, provider, verifier })
  assert.equal(MAX_REDOS, 2)
  assert.equal(r.verification.version?.redos, 2)
  assert.equal(prompts.length, 2, 'o LLM é chamado 2 vezes na conferência (a 1ª geração veio antes)')
  assert.equal(remaining(), 3, 'as respostas extras não foram pedidas')
  assert.equal(calls.filter((c) => c.ids.includes('no_invention')).length, 3, '3 versões conferidas: a original do LLM e as 2 refações')
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
