import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isOnlyPrefix, linkPrefix } from '../src/lib/links.ts'
import { bulletRows } from '../src/lib/rows.ts'

/** Preenchimento do começo dos links e tópicos do assistente de perguntas. */

test('linkPrefix: LinkedIn e GitHub têm o começo do endereço, sem diferenciar maiúsculas nem espaços', () => {
  assert.equal(linkPrefix('LinkedIn'), 'https://linkedin.com/in/')
  assert.equal(linkPrefix('  linkedin '), 'https://linkedin.com/in/')
  assert.equal(linkPrefix('GitHub'), 'https://github.com/')
})

test('linkPrefix: outros nomes de link não ganham começo de endereço', () => {
  assert.equal(linkPrefix('Portfólio'), null)
  assert.equal(linkPrefix(''), null)
})

test('isOnlyPrefix: só o começo preenchido conta como vazio; com usuário, não', () => {
  assert.equal(isOnlyPrefix('https://linkedin.com/in/'), true)
  assert.equal(isOnlyPrefix(' https://github.com/ '), true)
  assert.equal(isOnlyPrefix('https://github.com/lucas'), false)
  assert.equal(isOnlyPrefix(''), false)
})

test('bulletRows: cada linha com texto vira uma linha própria com "• ", sem duplicar marcadores nem manter vazias', () => {
  assert.deepEqual(bulletRows(['Dev com 5 anos', '', '- Node.js e React', '• Reduziu custos em 18%', '   ']), [
    { topic: '', text: '• Dev com 5 anos' },
    { topic: '', text: '• Node.js e React' },
    { topic: '', text: '• Reduziu custos em 18%' },
  ])
})

test('bulletRows: tudo vazio gera lista vazia', () => {
  assert.deepEqual(bulletRows(['', '  ']), [])
})
