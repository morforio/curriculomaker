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
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { moveItem } from '../../lib/rows'
import type { Row } from '../../lib/schemas/resume'
import { emptyRow } from '../../store/resumeStore'
import { useLocked } from '../credits/useLocked'
import { useFocusScope } from '../focus/focusScope'

type RowArgs = {
  row: Row
  index: number
  /** Alça de arrastar (⋮⋮): vai no começo da linha. */
  handle: ReactNode
  /** Remove esta linha; se for a única, ela é esvaziada. */
  remove: () => void
}

function Item({ id, index, children }: { id: string; index: number; children: (handle: ReactNode) => ReactNode }) {
  const { t } = useTranslation()
  const scope = useFocusScope()
  const locked = useLocked()
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: locked })
  const handle = (
    <button
      ref={setActivatorNodeRef}
      type="button"
      className="flex h-7 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-900 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
      disabled={locked}
      aria-label={t('form.dragRow')}
      title={locked ? t('lock.tooltip') : t('form.dragRow')}
      {...attributes}
      {...listeners}
    >
      ⋮⋮
    </button>
  )
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-focus-key={scope ? `${scope}#${index}` : undefined}
      className={isDragging ? 'relative z-10 rounded shadow-lg ring-1 ring-blue-500' : undefined}
    >
      {children(handle)}
    </div>
  )
}

/**
 * Lista de linhas que podem ser reordenadas arrastando (como os blocos do currículo). As linhas não têm identificador próprio,
 * então a lista guarda um por posição e o reordena junto com as linhas.
 */
export function SortableList({ rows, onChange, renderRow }: { rows: Row[]; onChange: (rows: Row[]) => void; renderRow: (args: RowArgs) => ReactNode }) {
  const [ids, setIds] = useState<string[]>(() => rows.map(() => crypto.randomUUID()))

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Linhas acrescentadas ou trocadas de fora (botão "Adicionar", dados carregados da conta): ajusta os identificadores e redesenha.
  if (ids.length !== rows.length) {
    setIds(ids.length < rows.length ? [...ids, ...Array.from({ length: rows.length - ids.length }, () => crypto.randomUUID())] : ids.slice(0, rows.length))
    return null
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    setIds(moveItem(ids, from, to))
    onChange(moveItem(rows, from, to))
  }

  function remove(i: number) {
    if (rows.length > 1) {
      setIds(ids.filter((_, j) => j !== i))
      onChange(rows.filter((_, j) => j !== i))
    } else {
      setIds([crypto.randomUUID()])
      onChange([emptyRow()])
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis, restrictToParentElement]} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {rows.map((row, i) => (
            <Item key={ids[i]} id={ids[i]} index={i}>
              {(handle) => renderRow({ row, index: i, handle, remove: () => remove(i) })}
            </Item>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
