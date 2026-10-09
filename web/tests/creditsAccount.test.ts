import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseAccount } from '../src/lib/credits.ts'

/** Leitura do saldo que o banco devolve em get_my_account() (src/lib/credits.ts). */

const row = { plan: 'free', paid: false, credits: 5, locked: false, credits_expire_at: '2026-11-07T12:00:00Z', paid_until: null, server_now: '2026-10-08T12:00:00Z' }

test('parseAccount: conta gratuita com créditos', () => {
  assert.deepEqual(parseAccount(row), { plan: 'free', paid: false, credits: 5, locked: false, credits_expire_at: '2026-11-07T12:00:00Z', paid_until: null })
})

test('parseAccount: conta paga e conta travada', () => {
  const paid = parseAccount({ ...row, plan: 'paid', paid: true, credits: 60, paid_until: '2026-11-08T12:00:00Z' })
  assert.equal(paid?.paid, true)
  assert.equal(paid?.credits, 60)
  const locked = parseAccount({ ...row, credits: 0, locked: true })
  assert.equal(locked?.locked, true)
  assert.equal(locked?.credits, 0)
})

test('parseAccount: resposta fora do formato vira null (o contador some em vez de mostrar lixo)', () => {
  for (const bad of [null, undefined, 'x', 7, {}, { ...row, plan: 'gold' }, { ...row, credits: -1 }, { ...row, credits: 1.5 }, { ...row, credits: '5' }, { ...row, locked: 'no' }]) {
    assert.equal(parseAccount(bad), null, JSON.stringify(bad))
  }
})

test('parseAccount: data inválida vira null, sem derrubar o resto', () => {
  assert.equal(parseAccount({ ...row, credits_expire_at: 'ontem' })?.credits_expire_at, null)
})
