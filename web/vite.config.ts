import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { handleAnalyze } from './worker/analyze.ts'
import { handleTranslate } from './worker/translate.ts'

/**
 * Em desenvolvimento, atende /api/analyze e /api/translate com o mesmo código do Worker (worker/).
 * A chave vem do .env local (LLM_API_KEY, sem prefixo VITE_, então nunca vai para o navegador).
 * Sem limite de uso: o limite real (Durable Object) só existe no Worker publicado.
 */
function apiDev(env: Record<string, string>): Plugin {
  const handlers = { analyze: handleAnalyze, translate: handleTranslate }
  return {
    name: 'api-dev',
    configureServer(server) {
      for (const [name, handle] of Object.entries(handlers)) {
        server.middlewares.use(`/api/${name}`, async (req, res) => {
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk as Buffer)
          const body = Buffer.concat(chunks)
          const headers = new Headers()
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
          const request = new Request(`http://${req.headers.host ?? 'localhost'}/api/${name}`, {
            method: req.method,
            headers,
            body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
          })
          const response = await handle(request, {
            env: {
              LLM_API_KEY: env.LLM_API_KEY,
              LLM_BASE_URL: env.LLM_BASE_URL,
              LLM_MODEL: env.LLM_MODEL,
              LLM_REASONING_EFFORT: env.LLM_REASONING_EFFORT,
              TYPESAFE_API_KEY: env.TYPESAFE_API_KEY,
              TYPESAFE_BASE_URL: env.TYPESAFE_BASE_URL,
              TYPESAFE_MODEL: env.TYPESAFE_MODEL,
            },
            ip: 'dev',
            limiter: { check: async () => 'ok' },
          })
          res.statusCode = response.status
          response.headers.forEach((value, key) => res.setHeader(key, value))
          res.end(await response.text())
        })
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), apiDev(loadEnv(mode, process.cwd(), ''))],
}))
