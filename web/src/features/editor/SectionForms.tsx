import { useTranslation } from 'react-i18next'
import type { Section } from '../../lib/schemas/resume'
import { CommaListField, TextAreaField, TextField } from './fields'

type Data = Section['data']

function ItemShell({ onRemove, children }: { onRemove: () => void; children: React.ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-2 rounded border border-gray-200 bg-gray-50 p-3">
      {children}
      <button type="button" onClick={onRemove} className="text-xs text-red-600 hover:underline">
        {t('form.removeItem')}
      </button>
    </div>
  )
}

function AddButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-dashed border-gray-400 px-3 py-1 text-xs text-gray-700 hover:bg-gray-100"
    >
      + {t('form.addItem')}
    </button>
  )
}

function replaceAt<T>(list: T[], index: number, value: T): T[] {
  return list.map((x, i) => (i === index ? value : x))
}

export function SectionForm({ section, onChange }: { section: Section; onChange: (data: Data) => void }) {
  const { t } = useTranslation()

  switch (section.type) {
    case 'summary':
      return (
        <TextAreaField
          label={t('form.summaryText')}
          hint={t('form.boldHint')}
          rows={5}
          value={section.data.text}
          onChange={(text) => onChange({ text })}
        />
      )
    case 'custom':
      return (
        <TextAreaField
          label={t('form.customText')}
          hint={t('form.boldHint')}
          rows={5}
          value={section.data.markdown}
          onChange={(markdown) => onChange({ markdown })}
        />
      )
    case 'experience': {
      const items = section.data.items
      return (
        <div className="space-y-3">
          {items.map((item, i) => (
            <ItemShell key={i} onRemove={() => onChange({ items: items.filter((_, j) => j !== i) })}>
              <div className="grid grid-cols-2 gap-2">
                <TextField label={t('form.role')} value={item.role} onChange={(role) => onChange({ items: replaceAt(items, i, { ...item, role }) })} />
                <TextField label={t('form.company')} value={item.company} onChange={(company) => onChange({ items: replaceAt(items, i, { ...item, company }) })} />
                <TextField label={t('form.period')} placeholder={t('form.periodPlaceholder')} value={item.period} onChange={(period) => onChange({ items: replaceAt(items, i, { ...item, period }) })} />
                <TextField label={t('form.location')} value={item.location} onChange={(location) => onChange({ items: replaceAt(items, i, { ...item, location }) })} />
              </div>
              <TextAreaField label={t('form.description')} hint={t('form.boldHint')} value={item.description} onChange={(description) => onChange({ items: replaceAt(items, i, { ...item, description }) })} />
            </ItemShell>
          ))}
          <AddButton onClick={() => onChange({ items: [...items, { company: '', role: '', period: '', location: '', description: '' }] })} />
        </div>
      )
    }
    case 'education': {
      const items = section.data.items
      return (
        <div className="space-y-3">
          {items.map((item, i) => (
            <ItemShell key={i} onRemove={() => onChange({ items: items.filter((_, j) => j !== i) })}>
              <div className="grid grid-cols-2 gap-2">
                <TextField label={t('form.degree')} value={item.degree} onChange={(degree) => onChange({ items: replaceAt(items, i, { ...item, degree }) })} />
                <TextField label={t('form.institution')} value={item.institution} onChange={(institution) => onChange({ items: replaceAt(items, i, { ...item, institution }) })} />
                <TextField label={t('form.period')} placeholder={t('form.periodPlaceholder')} value={item.period} onChange={(period) => onChange({ items: replaceAt(items, i, { ...item, period }) })} />
              </div>
              <TextAreaField label={t('form.description')} hint={t('form.boldHint')} rows={2} value={item.description} onChange={(description) => onChange({ items: replaceAt(items, i, { ...item, description }) })} />
            </ItemShell>
          ))}
          <AddButton onClick={() => onChange({ items: [...items, { institution: '', degree: '', period: '', description: '' }] })} />
        </div>
      )
    }
    case 'skills': {
      const groups = section.data.groups
      return (
        <div className="space-y-3">
          {groups.map((group, i) => (
            <ItemShell key={i} onRemove={() => onChange({ groups: groups.filter((_, j) => j !== i) })}>
              <TextField label={t('form.skillGroup')} value={group.label} onChange={(label) => onChange({ groups: replaceAt(groups, i, { ...group, label }) })} />
              <CommaListField label={t('form.skillItems')} value={group.items} onChange={(list) => onChange({ groups: replaceAt(groups, i, { ...group, items: list }) })} />
            </ItemShell>
          ))}
          <AddButton onClick={() => onChange({ groups: [...groups, { label: '', items: [] }] })} />
        </div>
      )
    }
    case 'languages': {
      const items = section.data.items
      return (
        <div className="space-y-3">
          {items.map((item, i) => (
            <ItemShell key={i} onRemove={() => onChange({ items: items.filter((_, j) => j !== i) })}>
              <div className="grid grid-cols-2 gap-2">
                <TextField label={t('form.language')} value={item.name} onChange={(name) => onChange({ items: replaceAt(items, i, { ...item, name }) })} />
                <TextField label={t('form.level')} value={item.level} onChange={(level) => onChange({ items: replaceAt(items, i, { ...item, level }) })} />
              </div>
            </ItemShell>
          ))}
          <AddButton onClick={() => onChange({ items: [...items, { name: '', level: '' }] })} />
        </div>
      )
    }
  }
}
