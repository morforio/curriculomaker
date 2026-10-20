import { z } from 'zod'
import type { Analysis, AnalyzeRequest, InputKind, Lang, Verification, VersionQuality } from '../src/lib/schemas/analysis.ts'
import type { JevAnswer, JevQuestion, Verifier } from './jev.ts'
import type { LLMProvider } from './llm.ts'
import { isStatedCredential } from '../src/lib/statedFacts.ts'
import { numberContextIssues, roleTitleIssue } from './guard.ts'
import { buildRedoPrompt, REDO_SYSTEM_PROMPT, type Issue } from './prompt.ts'
import { extractJson, isRealChange, normalize, toBullets } from './text.ts'

/**
 * Conferência da introdução sugerida (um só texto, no idioma da aba ativa). O LLM escreve; o Jev confere:
 *  - cada TÓPICO, com uma nota de 0 a 3 sobre o quanto o currículo o sustenta (0 inventa, 1 enfeita com finalidade, resultado, qualidade ou
 *    habilidade que o currículo não diz, 2 inferência leve e natural, 3 fiel). Tópico abaixo de BULLET_MIN_SCORE reprova;
 *  - o texto inteiro, com as duas perguntas de fidelidade (nada inventado, nada exagerado), com limite QUALITY_THRESHOLD.
 *    Quem reprova volta ao LLM dizendo QUAIS tópicos falharam e quais palavras deles não estão no currículo; o LLM refaz (no máximo
 *    MAX_REDOS vezes, ou seja, no máximo MAX_REDOS + 1 versões geradas). Se, depois disso, ainda sobrar tópico sem apoio (reprovado pelo
 *    Jev ou barrado por checagem de código), só ESSE tópico é RETIRADO do texto; os demais ficam. Se nenhum tópico novo se salvar, vale a
 *    melhor das versões geradas, com aviso. A introdução original do usuário NUNCA é devolvida nem conferida pelo Jev (original contra
 *    original sempre daria 100%): uma versão que só repete o original é recusada e refeita;
 *  - adequação: quanto o texto está ajustado à vaga, usando só o que o currículo sustenta. É só uma medida mostrada ao usuário:
 *    ela depende do quanto o currículo combina com a vaga, não de erro da IA, então nunca reprova nem refaz o texto.
 */
export const QUALITY_THRESHOLD = 0.7
/** Nota mínima (0 a 3) de cada tópico. Medido com 115 textos: 1,5 pega 65 de 66 textos ruins e derruba 4 de 49 bons. */
export const BULLET_MIN_SCORE = 1.5
// Com a refação dirigida (o LLM sabe quais tópicos falharam), 2 refações bastam; 3 sem direção dobravam o tempo sem subir a nota.
export const MAX_REDOS = 2

type Change = Analysis['summary']['changes'][number]
// adequacy é null quando não foi medida (o texto já foi barrado nas checagens em código). own = tópico copiado da introdução do usuário.
type BulletCheck = { text: string; score: number; own: boolean }
type Attempt = { text: string; changes: Change[]; fidelity: number; adequacy: number | null; issues: Issue[]; bullets: BulletCheck[] }
type VersionState = { lang: Lang; attempts: Attempt[]; redos: number }

const redoSchema = z.object({
  text: z.string().trim().min(1).max(5000),
  changes: z
    .array(z.object({ from: z.string().max(600), to: z.string().max(600), reason: z.string().max(400) }))
    .max(8)
    .nullish(),
})

// As perguntas do Jev ficam em inglês (idioma em que ele é mais preciso) e cada uma julga uma coisa só.
const FIDELITY_QUESTIONS: Record<string, JevQuestion> = {
  no_invention: {
    type: 'noul',
    instructions:
      'Does every skill, tool, technology, number, employer, school, degree, certification and responsibility that `rewritten_summary` attributes to the candidate also appear in `resume`?',
    criteria: {
      true: 'Everything `rewritten_summary` states about the candidate can be found in `resume`.',
      false:
        '`rewritten_summary` states at least one skill, tool, technology, number, employer, school, degree, certification or responsibility that `resume` does not contain.',
    },
  },
  consistent_with_resume: {
    type: 'noul',
    instructions:
      "Is everything `rewritten_summary` says about the candidate's level of responsibility, seniority, duration and results consistent with `resume`, with nothing exaggerated and nothing contradicted?",
    criteria: {
      true: 'No claim in `rewritten_summary` is stronger than, or different from, what `resume` says.',
      false: 'At least one claim in `rewritten_summary` exaggerates or contradicts `resume` (for example "participated" turned into "led").',
    },
  },
}

/** Com pedido, uma formação, certificação ou curso que o usuário declara nele também vale como fato (mais nada do pedido vale). */
const FIDELITY_QUESTIONS_REQUEST: Record<string, JevQuestion> = {
  ...FIDELITY_QUESTIONS,
  no_invention: {
    type: 'noul',
    instructions:
      'Does every skill, tool, technology, number, employer, school, degree, certification and responsibility that `rewritten_summary` attributes to the candidate also appear in `resume`? A degree, certification or course that the candidate states about themselves in `candidate_request` also counts as appearing; nothing else in `candidate_request` counts as evidence.',
    criteria: {
      true: 'Everything `rewritten_summary` states about the candidate can be found in `resume`, or is a degree, certification or course stated in `candidate_request`.',
      false:
        '`rewritten_summary` states at least one skill, tool, technology, number, employer, school, degree, certification or responsibility that `resume` does not contain and that is not a degree, certification or course stated in `candidate_request`.',
    },
  },
}

/** Estilo: nenhum tópico na primeira pessoa. Vai junto das perguntas de fidelidade (mesma consulta). Nota de 0 a 1: abaixo ou igual ao limite = primeira pessoa. Medido em 143 textos: limite 0,7 pega 22 de 22 e acusa por engano 2 de 121 (só custa uma refação); com 0,5 passavam casos de nota intermediária. */
const STYLE_QUESTION: JevQuestion = {
  type: 'noul',
  instructions:
    'Is every bullet of `rewritten_summary` free of first-person wording? A bullet is first person when it speaks as the candidate, with a first-person verb form or pronoun (for example "I led the team", "Treinei 3 atendentes", "Construo interfaces", "meu projeto"). A noun phrase ("Treinamento de 3 atendentes") or a subject-less action in the past tense ("Led a team of 7", "Criou o cardápio") is NOT first person.',
  criteria: { true: 'No bullet speaks in the first person.', false: 'At least one bullet speaks in the first person.' },
}
export const STYLE_MIN = 0.7

const ADEQUACY_QUESTIONS: Record<string, JevQuestion> = {
  adequacy: {
    type: 'score',
    instructions:
      'How well is `rewritten_summary` tailored to `job_description`, considering what `resume` actually contains? Judge only whether it uses the job\'s own terms and priorities where `resume` supports them. Do not penalize requirements that `resume` does not cover.',
    criteria: [
      'Ignores the job: nothing in the text relates to what the job asks.',
      "Generic: it touches the job's area but uses none of the job's terms or priorities.",
      "Partial: it uses some of the job's terms or priorities but misses clear opportunities that `resume` supports.",
      "Strong: it uses the job's main terms and priorities that `resume` supports, in the job's own wording.",
    ],
  },
}

/** Mesma nota, para quando o usuário escreveu um pedido (o que quer destacar) em vez de colar uma vaga. */
const ADEQUACY_QUESTIONS_REQUEST: Record<string, JevQuestion> = {
  adequacy: {
    type: 'score',
    instructions:
      'How well does `rewritten_summary` serve the goal stated in `candidate_request`, considering what `resume` actually contains? Judge only whether it foregrounds the facts of `resume` that matter for that goal and uses the vocabulary of the target area where `resume` supports it. Do not penalize parts of the target area that `resume` does not cover.',
    criteria: [
      'Ignores the goal: nothing in the text relates to what the candidate asked for.',
      "Generic: it touches the goal's area but foregrounds nothing in particular and uses none of the area's vocabulary.",
      'Partial: it foregrounds some relevant facts or terms but misses clear opportunities that `resume` supports.',
      "Strong: it leads with the facts of `resume` that best serve the goal and uses the target area's vocabulary where `resume` supports it.",
    ],
  },
}
const ADEQUACY_TOP_LEVEL = 3

/** Uma pergunta de nota (0 a 3) sobre o tópico `bullet_<i>`; os tópicos vão no mesmo pedido, em campos separados. */
function bulletQuestion(i: number, request: boolean): JevQuestion {
  return {
    type: 'score',
    instructions: `Compare the field \`bullet_${i}\` with the field \`resume\`. How well does \`resume\` support everything \`bullet_${i}\` says about the candidate? Check tools and technologies, employers and places, numbers and durations, duties, results, purposes (such as "to improve ..." or "ensuring ..."), qualities and skills (such as "demonstrating ..." or "with strong ... skills") and any link between two facts.${request ? ' A degree, certification or course that the candidate states about themselves in `candidate_request` counts as stated in `resume`; nothing else in `candidate_request` counts.' : ''}`,
    criteria: [
      '0: Invents. It states a fact, tool, number, employer, duty or result that `resume` does not contain, or it contradicts `resume`.',
      '1: Embellishes. Its facts are in `resume`, but it adds a purpose, result, quality, skill or link between facts that `resume` does not state and that does not follow directly from what `resume` says.',
      '2: Light inference. Everything is in `resume`, except a quality or skill that follows directly and naturally from an activity `resume` describes (for example, organizing events supports organization skills).',
      '3: Faithful. Everything it says is stated in `resume` or is a plain restatement of it.',
    ],
  }
}

const BULLETS_PER_CALL = 6

/** Uma pergunta de nota (0 a 3) sobre a habilidade `skill_<i>` da tabela: o currículo mostra que a pessoa a tem, na mesma área e no mesmo nível? */
function skillQuestion(i: number): JevQuestion {
  return {
    type: 'score',
    instructions: `Compare the field \`skill_${i}\` with the field \`resume\`. Does \`resume\` show that the candidate really has this skill or experience, in the same field and at the level the text names? Experience in a different field (for example, leading a team in a shop is not leading software developers), a lower level (basic instead of fluent, intermediate instead of advanced), a related but different tool, or only one part of a combined requirement is NOT the same.`,
    criteria: [
      '0: No support. `resume` shows nothing of this skill or experience.',
      '1: Related only. `resume` shows something related, but in a different field or tool, at a lower level, or covering only part of the requirement.',
      '2: Supported. `resume` shows that the candidate has it.',
      '3: Explicit. `resume` states it clearly, with the same name or level.',
    ],
  }
}

/** "possui" exige nota 2 ou mais; de 1 a menos de 2 vira "parcial"; abaixo de 1 vira "não possui". "parcial" exige nota 1 ou mais. */
export const SKILL_HAS_MIN = 2
export const SKILL_PARTIAL_MIN = 1

/** O Jev confere as habilidades marcadas "possui" ou "parcial" e rebaixa as que o currículo não sustenta (sem chamar o LLM de novo). */
async function verifySkills(skills: Analysis['skills'], verifier: Verifier, resumeText: string): Promise<{ skills: Analysis['skills']; adjusted: number }> {
  const idx = skills.map((s, i) => (s.status !== 'missing' ? i : -1)).filter((i) => i >= 0)
  const scores = new Map<number, number>()
  const calls: Promise<void>[] = []
  for (let from = 0; from < idx.length; from += BULLETS_PER_CALL) {
    const chunk = idx.slice(from, from + BULLETS_PER_CALL)
    const state: Record<string, string> = { resume: resumeText }
    const questions: Record<string, JevQuestion> = {}
    chunk.forEach((si, k) => {
      state[`skill_${k + 1}`] = skills[si].name
      questions[`skill_${k + 1}`] = skillQuestion(k + 1)
    })
    calls.push(
      verifier.ask(state, questions).then((answers) => {
        chunk.forEach((si, k) => scores.set(si, clamp(scoreOf(answers[`skill_${k + 1}`]), 0, ADEQUACY_TOP_LEVEL)))
      }),
    )
  }
  await Promise.all(calls)
  let adjusted = 0
  const out = skills.map((sk, i) => {
    const score = scores.get(i)
    if (score === undefined) return sk
    const next: Analysis['skills'][number]['status'] = score >= SKILL_HAS_MIN ? sk.status : score >= SKILL_PARTIAL_MIN ? 'partial' : 'missing'
    if (next === sk.status) return sk
    adjusted++
    return next === 'missing' ? { ...sk, status: next, evidence: undefined } : { ...sk, status: next }
  })
  return { skills: out, adjusted }
}

const stripMarker = (l: string) => normalize(l.replace(/^[•*\s-]+/, ''))
const textLines = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean)
/** Tópico igual a uma linha da introdução que o usuário já tinha: é afirmação dele, não do LLM. */
const isOwnLine = (line: string, ctx: Context) => ctx.own.has(stripMarker(line))

/** Nota de cada tópico (uma consulta ao Jev por até 6 tópicos). Tópico do usuário não é conferido (e não gasta consulta ao Jev). */
async function scoreBullets(lines: string[], ctx: Context): Promise<BulletCheck[]> {
  const request = ctx.inputKind === 'request'
  const isOwn = (line: string) => isOwnLine(line, ctx)
  const scores = new Map<string, number>()
  const toAsk = lines.filter((l) => !isOwn(l))
  for (let from = 0; from < toAsk.length; from += BULLETS_PER_CALL) {
    const chunk = toAsk.slice(from, from + BULLETS_PER_CALL)
    const state: Record<string, string> = { resume: ctx.req.resumeText }
    if (request) state.candidate_request = ctx.req.jobText
    const questions: Record<string, JevQuestion> = {}
    chunk.forEach((line, k) => {
      state[`bullet_${k + 1}`] = line.replace(/^•\s*/, '')
      questions[`bullet_${k + 1}`] = bulletQuestion(k + 1, request)
    })
    const answers = await ctx.verifier.ask(state, questions)
    chunk.forEach((line, k) => scores.set(line, clamp(scoreOf(answers[`bullet_${k + 1}`]), 0, ADEQUACY_TOP_LEVEL)))
  }
  return lines.map((line) => ({ text: line, score: isOwn(line) ? ADEQUACY_TOP_LEVEL : (scores.get(line) ?? 0), own: isOwn(line) }))
}

/** Palavras do tópico que não aparecem no currículo (comparando as 5 primeiras letras): dica de onde o tópico saiu do que está escrito. */
function wordsNotInResume(bullet: string, resumeNorm: string): string[] {
  const known = new Set(resumeNorm.split(' ').map((w) => w.slice(0, 5)))
  const out: string[] = []
  for (const raw of bullet.replace(/^•\s*/, '').split(/\s+/)) {
    const word = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    const key = normalize(word)
    if (key.length > 3 && !/^\d+$/.test(key) && !known.has(key.slice(0, 5)) && !out.includes(word)) out.push(word)
  }
  return out.slice(0, 8)
}

/** Texto da refação sobre os tópicos reprovados: o tópico, o que o Jev achou e as palavras que não estão no currículo. */
function bulletsDetail(bullets: BulletCheck[], resumeNorm: string): string {
  return bullets
    .filter((b) => b.score < BULLET_MIN_SCORE)
    .map((b) => {
      const what = b.score < 0.75 ? 'states something the resume does not contain' : 'adds a purpose, result, quality, skill or link the resume does not state'
      const words = wordsNotInResume(b.text, resumeNorm)
      return `  • ${b.text.replace(/^•\s*/, '')} → ${what}${words.length ? `; words not found in the resume: ${words.join(', ')}` : ''}`
    })
    .join('\n')
}

const noulOf = (a: JevAnswer | undefined) => (a?.type === 'noul' ? a.noul : 0)
const scoreOf = (a: JevAnswer | undefined) => (a?.type === 'score' ? a.score : 0)
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))
const clamp01 = (n: number) => clamp(n, 0, 1)

/** "style" (primeira pessoa) é só de forma: pede refação enquanto houver, mas nunca retira tópico nem vira aviso. */
const hardIssues = (a: Attempt) => a.issues.filter((i) => i.kind !== 'style')
const passes = (a: Attempt) => hardIssues(a).length === 0
const clean = (a: Attempt) => a.issues.length === 0
const hasStyleIssue = (a: Attempt) => a.issues.some((i) => i.kind === 'style')
/** Versão que só repete a introdução original: nunca é a escolhida se houver outra gerada. */
const isUnchanged = (a: Attempt) => a.issues.some((i) => i.kind === 'unchanged')
/** Tópicos NOVOS (que o LLM escreveu, não copiados do usuário) que foram aprovados: o que a versão realmente acrescenta. */
const newSurvivors = (a: Attempt) => a.bullets.filter((b) => !b.own && b.score >= BULLET_MIN_SCORE).length

const keptBullets = (a: Attempt) => a.bullets.filter((b) => b.score >= BULLET_MIN_SCORE).length

/**
 * Escolhe entre as versões GERADAS (a introdução original nunca entra): primeiro as que têm algum tópico novo aprovado. Como a poda
 * deixa o texto só com o que passou, vale a que MANTÉM MAIS tópicos aprovados (e não a que reprova menos, que favoreceria versões curtas);
 * antes disso, a que não tem problema no texto inteiro (invenção, exagero). Em empate, a de menos problema de estilo, depois a de maior
 * fidelidade e, por fim, a mais antiga. Se nenhuma tiver tópico novo aprovado, vale a melhor delas pelo mesmo critério.
 */
function bestOf(attempts: Attempt[]): Attempt {
  const pool = attempts.some((a) => newSurvivors(a) > 0) ? attempts.filter((a) => newSurvivors(a) > 0) : attempts
  // Problema no texto inteiro só pesa quando nenhum tópico reprovou: se algum reprovou, o problema vem dele e a poda o tira.
  const wholeTextIssues = (a: Attempt) => (a.bullets.some((b) => b.score < BULLET_MIN_SCORE) ? 0 : a.issues.filter((i) => i.kind === 'invention' || i.kind === 'exaggeration').length)
  const rank = (a: Attempt) => (isUnchanged(a) ? 1_000_000 : 0) + wholeTextIssues(a) * 1000 + (100 - keptBullets(a)) * 10 + (hasStyleIssue(a) ? 1 : 0)
  return pool.reduce((best, a) => (rank(a) < rank(best) || (rank(a) === rank(best) && a.fidelity > best.fidelity) ? a : best))
}

type Context = {
  req: AnalyzeRequest
  skills: Analysis['skills']
  verifier: Verifier
  provider: LLMProvider
  inputKind: InputKind
  /** Currículo + introdução original, já normalizados: base das checagens de código. */
  referenceNorm: string
  /** Linhas da introdução original (sem marcador, normalizadas): tópico igual a uma delas não é do LLM. */
  own: Set<string>
}

/** Checagens que não dependem do modelo: números e habilidades ausentes do currículo não podem aparecer no texto. */
function localIssues(text: string, ctx: Context): Issue[] {
  const issues: Issue[] = []
  const textNorm = normalize(text)
  const refNumbers = new Set(ctx.referenceNorm.split(' ').filter((t) => /^\d+$/.test(t)))
  const newNumbers = [...new Set(textNorm.split(' ').filter((t) => /^\d+$/.test(t) && !refNumbers.has(t)))]
  if (newNumbers.length > 0) issues.push({ kind: 'numbers', detail: `numbers not in the resume: ${newNumbers.join(', ')}` })

  const padded = ` ${textNorm} `
  const refPadded = ` ${ctx.referenceNorm} `
  // Formação, certificação ou curso que o usuário declarou no pedido não é "habilidade que o currículo não tem".
  const request = ctx.inputKind === 'request'
  const invented = ctx.skills
    .filter((s) => s.status === 'missing' && !(request && isStatedCredential(s.name, ctx.req.jobText)))
    .map((s) => ({ name: s.name, key: normalize(s.name) }))
    .filter(({ key }) => key.length >= 3 && padded.includes(` ${key} `) && !refPadded.includes(` ${key} `))
    .map(({ name }) => name)
  if (invented.length > 0) issues.push({ kind: 'skills', detail: `skills not in the resume: ${invented.join(', ')}` })

  // O modelo não pode trocar o assunto de um número do currículo nem o cargo (o prompt sozinho não impediu).
  const source = `${ctx.req.resumeText}\n${ctx.req.summaryText}`
  const relabeled = numberContextIssues(text, source, ctx.req.jobText)
  if (relabeled.length > 0) issues.push({ kind: 'relabel', detail: `numbers whose subject changed: ${relabeled.join('; ')}` })
  const title = roleTitleIssue(text, ctx.req.summaryText, source, ctx.req.jobText)
  if (title) issues.push({ kind: 'title', detail: title })
  return issues
}

async function assess(text: string, changes: Change[], ctx: Context): Promise<Attempt> {
  const lines = textLines(text)
  // Tópico do usuário vale como aprovado (é afirmação dele, o Jev não o confere); o que o LLM escreveu e foi barrado vale 0.
  const zero = (ls: string[]): BulletCheck[] => ls.map((l) => ({ text: l, score: isOwnLine(l, ctx) ? ADEQUACY_TOP_LEVEL : 0, own: isOwnLine(l, ctx) }))

  // A introdução original não é uma versão gerada: se nenhum tópico é novo, não há o que conferir (o Jev só daria 100%, original contra
  // original). A versão é recusada e o LLM refaz.
  if (lines.length > 0 && lines.every((l) => isOwnLine(l, ctx))) return { text, changes, fidelity: 0, adequacy: null, issues: [{ kind: 'unchanged' }], bullets: zero(lines) }

  // Checagens de código, uma por tópico: só o tópico com problema é barrado; os outros seguem para a conferência do Jev.
  const local = localIssues(text, ctx)
  let barred = new Set<string>()
  if (local.length > 0) {
    barred = new Set(lines.filter((l) => !isOwnLine(l, ctx) && localIssues(l, ctx).length > 0))
    if (barred.size === 0) barred = new Set(lines.filter((l) => !isOwnLine(l, ctx))) // o problema só aparece no conjunto
  }
  const rest = lines.filter((l) => !barred.has(l))
  if (rest.length === 0 || (local.length > 0 && rest.every((l) => isOwnLine(l, ctx)))) return { text, changes, fidelity: 0, adequacy: null, issues: local, bullets: zero(lines) }

  // Informação falsa, por tópico e no texto inteiro (só do que não foi barrado); quanto o texto mudou em relação ao original não conta.
  const { resumeText, jobText } = ctx.req
  const request = ctx.inputKind === 'request'
  const restText = rest.join('\n')
  const fidelityState = request ? { resume: resumeText, candidate_request: jobText, rewritten_summary: restText } : { resume: resumeText, rewritten_summary: restText }
  const fidelityQuestions = request ? FIDELITY_QUESTIONS_REQUEST : FIDELITY_QUESTIONS

  const [fid, scored] = await Promise.all([ctx.verifier.ask(fidelityState, { ...fidelityQuestions, impersonal: STYLE_QUESTION }), scoreBullets(rest, ctx)])

  const issues: Issue[] = [...local]
  if (noulOf(fid.no_invention) <= QUALITY_THRESHOLD) issues.push({ kind: 'invention' })
  if (noulOf(fid.consistent_with_resume) <= QUALITY_THRESHOLD) issues.push({ kind: 'exaggeration' })
  if (fid.impersonal && noulOf(fid.impersonal) <= STYLE_MIN) issues.push({ kind: 'style' })
  if (scored.some((b) => b.score < BULLET_MIN_SCORE)) issues.push({ kind: 'bullets', detail: bulletsDetail(scored, normalize(resumeText)) })
  const summaryFidelity = Math.min(...Object.keys(FIDELITY_QUESTIONS).map((id) => clamp01(noulOf(fid[id]))))
  const minBullet = Math.min(...scored.map((b) => b.score)) / ADEQUACY_TOP_LEVEL
  const byLine = new Map(scored.map((b) => [b.text, b]))
  const bullets = lines.map((l) => byLine.get(l) ?? { text: l, score: 0, own: false })
  return { text, changes, fidelity: Math.min(summaryFidelity, minBullet), adequacy: null, issues, bullets }
}

/** Quanto o texto final aborda o que a vaga (ou o pedido) pede. Só informa: se falhar, fica sem nota. */
async function adequacyOf(text: string, ctx: Context): Promise<number | null> {
  const { resumeText, jobText } = ctx.req
  const request = ctx.inputKind === 'request'
  const state = request ? { candidate_request: jobText, resume: resumeText, rewritten_summary: text } : { job_description: jobText, resume: resumeText, rewritten_summary: text }
  try {
    const ade = await ctx.verifier.ask(state, request ? ADEQUACY_QUESTIONS_REQUEST : ADEQUACY_QUESTIONS)
    return clamp01(scoreOf(ade.adequacy) / ADEQUACY_TOP_LEVEL)
  } catch {
    return null
  }
}

/** Pede ao LLM uma nova versão, dizendo o que reprovou na anterior. Devolve null se a resposta for inutilizável. */
async function redo(state: VersionState, ctx: Context): Promise<{ text: string; changes: Change[] } | null> {
  const last = state.attempts[state.attempts.length - 1]
  const user = buildRedoPrompt({
    lang: state.lang,
    summaryText: ctx.req.summaryText,
    resumeText: ctx.req.resumeText,
    jobText: ctx.req.jobText,
    inputKind: ctx.inputKind,
    previous: last.text,
    issues: last.issues,
  })
  try {
    const reply = await ctx.provider.complete({ system: REDO_SYSTEM_PROMPT, user })
    const parsed = redoSchema.safeParse(extractJson(reply))
    return parsed.success ? { text: toBullets(parsed.data.text), changes: parsed.data.changes ?? [] } : null
  } catch {
    return null
  }
}

/** Com versões refeitas, a lista de alterações antiga pode não bater mais: mantém só as que valem para os textos finais. */
function reconcileChanges(original: Change[], chosen: Attempt[], summaryText: string): Change[] {
  const summaryNorm = normalize(summaryText)
  const finals = chosen.map((a) => normalize(a.text))
  const seen = new Set<string>()
  const out: Change[] = []
  for (const c of [...original, ...chosen.flatMap((a) => a.changes)]) {
    const from = normalize(c.from)
    const to = normalize(c.to)
    const key = `${from}→${to}`
    if (!from || !to || !isRealChange(c) || seen.has(key) || !summaryNorm.includes(from) || !finals.some((t) => t.includes(to))) continue
    seen.add(key)
    out.push(c)
  }
  return out.slice(0, 8)
}

export type RefineDeps = {
  analysis: Analysis
  req: AnalyzeRequest
  provider: LLMProvider
  /** Sem verificador (Jev não configurado), a análise segue como veio do LLM. */
  verifier?: Verifier
}

export async function refineSummaries({ analysis, req, provider, verifier }: RefineDeps): Promise<{ analysis: Analysis; verification: Verification }> {
  const original = analysis.summary.suggested
  if (!verifier || !original) return { analysis, verification: { state: 'skipped' } }

  const ctx: Context = {
    req,
    skills: analysis.skills,
    verifier,
    provider,
    inputKind: analysis.inputKind ?? 'posting',
    referenceNorm: normalize(`${req.resumeText}\n${req.summaryText}`),
    own: new Set(textLines(req.summaryText).map(stripMarker)),
  }
  const state: VersionState = { lang: req.language, attempts: [], redos: 0 }

  let failed = false
  try {
    state.attempts.push(await assess(original, analysis.summary.changes, ctx))
    for (let round = 1; round <= MAX_REDOS && !state.attempts.some(clean); round++) {
      state.redos++
      const next = await redo(state, ctx)
      if (next) state.attempts.push(await assess(next.text, next.changes, ctx))
    }
  } catch (e) {
    console.error('Falha ao conferir a introdução com o Jev:', e instanceof Error ? e.message : e)
    failed = true
  }
  if (failed) console.error('A conferência com o Jev foi interrompida; usando a versão já avaliada.')

  if (state.attempts.length === 0) return { analysis, verification: { state: 'failed' } }
  const best = bestOf(state.attempts)

  // Depois das refações, o que não passou nunca vai ao usuário: só o tópico reprovado pelo Jev ou barrado no código é retirado e os
  // outros ficam. Se nenhum tópico NOVO se salvou, o que sobra (tópicos do próprio usuário) sai com aviso (best_effort); se nada sobra,
  // vale a melhor das versões geradas, também com aviso. Nunca se volta à introdução original.
  let finalText = best.text
  let removed = 0
  let fidelity = best.fidelity
  let resolved = passes(best)
  if (!failed && !resolved) {
    const keep = best.bullets.filter((b) => b.score >= BULLET_MIN_SCORE)
    if (keep.length > 0) {
      finalText = keep.map((b) => b.text).join('\n')
      removed = best.bullets.length - keep.length
      fidelity = Math.min(...keep.map((b) => b.score)) / ADEQUACY_TOP_LEVEL
      resolved = newSurvivors(best) > 0
    }
  }
  const changes = finalText !== best.text || best !== state.attempts[0] ? reconcileChanges(analysis.summary.changes, [{ ...best, text: finalText }], req.summaryText) : analysis.summary.changes
  const adequacy = failed ? null : await adequacyOf(finalText, ctx)

  // Tabela de habilidades: o que o currículo não sustenta é rebaixado (se o Jev falhar aqui, a tabela fica como veio).
  let skills = analysis.skills
  let skillsAdjusted = 0
  if (!failed) {
    try {
      const checked = await verifySkills(analysis.skills, verifier, req.resumeText)
      skills = checked.skills
      skillsAdjusted = checked.adjusted
    } catch (e) {
      console.error('Falha ao conferir as habilidades com o Jev:', e instanceof Error ? e.message : e)
    }
  }

  const version: VersionQuality | undefined = failed
    ? undefined
    : { status: resolved ? 'verified' : 'best_effort', fidelity: clamp01(fidelity), adequacy, redos: state.redos, ...(removed > 0 ? { removed } : {}) }
  return {
    analysis: { ...analysis, skills, summary: { ...analysis.summary, suggested: finalText, changes } },
    verification: { state: failed ? 'failed' : 'checked', version, ...(skillsAdjusted > 0 ? { skillsAdjusted } : {}) },
  }
}
