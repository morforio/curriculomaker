import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseTheme, THEME_COLOR } from '../src/lib/theme.ts'

/** Tema do site (src/lib/theme.ts): o modo escuro é o padrão. */

test('"light" vira o modo claro; qualquer outra coisa (ou nada) é o modo escuro', () => {
  assert.equal(parseTheme('light'), 'light')
  assert.equal(parseTheme('dark'), 'dark')
  for (const raw of [null, undefined, '', 'Light', 'claro', 'auto', '1']) assert.equal(parseTheme(raw), 'dark', String(raw))
})

test('cada tema tem a sua cor de barra do navegador', () => {
  assert.notEqual(THEME_COLOR.dark, THEME_COLOR.light)
})
