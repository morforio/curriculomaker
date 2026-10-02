import { useTranslation } from 'react-i18next'
import type { Section } from '../../lib/schemas/resume'
import { emptyRow } from '../../store/resumeStore'
import { TextField } from './fields'
import { RowsEditor } from './RowsEditor'

type Data = Section['data']

function ItemShell({ onRemove, children }: { onRemove: () => void; children: React.ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-2 rounded border border-gray-200 p-3">
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
    case 'skills':
    case 'languages':
    case 'custom':
      return <RowsEditor rows={section.data.rows} onChange={(rows) => onChange({ rows })} />
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
              <RowsEditor rows={item.rows} onChange={(rows) => onChange({ items: replaceAt(items, i, { ...item, rows }) })} />
            </ItemShell>
          ))}
          <AddButton onClick={() => onChange({ items: [...items, { company: '', role: '', period: '', location: '', rows: [emptyRow()] }] })} />
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
              <RowsEditor rows={item.rows} onChange={(rows) => onChange({ items: replaceAt(items, i, { ...item, rows }) })} />
            </ItemShell>
          ))}
          <AddButton onClick={() => onChange({ items: [...items, { institution: '', degree: '', period: '', rows: [emptyRow()] }] })} />
        </div>
      )
    }
  }
}
