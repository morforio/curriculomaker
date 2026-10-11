import { create } from 'zustand'

export type Notice = 'fallback' | 'noCredits' | 'creditsUnavailable' | 'exportError'

/** Avisos curtos ao usuário, vindos do que aconteceu no servidor (aparecem no topo até serem fechados). */
type NoticeState = {
  /** "fallback": o modelo de IA principal falhou e o reserva respondeu. As demais vêm da exportação do PDF. */
  notice: Notice | null
  show: (notice: Notice) => void
  clear: () => void
}

export const useNoticeStore = create<NoticeState>((set) => ({
  notice: null,
  show: (notice) => set({ notice }),
  clear: () => set({ notice: null }),
}))
