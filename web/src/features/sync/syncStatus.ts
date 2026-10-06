import { create } from 'zustand'

/** Estado do salvamento do currículo na conta, mostrado no topo da tela. */
export type SyncState = 'idle' | 'loading' | 'loadError' | 'saving' | 'saved' | 'saveError'

export const useSyncStatus = create<{ status: SyncState; set: (status: SyncState) => void }>((set) => ({
  status: 'idle',
  set: (status) => set({ status }),
}))

/** Ponto de ligação: o hook de sincronização registra aqui como gravar na hora (usado antes de sair da conta). */
export const syncControl: { flush: () => Promise<void> } = { flush: async () => {} }
