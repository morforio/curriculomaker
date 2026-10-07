import { create } from 'zustand'

/** Avisos curtos ao usuário, vindos do que aconteceu no servidor (aparecem no topo até serem fechados). */
type NoticeState = {
  /** "fallback": o modelo de IA principal falhou e o reserva respondeu. */
  notice: 'fallback' | null
  show: (notice: 'fallback') => void
  clear: () => void
}

export const useNoticeStore = create<NoticeState>((set) => ({
  notice: null,
  show: (notice) => set({ notice }),
  clear: () => set({ notice: null }),
}))
