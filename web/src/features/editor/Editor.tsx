import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SECTION_TYPES, type SectionType } from '../../lib/schemas/resume'
import { useResumeStore } from '../../store/resumeStore'
import { TextField } from './fields'
import { SectionCard } from './SectionCard'

export function Editor() {
  const { t } = useTranslation()
  const { resume, setHeader, addSection, moveSection } = useResumeStore()
  const [newType, setNewType] = useState<SectionType>('custom')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const from = resume.sections.findIndex((s) => s.id === active.id)
    const to = resume.sections.findIndex((s) => s.id === over.id)
    moveSection(from, to)
  }

  const { header } = resume

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">{t('header.title')}</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <TextField label={t('header.fullName')} value={header.fullName} onChange={(fullName) => setHeader({ fullName })} />
          <TextField label={t('header.headline')} value={header.headline} onChange={(headline) => setHeader({ headline })} />
          <TextField label={t('header.email')} value={header.email} onChange={(email) => setHeader({ email })} />
          <TextField label={t('header.phone')} value={header.phone} onChange={(phone) => setHeader({ phone })} />
          <TextField label={t('header.location')} value={header.location} onChange={(location) => setHeader({ location })} />
        </div>
        <div className="mt-3 space-y-2">
          <span className="block text-xs font-medium text-gray-600">{t('header.links')}</span>
          {header.links.map((link, i) => (
            <div key={i} className="grid grid-cols-[1fr_2fr_auto] items-end gap-2">
              <TextField
                label={t('header.linkLabel')}
                value={link.label}
                placeholder="LinkedIn"
                onChange={(label) => setHeader({ links: header.links.map((l, j) => (j === i ? { ...l, label } : l)) })}
              />
              <TextField
                label={t('header.linkUrl')}
                value={link.url}
                placeholder="linkedin.com/in/usuario"
                onChange={(url) => setHeader({ links: header.links.map((l, j) => (j === i ? { ...l, url } : l)) })}
              />
              <button
                type="button"
                className="mb-1 h-7 w-7 rounded text-gray-500 hover:bg-gray-100 hover:text-red-600"
                aria-label={t('header.removeLink')}
                title={t('header.removeLink')}
                onClick={() => setHeader({ links: header.links.filter((_, j) => j !== i) })}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setHeader({ links: [...header.links, { label: '', url: '' }] })}
            className="rounded border border-dashed border-gray-400 px-3 py-1 text-xs text-gray-700 hover:bg-gray-100"
          >
            + {t('header.addLink')}
          </button>
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-900">{t('sections.title')}</h2>
          <div className="flex items-center gap-2">
            <select
              aria-label={t('sections.add')}
              className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900"
              value={newType}
              onChange={(e) => setNewType(e.target.value as SectionType)}
            >
              {SECTION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`sectionType.${type}`)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => addSection(newType)}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              {t('sections.addButton')}
            </button>
          </div>
        </div>

        {resume.sections.length === 0 ? (
          <p className="rounded border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">{t('sections.empty')}</p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            onDragEnd={onDragEnd}
          >
            <SortableContext items={resume.sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {resume.sections.map((section, i) => (
                  <SectionCard key={section.id} section={section} index={i} total={resume.sections.length} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </section>
    </div>
  )
}
