import { z } from 'zod'

/** Contrato da análise de vaga, compartilhado entre o site e o Worker (worker/). */

export const LANGS = ['pt', 'en'] as const
export type Lang = (typeof LANGS)[number]

export const MAX_JOB_CHARS = 15000
export const MIN_JOB_CHARS = 80

export const analyzeRequestSchema = z.object({
  jobText: z.string().min(MIN_JOB_CHARS).max(MAX_JOB_CHARS),
  /** Currículo em texto puro, sem dados de contato. */
  resumeText: z.string().min(20).max(30000),
  /** Texto atual da introdução (pode ser vazio). */
  summaryText: z.string().max(5000),
  /** Idioma da aba ativa: a introdução sugerida é escrita neste idioma. */
  language: z.enum(LANGS),
})
export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>

// O modelo às vezes devolve null em vez de omitir o campo.
const optText = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((v) => (v && v.trim() ? v.trim() : undefined))

export const skillSchema = z.object({
  name: z.string().trim().min(1).max(80),
  importance: z.enum(['required', 'preferred']),
  status: z.enum(['has', 'partial', 'missing']),
  evidence: optText(400),
})
export type Skill = z.infer<typeof skillSchema>

export const analysisSchema = z.object({
  job: z
    .object({ title: optText(120), company: optText(120), seniority: optText(60) })
    .nullish()
    .transform((v): { title?: string; company?: string; seniority?: string } => v ?? {}),
  summary: z.object({
    suggested: optText(5000),
    changes: z
      .array(z.object({ from: z.string().max(600), to: z.string().max(600), reason: z.string().max(400) }))
      .max(8),
  }),
  skills: z.array(skillSchema).max(40),
  keywords: z.array(z.string().max(60)).max(30),
})
export type Analysis = z.infer<typeof analysisSchema>

/** Resultado da conferência da introdução sugerida (notas de 0 a 1). */
export type VersionQuality = {
  /** "verified": passou nas duas notas; "best_effort": melhor tentativa, mas ainda abaixo do limite. */
  status: 'verified' | 'best_effort'
  /** Sem invenção, sem fato errado e sem alteração incompatível com o original. */
  fidelity: number
  /** Quanto o texto está ajustado à vaga, usando só o que o currículo sustenta. */
  adequacy: number
  /** Quantas vezes o LLM refez esta versão (0 a 3). */
  redos: number
}

export type Verification = {
  /** "checked": conferido pelo Jev; "skipped": serviço não configurado; "failed": o Jev falhou desta vez. */
  state: 'checked' | 'skipped' | 'failed'
  /** Notas da introdução sugerida; ausente quando não houve conferência. */
  version?: VersionQuality
}

export type ApiErrorCode =
  | 'invalid_request'
  | 'forbidden_origin'
  | 'rate_limited_ip'
  | 'rate_limited_daily'
  | 'not_configured'
  | 'llm_unavailable'
  | 'llm_busy'
  | 'unauthorized'
  | 'auth_unavailable'
  | 'bad_llm_output'
  | 'no_credits'
  | 'credits_unavailable'
  | 'network'
