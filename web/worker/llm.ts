/**
 * Camada de LLM plugável. A implementação inicial fala o formato OpenAI-compatível
 * (/v1/chat/completions), usado pela NVIDIA, Baseten, Groq, Fireworks etc.
 * Trocar de provedor = trocar LLM_BASE_URL, LLM_MODEL e LLM_API_KEY.
 */
export interface LLMProvider {
  complete(args: { system: string; user: string; maxTokens?: number }): Promise<string>
}

export type LLMEnv = {
  LLM_API_KEY?: string
  LLM_BASE_URL?: string
  LLM_MODEL?: string
  /** "low", "medium" ou "high": quanto o modelo de raciocínio "pensa" antes de responder (menos = mais rápido). */
  LLM_REASONING_EFFORT?: string
}

export class LLMError extends Error {
  /** "busy": o provedor recusou por excesso de pedidos (HTTP 429), mesmo após uma nova tentativa. */
  kind: 'unavailable' | 'empty' | 'busy'
  constructor(message: string, kind: 'unavailable' | 'empty' | 'busy') {
    super(message)
    this.kind = kind
  }
}

export const DEFAULT_BASE_URL = 'https://integrate.api.nvidia.com/v1'
export const DEFAULT_MODEL = 'openai/gpt-oss-120b'

// Se o provedor recusar o parâmetro reasoning_effort (HTTP 400), deixamos de enviá-lo neste isolate.
let effortUnsupported = false

type Completion = {
  choices?: { message?: { content?: string | null; reasoning_content?: string | null } }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } }
}

/** Mensagem de erro do provedor, cortada em 300 caracteres, para o log. */
async function errorDetail(res: Response): Promise<string> {
  const text = await res.text().catch(() => '')
  try {
    const data = JSON.parse(text) as { error?: { message?: unknown } }
    return String(data?.error?.message ?? text).slice(0, 300)
  } catch {
    return text.slice(0, 300)
  }
}

export function createProvider(env: LLMEnv): LLMProvider {
  const base = (env.LLM_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '')
  const model = env.LLM_MODEL || DEFAULT_MODEL
  const apiKey = env.LLM_API_KEY ?? ''
  const effort = env.LLM_REASONING_EFFORT?.trim() || undefined

  return {
    // A Groq reserva o max_tokens inteiro no limite de tokens por minuto (TPM), mesmo que a resposta seja menor:
    // pedir 6.000 tokens estourava o limite com currículos grandes (HTTP 413 e 429).
    async complete({ system, user, maxTokens = 4000 }) {
      const started = Date.now()

      async function send(reasoningEffort: string | undefined): Promise<Response> {
        try {
          return await fetch(`${base}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model,
              messages: [
                { role: 'system', content: system },
                { role: 'user', content: user },
              ],
              temperature: 0.2,
              top_p: 0.9,
              max_tokens: maxTokens,
              stream: false,
              ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
            }),
            signal: AbortSignal.timeout(90_000),
          })
        } catch (e) {
          // Só o nome e a mensagem do erro (TimeoutError, TypeError...) vão para o log; a chave não aparece neles.
          const cause = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
          console.error(`LLM fetch falhou após ${Date.now() - started} ms (modelo: ${model}): ${cause}`)
          throw new LLMError('Falha de rede ou tempo esgotado ao chamar o provedor de LLM.', 'unavailable')
        }
      }

      let usedEffort = effort && !effortUnsupported ? effort : undefined
      let res = await send(usedEffort)
      if (res.status === 400 && usedEffort) {
        effortUnsupported = true
        console.error(`LLM HTTP 400 com reasoning_effort=${usedEffort} (modelo: ${model}); repetindo sem o parâmetro`)
        usedEffort = undefined
        res = await send(undefined)
      }
      if (res.status === 429) {
        // Limite de pedidos por minuto: espera o tempo que o provedor mandar (se for curto) e tenta uma vez mais.
        const seconds = Number(res.headers.get('retry-after'))
        const waitMs = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 2000
        if (waitMs <= 10_000) {
          console.error(`LLM HTTP 429 após ${Date.now() - started} ms (modelo: ${model}); nova tentativa em ${waitMs} ms`)
          await new Promise((resolve) => setTimeout(resolve, waitMs))
          res = await send(usedEffort)
        }
      }
      if (!res.ok) {
        // O corpo da resposta vai só para o log do servidor (nunca para o usuário): traz o motivo exato do provedor,
        // como o limite de tokens por minuto, o que permite diagnosticar sem adivinhar.
        console.error(`LLM HTTP ${res.status} após ${Date.now() - started} ms (modelo: ${model}): ${await errorDetail(res)}`)
        throw new LLMError(`O provedor de LLM respondeu HTTP ${res.status}.`, res.status === 429 ? 'busy' : 'unavailable')
      }
      const data = (await res.json().catch(() => null)) as Completion | null
      const message = data?.choices?.[0]?.message
      const u = data?.usage
      console.log(
        `LLM ok em ${Date.now() - started} ms (modelo: ${model}; esforço: ${usedEffort ?? 'padrão'}; tokens de entrada: ${u?.prompt_tokens ?? 'n/d'}, de saída: ${u?.completion_tokens ?? 'n/d'}, de raciocínio: ${u?.completion_tokens_details?.reasoning_tokens ?? 'n/d'}; raciocínio devolvido: ${message?.reasoning_content?.length ?? 0} caracteres)`,
      )
      const content = message?.content
      if (!content || !content.trim()) throw new LLMError('O provedor de LLM devolveu uma resposta vazia.', 'empty')
      return content
    },
  }
}
