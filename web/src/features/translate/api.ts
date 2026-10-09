import type { ApiErrorCode, Lang } from '../../lib/schemas/analysis'
import { translateResponseSchema } from '../../lib/schemas/translate'
import { authHeaders } from '../auth/token'
import { useCreditsStore } from '../credits/creditsStore'
import { ApiError } from '../job-match/api'
import { useNoticeStore } from '../notice/noticeStore'

const KNOWN: ApiErrorCode[] = [
  'unauthorized',
  'auth_unavailable',
  'invalid_request',
  'forbidden_origin',
  'rate_limited_ip',
  'rate_limited_daily',
  'not_configured',
  'llm_unavailable',
  'llm_busy',
  'no_credits',
  'credits_unavailable',
  'bad_llm_output',
]

/** Traduz os textos, devolvendo a lista na mesma ordem. */
export async function requestTranslation(from: Lang, to: Lang, texts: string[], signal?: AbortSignal): Promise<string[]> {
  let res: Response
  try {
    res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ from, to, texts }),
      signal,
    })
  } catch {
    throw new ApiError('network')
  }

  void useCreditsStore.getState().refresh() // o saldo mudou (gastou, ou voltou se deu erro)
  const data = (await res.json().catch(() => null)) as { texts?: unknown; error?: string } | null
  if (!res.ok) throw new ApiError(KNOWN.find((c) => c === data?.error) ?? 'llm_unavailable')
  const parsed = translateResponseSchema.safeParse(data)
  if (!parsed.success || parsed.data.texts.length !== texts.length) throw new ApiError('bad_llm_output')
  if (parsed.data.fallback) useNoticeStore.getState().show('fallback')
  else useNoticeStore.getState().clear()
  return parsed.data.texts
}
