import { analysisSchema, type Analysis, type AnalyzeRequest, type ApiErrorCode, type Verification } from '../../lib/schemas/analysis'

export class ApiError extends Error {
  code: ApiErrorCode
  constructor(code: ApiErrorCode) {
    super(code)
    this.code = code
  }
}

const KNOWN: ApiErrorCode[] = [
  'invalid_request',
  'forbidden_origin',
  'rate_limited_ip',
  'rate_limited_daily',
  'not_configured',
  'llm_unavailable',
  'bad_llm_output',
]

export type AnalysisResult = { analysis: Analysis; meta: { model: string; downgraded: number; verification?: Verification } }

export async function requestAnalysis(req: AnalyzeRequest, signal?: AbortSignal): Promise<AnalysisResult> {
  let res: Response
  try {
    res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal,
    })
  } catch {
    throw new ApiError('network')
  }

  const data = (await res.json().catch(() => null)) as { analysis?: unknown; meta?: AnalysisResult['meta']; error?: string } | null
  if (!res.ok) {
    const code = KNOWN.find((c) => c === data?.error)
    throw new ApiError(code ?? 'llm_unavailable')
  }
  const parsed = analysisSchema.safeParse(data?.analysis)
  if (!parsed.success) throw new ApiError('bad_llm_output')
  return { analysis: parsed.data, meta: data?.meta ?? { model: '', downgraded: 0 } }
}
