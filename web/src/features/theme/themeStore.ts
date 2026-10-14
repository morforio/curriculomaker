import { create } from 'zustand'
import { parseTheme, THEME_COLOR, THEME_KEY, type Theme } from '../../lib/theme'

/**
 * Tema do site (escuro ou claro). A escolha fica guardada neste navegador. O tema vale por um atributo na raiz da página
 * (html[data-theme]), que o index.css usa para trocar as cores; por isso é aplicado já ao carregar este arquivo, antes de a tela aparecer.
 */
function read(): Theme {
  try {
    return parseTheme(localStorage.getItem(THEME_KEY))
  } catch {
    return 'dark'
  }
}

function apply(theme: Theme) {
  const root = document.documentElement
  root.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme])
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', theme)
}

type ThemeState = { theme: Theme; toggle: () => void }

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: read(),
  toggle: () => {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark'
    try {
      localStorage.setItem(THEME_KEY, next)
    } catch {
      // Sem armazenamento: vale só nesta visita.
    }
    apply(next)
    set({ theme: next })
  },
}))

apply(useThemeStore.getState().theme)
