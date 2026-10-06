import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dataToRows, planInitialSync, remoteToData } from '../src/lib/sync.ts'

const resume = (name: string) => ({
  version: 1,
  header: { fullName: name, headline: '', email: '', phone: '', location: '', links: [] },
  sections: [],
  settings: { template: 'ats', fontScale: 1, fontSize: 10 },
})

test('conta com currículo: vale o da conta', () => {
  assert.equal(planInitialSync({ userId: 'u1', ownerId: 'u1', localHasContent: true, remoteCount: 1 }), 'load-remote')
  assert.equal(planInitialSync({ userId: 'u1', ownerId: 'u2', localHasContent: true, remoteCount: 2 }), 'load-remote')
})

test('conta vazia e currículo de antes do login: sobe para a conta', () => {
  assert.equal(planInitialSync({ userId: 'u1', ownerId: null, localHasContent: true, remoteCount: 0 }), 'upload-local')
})

test('conta vazia e currículo desta mesma conta no navegador: sobe para a conta', () => {
  assert.equal(planInitialSync({ userId: 'u1', ownerId: 'u1', localHasContent: true, remoteCount: 0 }), 'upload-local')
})

test('conta vazia e currículo de OUTRA conta no navegador: começa vazio, sem vazar dados', () => {
  assert.equal(planInitialSync({ userId: 'u1', ownerId: 'u2', localHasContent: true, remoteCount: 0 }), 'start-empty')
})

test('conta vazia e nada preenchido no navegador: começa vazio', () => {
  assert.equal(planInitialSync({ userId: 'u1', ownerId: null, localHasContent: false, remoteCount: 0 }), 'start-empty')
})

test('remoteToData: usa o idioma preferido e guarda o outro em "saved"', () => {
  const data = remoteToData(
    [
      { lang: 'pt', content: resume('Maria') },
      { lang: 'en', content: resume('Mary') },
    ],
    'en',
  )
  assert.equal(data?.lang, 'en')
  assert.equal(data?.resume.header.fullName, 'Mary')
  assert.equal(data?.saved.pt?.header.fullName, 'Maria')
})

test('remoteToData: sem o idioma preferido, usa o que existe', () => {
  const data = remoteToData([{ lang: 'pt', content: resume('Maria') }], 'en')
  assert.equal(data?.lang, 'pt')
  assert.deepEqual(data?.saved, {})
})

test('remoteToData: linhas inválidas são ignoradas; sem nenhuma válida, null', () => {
  assert.equal(remoteToData([{ lang: 'pt', content: { lixo: true } }, { lang: 'fr', content: resume('X') }], 'pt'), null)
  const data = remoteToData([{ lang: 'pt', content: { lixo: true } }, { lang: 'en', content: resume('Mary') }], 'pt')
  assert.equal(data?.lang, 'en')
})

test('remoteToData: currículo salvo antes do tamanho da fonte ganha 10 pt', () => {
  const old = resume('Maria') as { settings: Record<string, unknown> }
  delete old.settings.fontSize
  assert.equal(remoteToData([{ lang: 'pt', content: old }], 'pt')?.resume.settings.fontSize, 10)
})

test('dataToRows: uma linha por aba já aberta', () => {
  const pt = remoteToData([{ lang: 'pt', content: resume('Maria') }], 'pt')!.resume
  const en = remoteToData([{ lang: 'en', content: resume('Mary') }], 'en')!.resume
  const rows = dataToRows('u1', { lang: 'pt', resume: pt, saved: { en } })
  assert.deepEqual(rows.map((r) => [r.user_id, r.lang]), [['u1', 'pt'], ['u1', 'en']])
  assert.equal(dataToRows('u1', { lang: 'pt', resume: pt, saved: {} }).length, 1)
})
