import type { Lang } from '../../lib/i18n'

/** Altura da faixa colorida sob a barra superior, em px. A aba ativa a cobre para "abrir" para ela, como numa aba de navegador. */
export const STRIPE_HEIGHT = 6

/**
 * Cores de cada idioma: `color` contorna a aba ativa; `stripe` é o fundo da faixa.
 * Português: verde com detalhes azuis tracejados. English: azul, branco e vermelho.
 */
export const LANG_THEME: Record<Lang, { color: string; stripe: string }> = {
  pt: {
    color: '#15803d',
    stripe: 'repeating-linear-gradient(90deg, #2563eb 0 14px, transparent 14px 28px) left bottom / 100% 2px no-repeat, linear-gradient(#16a34a, #16a34a) left top / 100% 4px no-repeat',
  },
  en: {
    color: '#1d4ed8',
    stripe: 'linear-gradient(to bottom, #1d4ed8 0 2px, #ffffff 2px 4px, #dc2626 4px 6px)',
  },
}
