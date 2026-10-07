import { useEffect } from 'react'
import { dataToRows, remoteToData } from '../../lib/sync'
import { getSupabase } from '../../lib/supabase'
import { useResumeStore } from '../../store/resumeStore'
import { useAuthStore } from '../auth/authStore'
import { syncControl, useSyncStatus } from './syncStatus'

/**
 * Mantém o currículo da conta (tabela `resumes`) e o do editor iguais:
 * ao entrar, carrega o currículo da conta (conta sem currículo começa em branco; o que havia no navegador nunca é aproveitado);
 * depois grava sozinho 1 s depois da última alteração. Sem login configurado, não faz nada.
 */
export function useResumeSync() {
  const userId = useAuthStore((s) => s.userId)

  useEffect(() => {
    const supabase = getSupabase()
    if (!userId || !supabase) return
    const setStatus = useSyncStatus.getState().set

    let alive = true
    let ready = false // só grava depois de carregar a conta: nunca por cima de dados que ainda não vimos
    let dirty = false
    let version = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let queue: Promise<void> = Promise.resolve()

    const snapshot = () => {
      const s = useResumeStore.getState()
      return { lang: s.lang, resume: s.resume, saved: s.saved }
    }

    // Uma gravação por vez, na ordem, para uma antiga não sobrescrever uma mais nova.
    const save = () => {
      queue = queue.then(async () => {
        if (!ready) return
        const startedAt = version
        setStatus('saving')
        const { error } = await supabase.from('resumes').upsert(dataToRows(userId, snapshot()), { onConflict: 'user_id,lang' })
        if (error) {
          console.error(`Falha ao salvar o currículo: ${error.message}`)
          if (alive) setStatus('saveError')
          return
        }
        if (version === startedAt) dirty = false
        if (alive) setStatus('saved')
      })
      return queue
    }

    const flush = async () => {
      clearTimeout(timer)
      if (dirty) await save()
    }
    syncControl.flush = flush

    const unsubscribe = useResumeStore.subscribe((s, prev) => {
      if (!ready || (s.resume === prev.resume && s.saved === prev.saved && s.lang === prev.lang)) return
      dirty = true
      version++
      setStatus('saving')
      clearTimeout(timer)
      timer = setTimeout(() => void save(), 1000)
    })

    // O navegador pode fechar a aba logo depois de uma alteração: grava ao esconder a página.
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush()
    }
    document.addEventListener('visibilitychange', onHide)

    void (async () => {
      setStatus('loading')
      const { data, error } = await supabase.from('resumes').select('lang, content')
      if (!alive) return
      if (error) {
        console.error(`Falha ao carregar o currículo: ${error.message}`)
        setStatus('loadError')
        return
      }
      // A conta é a fonte da verdade: com currículo, carrega; sem, começa em branco (o do navegador é descartado).
      useResumeStore.getState().hydrate(remoteToData(data ?? [], useResumeStore.getState().lang) ?? undefined)
      ready = true
      setStatus('saved')
    })()

    return () => {
      alive = false
      ready = false
      clearTimeout(timer)
      unsubscribe()
      document.removeEventListener('visibilitychange', onHide)
      syncControl.flush = async () => {}
      setStatus('idle')
    }
  }, [userId])
}
