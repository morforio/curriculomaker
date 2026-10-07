import { useTranslation } from 'react-i18next'
import { stripBullet } from '../../lib/rows'
import type { Row } from '../../lib/schemas/resume'
import { inputCls } from './fields'
import { LabeledRows } from './LabeledRows'
import { SortableList } from './SortableList'

export type GuidedKind = 'summary' | 'skills' | 'languages'

const addCls = 'rounded border border-dashed border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-white/10'
const removeCls = 'h-7 w-7 shrink-0 rounded text-gray-500 hover:bg-gray-100 hover:text-red-600'

/**
 * Resumo profissional: uma caixa por tópico. O "• " fica guardado no texto (é ele que faz a prévia e o PDF mostrarem
 * marcador), mas não aparece na caixa: a pessoa só escreve o tópico. Texto antigo com várias linhas numa caixa só é mostrado como está.
 */
function BulletRows({ rows, onChange, examples }: { rows: Row[]; onChange: (rows: Row[]) => void; examples: string[] }) {
  const { t } = useTranslation()
  const update = (i: number, text: string, multi: boolean) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, text: multi ? text : text.trim() ? `• ${text}` : '' } : r)))

  return (
    <div className="space-y-2">
      <SortableList
        rows={rows}
        onChange={onChange}
        renderRow={({ row, index: i, handle, remove }) => {
          const multi = row.text.includes('\n')
          return (
            <div className="flex items-start gap-2">
              <div className="mt-0.5">{handle}</div>
              {!multi && (
                <span aria-hidden="true" className="mt-1.5 text-gray-500">
                  •
                </span>
              )}
              <textarea
                className={`${inputCls} resize-none`}
                rows={multi ? 3 : 2}
                aria-label={`${t('guide.summary.topic')} ${i + 1}`}
                placeholder={examples[i % examples.length]}
                value={multi ? row.text : stripBullet(row.text)}
                onChange={(e) => update(i, e.target.value, multi)}
              />
              <button type="button" className={`${removeCls} mt-0.5`} aria-label={t('guide.remove')} title={t('guide.remove')} onClick={remove}>
                ✕
              </button>
            </div>
          )
        }}
      />
      <button type="button" className={addCls} onClick={() => onChange([...rows, { topic: '', text: '' }])}>
        + {t('guide.summary.add')}
      </button>
    </div>
  )
}

/** Blocos com formato próprio (resumo, habilidades, idiomas): uma linha por item, botão para adicionar e dicas de preenchimento. */
export function GuidedRows({ kind, rows, onChange }: { kind: GuidedKind; rows: Row[]; onChange: (rows: Row[]) => void }) {
  const { t } = useTranslation()

  if (kind === 'summary') {
    return (
      <div className="space-y-3">
        <p className="text-xs text-gray-500">{t('guide.summary.hint')}</p>
        <BulletRows rows={rows} onChange={onChange} examples={[t('guide.summary.example1'), t('guide.summary.example2'), t('guide.summary.example3')]} />
        <div className="rounded border border-gray-200 bg-white/5 p-3">
          <p className="text-xs font-medium text-gray-700">{t('guide.summary.tipsTitle')}</p>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-gray-600">
            <li>{t('guide.summary.tip1')}</li>
            <li>{t('guide.summary.tip2')}</li>
            <li>{t('guide.summary.tip3')}</li>
            <li>{t('guide.summary.tip4')}</li>
          </ul>
        </div>
      </div>
    )
  }

  if (kind === 'skills') {
    return (
      <div className="space-y-3">
        <p className="text-xs text-gray-500">{t('guide.skills.hint')}</p>
        <LabeledRows
          rows={rows}
          onChange={onChange}
          topicLabel={t('guide.skills.group')}
          textLabel={t('guide.skills.items')}
          topicExamples={[t('guide.skills.group1'), t('guide.skills.group2'), t('guide.skills.group3')]}
          textExamples={[t('guide.skills.items1'), t('guide.skills.items2'), t('guide.skills.items3')]}
          addLabel={t('guide.skills.add')}
          removeLabel={t('guide.remove')}
        />
        <p className="text-xs text-gray-500">{t('guide.skills.examples')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">{t('guide.languages.hint')}</p>
      <LabeledRows
        rows={rows}
        onChange={onChange}
        topicLabel={t('guide.languages.language')}
        textLabel={t('guide.languages.level')}
        topicExamples={[t('guide.languages.language1'), t('guide.languages.language2')]}
        textExamples={[t('guide.languages.level1'), t('guide.languages.level2')]}
        addLabel={t('guide.languages.add')}
        removeLabel={t('guide.remove')}
      />
    </div>
  )
}
