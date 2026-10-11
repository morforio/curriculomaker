import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isPrintShortcut, printDecision, type Account } from '../src/lib/credits.ts'

/** Regras da impressão por conta (src/lib/credits.ts): o que fazer quando o site não controla o caminho da impressão. */

const account = (patch: Partial<Account>): Account => ({ plan: 'free', paid: false, credits: 3, locked: false, credits_expire_at: '2026-11-07T00:00:00Z', paid_until: null, ...patch })

test('printDecision: conta gratuita com crédito é cobrada (1 crédito) e imprime', () => {
  assert.equal(printDecision(account({})), 'charge')
})

test('printDecision: conta paga imprime sem cobrança', () => {
  assert.equal(printDecision(account({ plan: 'paid', paid: true, credits: 60, paid_until: '2026-11-08T00:00:00Z' })), 'allow')
})

test('printDecision: conta travada (sem crédito válido) imprime borrada', () => {
  assert.equal(printDecision(account({ credits: 0, locked: true })), 'blur')
})

test('printDecision: saldo desconhecido falha fechado: borra', () => {
  assert.equal(printDecision(null), 'blur')
})

test('isPrintShortcut: Ctrl+P e Cmd+P (com ou sem Shift, maiúscula ou minúscula) são o atalho de imprimir', () => {
  const key = (k: string, ctrlKey: boolean, metaKey = false, altKey = false) => isPrintShortcut({ key: k, ctrlKey, metaKey, altKey })
  assert.ok(key('p', true))
  assert.ok(key('P', true))
  assert.ok(key('p', false, true))
})

test('isPrintShortcut: P sozinho, outra tecla ou Alt junto não são o atalho', () => {
  const key = (k: string, ctrlKey: boolean, metaKey = false, altKey = false) => isPrintShortcut({ key: k, ctrlKey, metaKey, altKey })
  assert.ok(!key('p', false))
  assert.ok(!key('s', true))
  assert.ok(!key('p', true, false, true))
})
