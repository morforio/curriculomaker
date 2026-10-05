import { z } from 'zod'
import type { Analysis, AnalyzeRequest, Lang, Verification, VersionQuality } from '../src/lib/schemas/analysis.ts'
import type { JevAnswer, JevQuestion, Verifier } from './jev.ts'
import type { LLMProvider } from './llm.ts'
import { buildRedoPrompt, REDO_SYSTEM_PROMPT, type Issue } from './prompt.ts'
import { extractJson, normalize } from './text.ts'

/**
 * Conferência da introdução sugerida. O LLM escreve; o Jev dá duas notas (0 a 1) a cada versão de idioma:
 *  - fidelidade: sem invenção, sem fato errado e sem alteração incompatível com o original;
 *  - adequação: quanto o texto está ajustado à vaga, usando só o que o currículo sustenta.
 * Versão que não passa nas duas é refeita pelo LLM (no máximo MAX_REDOS vezes). Se nenhuma passar,
 * vale a de maior nota.
 */
export const QUALITY_THRESHOLD = 0.8
export const MAX_REDOS = 3

type Change = Analysis['summary']['changes'][number]
type Attempt = { text: string; changes: Change[]; fidelity: number; adequacy: number; issues: Issue[] }
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

const FAITHFUL_QUESTION: JevQuestion = {
  type: 'noul',
  instructions: 'Does `rewritten_summary` keep the same ideas and meaning as `current_summary`, apart from changes of wording?',
  criteria: {
    true: 'The same ideas are present; only wording or word order changed.',
    false: 'An idea of `current_summary` was dropped, a new idea was added, or the meaning changed.',
  },
}

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
const ADEQUACY_TOP_LEVEL = 3

const noulOf = (a: JevAnswer | undefined) => (a?.type === 'noul' ? a.noul : 0)
const scoreOf = (a: JevAnswer | undefined) => (a?.type === 'score' ? a.score : 0)
const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

const quality = (a: Attempt) => Math.min(a.fidelity, a.adequacy)
const passes = (a: Attempt) => a.issues.length === 0 && a.fidelity > QUALITY_THRESHOLD && a.adequacy > QUALITY_THRESHOLD

/** A de maior nota; em empate, a mais antiga. */
function bestOf(attempts: Attempt[]): Attempt {
  return attempts.reduce((best, a) => (quality(a) > quality(best) ? a : best))
}

type Context = {
  req: AnalyzeRequest
  skills: Analysis['skills']
  verifier: Verifier
  provider: LLMProvider
  /** Currículo + introdução original, já normalizados: base das checagens de código. */
  referenceNorm: string
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
  const invented = ctx.skills
    .filter((s) => s.status === 'missing')
    .map((s) => ({ name: s.name, key: normalize(s.name) }))
    .filter(({ key }) => key.length >= 3 && padded.includes(` ${key} `) && !refPadded.includes(` ${key} `))
    .map(({ name }) => name)
  if (invented.length > 0) issues.push({ kind: 'skills', detail: `skills not in the resume: ${invented.join(', ')}` })
  return issues
}

async function assess(text: string, changes: Change[], ctx: Context): Promise<Attempt> {
  const local = localIssues(text, ctx)
  if (local.length > 0) return { text, changes, fidelity: 0, adequacy: 0, issues: local }

  const { summaryText, resumeText, jobText } = ctx.req
  const hasOriginal = summaryText.trim().length > 0
  const fidelityState = {
    resume: resumeText,
    ...(hasOriginal ? { current_summary: summaryText } : {}),
    rewritten_summary: text,
  }
  const fidelityQuestions = hasOriginal ? { ...FIDELITY_QUESTIONS, faithful_to_original: FAITHFUL_QUESTION } : FIDELITY_QUESTIONS
  const adequacyState = { job_description: jobText, resume: resumeText, rewritten_summary: text }

  const [fid, ade] = await Promise.all([ctx.verifier.ask(fidelityState, fidelityQuestions), ctx.verifier.ask(adequacyState, ADEQUACY_QUESTIONS)])

  const issues: Issue[] = []
  if (noulOf(fid.no_invention) <= QUALITY_THRESHOLD) issues.push({ kind: 'invention' })
  if (noulOf(fid.consistent_with_resume) <= QUALITY_THRESHOLD) issues.push({ kind: 'exaggeration' })
  if (hasOriginal && noulOf(fid.faithful_to_original) <= QUALITY_THRESHOLD) issues.push({ kind: 'meaning' })
  const fidelity = Math.min(...Object.keys(fidelityQuestions).map((id) => clamp01(noulOf(fid[id]))))
  const adequacy = clamp01(scoreOf(ade.adequacy) / ADEQUACY_TOP_LEVEL)
  if (adequacy <= QUALITY_THRESHOLD) issues.push({ kind: 'adequacy' })
  return { text, changes, fidelity, adequacy, issues }
}

/** Pede ao LLM uma nova versão, dizendo o que reprovou na anterior. Devolve null se a resposta for inutilizável. */
async function redo(state: VersionState, ctx: Context): Promise<{ text: string; changes: Change[] } | null> {
  const last = state.attempts[state.attempts.length - 1]
  const user = buildRedoPrompt({
    lang: state.lang,
    summaryText: ctx.req.summaryText,
    resumeText: ctx.req.resumeText,
    jobText: ctx.req.jobText,
    previous: last.text,
    issues: last.issues,
  })
  try {
    const reply = await ctx.provider.complete({ system: REDO_SYSTEM_PROMPT, user })
    const parsed = redoSchema.safeParse(extractJson(reply))
    return parsed.success ? { text: parsed.data.text, changes: parsed.data.changes ?? [] } : null
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
    if (!from || !to || seen.has(key) || !summaryNorm.includes(from) || !finals.some((t) => t.includes(to))) continue
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
  if (!verifier) return { analysis, verification: { state: 'skipped', versions: {} } }

  const ctx: Context = {
    req,
    skills: analysis.skills,
    verifier,
    provider,
    referenceNorm: normalize(`${req.resumeText}\n${req.summaryText}`),
  }
  const states: VersionState[] = req.languages
    .filter((lang) => analysis.summary.suggested[lang])
    .map((lang) => ({ lang, attempts: [], redos: 0 }))

  let failed = false
  try {
    const first = await Promise.allSettled(
      states.map(async (s) => {
        s.attempts.push(await assess(analysis.summary.suggested[s.lang]!, analysis.summary.changes, ctx))
      }),
    )
    failed = first.some((r) => r.status === 'rejected')

    for (let round = 1; round <= MAX_REDOS && !failed; round++) {
      const pending = states.filter((s) => !s.attempts.some(passes))
      if (pending.length === 0) break
      const results = await Promise.allSettled(
        pending.map(async (s) => {
          s.redos++
          const next = await redo(s, ctx)
          if (next) s.attempts.push(await assess(next.text, next.changes, ctx))
        }),
      )
      failed = results.some((r) => r.status === 'rejected')
    }
  } catch (e) {
    console.error('Falha ao conferir a introdução com o Jev:', e instanceof Error ? e.message : e)
    failed = true
  }
  if (failed) console.error('A conferência com o Jev foi interrompida; usando as versões já avaliadas.')

  const chosen = states.filter((s) => s.attempts.length > 0).map((s) => ({ state: s, best: bestOf(s.attempts) }))
  const suggested = { ...analysis.summary.suggested }
  for (const { state, best } of chosen) suggested[state.lang] = best.text

  const redoneChosen = chosen.some(({ state, best }) => best !== state.attempts[0])
  const changes = redoneChosen ? reconcileChanges(analysis.summary.changes, chosen.map((c) => c.best), req.summaryText) : analysis.summary.changes

  const versions: Partial<Record<Lang, VersionQuality>> = {}
  if (!failed) {
    for (const { state, best } of chosen) {
      versions[state.lang] = {
        status: passes(best) ? 'verified' : 'best_effort',
        fidelity: best.fidelity,
        adequacy: best.adequacy,
        redos: state.redos,
      }
    }
  }
  return {
    analysis: { ...analysis, summary: { ...analysis.summary, suggested, changes } },
    verification: { state: failed ? 'failed' : 'checked', versions },
  }
}
