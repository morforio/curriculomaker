import { useTranslation } from 'react-i18next'
import type { Row } from '../../lib/schemas/resume'
import { emptyRow } from '../../store/resumeStore'
import { TextAreaField, TextField } from './fields'
import { GuidedRows, type GuidedKind } from './GuidedRows'
import { SortableList } from './SortableList'

/**
 * Lista de linhas "tópico + texto". Tópico vazio = texto livre. As linhas se reordenam arrastando.
 * Resumo, habilidades e idiomas (`kind`) têm campos próprios, com exemplos e dicas.
 */
export function RowsEditor({ rows, onChange, kind }: { rows: Row[]; onChange: (rows: Row[]) => void; kind?: GuidedKind }) {
  const { t } = useTranslation()
  if (kind) return <GuidedRows kind={kind} rows={rows} onChange={onChange} />
  const update = (i: number, patch: Partial<Row>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  return (
    <div className="space-y-2">
      <SortableList
        rows={rows}
        onChange={onChange}
        renderRow={({ row, index: i, handle, remove }) => (
          <div className="flex items-start gap-1 rounded border border-gray-200 bg-gray-50 p-2">
            <div className="sm:mt-5">{handle}</div>
            <div className="grid min-w-0 flex-1 grid-cols-1 items-start gap-2 sm:grid-cols-[1fr_2fr]">
              <TextField label={t('form.topic')} placeholder={t('form.topicPlaceholder')} value={row.topic} onChange={(topic) => update(i, { topic })} />
              <TextAreaField label={t('form.rowText')} rows={2} value={row.text} onChange={(text) => update(i, { text })} />
            </div>
            <button
              type="button"
              className="h-7 w-7 shrink-0 rounded text-gray-500 hover:bg-gray-100 hover:text-red-600 sm:mt-5"
              aria-label={t('form.removeRow')}
              title={t('form.removeRow')}
              onClick={remove}
            >
              ✕
            </button>
          </div>
        )}
      />
      <button
        type="button"
        onClick={() => onChange([...rows, emptyRow()])}
        className="rounded border border-dashed border-gray-400 px-3 py-1 text-xs text-gray-700 hover:bg-gray-100"
      >
        + {t('form.addRow')}
      </button>
      <p className="text-xs text-gray-500">{t('form.rowsHint')}</p>
    </div>
  )
}
