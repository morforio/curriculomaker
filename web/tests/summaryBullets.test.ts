import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Analysis, AnalyzeRequest } from '../src/lib/schemas/analysis.ts'
import { postProcess } from '../worker/analyze.ts'
import { REDO_SYSTEM_PROMPT, SYSTEM_PROMPT } from '../worker/prompt.ts'
import { toBullets } from '../worker/text.ts'

/** A introdução é uma lista de tópicos (highlights), não texto corrido. */

test('toBullets: uma linha por tópico, todas com "• "', () => {
  assert.equal(toBullets('Dev Node.js\nLidera equipe'), '• Dev Node.js\n• Lidera equipe')
})

test('toBullets: troca marcadores diferentes, tira linhas vazias e não duplica o marcador', () => {
  assert.equal(toBullets('- um\n* dois\n–  três\n\n•quatro\n• cinco\n'), '• um\n• dois\n• três\n• quatro\n• cinco')
})

test('toBullets: preserva **negrito** no começo da linha e números negativos', () => {
  assert.equal(toBullets('**Node.js** e React\n-5% de custo'), '• **Node.js** e React\n• -5% de custo')
})

test('postProcess: a introdução sugerida sai em tópicos mesmo que o modelo devolva texto corrido em linhas', () => {
  const raw: Analysis = {
    job: { title: null, company: null, seniority: null },
    summary: { suggested: 'Dev com 5 anos\n- APIs REST', changes: [] },
    skills: [],
    keywords: [],
  }
  const req = { jobText: 'x'.repeat(100), resumeText: 'Dev com 5 anos. APIs REST.', summaryText: '', language: 'pt' } as AnalyzeRequest
  assert.equal(postProcess(raw, req).analysis.summary.suggested, '• Dev com 5 anos\n• APIs REST')
})

test('os prompts pedem tópicos curtos e a conversão de texto corrido', () => {
  for (const prompt of [SYSTEM_PROMPT, REDO_SYSTEM_PROMPT]) {
    assert.match(prompt, /list of professional highlights, NOT running text/)
    assert.match(prompt, /3 to 6 bullets/)
    assert.match(prompt, /running text, convert it into the bullets/)
  }
})
