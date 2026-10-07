import { useTranslation } from 'react-i18next'
import { useMotionEnabled, useMotionStore } from './motionStore'

/** Liga e desliga as animações de fundo. Fixo no canto, para existir também na tela de login. */
export function MotionToggle() {
  const { t } = useTranslation()
  const on = useMotionEnabled()
  const toggle = useMotionStore((s) => s.toggle)
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      title={on ? t('motion.titleOn') : t('motion.titleOff')}
      className="motion-toggle fixed bottom-3 right-3 z-30 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-[#07080c]/80 px-3 py-1 text-xs text-gray-600 backdrop-blur hover:text-gray-900 print:hidden"
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-blue-500' : 'bg-gray-400'}`} />
      {t('motion.label')}
    </button>
  )
}
