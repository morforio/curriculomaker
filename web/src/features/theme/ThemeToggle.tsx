import { useTranslation } from 'react-i18next'
import { IconMoon, IconSun } from '../../components/Icons'
import { useThemeStore } from './themeStore'

/** Chave de alternância entre o modo escuro (lua) e o claro (sol): o botão redondo desliza para o símbolo do modo ativo. */
export function ThemeToggle() {
  const { t } = useTranslation()
  const light = useThemeStore((s) => s.theme === 'light')
  const toggle = useThemeStore((s) => s.toggle)
  const label = light ? t('theme.toDark') : t('theme.toLight')
  return (
    <button
      type="button"
      role="switch"
      aria-checked={light}
      aria-label={label}
      title={label}
      onClick={toggle}
      className="theme-toggle relative inline-flex h-7 w-[54px] shrink-0 items-center justify-between rounded-full border border-gray-300 bg-gray-100 px-[7px] transition-colors duration-200 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <span
        aria-hidden="true"
        className={`absolute top-[2px] h-[22px] w-[22px] rounded-full bg-gradient-to-br from-[#35b6ff] to-[#a77bff] shadow transition-all duration-300 ${light ? 'left-[30px]' : 'left-[2px]'}`}
      />
      <span className={`relative z-10 ${light ? 'text-gray-500' : 'text-[#04101f]'}`}>
        <IconMoon />
      </span>
      <span className={`relative z-10 ${light ? 'text-[#04101f]' : 'text-gray-500'}`}>
        <IconSun />
      </span>
    </button>
  )
}
