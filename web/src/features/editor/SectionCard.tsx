import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Section } from '../../lib/schemas/resume'
import { useResumeStore } from '../../store/resumeStore'
import { SectionForm } from './SectionForms'

const iconBtn =
  'flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-30 disabled:hover:bg-transparent'

export function SectionCard({ section, index, total }: { section: Section; index: number; total: number }) {
  const { t } = useTranslation()
  const { updateSection, removeSection, moveSection } = useResumeStore()
  const [open, setOpen] = useState(true)
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`glass rounded-lg border ${isDragging ? 'z-10 border-blue-500 shadow-lg' : 'border-gray-200'}`}
    >
      <div className="flex items-center gap-1 border-b border-gray-100 p-2">
        <button
          ref={setActivatorNodeRef}
          type="button"
          className={`${iconBtn} cursor-grab touch-none active:cursor-grabbing`}
          aria-label={t('card.drag')}
          title={t('card.drag')}
          {...attributes}
          {...listeners}
        >
          ⋮⋮
        </button>
        <input
          aria-label={t('card.title')}
          className="min-w-0 flex-1 rounded border border-transparent px-2 py-1 text-sm font-semibold text-gray-900 hover:border-gray-300 focus:border-blue-500 focus:outline-none"
          value={section.title}
          onChange={(e) => updateSection(section.id, { title: e.target.value })}
        />
        <button type="button" className={iconBtn} disabled={index === 0} onClick={() => moveSection(index, index - 1)} aria-label={t('card.up')} title={t('card.up')}>
          ↑
        </button>
        <button type="button" className={iconBtn} disabled={index === total - 1} onClick={() => moveSection(index, index + 1)} aria-label={t('card.down')} title={t('card.down')}>
          ↓
        </button>
        <button type="button" className={iconBtn} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={open ? t('card.collapse') : t('card.expand')} title={open ? t('card.collapse') : t('card.expand')}>
          {open ? '−' : '+'}
        </button>
        <button type="button" className={`${iconBtn} hover:text-red-600`} onClick={() => removeSection(section.id)} aria-label={t('card.remove')} title={t('card.remove')}>
          ✕
        </button>
      </div>
      {open && (
        <div className="p-3">
          <SectionForm section={section} onChange={(data) => updateSection(section.id, { data })} />
        </div>
      )}
    </div>
  )
}
