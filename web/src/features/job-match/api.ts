import { analysisSchema, type Analysis, type AnalyzeRequest, type ApiErrorCode, type Verification } from '../../lib/schemas/analysis'
import { authHeaders } from '../auth/token'
import { useCreditsStore } from '../credits/creditsStore'
import { useNoticeStore } from '../notice/noticeStore'

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
  'llm_busy',
  'no_credits',
  'credits_unavailable',
  'unauthorized',
  'auth_unavailable',
  'bad_llm_output',
]

export type AnalysisResult = { analysis: Analysis; meta: { model: string; downgraded: number; verification?: Verification; fallback?: boolean } }

export async function requestAnalysis(req: AnalyzeRequest, signal?: AbortSignal): Promise<AnalysisResult> {
  let res: Response
  try {
    res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify(req),
      signal,
    })
  } catch {
    throw new ApiError('network')
  }

  void useCreditsStore.getState().refresh() // o saldo mudou (gastou, ou voltou se deu erro)
  const data = (await res.json().catch(() => null)) as { analysis?: unknown; meta?: AnalysisResult['meta']; error?: string } | null
  if (!res.ok) {
    const code = KNOWN.find((c) => c === data?.error)
    throw new ApiError(code ?? 'llm_unavailable')
  }
  const parsed = analysisSchema.safeParse(data?.analysis)
  if (!parsed.success) throw new ApiError('bad_llm_output')
  if (data?.meta?.fallback) useNoticeStore.getState().show('fallback')
  else useNoticeStore.getState().clear()
  return { analysis: parsed.data, meta: data?.meta ?? { model: '', downgraded: 0 } }
}
