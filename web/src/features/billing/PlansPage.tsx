import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDate } from '../../lib/credits'
import { formatCpf, FREE_CREDITS, FREE_DAYS, isValidCpf, PRO_CREDITS, PRO_PRICE_BRL } from '../../lib/plans'
import { AccountBar } from '../auth/AccountBar'
import { useCreditsStore } from '../credits/creditsStore'
import { ApiError } from '../job-match/api'
import { cancelSubscription, startCheckout } from './api'

const card = 'glass flex flex-col rounded-lg p-5'
// Dourado do plano pro (cor fixa, fora do tema): borda e etiqueta de destaque.
const GOLD = '#d4af37'
const bullet = 'flex gap-2 text-sm text-gray-700 before:text-blue-300 before:content-["✔"]'
const input = 'w-full rounded border border-gray-300 bg-white/5 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'

/**
 * Página /planos: compara o plano gratuito com o pro e leva ao pagamento (fatura do Asaas).
 * Só em português (pt-BR): a aba de inglês do currículo serve para traduzir o conteúdo do currículo, não a interface de venda.
 */
export function PlansPage() {
  const { i18n } = useTranslation()
  const t = useMemo(() => i18n.getFixedT('pt'), [i18n])
  const account = useCreditsStore((s) => s.account)
  const [formOpen, setFormOpen] = useState(false)
  const [name, setName] = useState('')
  const [cpf, setCpf] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  // O resto da tela (menu da conta) também fica em português aqui; o editor volta ao idioma da aba ao abrir. O saldo é lido pelo AccountBar.
  useEffect(() => {
    void i18n.changeLanguage('pt')
    document.documentElement.lang = 'pt-BR'
  }, [i18n])
  useEffect(() => {
    document.title = `${t('app.name')} - ${t('plans.title')}`
  }, [t])

  const paid = account?.paid === true
  const price = PRO_PRICE_BRL.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  async function subscribe(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (name.trim().length < 3) return setError(t('plans.err.invalid_name'))
    if (!isValidCpf(cpf)) return setError(t('plans.err.invalid_cpf'))
    if (!agreed) return setError('Marque que leu e concorda com os Termos de uso e a Política de privacidade.')
    setBusy(true)
    try {
      window.location.assign(await startCheckout(name.trim(), cpf)) // vai para a fatura do Asaas
    } catch (err) {
      setError(t(`plans.err.${err instanceof ApiError ? err.code : 'network'}`, { defaultValue: t('plans.err.payment_unavailable') }))
      setBusy(false)
    }
  }

  async function cancel() {
    if (!window.confirm(t('plans.cancelConfirm'))) return
    setError(null)
    setBusy(true)
    try {
      await cancelSubscription()
      setInfo(t('plans.canceled', { date: account?.paid_until ? formatDate(account.paid_until, 'pt-BR') : '' }))
    } catch (err) {
      setError(t(`plans.err.${err instanceof ApiError ? err.code : 'network'}`, { defaultValue: t('plans.err.payment_unavailable') }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto min-h-screen max-w-4xl px-4 pb-16">
      <header className="flex items-center justify-between gap-3 py-4">
        <a href="/" className="text-sm text-blue-300 hover:underline">
          ← {t('plans.back')}
        </a>
        <AccountBar />
      </header>

      <h1 className="text-2xl font-bold text-gray-900">{t('plans.title')}</h1>
      <p className="mt-1 text-sm text-gray-600">{t('plans.subtitle')}</p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <section className={`${card} border ${account && !paid ? 'border-blue-400/60' : 'border-gray-200'}`} aria-labelledby="plan-free">
          <div className="flex items-center justify-between">
            <h2 id="plan-free" className="text-lg font-semibold text-gray-900">
              {t('plans.free.name')}
            </h2>
            {account && !paid && <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs text-blue-300">{t('plans.current')}</span>}
          </div>
          <p className="mt-2 text-3xl font-bold text-gray-900">{(0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
          <ul className="mt-4 space-y-2">
            <li className={bullet}>{t('plans.free.credits', { count: FREE_CREDITS, days: FREE_DAYS })}</li>
            <li className={bullet}>{t('plans.free.cost')}</li>
            <li className={bullet}>{t('plans.free.locked')}</li>
          </ul>
        </section>

        <section className={`${card} relative border-2`} style={{ borderColor: GOLD, boxShadow: `0 0 28px -8px ${GOLD}` }} aria-labelledby="plan-pro">
          <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-0.5 text-xs font-bold text-[#1a1405]" style={{ background: GOLD }}>
            {t('plans.pro.badge')}
          </span>
          <div className="flex items-center justify-between">
            <h2 id="plan-pro" className="text-lg font-semibold text-gray-900">
              {t('plans.pro.name')}
            </h2>
            {paid && <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs text-blue-300">{t('plans.current')}</span>}
          </div>
          <p className="mt-2 text-3xl font-bold text-gray-900">
            {price} <span className="text-sm font-normal text-gray-600">{t('plans.perMonth')}</span>
          </p>
          <ul className="mt-4 space-y-2">
            <li className={bullet}>{t('plans.pro.credits', { count: PRO_CREDITS })}</li>
            <li className={bullet}>{t('plans.pro.export')}</li>
            <li className={bullet}>{t('plans.pro.unlocked')}</li>
            <li className={bullet}>{t('plans.pro.methods')}</li>
            <li className={bullet}>{t('plans.pro.cancel')}</li>
          </ul>

          <div className="mt-5">
            {paid ? (
              <div className="space-y-2">
                {account?.paid_until && <p className="text-sm text-gray-700">{t('plans.activeUntil', { date: formatDate(account.paid_until, 'pt-BR') })}</p>}
                <button type="button" disabled={busy} onClick={() => void cancel()} className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-white/10 disabled:opacity-50">
                  {t('plans.cancelButton')}
                </button>
              </div>
            ) : !formOpen ? (
              <button type="button" onClick={() => setFormOpen(true)} className="w-full rounded btn-prism px-4 py-2 text-sm font-medium">
                {t('plans.subscribe')}
              </button>
            ) : (
              <form onSubmit={(e) => void subscribe(e)} className="space-y-3">
                <label className="block">
                  <span className="mb-0.5 block text-xs font-medium text-gray-600">{t('plans.form.name')}</span>
                  <input className={input} autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-0.5 block text-xs font-medium text-gray-600">{t('plans.form.cpf')}</span>
                  <input className={input} inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" required value={cpf} onChange={(e) => setCpf(formatCpf(e.target.value))} />
                </label>
                <p className="text-xs text-gray-500">{t('plans.form.privacy')}</p>
                <label className="flex items-start gap-2 text-xs text-gray-600">
                  <input type="checkbox" className="mt-0.5" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                  <span>
                    Li e concordo com os{' '}
                    <a href="/termos" target="_blank" rel="noopener" className="text-blue-300 hover:underline">
                      Termos de uso
                    </a>{' '}
                    (incluindo o reembolso em até 7 dias) e a{' '}
                    <a href="/privacidade" target="_blank" rel="noopener" className="text-blue-300 hover:underline">
                      Política de privacidade
                    </a>
                    .
                  </span>
                </label>
                <button type="submit" disabled={busy || !agreed} className="w-full rounded btn-prism px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50">
                  {busy ? t('plans.form.wait') : t('plans.form.submit')}
                </button>
              </form>
            )}
            {error && (
              <p role="alert" className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
                {error}
              </p>
            )}
            {info && (
              <p role="status" className="mt-3 rounded border border-blue-200 bg-blue-50 p-2 text-sm text-blue-300">
                {info}
              </p>
            )}
          </div>
        </section>
      </div>

      <p className="mt-6 text-xs text-gray-500">{t('plans.afterPay')}</p>
      <p className="mt-2 text-xs text-gray-500">
        <a href="/termos" className="text-blue-300 hover:underline">
          Termos de uso
        </a>{' '}
        ·{' '}
        <a href="/privacidade" className="text-blue-300 hover:underline">
          Política de privacidade
        </a>
      </p>
    </div>
  )
}
