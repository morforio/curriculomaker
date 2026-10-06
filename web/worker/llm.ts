/**
 * Camada de LLM plugável. A implementação inicial fala o formato OpenAI-compatível
 * (/v1/chat/completions), usado pela NVIDIA, Baseten, Groq, Fireworks etc.
 * Trocar de provedor = trocar LLM_BASE_URL, LLM_MODEL e LLM_API_KEY.
 */
export interface LLMProvider {
  complete(args: { system: string; user: string; maxTokens?: number }): Promise<string>
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

export function createProvider(env: { LLM_API_KEY?: string; LLM_BASE_URL?: string; LLM_MODEL?: string }): LLMProvider {
  const base = (env.LLM_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '')
  const model = env.LLM_MODEL || DEFAULT_MODEL
  const apiKey = env.LLM_API_KEY ?? ''

  return {
    async complete({ system, user, maxTokens = 6000 }) {
      let res: Response
      const started = Date.now()
      try {
        res = await fetch(`${base}/chat/completions`, {
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
          }),
          signal: AbortSignal.timeout(90_000),
        })
      } catch (e) {
        // Só o nome e a mensagem do erro (TimeoutError, TypeError...) vão para o log; a chave não aparece neles.
        const cause = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
        console.error(`LLM fetch falhou após ${Date.now() - started} ms (modelo: ${model}): ${cause}`)
        throw new LLMError('Falha de rede ou tempo esgotado ao chamar o provedor de LLM.', 'unavailable')
      }
      if (!res.ok) {
        // Não repassa o corpo da resposta ao usuário (pode conter detalhes da conta).
        // O status e o modelo vão para o log do servidor, para diagnosticar chave ou id de modelo errados.
        console.error(`LLM HTTP ${res.status} após ${Date.now() - started} ms (modelo: ${model})`)
        throw new LLMError(`O provedor de LLM respondeu HTTP ${res.status}.`, 'unavailable')
      }
      const data = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string | null } }[] } | null
      const content = data?.choices?.[0]?.message?.content
      if (!content || !content.trim()) throw new LLMError('O provedor de LLM devolveu uma resposta vazia.', 'empty')
      return content
    },
  }
}
