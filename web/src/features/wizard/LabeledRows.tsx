import type { Row } from '../../lib/schemas/resume'
import { inputCls } from '../editor/fields'

const addCls = 'rounded border border-dashed border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-white/10'
const removeCls = 'h-7 w-7 shrink-0 rounded text-gray-500 hover:bg-gray-100 hover:text-red-600'

/** Valor de uma lista de exemplos para a posição i (repete a lista se houver mais linhas que exemplos). */
const pick = (list: string[], i: number) => list[i % list.length] ?? ''

/**
 * Lista de linhas "nome + texto" (uma por linha, com botão para adicionar mais), usada em habilidades e idiomas.
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
      <div className="grid grid-cols-[1fr_2fr_1.75rem] gap-2 text-xs font-medium text-gray-600">
        <span>{topicLabel}</span>
        <span>{textLabel}</span>
        <span />
      </div>
      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-[1fr_2fr_1.75rem] items-center gap-2">
          <input className={inputCls} aria-label={topicLabel} placeholder={pick(topicExamples, i)} value={row.topic} onChange={(e) => update(i, { topic: e.target.value })} />
          <input className={inputCls} aria-label={textLabel} placeholder={pick(textExamples, i)} value={row.text} onChange={(e) => update(i, { text: e.target.value })} />
          <button
            type="button"
            className={removeCls}
            aria-label={removeLabel}
            title={removeLabel}
            disabled={rows.length === 1 && !row.topic && !row.text}
            onClick={() => onChange(rows.length > 1 ? rows.filter((_, j) => j !== i) : [{ topic: '', text: '' }])}
          >
            ✕
          </button>
        </div>
      ))}
      <button type="button" className={addCls} onClick={() => onChange([...rows, { topic: '', text: '' }])}>
        + {addLabel}
      </button>
    </div>
  )
}

/** Lista de linhas de um campo só (um tópico por linha), com botão para adicionar mais. */
export function LineList({
  lines,
  onChange,
  label,
  examples,
  addLabel,
  removeLabel,
}: {
  lines: string[]
  onChange: (lines: string[]) => void
  label: string
  examples: string[]
  addLabel: string
  removeLabel: string
}) {
  return (
    <div className="space-y-2">
      {lines.map((line, i) => (
        <div key={i} className="flex items-center gap-2">
          <span aria-hidden="true" className="text-gray-500">
            •
          </span>
          <input
            className={inputCls}
            aria-label={`${label} ${i + 1}`}
            placeholder={pick(examples, i)}
            value={line}
            onChange={(e) => onChange(lines.map((l, j) => (j === i ? e.target.value : l)))}
          />
          <button
            type="button"
            className={removeCls}
            aria-label={removeLabel}
            title={removeLabel}
            disabled={lines.length === 1 && !line}
            onClick={() => onChange(lines.length > 1 ? lines.filter((_, j) => j !== i) : [''])}
          >
            ✕
          </button>
        </div>
      ))}
      <button type="button" className={addCls} onClick={() => onChange([...lines, ''])}>
        + {addLabel}
      </button>
    </div>
  )
}
