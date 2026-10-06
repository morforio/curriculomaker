import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import i18n, { type Lang } from '../lib/i18n'
import { migrateResume } from '../lib/migrate'
import { DEFAULT_FONT_SIZE, resumeSchema, type Resume, type Row, type Section, type SectionType } from '../lib/schemas/resume'

export function emptyRow(): Row {
  return { topic: '', text: '' }
}

function emptyData(type: SectionType): Section['data'] {
  switch (type) {
    case 'education':
      return { items: [{ institution: '', degree: '', period: '', rows: [emptyRow()] }] }
    case 'experience':
      return { items: [{ company: '', role: '', period: '', location: '', rows: [emptyRow()] }] }
    case 'summary':
    case 'skills':
    case 'languages':
    case 'custom':
      return { rows: [emptyRow()] }
  }
}

/** O título padrão do bloco vem no idioma pedido (por padrão, o da aba ativa). */
export function newSection(type: SectionType, lang?: Lang): Section {
  return {
    id: crypto.randomUUID(),
    type,
    title: i18n.t(`sectionType.${type}`, lang ? { lng: lang } : {}),
    data: emptyData(type),
  } as Section
}

function defaultResume(lang: Lang): Resume {
  return {
    version: 1,
    header: { fullName: '', headline: '', email: '', phone: '', location: '', links: [] },
    sections: (['summary', 'experience', 'education', 'skills'] as SectionType[]).map((type) => newSection(type, lang)),
    settings: { template: 'ats', fontScale: 1, fontSize: DEFAULT_FONT_SIZE },
  }
}

/** Já tem algo preenchido? Compara com os blocos vazios e olha os dados de contato. */
export function hasContent(resume: Resume): boolean {
  const h = resume.header
  if ([h.fullName, h.headline, h.email, h.phone, h.location].some((v) => v.trim()) || h.links.length > 0) return true
  return resume.sections.some((s) => JSON.stringify(s.data) !== JSON.stringify(newSection(s.type).data))
}

function browserLang(): Lang {
  return i18n.language.startsWith('pt') ? 'pt' : 'en'
}

type State = {
  /** Aba de idioma ativa: define o idioma do currículo, da interface e da introdução sugerida. */
  lang: Lang
  /** Currículo da aba ativa. */
  resume: Resume
  /** Currículo da outra aba, se ela já foi aberta. */
  saved: Partial<Record<Lang, Resume>>
  setHeader: (patch: Partial<Resume['header']>) => void
  setFontSize: (size: number) => void
  addSection: (type: SectionType) => void
  insertSection: (section: Section, index: number) => void
  removeSection: (id: string) => void
  moveSection: (from: number, to: number) => void
  updateSection: (id: string, patch: Partial<Pick<Section, 'title' | 'data'>>) => void
  reset: () => void
  importResume: (resume: Resume) => void
  /** Troca de aba. Com `translated`, a nova aba nasce com o currículo traduzido; sem ele, abre vazia (ou como estava). */
  switchLang: (next: Lang, translated?: Resume) => void
}

const initialLang = browserLang()

export const useResumeStore = create<State>()(
  persist(
    (set) => ({
      lang: initialLang,
      resume: defaultResume(initialLang),
      saved: {},
      setHeader: (patch) => set((s) => ({ resume: { ...s.resume, header: { ...s.resume.header, ...patch } } })),
      setFontSize: (size) => set((s) => ({ resume: { ...s.resume, settings: { ...s.resume.settings, fontSize: size } } })),
      addSection: (type) => set((s) => ({ resume: { ...s.resume, sections: [...s.resume.sections, newSection(type, s.lang)] } })),
      insertSection: (section, index) =>
        set((s) => {
          const sections = [...s.resume.sections]
          sections.splice(Math.max(0, Math.min(index, sections.length)), 0, section)
          return { resume: { ...s.resume, sections } }
        }),
      removeSection: (id) => set((s) => ({ resume: { ...s.resume, sections: s.resume.sections.filter((x) => x.id !== id) } })),
      moveSection: (from, to) =>
        set((s) => {
          const sections = [...s.resume.sections]
          if (from < 0 || to < 0 || from >= sections.length || to >= sections.length) return s
          const [moved] = sections.splice(from, 1)
          sections.splice(to, 0, moved)
          return { resume: { ...s.resume, sections } }
        }),
      updateSection: (id, patch) =>
        set((s) => ({
          resume: {
            ...s.resume,
            sections: s.resume.sections.map((x) => (x.id === id ? ({ ...x, ...patch } as Section) : x)),
          },
        })),
      reset: () => set((s) => ({ resume: defaultResume(s.lang) })),
      importResume: (resume) => set({ resume }),
      switchLang: (next, translated) =>
        set((s) => {
          if (next === s.lang) return s
          const saved = { ...s.saved, [s.lang]: s.resume }
          const target = translated ?? saved[next] ?? defaultResume(next)
          delete saved[next]
          return { lang: next, resume: target, saved }
        }),
    }),
    {
      name: 'currimaker:resume',
      version: 3,
      // v1 guardava um texto único por bloco; v2, linhas "tópico + texto"; v3, um currículo por aba de idioma.
      // O currículo que já existia vai para a aba do idioma que a interface estava usando.
      migrate: (persisted, version) => {
        if (persisted && typeof persisted === 'object') {
          const p = persisted as { resume?: unknown }
          const resume = version < 2 ? migrateResume(p.resume) : p.resume
          if (version < 3) return { lang: browserLang(), resume, saved: {} } as unknown as State
          return { ...p, resume } as State
        }
        return persisted as State
      },
      partialize: (s) => ({ lang: s.lang, resume: s.resume, saved: s.saved }),
      // Dados salvos que não passam no schema são descartados em vez de quebrar a tela.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as { lang?: unknown; resume?: unknown; saved?: Record<string, unknown> }
        const lang: Lang = p.lang === 'pt' || p.lang === 'en' ? p.lang : current.lang
        const parsed = resumeSchema.safeParse(p.resume)
        const saved: Partial<Record<Lang, Resume>> = {}
        for (const l of ['pt', 'en'] as const) {
          const other = resumeSchema.safeParse(p.saved?.[l])
          if (other.success && l !== lang) saved[l] = other.data
        }
        return { ...current, lang, resume: parsed.success ? parsed.data : defaultResume(lang), saved }
      },
    },
  ),
)
