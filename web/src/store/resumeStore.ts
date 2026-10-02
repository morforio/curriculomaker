import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import i18n from '../lib/i18n'
import { resumeSchema, type Resume, type Section, type SectionType } from '../lib/schemas/resume'

function emptyData(type: SectionType): Section['data'] {
  switch (type) {
    case 'summary':
      return { text: '' }
    case 'education':
      return { items: [{ institution: '', degree: '', period: '', description: '' }] }
    case 'experience':
      return { items: [{ company: '', role: '', period: '', location: '', description: '' }] }
    case 'skills':
      return { groups: [{ label: '', items: [] }] }
    case 'languages':
      return { items: [{ name: '', level: '' }] }
    case 'custom':
      return { markdown: '' }
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
      version: 1,
      partialize: (s) => ({ resume: s.resume }),
      // Dados salvos que não passam no schema são descartados em vez de quebrar a tela.
      merge: (persisted, current) => {
        const parsed = resumeSchema.safeParse((persisted as { resume?: unknown } | undefined)?.resume)
        return parsed.success ? { ...current, resume: parsed.data } : current
      },
    },
  ),
)
