import assert from 'node:assert/strict'
import { test } from 'node:test'
import { focusKeyChain, scrollDuration, scrollEase, targetScrollTop } from '../src/lib/focusTarget.ts'

/** Foco da prévia no trecho editado (src/lib/focusTarget.ts). */

test('a chave vai da linha para o item e para o bloco', () => {
  assert.deepEqual(focusKeyChain('abc:1#2'), ['abc:1#2', 'abc:1', 'abc'])
  assert.deepEqual(focusKeyChain('abc:1'), ['abc:1', 'abc'])
  assert.deepEqual(focusKeyChain('abc#0'), ['abc#0', 'abc'])
  assert.deepEqual(focusKeyChain('abc'), ['abc'])
  assert.deepEqual(focusKeyChain('header'), ['header'])
})

test('o trecho se alinha com a posição do campo', () => {
  // área visível de 600 px, conteúdo de 2000 px; trecho de 40 px com centro em 1000; campo no meio da área (300).
  assert.equal(targetScrollTop({ snippetCenter: 1000, snippetHeight: 40, wantedCenter: 300, viewHeight: 600, contentHeight: 2000 }), 700)
  // campo mais acima: o trecho aparece mais acima
  assert.equal(targetScrollTop({ snippetCenter: 1000, snippetHeight: 40, wantedCenter: 100, viewHeight: 600, contentHeight: 2000 }), 900)
})

test('a rolagem nunca passa dos limites e o trecho não sai da área visível', () => {
  // trecho no começo: não rola para cima do topo
  assert.equal(targetScrollTop({ snippetCenter: 50, snippetHeight: 40, wantedCenter: 500, viewHeight: 600, contentHeight: 2000 }), 0)
  // trecho no fim: não rola além do fim
  assert.equal(targetScrollTop({ snippetCenter: 1980, snippetHeight: 40, wantedCenter: 100, viewHeight: 600, contentHeight: 2000 }), 1400)
  // campo fora da área (acima ou abaixo): o centro do trecho é puxado para dentro dela, com folga
  assert.equal(targetScrollTop({ snippetCenter: 1000, snippetHeight: 40, wantedCenter: -50, viewHeight: 600, contentHeight: 2000 }), 1000 - 28)
  assert.equal(targetScrollTop({ snippetCenter: 1000, snippetHeight: 40, wantedCenter: 900, viewHeight: 600, contentHeight: 2000 }), 1000 - (600 - 28))
})

test('trecho mais alto que a área visível: o topo dele fica no topo da área', () => {
  assert.equal(targetScrollTop({ snippetCenter: 1000, snippetHeight: 800, wantedCenter: 300, viewHeight: 600, contentHeight: 2000 }), 1000 - 400 - 8)
})

test('a duração do deslize é curta, cresce com a distância e tem piso e teto', () => {
  assert.equal(scrollDuration(0), 250)
  assert.equal(scrollDuration(100), 250)
  assert.equal(Math.round(scrollDuration(445)), 314)
  assert.equal(scrollDuration(5000), 450)
  assert.ok(scrollDuration(600) > scrollDuration(300))
})

test('o ritmo do deslize começa em 0, termina em 1, passa por 0,5 no meio e nunca anda para trás', () => {
  assert.equal(scrollEase(0), 0)
  assert.equal(scrollEase(1), 1)
  assert.ok(Math.abs(scrollEase(0.5) - 0.5) < 1e-9)
  assert.equal(scrollEase(-1), 0)
  assert.equal(scrollEase(2), 1)
  let prev = -1
  for (let i = 0; i <= 20; i++) {
    const v = scrollEase(i / 20)
    assert.ok(v >= prev)
    prev = v
  }
})
