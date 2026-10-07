import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planTranslation } from '../src/features/translate/resumeTranslation.ts'
import type { Resume } from '../src/lib/schemas/resume.ts'

/**
 * Garante que a tradução captura TODOS os textos do currículo: cada campo de texto preenchido ou foi traduzido
 * ou está na lista de exceções (dados que nunca são traduzidos nem enviados). Um campo novo no formato do currículo,
 * sem tradução, faz este teste falhar.
 */

let n = 0
const s = (label: string) => `${label} ${++n}`
const row = (label: string) => ({ topic: s(`${label} tópico`), text: s(`${label} texto`) })

function fullResume(): Resume {
  return {
    version: 1,
    header: {
      fullName: s('nome'),
      headline: s('cargo'),
      email: s('email'),
      phone: s('telefone'),
      location: s('cidade'),
      links: [
        { label: s('rótulo do link A'), url: s('url A') },
        { label: s('rótulo do link B'), url: s('url B') },
      ],
    },
    sections: [
      { id: s('id'), type: 'summary', title: s('título resumo'), data: { rows: [row('resumo 1'), row('resumo 2')] } },
      {
        id: s('id'),
        type: 'experience',
        title: s('título experiência'),
        data: {
          items: [
            { company: s('empresa 1'), role: s('cargo 1'), period: s('período 1'), location: s('local 1'), rows: [row('exp 1a'), row('exp 1b')] },
            { company: s('empresa 2'), role: s('cargo 2'), period: s('período 2'), location: s('local 2'), rows: [row('exp 2a')] },
          ],
        },
      },
      {
        id: s('id'),
        type: 'education',
        title: s('título formação'),
        data: { items: [{ institution: s('instituição'), degree: s('curso'), period: s('período edu'), rows: [row('edu a')] }] },
      },
      { id: s('id'), type: 'skills', title: s('título habilidades'), data: { rows: [row('hab 1'), row('hab 2')] } },
      { id: s('id'), type: 'languages', title: s('título idiomas'), data: { rows: [row('idioma 1')] } },
      { id: s('id'), type: 'custom', title: s('título extra'), data: { rows: [row('extra 1'), row('extra 2')] } },
      { id: s('id'), type: 'custom', title: s('título extra 2'), data: { rows: [row('extra 3')] } },
    ],
    settings: { template: 'ats', fontScale: 1, fontSize: 11 },
  }
}

/** Caminhos de textos que NÃO são traduzidos (e nem enviados). Tudo o mais precisa mudar. */
const NEVER_TRANSLATED = [/^settings\./, /^header\.fullName$/, /^header\.email$/, /^header\.phone$/, /^header\.links\.\d+\.url$/, /^sections\.\d+\.id$/, /^sections\.\d+\.type$/, /\.company$/, /\.institution$/]

function leaves(value: unknown, path: string, out: Map<string, string>) {
  if (typeof value === 'string') out.set(path, value)
  else if (Array.isArray(value)) value.forEach((v, i) => leaves(v, path ? `${path}.${i}` : String(i), out))
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) leaves(v, path ? `${path}.${k}` : k, out)
}

test('todo texto do currículo é traduzido, exceto os dados que nunca são traduzidos', () => {
  const original = fullResume()
  const plan = planTranslation(original)
  const translated = plan.apply(plan.texts.map((t) => `[EN] ${t}`))

  const before = new Map<string, string>()
  const after = new Map<string, string>()
  leaves(original, '', before)
  leaves(translated, '', after)

  assert.deepEqual([...after.keys()], [...before.keys()], 'a estrutura do currículo não pode mudar')
  const missed: string[] = []
  for (const [path, value] of before) {
    const changed = after.get(path) !== value
    const exception = NEVER_TRANSLATED.some((re) => re.test(path))
    if (!exception && !changed) missed.push(`${path} = "${value}"`)
    if (exception && changed) missed.push(`${path} foi traduzido, mas devia ficar como está`)
  }
  assert.deepEqual(missed, [])
})

test('só vão ao serviço os textos traduzíveis: nome, e-mail, telefone, endereços, empresas e instituições ficam de fora', () => {
  const original = fullResume()
  const sent = planTranslation(original).texts.join('\n')
  for (const secret of [original.header.fullName, original.header.email, original.header.phone, 'url A', 'url B', 'empresa 1', 'empresa 2', 'instituição']) {
    assert.ok(!sent.includes(secret), `"${secret}" não pode ser enviado`)
  }
})

test('textos vazios não são enviados e continuam vazios', () => {
  const r = fullResume()
  r.header.headline = ''
  r.header.location = '   '
  const plan = planTranslation(r)
  assert.ok(plan.texts.every((t) => t.trim() !== ''))
  const out = plan.apply(plan.texts.map((t) => `[EN] ${t}`))
  assert.equal(out.header.headline, '')
  assert.equal(out.header.location, '   ')
})

test('a ordem dos textos enviados é a mesma da volta (cada tradução volta ao campo certo)', () => {
  const original = fullResume()
  const plan = planTranslation(original)
  const out = plan.apply(plan.texts.map((t) => t.toUpperCase()))
  assert.equal(out.header.headline, original.header.headline.toUpperCase())
  const exp = out.sections[1]
  assert.equal(exp.type, 'experience')
  if (exp.type === 'experience') {
    assert.equal(exp.data.items[1].role, original.sections[1].type === 'experience' ? original.sections[1].data.items[1].role.toUpperCase() : '')
    assert.equal(exp.data.items[0].company, original.sections[1].type === 'experience' ? original.sections[1].data.items[0].company : '')
  }
})
