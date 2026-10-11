import { useEffect } from 'react'
import { isPrintShortcut, printDecision } from '../../lib/credits'
import { useAuthStore } from '../auth/authStore'
import { authHeaders } from '../auth/token'
import { useCreditsStore } from '../credits/creditsStore'
import { useNoticeStore } from '../notice/noticeStore'

/**
 * Exportar o PDF é imprimir a página. Para a conta gratuita isso gasta 1 crédito (o servidor cobra em /api/export; conta paga não gasta).
 * O botão Exportar PDF e o atalho Ctrl+P passam pelo servidor antes de imprimir. Outros caminhos que o site não controla (menu do navegador)
 * são pegos pelo evento de impressão: conta travada imprime borrada; conta gratuita é cobrada no mesmo instante.
 * Isto é uma trava de interface (quem sabe contornar, contorna); a IA e a tradução, essas sim, são cobradas de verdade no servidor.
 */

type ExportResult = 'ok' | 'no_credits' | 'unavailable' | 'error'

// A impressão em curso foi liberada pelo servidor: o evento de impressão não precisa cobrar nem borrar.
let authorized = false
let busy = false

async function requestExport(): Promise<ExportResult> {
  let res: Response
  try {
    res = await fetch('/api/export', { method: 'POST', headers: await authHeaders() })
  } catch {
    return 'error'
  }
  void useCreditsStore.getState().refresh() // o saldo mudou (ou não, na conta paga)
  if (res.ok) return 'ok'
  const body = (await res.json().catch(() => null)) as { error?: string } | null
  if (res.status === 402 || body?.error === 'no_credits') return 'no_credits'
  if (res.status === 503 || body?.error === 'credits_unavailable') return 'unavailable'
  return 'error'
}

function printNow() {
  authorized = true
  // Se o navegador não avisar o fim da impressão, a liberação expira sozinha.
  setTimeout(() => {
    authorized = false
  }, 30_000)
  window.print()
}

/** Botão Exportar PDF (e Ctrl+P): cobra no servidor e só então imprime. */
export async function exportPdf(): Promise<void> {
  if (useAuthStore.getState().status !== 'signedIn') return window.print() // sem login (teste local): sem cobrança
  if (busy) return
  const notice = useNoticeStore.getState()
  if (useCreditsStore.getState().account?.locked) return notice.show('noCredits')
  busy = true
  try {
    const result = await requestExport()
    if (result === 'ok') {
      notice.clear()
      printNow()
    } else notice.show(result === 'no_credits' ? 'noCredits' : result === 'unavailable' ? 'creditsUnavailable' : 'exportError')
  } finally {
    busy = false
  }
}

/** Liga Ctrl+P ao fluxo do servidor e trata a impressão que começa por outro caminho. Usar uma vez, no App. */
export function usePrintGuard() {
  useEffect(() => {
    const root = document.documentElement
    const signedIn = () => useAuthStore.getState().status === 'signedIn'

    const onKey = (e: KeyboardEvent) => {
      if (!isPrintShortcut(e) || !signedIn()) return
      const account = useCreditsStore.getState().account
      // Sem saldo conhecido ou conta travada: deixa abrir; a impressão sai borrada (onBeforePrint).
      if (!account || account.locked) return
      e.preventDefault()
      void exportPdf()
    }

    const onBeforePrint = () => {
      if (authorized || !signedIn()) return
      const decision = printDecision(useCreditsStore.getState().account)
      if (decision === 'blur') root.classList.add('print-blur')
      else if (decision === 'charge') void requestExport()
    }

    const onAfterPrint = () => {
      authorized = false
      root.classList.remove('print-blur')
    }

    document.addEventListener('keydown', onKey)
    window.addEventListener('beforeprint', onBeforePrint)
    window.addEventListener('afterprint', onAfterPrint)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('beforeprint', onBeforePrint)
      window.removeEventListener('afterprint', onAfterPrint)
    }
  }, [])
}
