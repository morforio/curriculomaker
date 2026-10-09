import { create } from 'zustand'
import { parseAccount, type Account } from '../../lib/credits'
import { getSupabase } from '../../lib/supabase'

type State = {
  account: Account | null
  /** Lê o saldo no banco. Se falhar, mantém o último valor conhecido. */
  refresh: () => Promise<void>
  clear: () => void
}

let seq = 0

/** Saldo de créditos da conta logada. O banco é a fonte da verdade: aqui é só uma cópia para mostrar na tela. */
export const useCreditsStore = create<State>((set) => ({
  account: null,

  async refresh() {
    const supabase = getSupabase()
    if (!supabase) return
    const mine = ++seq // só a resposta mais recente vale (duas leituras seguidas podem chegar fora de ordem)
    const { data, error } = await supabase.rpc('get_my_account')
    if (error || mine !== seq) return
    const account = parseAccount(data)
    if (account) set({ account })
  },

  clear() {
    seq++
    set({ account: null })
  },
}))
