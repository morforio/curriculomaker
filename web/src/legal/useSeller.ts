import { useEffect, useState } from 'react'
import { parseSeller, type Seller } from '../lib/seller.ts'

/** Busca os dados do fornecedor em /api/seller. 'loading' enquanto carrega; 'unavailable' se o Worker não os tem ou a rede falhou. */
export type SellerState = { status: 'loading' } | { status: 'unavailable' } | { status: 'ready'; seller: Seller }

export function useSeller(): SellerState {
  const [state, setState] = useState<SellerState>({ status: 'loading' })

  useEffect(() => {
    let alive = true
    fetch('/api/seller')
      .then(async (res) => {
        const seller = res.ok ? parseSeller(((await res.json()) as { seller?: unknown }).seller) : null
        if (alive) setState(seller ? { status: 'ready', seller } : { status: 'unavailable' })
      })
      .catch(() => alive && setState({ status: 'unavailable' }))
    return () => {
      alive = false
    }
  }, [])

  return state
}
