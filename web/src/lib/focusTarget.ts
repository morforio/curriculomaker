/**
 * Qual elemento do currículo na tela corresponde a uma chave do editor. A chave vai de específica para geral
 * ("abc:1#2" > "abc:1" > "abc"): se o trecho exato não existe na prévia (linha de texto livre, por exemplo), usa o item e depois o bloco.
 */
export function focusKeyChain(key: string): string[] {
  const chain = [key]
  const hash = key.indexOf('#')
  if (hash >= 0) chain.push(key.slice(0, hash))
  const colon = key.indexOf(':')
  if (colon >= 0) chain.push(key.slice(0, colon))
  return [...new Set(chain)]
}

/**
 * Posição de rolagem que alinha o centro de um trecho (`snippetCenter`, na altura total do conteúdo) com a posição de tela do campo
 * (`wantedCenter`, medida a partir do topo da área visível). O resultado nunca passa dos limites da rolagem. Trecho mais alto que a
 * área visível: alinha o topo dele com o topo da área.
 */
export function targetScrollTop(opts: {
  snippetCenter: number
  snippetHeight: number
  wantedCenter: number
  viewHeight: number
  contentHeight: number
  pad?: number
}): number {
  const { snippetCenter, snippetHeight, viewHeight, contentHeight } = opts
  const pad = opts.pad ?? 8
  const max = Math.max(0, contentHeight - viewHeight)
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
  if (snippetHeight + 2 * pad >= viewHeight) return clamp(snippetCenter - snippetHeight / 2 - pad, 0, max)
  // O trecho inteiro cabe: o centro dele fica onde o campo está, mas sem sair da área visível.
  const half = snippetHeight / 2 + pad
  const center = clamp(opts.wantedCenter, half, viewHeight - half)
  return clamp(snippetCenter - center, 0, max)
}

/**
 * Duração do deslize da prévia, em ms, para uma distância em px: curta e crescente (velocidade "muito rápida" escolhida em demonstração):
 * 180 ms + 0,3 ms por px, entre 250 ms e 450 ms.
 */
export function scrollDuration(distance: number): number {
  return Math.min(450, Math.max(250, 180 + distance * 0.3))
}

/** Ritmo do deslize: ease-in-out senoidal (começa e termina devagar, sem arranque brusco). `p` vai de 0 a 1. */
export function scrollEase(p: number): number {
  const x = Math.min(1, Math.max(0, p))
  return 0.5 - Math.cos(Math.PI * x) / 2
}
