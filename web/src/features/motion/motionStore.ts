import { create } from 'zustand'

/**
 * Animações de fundo (e o leve movimento dos blocos). Seguem a configuração "reduzir movimento" do sistema,
 * a menos que a pessoa use o botão: a escolha dela vale mais e fica guardada neste navegador.
 */
const KEY = 'currimaker-motion'

type Pref = 'on' | 'off' | null

function readPref(): Pref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'on' || v === 'off' ? v : null
  } catch {
    return null
  }
}

const query = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null

type MotionState = {
  /** Escolha feita no botão; null = seguir o sistema. */
  pref: Pref
  /** O sistema pede menos movimento. */
  systemReduce: boolean
  toggle: () => void
}

export const motionEnabled = (s: Pick<MotionState, 'pref' | 'systemReduce'>) => (s.pref ? s.pref === 'on' : !s.systemReduce)

export const useMotionStore = create<MotionState>((set, get) => ({
  pref: readPref(),
  systemReduce: query?.matches ?? false,
  toggle: () => {
    const next: Pref = motionEnabled(get()) ? 'off' : 'on'
    try {
      localStorage.setItem(KEY, next)
    } catch {
      // Sem armazenamento: vale só nesta visita.
    }
    set({ pref: next })
  },
}))

query?.addEventListener('change', (e) => useMotionStore.setState({ systemReduce: e.matches }))

export const useMotionEnabled = () => useMotionStore(motionEnabled)
