import { z } from 'zod'

/** Linha de conteúdo: tópico (opcional, em negrito) + texto. Sem tópico, vira texto livre. */
export const rowSchema = z.object({ topic: z.string(), text: z.string() })
export const rowsDataSchema = z.object({ rows: z.array(rowSchema) })

export const educationItemSchema = z.object({
  institution: z.string(),
  degree: z.string(),
  period: z.string(),
  rows: z.array(rowSchema),
})

export const experienceItemSchema = z.object({
  company: z.string(),
  role: z.string(),
  period: z.string(),
  location: z.string(),
  rows: z.array(rowSchema),
})

export const sectionSchema = z.discriminatedUnion('type', [
  z.object({ id: z.string(), type: z.literal('summary'), title: z.string(), data: rowsDataSchema }),
  z.object({ id: z.string(), type: z.literal('education'), title: z.string(), data: z.object({ items: z.array(educationItemSchema) }) }),
  z.object({ id: z.string(), type: z.literal('experience'), title: z.string(), data: z.object({ items: z.array(experienceItemSchema) }) }),
  z.object({ id: z.string(), type: z.literal('skills'), title: z.string(), data: rowsDataSchema }),
  z.object({ id: z.string(), type: z.literal('languages'), title: z.string(), data: rowsDataSchema }),
  z.object({ id: z.string(), type: z.literal('custom'), title: z.string(), data: rowsDataSchema }),
])

/** Tamanhos de fonte oferecidos, em pt (faixa usual de currículos). */
export const FONT_SIZES = [8, 9, 10, 11, 12] as const
export const MIN_FONT_SIZE = 8
export const MAX_FONT_SIZE = 12
export const DEFAULT_FONT_SIZE = 10

export const resumeSchema = z.object({
  version: z.literal(1),
  header: z.object({
    fullName: z.string(),
    headline: z.string(),
    email: z.string(),
    phone: z.string(),
    location: z.string(),
    links: z.array(z.object({ label: z.string(), url: z.string() })),
  }),
  sections: z.array(sectionSchema),
  settings: z.object({
    template: z.literal('ats'),
    fontScale: z.number(),
    /** Tamanho da fonte do texto, em pt. Currículos salvos antes desta opção usam 10 pt. */
    fontSize: z.number().min(MIN_FONT_SIZE).max(MAX_FONT_SIZE).default(DEFAULT_FONT_SIZE),
  }),
})

export type Row = z.infer<typeof rowSchema>
export type Resume = z.infer<typeof resumeSchema>
export type Section = z.infer<typeof sectionSchema>
export type SectionType = Section['type']
export type EducationItem = z.infer<typeof educationItemSchema>
export type ExperienceItem = z.infer<typeof experienceItemSchema>

export const SECTION_TYPES: SectionType[] = ['summary', 'experience', 'education', 'skills', 'languages', 'custom']
