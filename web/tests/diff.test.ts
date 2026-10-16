import assert from 'node:assert/strict'
import { test } from 'node:test'
import { wordDiff, wordKey } from '../src/lib/diff.ts'

/** Comparação "original x sugerido" da introdução (src/lib/diff.ts): só o que mudou de verdade é marcado. */

const dels = (r: ReturnType<typeof wordDiff>) => r.original.filter((t) => t.kind === 'del').map((t) => t.text)
const adds = (r: ReturnType<typeof wordDiff>) => r.suggested.filter((t) => t.kind === 'add').map((t) => t.text)

test('textos iguais: nada é marcado', () => {
  const r = wordDiff('Habilidade em python, sql e javascript', 'Habilidade em python, sql e javascript')
  assert.deepEqual(dels(r), [])
  assert.deepEqual(adds(r), [])
})

test('a mesma palavra com outra pontuação, maiúscula, acento ou negrito não é retirada nem acrescentada', () => {
  assert.equal(wordKey('Python,'), wordKey('python'))
  assert.equal(wordKey('**python**,'), wordKey('Python'))
  assert.equal(wordKey('Gestão'), wordKey('gestao'))
  assert.equal(wordKey('Gestão'), wordKey('Gestão')) // com o til como caractere separado
  const r = wordDiff('Habilidade em **Python**, SQL e JavaScript.', 'habilidade em python; sql e javascript')
  assert.deepEqual(dels(r), [])
  assert.deepEqual(adds(r), [])
})

test('frase reordenada: palavra que só mudou de lugar não é marcada', () => {
  const r = wordDiff('Habilidade em python, sql e javascript', 'Habilidade em javascript, python e sql')
  assert.deepEqual(dels(r), [])
  assert.deepEqual(adds(r), [])
})

test('o que de fato foi retirado ou acrescentado continua marcado', () => {
  const r = wordDiff('Atuo com python e sql em projetos de dados', 'Atuo com python, sql e docker em projetos de dados')
  assert.deepEqual(dels(r), [])
  assert.deepEqual(adds(r).map((t) => wordKey(t)), ['docker'])
  const r2 = wordDiff('Atuo com python, sql e excel', 'Atuo com python e sql')
  assert.deepEqual(dels(r2).map((t) => wordKey(t)), ['excel'])
  assert.deepEqual(adds(r2), [])
})

test('palavra repetida: cada uma só se junta com uma do outro lado', () => {
  const r = wordDiff('dados dados dados', 'dados')
  assert.equal(dels(r).length, 2)
  assert.deepEqual(adds(r), [])
})

test('a quebra de linha continua um item à parte e nunca é marcada como movida', () => {
  const r = wordDiff('um\ndois', 'um dois')
  assert.ok(r.original.some((t) => t.text === '\n'))
  assert.deepEqual(adds(r), [])
})
