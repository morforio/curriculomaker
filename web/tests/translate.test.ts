import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LLMError, type LLMProvider } from '../worker/llm.ts'
import { handleTranslate } from '../worker/translate.ts'

/** Testes do endpoint de tradução (worker/translate.ts), com LLM e limite simulados. Cada texto vai e volta com um "id". */

type Item = { id: number; text: string }

function request(body: unknown): Request {
  return new Request('https://currimaker.test/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** Lê os itens {id, text} que o Worker mandou no prompt. */
function itemsOf(user: string): Item[] {
  const m = user.match(/<texts>\n([\s\S]*?)\n<\/texts>/)
  return JSON.parse(m![1]) as Item[]
}

/** LLM simulado: o `behave` recebe os itens do pedido e devolve o texto bruto da resposta. */
function fakeProvider(behave: (items: Item[], call: number) => string): { provider: LLMProvider; calls: () => number; sizes: () => number[] } {
  let calls = 0
  const sizes: number[] = []
  return {
    provider: {
      async complete({ user }) {
        const items = itemsOf(user)
        sizes.push(items.length)
        return behave(items, calls++)
      },
    },
    calls: () => calls,
    sizes: () => sizes,
  }
}

const reply = (items: Item[]) => JSON.stringify({ items })
const translate = (items: Item[]) => items.map((i) => ({ id: i.id, text: `[EN] ${i.text}` }))

const ok = { check: async () => 'ok' as const }
const base = { from: 'pt', to: 'en', texts: ['Desenvolvedor', '', 'Trabalho com **Node.js**'] }
const deps = (provider: LLMProvider, limiter: { check: () => Promise<'ok' | 'ip' | 'daily'> } = ok) => ({ env: {}, ip: '1.2.3.4', limiter, provider })

test('traduz e devolve os textos na mesma ordem; os vazios continuam vazios e não vão ao modelo', async () => {
  const f = fakeProvider((items) => reply(translate(items)))
  const res = await handleTranslate(request(base), deps(f.provider))
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { texts: ['[EN] Desenvolvedor', '', '[EN] Trabalho com **Node.js**'] })
  assert.deepEqual(f.sizes(), [2])
})

test('aceita a resposta dentro de cercas de markdown', async () => {
  const f = fakeProvider((items) => '```json\n' + reply(translate(items)) + '\n```')
  const res = await handleTranslate(request(base), deps(f.provider))
  assert.equal(res.status, 200)
})

test('a resposta pode vir fora de ordem: cada texto volta ao seu lugar pelo id', async () => {
  const f = fakeProvider((items) => reply(translate(items).reverse()))
  const res = await handleTranslate(request(base), deps(f.provider))
  assert.deepEqual(await res.json(), { texts: ['[EN] Desenvolvedor', '', '[EN] Trabalho com **Node.js**'] })
})

test('o caso que falhou em produção: o modelo devolve itens a MAIS (divide um texto) e mesmo assim funciona', async () => {
  const f = fakeProvider((items) => reply([...translate(items), { id: 999, text: 'sobra' }, { id: items[0].id, text: 'duplicado' }]))
  const res = await handleTranslate(request(base), deps(f.provider))
  assert.equal(res.status, 200)
  const out = (await res.json()) as { texts: string[] }
  assert.equal(out.texts.length, 3)
  assert.equal(out.texts[0], '[EN] Desenvolvedor')
})

test('faltou um id: só o que faltou é pedido de novo, e o resto não é refeito', async () => {
  const f = fakeProvider((items, call) => (call === 0 ? reply(translate(items).slice(0, 1)) : reply(translate(items))))
  const res = await handleTranslate(request(base), deps(f.provider))
  assert.equal(res.status, 200)
  assert.deepEqual(f.sizes(), [2, 1])
  assert.deepEqual(await res.json(), { texts: ['[EN] Desenvolvedor', '', '[EN] Trabalho com **Node.js**'] })
})

test('texto de várias linhas que volta com outro número de linhas é refeito (pode ter ido para o id errado)', async () => {
  const body = { from: 'pt', to: 'en', texts: ['linha 1\n• linha 2\n• linha 3', 'outro texto'] }
  const f = fakeProvider((items, call) =>
    call === 0 ? reply(items.map((i) => ({ id: i.id, text: i.text.replace(/\n/g, ' ') }))) : reply(translate(items)),
  )
  const res = await handleTranslate(request(body), deps(f.provider))
  assert.equal(res.status, 200)
  assert.deepEqual(f.sizes(), [2, 1], 'só o texto de várias linhas voltou sem as quebras, então só ele foi pedido de novo')
  assert.deepEqual(((await res.json()) as { texts: string[] }).texts, ['[EN] linha 1\n• linha 2\n• linha 3', 'outro texto'])
})

test('se na segunda tentativa o número de linhas ainda diferir, aceita o que veio (melhor que falhar tudo)', async () => {
  const body = { from: 'pt', to: 'en', texts: ['a\nb'] }
  const f = fakeProvider((items) => reply(items.map((i) => ({ id: i.id, text: 'a b traduzido' }))))
  const res = await handleTranslate(request(body), deps(f.provider))
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { texts: ['a b traduzido'] })
  assert.equal(f.calls(), 2)
})

test('continua faltando depois da segunda tentativa: 502 bad_llm_output', async () => {
  const f = fakeProvider((items) => reply(translate(items).slice(0, -1))) // sempre deixa o último de fora
  const res = await handleTranslate(request(base), deps(f.provider))
  assert.equal(res.status, 502)
  assert.equal(((await res.json()) as { error: string }).error, 'bad_llm_output')
})

test('texto que existia não pode voltar vazio', async () => {
  const f = fakeProvider((items) => reply(items.map((i) => ({ id: i.id, text: '' }))))
  const res = await handleTranslate(request(base), deps(f.provider))
  assert.equal(res.status, 502)
})

test('resposta que não é JSON nas duas tentativas: 502 bad_llm_output', async () => {
  const f = fakeProvider(() => 'isto não é JSON')
  const res = await handleTranslate(request(base), deps(f.provider))
  assert.equal(res.status, 502)
  assert.equal(f.calls(), 2)
})

test('currículo grande: vai em pedaços de até 20 textos, em paralelo, e a ordem final é a do pedido', async () => {
  const texts = Array.from({ length: 51 }, (_, i) => `texto ${i}`)
  const f = fakeProvider((items) => reply(translate(items).reverse()))
  const res = await handleTranslate(request({ from: 'pt', to: 'en', texts }), deps(f.provider))
  assert.equal(res.status, 200)
  assert.deepEqual(f.sizes().sort((a, b) => a - b), [11, 20, 20])
  assert.deepEqual(((await res.json()) as { texts: string[] }).texts, texts.map((t) => `[EN] ${t}`))
})

test('um pedaço que falha derruba o pedido inteiro com erro claro (nada parcial)', async () => {
  const texts = Array.from({ length: 45 }, (_, i) => `texto ${i}`)
  const f = fakeProvider((items) => (items.some((i) => i.id === 30) ? 'lixo' : reply(translate(items))))
  const res = await handleTranslate(request({ from: 'pt', to: 'en', texts }), deps(f.provider))
  assert.equal(res.status, 502)
})

test('mesmo idioma de origem e destino é recusado, sem chamar o LLM', async () => {
  const f = fakeProvider((items) => reply(translate(items)))
  const res = await handleTranslate(request({ ...base, to: 'pt' }), deps(f.provider))
  assert.equal(res.status, 400)
  assert.equal(f.calls(), 0)
})

test('limite por IP: 429 sem chamar o LLM', async () => {
  const f = fakeProvider((items) => reply(translate(items)))
  const res = await handleTranslate(request(base), deps(f.provider, { check: async () => 'ip' }))
  assert.equal(res.status, 429)
  assert.equal(f.calls(), 0)
})

test('origem diferente do site é recusada', async () => {
  const f = fakeProvider((items) => reply(translate(items)))
  const req = new Request('https://currimaker.test/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://outro-site.example' },
    body: JSON.stringify(base),
  })
  const res = await handleTranslate(req, deps(f.provider))
  assert.equal(res.status, 403)
})

test('LLM indisponível: 502 llm_unavailable', async () => {
  const provider: LLMProvider = {
    async complete() {
      throw new LLMError('fora do ar', 'unavailable')
    },
  }
  const res = await handleTranslate(request(base), deps(provider))
  assert.equal(res.status, 502)
  assert.equal(((await res.json()) as { error: string }).error, 'llm_unavailable')
})

test('LLM ocupado (429 do provedor): 503 llm_busy', async () => {
  const provider: LLMProvider = {
    async complete() {
      throw new LLMError('muitas solicitações', 'busy')
    },
  }
  const res = await handleTranslate(request(base), deps(provider))
  assert.equal(res.status, 503)
  assert.equal(((await res.json()) as { error: string }).error, 'llm_busy')
})

test('quando o modelo reserva respondeu, a resposta traz fallback: true (o site avisa o usuário)', async () => {
  const f = fakeProvider((items) => reply(translate(items)))
  const res = await handleTranslate(request(base), deps({ ...f.provider, fallbackUsed: () => true }))
  assert.equal(res.status, 200)
  assert.equal(((await res.json()) as { fallback?: boolean }).fallback, true)
})

test('sem reserva, a resposta não traz o campo fallback', async () => {
  const f = fakeProvider((items) => reply(translate(items)))
  const res = await handleTranslate(request(base), deps(f.provider))
  assert.ok(!('fallback' in ((await res.json()) as object)))
})
