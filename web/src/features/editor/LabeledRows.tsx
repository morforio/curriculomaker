import type { Row } from '../../lib/schemas/resume'
import { inputCls } from './fields'
import { SortableList } from './SortableList'

const addCls = 'rounded border border-dashed border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-white/10'
const removeCls = 'h-7 w-7 shrink-0 rounded text-gray-500 hover:bg-gray-100 hover:text-red-600'

/** Valor de uma lista de exemplos para a posição i (repete a lista se houver mais linhas que exemplos). */
const pick = (list: string[], i: number) => list[i % list.length] ?? ''

/**
 * Lista de linhas "nome + texto" (uma por linha, com botão para adicionar mais e alça para reordenar), usada em habilidades e idiomas.
 * Os exemplos aparecem como dica dentro dos campos vazios.
 */
export function LabeledRows({
  rows,
  onChange,
  topicLabel,
  textLabel,
  topicExamples,
  textExamples,
  addLabel,
  removeLabel,
}: {
  rows: Row[]
  onChange: (rows: Row[]) => void
  topicLabel: string
  textLabel: string
  topicExamples: string[]
  textExamples: string[]
  addLabel: string
  removeLabel: string
}) {
  const update = (i: number, patch: Partial<Row>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1.25rem_1fr_2fr_1.75rem] gap-2 text-xs font-medium text-gray-600">
        <span />
        <span>{topicLabel}</span>
        <span>{textLabel}</span>
        <span />
      </div>
      <SortableList
        rows={rows}
        onChange={onChange}
        renderRow={({ row, index: i, handle, remove }) => (
          <div className="grid grid-cols-[1.25rem_1fr_2fr_1.75rem] items-center gap-2">
            {handle}
            <input className={inputCls} aria-label={topicLabel} placeholder={pick(topicExamples, i)} value={row.topic} onChange={(e) => update(i, { topic: e.target.value })} />
            <input className={inputCls} aria-label={textLabel} placeholder={pick(textExamples, i)} value={row.text} onChange={(e) => update(i, { text: e.target.value })} />
            <button type="button" className={removeCls} aria-label={removeLabel} title={removeLabel} disabled={rows.length === 1 && !row.topic && !row.text} onClick={remove}>
              ✕
            </button>
          </div>
        )}
      />
      <button type="button" className={addCls} onClick={() => onChange([...rows, { topic: '', text: '' }])}>
        + {addLabel}
      </button>
    </div>
  )
}
