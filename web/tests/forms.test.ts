import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isOnlyPrefix, linkPrefix } from '../src/lib/links.ts'
import { moveItem, stripBullet } from '../src/lib/rows.ts'

/** Preenchimento do começo dos links e marcador dos tópicos do resumo. */

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

test('stripBullet: tira o marcador do começo, qualquer que seja, e não mexe no resto', () => {
  assert.equal(stripBullet('• Reduziu custos em 18%'), 'Reduziu custos em 18%')
  assert.equal(stripBullet('- Node.js e React'), 'Node.js e React')
  assert.equal(stripBullet('Dev com 5 anos'), 'Dev com 5 anos')
  assert.equal(stripBullet('-5% de custo'), '-5% de custo')
})

test('moveItem: o tópico 1 pode ir para a segunda posição, e os outros mantêm a ordem', () => {
  assert.deepEqual(moveItem(['a', 'b', 'c'], 0, 1), ['b', 'a', 'c'])
  assert.deepEqual(moveItem(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b'])
  assert.deepEqual(moveItem(['a', 'b', 'c'], 1, 1), ['a', 'b', 'c'])
})

test('moveItem: não altera a lista original', () => {
  const list = ['a', 'b', 'c']
  moveItem(list, 0, 2)
  assert.deepEqual(list, ['a', 'b', 'c'])
})
