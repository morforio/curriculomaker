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
  kind: 'unavailable' | 'empty'
  constructor(message: string, kind: 'unavailable' | 'empty') {
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

export function createProvider(env: LLMEnv): LLMProvider {
  const base = (env.LLM_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '')
  const model = env.LLM_MODEL || DEFAULT_MODEL
  const apiKey = env.LLM_API_KEY ?? ''
  const effort = env.LLM_REASONING_EFFORT?.trim() || undefined

  return {
    async complete({ system, user, maxTokens = 6000 }) {
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
      if (!res.ok) {
        // Não repassa o corpo da resposta ao usuário (pode conter detalhes da conta).
        // O status e o modelo vão para o log do servidor, para diagnosticar chave ou id de modelo errados.
        console.error(`LLM HTTP ${res.status} após ${Date.now() - started} ms (modelo: ${model})`)
        throw new LLMError(`O provedor de LLM respondeu HTTP ${res.status}.`, 'unavailable')
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
