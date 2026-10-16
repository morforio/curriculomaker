import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Analysis, AnalyzeRequest } from '../src/lib/schemas/analysis.ts'
import { postProcess } from '../worker/analyze.ts'
import { isRealChange } from '../worker/text.ts'

/** A lista "Alterações feitas" não pode trazer troca em que as palavras são as mesmas (ex.: "python" riscado → "Python"). */

test('isRealChange: só maiúscula, acento, pontuação, negrito ou a ordem das mesmas palavras não é alteração', () => {
  assert.equal(isRealChange({ from: 'python, sql e javascript', to: 'Python, SQL e JavaScript' }), false)
  assert.equal(isRealChange({ from: 'Habilidade em python', to: '**Habilidade** em Python.' }), false)
  assert.equal(isRealChange({ from: 'python, sql e javascript', to: 'javascript, python e sql' }), false)
  assert.equal(isRealChange({ from: 'gestão de projetos', to: 'gestao de projetos' }), false)
})

test('isRealChange: troca, acréscimo ou retirada de palavra é alteração', () => {
  assert.equal(isRealChange({ from: 'APIs', to: 'APIs REST' }), true)
  assert.equal(isRealChange({ from: 'trabalho com dados', to: 'atuo com dados' }), true)
  assert.equal(isRealChange({ from: 'python e sql', to: 'python' }), true)
})

test('postProcess: descarta alterações sem mudança de palavra e mantém as reais', () => {
  const raw: Analysis = {
    job: {},
    summary: {
      suggested: '• Python, SQL e JavaScript\n• APIs REST',
      changes: [
        { from: 'python, sql e javascript', to: 'Python, SQL e JavaScript', reason: 'x' },
        { from: 'APIs', to: 'APIs REST', reason: 'termo da vaga' },
      ],
    },
    skills: [],
    keywords: [],
  }
  const req = { jobText: 'x'.repeat(100), resumeText: 'Python, SQL, JavaScript e APIs.', summaryText: 'python, sql e javascript e APIs', language: 'pt' } as AnalyzeRequest
  assert.deepEqual(postProcess(raw, req).analysis.summary.changes, [{ from: 'APIs', to: 'APIs REST', reason: 'termo da vaga' }])
})
