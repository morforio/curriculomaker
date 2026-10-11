import { useAuthStore } from '../auth/authStore'
import { useCreditsStore } from './creditsStore'

/**
 * Conta travada: logada, não paga e sem crédito válido. Só nesse caso as travas de tela valem (reordenar, adicionar e apagar
 * blocos, importar PDF, trocar de idioma, IA e exportar). Sem login configurado (teste local) ou com o saldo ainda sem carregar, nada trava:
 * quem cobra de verdade é o servidor.
 */
export function useLocked(): boolean {
  const signedIn = useAuthStore((s) => s.status === 'signedIn')
  const locked = useCreditsStore((s) => s.account?.locked ?? false)
  return signedIn && locked
}
