import { useTranslation } from 'react-i18next'
import { useNoticeStore } from './noticeStore'

export function NoticeBanner() {
  const { t } = useTranslation()
  const notice = useNoticeStore((s) => s.notice)
  const clear = useNoticeStore((s) => s.clear)
  if (!notice) return null
  return (
    <div role="status" className="mx-4 mt-3 flex items-start justify-between gap-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 print:hidden">
      <p>{t(`notice.${notice}`)}</p>
      <button type="button" onClick={clear} aria-label={t('notice.close')} className="shrink-0 rounded px-1.5 text-amber-900 hover:bg-amber-100">
        ×
      </button>
    </div>
  )
}
