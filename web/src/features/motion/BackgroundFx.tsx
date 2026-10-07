import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useMotionEnabled } from './motionStore'

/**
 * Fundo do site: constelação discreta (partículas que se ligam por linhas finas quando ficam perto) e uma luz suave que
 * acompanha o mouse com atraso. Também publica a posição do mouse em --mx e --my (de -1 a 1, suavizada) na raiz da página,
 * que move de leve os blocos flutuantes (.float-block e .float-sheet no CSS). Desligado, desenha um quadro parado.
 */
const ACC = '91,140,255'

// Valores aprovados na maquete "B3, ainda mais sutil".
const LINK = 140 // distância máxima entre partículas ligadas, em px
const LINK_ALPHA = 0.26
const CURSOR_RANGE = 150 // alcance das ligações ao cursor, em px
const CURSOR_ALPHA = 0.17 * 1.1
const CURSOR_LINKS = 2
const SPOT_RADIUS = 380
const SPOT_ALPHA = 0.075
const SPOT_EASE = 0.07
const FOLLOW = 0.03 // quão rápido --mx e --my seguem o mouse, por quadro

type Dot = { x: number; y: number; s: number; a: number; vx: number; vy: number; k: number }

function makeDots(count: number): Dot[] {
  return Array.from({ length: count }, () => ({
    x: Math.random(),
    y: Math.random(),
    s: 1.2 + Math.random() * 1.2,
    a: 0.25 + Math.random() * 0.6,
    vx: (Math.random() - 0.5) * 0.00014,
    vy: (Math.random() - 0.5) * 0.00014,
    k: 8 + Math.random() * 30,
  }))
}

export function BackgroundFx() {
  const ref = useRef<HTMLCanvasElement>(null)
  const enabled = useMotionEnabled()

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const root = document.documentElement

    let w = 0
    let h = 0
    let dots: Dot[] = []
    let raf = 0
    let mx = 0
    let my = 0
    let tx = 0
    let ty = 0
    let px = -9999
    let py = -9999
    let sx = 0
    let sy = 0
    let presence = 0

    function size() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = window.innerWidth
      h = window.innerHeight
      canvas!.width = Math.round(w * dpr)
      canvas!.height = Math.round(h * dpr)
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      // Densidade parecida com a da maquete (58 partículas em 1100 x 560 px).
      const count = Math.min(120, Math.max(36, Math.round((58 * w * h) / (1100 * 560))))
      if (dots.length !== count) dots = makeDots(count)
    }

    function wash(x: number, y: number, r: number, a: number) {
      const g = ctx!.createRadialGradient(x, y, 0, x, y, r)
      g.addColorStop(0, `rgba(${ACC},${a})`)
      g.addColorStop(1, `rgba(${ACC},0)`)
      ctx!.fillStyle = g
      ctx!.fillRect(0, 0, w, h)
    }

    function draw(animate: boolean) {
      if (animate) {
        mx += (tx - mx) * FOLLOW
        my += (ty - my) * FOLLOW
        root.style.setProperty('--mx', mx.toFixed(3))
        root.style.setProperty('--my', my.toFixed(3))
      }
      ctx!.clearRect(0, 0, w, h)
      wash(w * 0.5, h * 0.4, Math.max(w, h) * 0.7, 0.07)

      const inside = animate && px > -9000
      if (inside) {
        if (presence === 0) {
          sx = px
          sy = py
        }
        sx += (px - sx) * SPOT_EASE
        sy += (py - sy) * SPOT_EASE
      }
      presence += ((inside ? 1 : 0) - presence) * 0.05
      if (presence < 0.01) presence = 0
      if (presence > 0) wash(sx, sy, SPOT_RADIUS, SPOT_ALPHA * presence)

      const pts = dots.map((p) => {
        if (animate) {
          p.x += p.vx
          p.y += p.vy
          if (p.x < -0.03) p.x = 1.03
          if (p.x > 1.03) p.x = -0.03
          if (p.y < -0.03) p.y = 1.03
          if (p.y > 1.03) p.y = -0.03
        }
        const x = p.x * w - mx * p.k
        const y = p.y * h - my * p.k
        return { x, y, s: p.s, a: p.a, d: Math.hypot(x - sx, y - sy) }
      })

      ctx!.lineWidth = 0.8
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y)
          if (d < LINK) {
            ctx!.strokeStyle = `rgba(${ACC},${(LINK_ALPHA * (1 - d / LINK)).toFixed(3)})`
            ctx!.beginPath()
            ctx!.moveTo(pts[i].x, pts[i].y)
            ctx!.lineTo(pts[j].x, pts[j].y)
            ctx!.stroke()
          }
        }
      }
      // Ligações ao cursor: só as mais próximas, bem finas e fracas.
      if (presence > 0) {
        pts
          .filter((q) => q.d < CURSOR_RANGE)
          .sort((u, v) => u.d - v.d)
          .slice(0, CURSOR_LINKS)
          .forEach((q) => {
            ctx!.strokeStyle = `rgba(190,210,255,${(CURSOR_ALPHA * (1 - q.d / CURSOR_RANGE) * presence).toFixed(3)})`
            ctx!.lineWidth = 0.7
            ctx!.beginPath()
            ctx!.moveTo(q.x, q.y)
            ctx!.lineTo(sx, sy)
            ctx!.stroke()
          })
      }
      for (const q of pts) {
        const glow = q.d < CURSOR_RANGE ? (1 - q.d / CURSOR_RANGE) * presence : 0
        ctx!.fillStyle = `rgba(176,196,240,${Math.min(1, q.a * 0.5 + glow * 0.16).toFixed(2)})`
        const sz = q.s + glow * 0.7
        ctx!.fillRect(q.x - sz / 2, q.y - sz / 2, sz, sz)
      }
    }

    size()

    function onMove(e: PointerEvent) {
      px = e.clientX
      py = e.clientY
      tx = (px / w - 0.5) * 2
      ty = (py / h - 0.5) * 2
    }
    function onLeave() {
      tx = 0
      ty = 0
      px = -9999
      py = -9999
    }
    function onResize() {
      size()
      if (!enabled) draw(false)
    }

    if (enabled) {
      window.addEventListener('pointermove', onMove)
      root.addEventListener('mouseleave', onLeave)
      window.addEventListener('blur', onLeave)
      const frame = () => {
        if (!document.hidden) draw(true)
        raf = requestAnimationFrame(frame)
      }
      raf = requestAnimationFrame(frame)
    } else {
      root.style.setProperty('--mx', '0')
      root.style.setProperty('--my', '0')
      draw(false)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      root.removeEventListener('mouseleave', onLeave)
      window.removeEventListener('blur', onLeave)
      window.removeEventListener('resize', onResize)
      root.style.setProperty('--mx', '0')
      root.style.setProperty('--my', '0')
    }
  }, [enabled])

  return createPortal(<canvas ref={ref} className="fx-bg" aria-hidden="true" />, document.body)
}
