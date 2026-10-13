import type { Lang } from '../../lib/i18n'

/** Altura da linha colorida sob a barra superior, em px. A aba ativa a cobre para "abrir" para ela, como numa aba de navegador. */
export const STRIPE_HEIGHT = 3

/**
 * Cores de cada idioma. A linha sob a barra é uma só cor (verde no português, azul no inglês), que some suavemente nas pontas e brilha um pouco.
 * `color` contorna a aba ativa; `line` é o fundo da linha; `glow` é o brilho dela; `capBorder` e `capBg` pintam a aba invertida da legenda.
 */
export const LANG_THEME: Record<Lang, { color: string; line: string; glow: string; capBorder: string; capBg: string }> = {
  pt: {
    color: '#34d399',
    line: 'linear-gradient(90deg, rgba(52,211,153,0) 0%, rgba(52,211,153,0.8) 10%, #34d399 50%, rgba(52,211,153,0.8) 90%, rgba(52,211,153,0) 100%)',
    glow: '0 0 14px rgba(52,211,153,0.45)',
    capBorder: 'rgba(52,211,153,0.55)',
    capBg: 'linear-gradient(180deg, rgba(52,211,153,0.2), rgba(52,211,153,0.04))',
  },
  en: {
    color: '#60a5fa',
    line: 'linear-gradient(90deg, rgba(96,165,250,0) 0%, rgba(96,165,250,0.8) 10%, #60a5fa 50%, rgba(96,165,250,0.8) 90%, rgba(96,165,250,0) 100%)',
    glow: '0 0 14px rgba(96,165,250,0.45)',
    capBorder: 'rgba(96,165,250,0.55)',
    capBg: 'linear-gradient(180deg, rgba(96,165,250,0.2), rgba(96,165,250,0.04))',
  },
}
