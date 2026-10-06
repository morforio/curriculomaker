import type { ApiErrorCode, Lang } from '../../lib/schemas/analysis'
import { translateResponseSchema } from '../../lib/schemas/translate'
import { ApiError } from '../job-match/api'

const KNOWN: ApiErrorCode[] = [
  'invalid_request',
  'forbidden_origin',
  'rate_limited_ip',
  'rate_limited_daily',
  'not_configured',
  'llm_unavailable',
  'llm_busy',
  'bad_llm_output',
]

/** Traduz os textos, devolvendo a lista na mesma ordem. */
export async function requestTranslation(from: Lang, to: Lang, texts: string[], signal?: AbortSignal): Promise<string[]> {
  let res: Response
  try {
    res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, texts }),
      signal,
    })
  } catch {
    throw new ApiError('network')
  }

  const data = (await res.json().catch(() => null)) as { texts?: unknown; error?: string } | null
  if (!res.ok) throw new ApiError(KNOWN.find((c) => c === data?.error) ?? 'llm_unavailable')
  const parsed = translateResponseSchema.safeParse(data)
  if (!parsed.success || parsed.data.texts.length !== texts.length) throw new ApiError('bad_llm_output')
  return parsed.data.texts
}
