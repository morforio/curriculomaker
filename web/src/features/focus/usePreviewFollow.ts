import { useEffect, type RefObject } from 'react'
import { focusKeyChain, scrollDuration, scrollEase, targetScrollTop } from '../../lib/focusTarget'
import { useMotionStore } from '../motion/motionStore'

/**
 * A prévia acompanha o que está sendo editado: quando um campo do editor (à esquerda) ganha o foco ou recebe texto, o currículo desliza
 * (rolagem animada da janela da prévia) até que o trecho correspondente fique na altura do campo, sem passar dos limites. O trecho em edição
 * fica marcado (classe "mark", estilo em index.css) durante todo o tempo em que o campo está em uso.
 *
 * Só reage a foco e digitação: rolar a prévia ou a página continua funcionando normalmente, e a prévia não "volta" sozinha. Qualquer toque
 * na rolagem da prévia (roda do mouse, toque, tecla ou barra) interrompe a animação na hora. Só vale com as duas colunas lado a lado.
 * Enquanto desliza, uma régua fina na lateral (`rail`) mostra a posição do currículo.
 */
export function usePreviewFollow(scrollRef: RefObject<HTMLElement | null>, railRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const scroller = scrollRef.current
    const rail = railRef.current
    if (!scroller) return
    const box: HTMLElement = scroller
    const wide = window.matchMedia('(min-width: 1024px)')
    let raf = 0
    let anim = 0
    let hideRail = 0
    let field: HTMLElement | null = null
    let marked: HTMLElement | null = null

    function clearMark() {
      for (const el of box.querySelectorAll('.mark')) el.classList.remove('mark')
      marked = null
    }

    function drawRail() {
      const thumb = rail?.firstElementChild as HTMLElement | null
      if (!rail || !thumb) return
      const h = rail.clientHeight
      const size = Math.max(28, (h * box.clientHeight) / Math.max(1, box.scrollHeight))
      thumb.style.height = `${size}px`
      thumb.style.top = `${(h - size) * (box.scrollTop / Math.max(1, box.scrollHeight - box.clientHeight))}px`
    }

    function showRail(on: boolean) {
      if (!rail) return
      clearTimeout(hideRail)
      if (on) rail.classList.add('opacity-100')
      else hideRail = window.setTimeout(() => rail.classList.remove('opacity-100'), 700)
    }

    /**
     * Rolagem animada: ease-in-out senoidal (começa e termina devagar) e duração curta que cresce com a distância (de 0,25 s a 0,45 s).
     * Só vai direto para o lugar se a pessoa desligou as animações no botão do site; a opção "reduzir movimento" do sistema não vale aqui,
     * porque o deslize é o que faz a pessoa entender que o currículo andou até o trecho.
     */
    function animateTo(to: number) {
      cancelAnimationFrame(anim)
      const from = box.scrollTop
      const delta = to - from
      if (Math.abs(delta) < 1) return
      if (useMotionStore.getState().pref === 'off') {
        box.scrollTop = to
        return
      }
      const dur = scrollDuration(Math.abs(delta))
      const t0 = performance.now()
      drawRail()
      showRail(true)
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / dur)
        box.scrollTop = from + delta * scrollEase(p)
        drawRail()
        if (p < 1) anim = requestAnimationFrame(step)
        else showRail(false)
      }
      anim = requestAnimationFrame(step)
    }

    function stopAnimation() {
      cancelAnimationFrame(anim)
      showRail(false)
    }

    function follow() {
      raf = 0
      if (!wide.matches || !field?.isConnected) return
      const anchor = field.closest<HTMLElement>('[data-focus-key]')
      const key = anchor?.dataset.focusKey
      if (!key) return

      // O trecho aparece uma vez em cada página (cada folha mostra só a sua janela): vale a cópia que está visível na própria janela.
      let snippet: HTMLElement | null = null
      let best = -1
      for (const k of focusKeyChain(key)) {
        for (const el of box.querySelectorAll<HTMLElement>(`[data-focus-key="${CSS.escape(k)}"]`)) {
          const win = el.closest<HTMLElement>('[data-sheet-window]')?.getBoundingClientRect()
          const r = el.getBoundingClientRect()
          const visible = win ? Math.min(r.bottom, win.bottom) - Math.max(r.top, win.top) : r.height
          if (visible > best) {
            best = visible
            snippet = el
          }
        }
        if (snippet && best > 0) break
        snippet = null
        best = -1
      }
      if (!snippet) return

      // Marca o trecho em edição (e só ele) enquanto o campo está em uso.
      if (marked !== snippet || !snippet.classList.contains('mark')) {
        clearMark()
        snippet.classList.add('mark')
        marked = snippet
      }

      const view = box.getBoundingClientRect()
      const r = snippet.getBoundingClientRect()
      const win = snippet.closest<HTMLElement>('[data-sheet-window]')?.getBoundingClientRect()
      const top = Math.max(r.top, win?.top ?? r.top)
      const bottom = Math.min(r.bottom, win?.bottom ?? r.bottom)
      const f = field.getBoundingClientRect()
      animateTo(
        targetScrollTop({
          snippetCenter: (top + bottom) / 2 - view.top + box.scrollTop,
          snippetHeight: bottom - top,
          wantedCenter: (f.top + f.bottom) / 2 - view.top,
          viewHeight: box.clientHeight,
          contentHeight: box.scrollHeight,
        }),
      )
    }

    function schedule(e: Event) {
      const t = e.target
      if (!(t instanceof HTMLElement) || box.contains(t)) return
      if (!t.closest('[data-focus-key]')) return
      field = t
      if (!raf) raf = requestAnimationFrame(follow)
    }

    // Saiu do campo para fora dos blocos do editor: o trecho deixa de estar em edição.
    function leave(e: FocusEvent) {
      const next = e.relatedTarget
      if (next instanceof HTMLElement && !box.contains(next) && next.closest('[data-focus-key]')) return
      clearMark()
    }

    document.addEventListener('focusin', schedule)
    document.addEventListener('input', schedule)
    document.addEventListener('focusout', leave)
    const mine = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const
    for (const ev of mine) box.addEventListener(ev, stopAnimation, { passive: true })
    return () => {
      document.removeEventListener('focusin', schedule)
      document.removeEventListener('input', schedule)
      document.removeEventListener('focusout', leave)
      for (const ev of mine) box.removeEventListener(ev, stopAnimation)
      if (raf) cancelAnimationFrame(raf)
      cancelAnimationFrame(anim)
      clearTimeout(hideRail)
    }
  }, [scrollRef, railRef])
}
