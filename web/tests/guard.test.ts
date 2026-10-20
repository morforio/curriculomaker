import assert from 'node:assert/strict'
import { test } from 'node:test'
import { credentialClauses, isStatedCredential, statedByCandidate } from '../src/lib/statedFacts.ts'
import type { Analysis, AnalyzeRequest } from '../src/lib/schemas/analysis.ts'
import { numberContextIssues, roleTitleIssue } from '../worker/guard.ts'
import type { JevAnswer, JevQuestion, Verifier } from '../worker/jev.ts'
import type { LLMProvider } from '../worker/llm.ts'
import { REDO_SYSTEM_PROMPT, SYSTEM_PROMPT } from '../worker/prompt.ts'
import { MAX_REDOS, refineSummaries } from '../worker/verify.ts'

/** Travas em código contra "rebatizar" fatos do currículo e regras do pedido (formação declarada), validadas com saídas reais do modelo. */

const RESUME = `Engenheiro Eletricista

Resumo
• Engenheiro Eletricista com 7+ anos de experiência em projetos fotovoltaicos on‑grid e off‑grid
• Liderou equipe de 7 profissionais em metodologias ágeis, entregando 200+ projetos com 100% de sucesso

Experiência
Liderou equipe de 7 profissionais em metodologias ágeis, entregando 200+ projetos fotovoltaicos on-grid e off-grid com 100% de sucesso.
Automatizou o acompanhamento de obras com n8n e Webhooks, gravando os dados em PostgreSQL.

Formação
Bacharelado em Engenharia Elétrica, Universidade Federal | 2012 – 2017`
const SUMMARY = `• Engenheiro Eletricista com 7+ anos de experiência em projetos fotovoltaicos on‑grid e off‑grid
• Liderou equipe de 7 profissionais em metodologias ágeis, entregando 200+ projetos com 100% de sucesso`
const SOURCE = `${RESUME}\n${SUMMARY}`
const PEDIDO = 'Faça alterações para tornar meu currículo mais adaptado para vagas de engenharia de software. Possuo pós-graduação em engenharia de software.'

test('número: "7+ anos de experiência em automação" no lugar de "em projetos fotovoltaicos" é reprovado', () => {
  const text = '• Engenheiro Eletricista com 7+ anos de experiência em automação de processos e integração de sistemas'
  assert.equal(numberContextIssues(text, SOURCE, PEDIDO).length, 1)
})

test('número: "200+ projetos de software" (acrescenta palavra do pedido) é reprovado', () => {
  assert.equal(numberContextIssues('• Liderou equipe de 7 profissionais, entregando 200+ projetos de software com 100% de sucesso', SOURCE, PEDIDO).length, 1)
})

test('número: o texto original, reescritas fiéis e frases mais curtas ou um pouco mais longas passam', () => {
  for (const text of [
    SUMMARY,
    '• Engenheiro Eletricista com 7+ anos de experiência em projetos fotovoltaicos on‑grid e off‑grid, agora focado em automação',
    '• Engenheiro Eletricista com 7+ anos de experiência em projetos fotovoltaicos',
    '• Liderou equipe de 7 profissionais em metodologias ágeis, entregando 200+ projetos fotovoltaicos com 100% de sucesso',
    '• Liderou equipe de 7 profissionais em metodologias ágeis, entregando 200+ projetos',
  ]) {
    assert.deepEqual(numberContextIssues(text, SOURCE, PEDIDO), [], text)
  }
})

test('número: unidade diferente, número novo e formatação diferente não são reprovados aqui (outras checagens cuidam)', () => {
  assert.deepEqual(numberContextIssues('• Reduziu o tempo em 30%', SOURCE, PEDIDO), [])
  assert.deepEqual(numberContextIssues('• Equipe de 7 pessoas', SOURCE, PEDIDO), [])
  assert.deepEqual(numberContextIssues('• Used by 90 mil clientes', 'Used by 90 thousand customers', 'x'), [])
})

test('cargo: "Engenheiro de Software" no lugar de "Engenheiro Eletricista" é reprovado, no primeiro tópico ou em outro', () => {
  assert.ok(roleTitleIssue('• Engenheiro de Software com 7+ anos de experiência em automação', SUMMARY, SOURCE, PEDIDO))
  assert.ok(roleTitleIssue(`${SUMMARY.split('\n')[0]}\n• Engenheiro de Software pós‑graduação, especializado em automação`, SUMMARY, SOURCE, PEDIDO))
})

test('cargo: cargo igual, mais longo, tópico da pós e tópicos de habilidade passam', () => {
  for (const text of [
    SUMMARY,
    '• Engenheiro Eletricista com pós‑graduação em Engenharia de Software e 7+ anos de experiência',
    '• Engenheiro Eletricista com 7+ anos de experiência em projetos fotovoltaicos\n• Pós‑graduação em Engenharia de Software\n• Especialista em automação com n8n, Webhooks e PostgreSQL',
    '• Engenheiro Eletricista Sênior, com 7+ anos de experiência',
  ]) {
    assert.equal(roleTitleIssue(text, SUMMARY, SOURCE, PEDIDO), null, text)
  }
  // sem introdução original, não há cargo a proteger
  assert.equal(roleTitleIssue('• Engenheiro de Software com 7+ anos', '', SOURCE, PEDIDO), null)
})

test('formação declarada: só as orações de formação, certificação e curso contam', () => {
  assert.equal(credentialClauses(PEDIDO).length, 1)
  assert.ok(isStatedCredential('Engenharia de Software', PEDIDO))
  assert.ok(isStatedCredential('pós-graduação', PEDIDO))
  assert.ok(!isStatedCredential('PyTorch', 'Diga que tenho 5 anos de experiência com PyTorch e que fiz mestrado na USP.'))
  assert.ok(isStatedCredential('USP', 'Diga que tenho 5 anos de experiência com PyTorch e que fiz mestrado na USP.'))
  assert.ok(isStatedCredential('Scrum', 'Tenho certificação Scrum e quero vagas de gestão.'))
  assert.deepEqual(credentialClauses('quero destacar minha experiência com dados'), [])
})

test('tela: o tópico da pós é marcado "informado por você" e os do currículo não', () => {
  const lines = ['• Engenheiro Eletricista com 7+ anos de experiência em projetos fotovoltaicos', '• Pós‑graduação em Engenharia de Software', '• Automação com n8n e PostgreSQL']
  assert.deepEqual(statedByCandidate(lines, SOURCE, PEDIDO), ['• Pós‑graduação em Engenharia de Software'])
  assert.deepEqual(statedByCandidate(lines, SOURCE, 'quero destacar automação'), [])
})

test('os prompts trazem as regras testadas (rebatizar, fatos do candidato, tópico-âncora)', () => {
  for (const prompt of [SYSTEM_PROMPT, REDO_SYSTEM_PROMPT]) {
    assert.match(prompt, /FIDELITY OF WORDING/)
    assert.match(prompt, /must never become "10\+ years in data science"/)
    assert.match(prompt, /CANDIDATE-STATED FACTS/)
    assert.match(prompt, /in ONE bullet, even if the resume does not list it/)
    assert.match(prompt, /ANCHOR BULLET/)
    assert.match(prompt, /candidate-stated facts allowed below/)
  }
})

// ---------------------------------------------------------------- integração com a conferência
const req = (summaryText = SUMMARY): AnalyzeRequest => ({ jobText: PEDIDO, resumeText: RESUME, summaryText, language: 'pt' })
const analysis = (suggested: string, skills: Analysis['skills'] = []): Analysis => ({ inputKind: 'request', job: {}, summary: { suggested, changes: [] }, skills, keywords: [] })

function recorder() {
  const calls: { state: Record<string, unknown>; questions: Record<string, JevQuestion> }[] = []
  const verifier: Verifier = {
    async ask(state, questions) {
      calls.push({ state: state as Record<string, unknown>, questions })
      const out: Record<string, JevAnswer> = {}
      for (const [id, q] of Object.entries(questions)) out[id] = q.type === 'score' ? { type: 'score', score: 3 } : { type: 'noul', noul: 0.97 }
      return out
    },
  }
  return { verifier, calls }
}
const fixed = (replies: string[]): { provider: LLMProvider; used: () => number } => {
  let i = 0
  return { provider: { complete: async () => JSON.stringify({ text: replies[Math.min(i++, replies.length - 1)], changes: [] }) }, used: () => i }
}

test('conferência: troca do assunto dos anos reprova na hora (sem gastar o Jev) e a refação corrige', async () => {
  const bad = '• Engenheiro Eletricista com 7+ anos de experiência em automação de processos\n• Liderou equipe de 7 profissionais em metodologias ágeis'
  const good = '• Engenheiro Eletricista com 7+ anos de experiência em projetos fotovoltaicos\n• Automação com n8n e PostgreSQL'
  const { verifier, calls } = recorder()
  const { provider, used } = fixed([good])
  const r = await refineSummaries({ analysis: analysis(bad), req: req(), provider, verifier })
  assert.equal(used(), 1)
  assert.equal(r.analysis.summary.suggested, good)
  assert.equal(r.verification.version?.status, 'verified')
  assert.ok(calls.length >= 2) // só a versão boa foi ao Jev
})

test('conferência: a pós declarada no pedido não é tratada como habilidade inventada e o Jev recebe o pedido', async () => {
  const text = '• Engenheiro Eletricista com 7+ anos de experiência em projetos fotovoltaicos\n• Pós‑graduação em Engenharia de Software'
  const { verifier, calls } = recorder()
  const { provider, used } = fixed(['nunca'])
  const skills: Analysis['skills'] = [{ name: 'Engenharia de Software', importance: 'required', status: 'missing', evidence: undefined }]
  const r = await refineSummaries({ analysis: analysis(text, skills), req: req(), provider, verifier })
  assert.equal(used(), 0)
  assert.equal(r.verification.version?.status, 'verified')
  const fid = calls.find((c) => 'no_invention' in c.questions)!
  assert.equal(fid.state.candidate_request, PEDIDO)
  assert.match((fid.questions.no_invention as { instructions: string }).instructions, /candidate_request/)
})

test('conferência: habilidade ausente que NÃO é formação declarada continua reprovada (ex.: PyTorch)', async () => {
  const pedido = 'Quero vagas de machine learning. Diga que tenho 5 anos de experiência com PyTorch e que fiz mestrado na USP.'
  const text = '• Engenheiro Eletricista com 7+ anos de experiência em projetos fotovoltaicos\n• Especialista em PyTorch'
  const { verifier } = recorder()
  const { provider, used } = fixed([text])
  const skills: Analysis['skills'] = [{ name: 'PyTorch', importance: 'required', status: 'missing', evidence: undefined }]
  const r = await refineSummaries({ analysis: analysis(text, skills), req: { ...req(), jobText: pedido }, provider, verifier })
  assert.equal(used(), MAX_REDOS) // tentou refazer até o limite
  // O PyTorch não vai ao usuário: sem saída, vale a introdução original do usuário.
  assert.ok(!/pytorch/i.test(r.analysis.summary.suggested ?? ''))
  assert.equal(r.analysis.summary.suggested, SUMMARY)
  assert.ok((r.verification.version?.removed ?? 0) > 0)
})
