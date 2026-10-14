export type Theme = 'dark' | 'light'

/** Chave onde a escolha de tema fica guardada neste navegador. */
export const THEME_KEY = 'currimaker-theme'

/** Cor da barra do navegador (celular) em cada tema. */
export const THEME_COLOR: Record<Theme, string> = { dark: '#07102a', light: '#f3f6fb' }

/** O que está guardado vira um tema; qualquer valor desconhecido (ou nenhum) é o modo escuro, o padrão do site. */
export function parseTheme(raw: string | null | undefined): Theme {
  return raw === 'light' ? 'light' : 'dark'
}
