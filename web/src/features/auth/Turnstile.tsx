import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

/** Parte da API do Turnstile (captcha da Cloudflare) que usamos. */
type TurnstileApi = {
  render: (
    el: HTMLElement,
    options: {
      sitekey: string
      theme: 'dark'
      callback: (token: string) => void
      'expired-callback': () => void
      'error-callback': () => void
    },
  ) => string
  reset: (id: string) => void
  remove: (id: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let scriptPromise: Promise<TurnstileApi> | null = null

function loadScript(): Promise<TurnstileApi> {
  scriptPromise ??= new Promise<TurnstileApi>((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile)
    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile ausente')))
    script.onerror = () => reject(new Error('falha ao carregar o Turnstile'))
    document.head.appendChild(script)
  }).catch((e) => {
    scriptPromise = null // permite tentar de novo
    throw e
  })
  return scriptPromise
}

export type TurnstileHandle = { reset: () => void }

/**
 * Captcha do login. `onToken` recebe o código quando a pessoa passa na checagem e null quando ele expira.
 * Cada código vale para um único login: depois de cada tentativa, o pai chama `reset()` para gerar outro.
 */
export const Turnstile = forwardRef<TurnstileHandle, { siteKey: string; onToken: (token: string | null) => void }>(function Turnstile({ siteKey, onToken }, ref) {
  const { t } = useTranslation()
  const box = useRef<HTMLDivElement>(null)
  const widget = useRef<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const notify = useRef(onToken)
  useEffect(() => {
    notify.current = onToken
  })

  useImperativeHandle(ref, () => ({
    reset() {
      notify.current(null)
      if (widget.current && window.turnstile) window.turnstile.reset(widget.current)
    },
  }))

  useEffect(() => {
    let cancelled = false
    loadScript()
      .then((api) => {
        if (cancelled || !box.current) return
        widget.current = api.render(box.current, {
          sitekey: siteKey,
          theme: 'dark',
          callback: (token) => notify.current(token),
          'expired-callback': () => notify.current(null),
          'error-callback': () => {
            notify.current(null)
            setFailed(true)
          },
        })
      })
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current)
      widget.current = null
    }
  }, [siteKey, attempt])

  return (
    <div>
      <div ref={box} />
      {failed && (
        <p role="alert" className="mt-1 text-xs text-red-700">
          {t('auth.captchaLoadError')}{' '}
          <button type="button" className="text-blue-300 hover:underline" onClick={() => {
              setFailed(false)
              setAttempt((n) => n + 1)
            }}>
            {t('auth.retry')}
          </button>
        </p>
      )}
    </div>
  )
})
