import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import i18n from '../lib/i18n'
import { migrateResume } from '../lib/migrate'
import { resumeSchema, type Resume, type Row, type Section, type SectionType } from '../lib/schemas/resume'

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

export function newSection(type: SectionType): Section {
  return {
    id: crypto.randomUUID(),
    type,
    title: i18n.t(`sectionType.${type}`),
    data: emptyData(type),
  } as Section
}

function defaultResume(): Resume {
  return {
    version: 1,
    header: { fullName: '', headline: '', email: '', phone: '', location: '', links: [] },
    sections: (['summary', 'experience', 'education', 'skills'] as SectionType[]).map(newSection),
    settings: { template: 'ats', fontScale: 1 },
  }
}

type State = {
  resume: Resume
  setHeader: (patch: Partial<Resume['header']>) => void
  addSection: (type: SectionType) => void
  insertSection: (section: Section, index: number) => void
  removeSection: (id: string) => void
  moveSection: (from: number, to: number) => void
  updateSection: (id: string, patch: Partial<Pick<Section, 'title' | 'data'>>) => void
  reset: () => void
  importResume: (resume: Resume) => void
}

export const useResumeStore = create<State>()(
  persist(
    (set) => ({
      resume: defaultResume(),
      setHeader: (patch) => set((s) => ({ resume: { ...s.resume, header: { ...s.resume.header, ...patch } } })),
      addSection: (type) => set((s) => ({ resume: { ...s.resume, sections: [...s.resume.sections, newSection(type)] } })),
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
      reset: () => set({ resume: defaultResume() }),
      importResume: (resume) => set({ resume }),
    }),
    {
      name: 'currimaker:resume',
      version: 2,
      // v1 guardava um texto único por bloco; v2 guarda linhas "tópico + texto".
      migrate: (persisted, version) => {
        if (version < 2 && persisted && typeof persisted === 'object') {
          const p = persisted as { resume?: unknown }
          return { ...p, resume: migrateResume(p.resume) } as State
        }
        return persisted as State
      },
      partialize: (s) => ({ resume: s.resume }),
      // Dados salvos que não passam no schema são descartados em vez de quebrar a tela.
      merge: (persisted, current) => {
        const parsed = resumeSchema.safeParse((persisted as { resume?: unknown } | undefined)?.resume)
        return parsed.success ? { ...current, resume: parsed.data } : current
      },
    },
  ),
)
