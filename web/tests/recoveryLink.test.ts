import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseAuthLink } from '../src/features/auth/recoveryLink.ts'

/** Leitura do link do e-mail de "Esqueci minha senha" (src/features/auth/recoveryLink.ts). */

test('link bom de recuperação (com token e type=recovery) é reconhecido', () => {
  assert.deepEqual(parseAuthLink('#access_token=abc.def.ghi&expires_in=3600&refresh_token=xyz&token_type=bearer&type=recovery'), { kind: 'recovery' })
})

test('link expirado ou já usado (error no endereço) vira "error"', () => {
  assert.deepEqual(parseAuthLink('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'), { kind: 'error' })
  assert.deepEqual(parseAuthLink('#error_code=otp_expired'), { kind: 'error' })
})

test('recuperação sem token não vale (não abre a tela de nova senha só por escrever type=recovery)', () => {
  assert.equal(parseAuthLink('#type=recovery'), null)
  assert.equal(parseAuthLink('#access_token=&type=recovery'), null)
})

test('endereço comum, outros tipos de link e vazio não são recuperação', () => {
  assert.equal(parseAuthLink(''), null)
  assert.equal(parseAuthLink('#'), null)
  assert.equal(parseAuthLink('#plano-pro'), null)
  assert.equal(parseAuthLink('#access_token=abc&type=signup'), null)
  assert.equal(parseAuthLink('#access_token=abc&type=magiclink'), null)
})
