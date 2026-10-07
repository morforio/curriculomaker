import { z } from 'zod'
import { LANGS } from './analysis.ts'

/** Contrato da tradução do currículo ao trocar de aba de idioma, compartilhado entre o site e o Worker. */

export const MAX_TRANSLATE_ITEMS = 300
export const MAX_TRANSLATE_CHARS = 30000

export const translateRequestSchema = z
  .object({
    from: z.enum(LANGS),
    to: z.enum(LANGS),
    /** Só os textos a traduzir (nunca nome, e-mail, telefone, links, empresas ou instituições). */
    texts: z.array(z.string().max(5000)).min(1).max(MAX_TRANSLATE_ITEMS),
  })
  .refine((v) => v.from !== v.to, { message: 'from e to precisam ser diferentes' })
  .refine((v) => v.texts.reduce((n, t) => n + t.length, 0) <= MAX_TRANSLATE_CHARS, { message: 'texto grande demais' })
export type TranslateRequest = z.infer<typeof translateRequestSchema>

export const translateResponseSchema = z.object({ texts: z.array(z.string().max(8000)), /** O modelo principal falhou e o reserva respondeu. */ fallback: z.boolean().optional() })
export type TranslateResponse = z.infer<typeof translateResponseSchema>
