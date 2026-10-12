import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatCpf, isValidCpf, PRO_ACCESS_DAYS, PRO_CREDITS, PRO_PRICE_BRL, PRO_TEST_PRICE_BRL } from '../src/lib/plans.ts'
import { handleCancel, handleCheckout, handleWebhook, priceFor, type BillingEnv } from '../worker/billing.ts'

/** Pagamento do plano pro (worker/billing.ts), com o Asaas e o banco simulados. */

const env: BillingEnv = {
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_SERVICE_KEY: 'service-secret',
  ASAAS_API_KEY: 'asaas-secret-key',
  ASAAS_WEBHOOK_TOKEN: 'webhook-token-with-more-than-thirty-two-chars',
}
const CPF = '529.982.247-25'

type Call = { kind: 'rpc' | 'asaas'; name: string; method: string; body: Record<string, unknown> | null; headers: Record<string, string> }

/**
 * Mundo simulado: o banco (funções rpc) e o Asaas. `db` e `asaas` recebem o pedido e devolvem o corpo (ou uma Response pronta).
 * Tudo que for chamado fica em `calls`, na ordem.
 */
function world(handlers: { db?: Record<string, (body: Record<string, unknown>) => unknown>; asaas?: Record<string, (body: Record<string, unknown> | null) => unknown> }) {
  const original = globalThis.fetch
  const calls: Call[] = []
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    const u = String(url)
    const method = init?.method ?? 'GET'
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null
    const headers = (init?.headers ?? {}) as Record<string, string>
    const rpcName = u.match(/\/rest\/v1\/rpc\/(\w+)$/)?.[1]
    if (rpcName) {
      calls.push({ kind: 'rpc', name: rpcName, method, body, headers })
      const h = handlers.db?.[rpcName]
      if (!h) return new Response('null', { status: 200 })
      const out = h(body ?? {})
      return out instanceof Response ? out : new Response(JSON.stringify(out), { status: 200 })
    }
    const path = u.replace(/^https:\/\/api-sandbox\.asaas\.com\/v3/, '')
    const key = `${method} ${path.replace(/\/(cus|sub)_\w+/g, '/$1_X')}`
    calls.push({ kind: 'asaas', name: key, method, body, headers })
    const h = handlers.asaas?.[key]
    if (!h) throw new Error(`Asaas simulado sem resposta para ${key}`)
    const out = h(body)
    return out instanceof Response ? out : new Response(JSON.stringify(out), { status: 200 })
  }) as typeof fetch
  return { calls, restore: () => (globalThis.fetch = original) }
}

const post = (path: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://currimaker.niuai.com.br${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) })

const checkout = (body: unknown, e: BillingEnv = env) => handleCheckout(post('/api/checkout', body), { env: e, userId: 'user-1', email: 'maria@x.com' })
const names = (calls: Call[]) => calls.map((c) => c.name)

const newCustomerWorld = () =>
  world({
    db: { billing_get: () => null, billing_save: () => null },
    asaas: {
      'POST /customers': () => ({ id: 'cus_1' }),
      'POST /subscriptions': () => ({ id: 'sub_1' }),
      'GET /subscriptions/sub_X/payments': () => ({ data: [{ id: 'pay_1', status: 'PENDING', invoiceUrl: 'https://sandbox.asaas.com/i/pay_1' }] }),
    },
  })

// ---------------------------------------------------------------- CPF

test('isValidCpf: aceita CPFs válidos (com ou sem pontuação)', () => {
  assert.ok(isValidCpf('529.982.247-25'))
  assert.ok(isValidCpf('52998224725'))
  assert.ok(isValidCpf('111.444.777-35'))
})

test('isValidCpf: recusa dígito errado, tamanho errado, números repetidos e texto', () => {
  for (const bad of ['529.982.247-24', '123', '', '111.111.111-11', '00000000000', 'abc', '529982247251', '5299822472']) assert.ok(!isValidCpf(bad), bad)
})

test('formatCpf: formata enquanto digita e ignora o excesso', () => {
  assert.equal(formatCpf('5'), '5')
  assert.equal(formatCpf('5299'), '529.9')
  assert.equal(formatCpf('529982'), '529.982')
  assert.equal(formatCpf('5299822'), '529.982.2')
  assert.equal(formatCpf('52998224725'), '529.982.247-25')
  assert.equal(formatCpf('52998224725999'), '529.982.247-25')
})

// ---------------------------------------------------------------- checkout

test('checkout (cliente novo): cria cliente e assinatura mensal e devolve o link da fatura; o CPF só vai ao Asaas', async () => {
  const w = newCustomerWorld()
  try {
    const res = await checkout({ name: 'Maria Silva', cpf: CPF })
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { url: 'https://sandbox.asaas.com/i/pay_1' })
    assert.deepEqual(names(w.calls), ['billing_get', 'POST /customers', 'billing_save', 'POST /subscriptions', 'billing_save', 'GET /subscriptions/sub_X/payments'])

    const customer = w.calls.find((c) => c.name === 'POST /customers')!
    assert.deepEqual(customer.body, { name: 'Maria Silva', cpfCnpj: '52998224725', email: 'maria@x.com', externalReference: 'user-1' })
    assert.equal(customer.headers.access_token, 'asaas-secret-key')
    assert.ok(customer.headers['User-Agent'])

    const sub = w.calls.find((c) => c.name === 'POST /subscriptions')!
    assert.equal(sub.body?.customer, 'cus_1')
    assert.equal(sub.body?.value, PRO_PRICE_BRL)
    assert.equal(sub.body?.cycle, 'MONTHLY')
    assert.equal(sub.body?.billingType, 'UNDEFINED')
    assert.match(String(sub.body?.nextDueDate), /^\d{4}-\d{2}-\d{2}$/)

    // O CPF nunca vai para o banco.
    const rpcBodies = JSON.stringify(w.calls.filter((c) => c.kind === 'rpc').map((c) => c.body))
    assert.ok(!rpcBodies.includes('52998224725') && !rpcBodies.includes(CPF))
    const saved = w.calls.filter((c) => c.name === 'billing_save').map((c) => c.body)
    assert.deepEqual(saved, [
      { p_user: 'user-1', p_customer: 'cus_1', p_subscription: null },
      { p_user: 'user-1', p_customer: 'cus_1', p_subscription: 'sub_1' },
    ])
  } finally {
    w.restore()
  }
})

test('checkout: CPF inválido ou nome curto é recusado sem chamar o Asaas nem o banco', async () => {
  const w = newCustomerWorld()
  try {
    const bad = await checkout({ name: 'Maria Silva', cpf: '529.982.247-24' })
    assert.equal(bad.status, 400)
    assert.equal(((await bad.json()) as { error: string }).error, 'invalid_cpf')
    assert.equal((await checkout({ name: 'Ma', cpf: CPF })).status, 400)
    assert.equal((await checkout({ cpf: CPF })).status, 400)
    assert.equal(w.calls.length, 0)
  } finally {
    w.restore()
  }
})

test('checkout: origem de outro site e método errado são recusados', async () => {
  const w = newCustomerWorld()
  try {
    const other = handleCheckout(post('/api/checkout', { name: 'Maria Silva', cpf: CPF }, { Origin: 'https://evil.example' }), { env, userId: 'u', email: null })
    assert.equal((await other).status, 403)
    const get = handleCheckout(new Request('https://currimaker.niuai.com.br/api/checkout'), { env, userId: 'u', email: null })
    assert.equal((await get).status, 405)
    assert.equal(w.calls.length, 0)
  } finally {
    w.restore()
  }
})

test('checkout: sem a chave do Asaas, falha fechada (503) e nada é criado', async () => {
  const w = newCustomerWorld()
  try {
    const res = await checkout({ name: 'Maria Silva', cpf: CPF }, { ...env, ASAAS_API_KEY: undefined })
    assert.equal(res.status, 503)
    assert.equal(((await res.json()) as { error: string }).error, 'payment_unavailable')
    assert.ok(!w.calls.some((c) => c.kind === 'asaas'))
  } finally {
    w.restore()
  }
})

test('checkout: cliente que já existe não é criado de novo; assinatura ativa com fatura aberta reaproveita o link', async () => {
  const w = world({
    db: { billing_get: () => ({ customer_id: 'cus_1', subscription_id: 'sub_1' }), billing_save: () => null },
    asaas: {
      'GET /subscriptions/sub_X': () => ({ status: 'ACTIVE', deleted: false }),
      'GET /subscriptions/sub_X/payments': () => ({ data: [{ id: 'pay_9', status: 'PENDING', invoiceUrl: 'https://sandbox.asaas.com/i/pay_9' }] }),
    },
  })
  try {
    const res = await checkout({ name: 'Maria Silva', cpf: CPF })
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { url: 'https://sandbox.asaas.com/i/pay_9' })
    assert.ok(!names(w.calls).includes('POST /customers'))
    assert.ok(!names(w.calls).includes('POST /subscriptions'), 'cliques repetidos não criam assinatura a mais')
  } finally {
    w.restore()
  }
})

test('checkout: assinatura ativa e toda paga (sem fatura aberta) responde 409 já assinante', async () => {
  const w = world({
    db: { billing_get: () => ({ customer_id: 'cus_1', subscription_id: 'sub_1' }) },
    asaas: {
      'GET /subscriptions/sub_X': () => ({ status: 'ACTIVE', deleted: false }),
      'GET /subscriptions/sub_X/payments': () => ({ data: [{ id: 'pay_1', status: 'RECEIVED', invoiceUrl: 'https://x/i/1' }] }),
    },
  })
  try {
    const res = await checkout({ name: 'Maria Silva', cpf: CPF })
    assert.equal(res.status, 409)
    assert.equal(((await res.json()) as { error: string }).error, 'already_subscribed')
    assert.ok(!names(w.calls).includes('POST /subscriptions'))
  } finally {
    w.restore()
  }
})

test('checkout: assinatura cancelada (ou apagada no Asaas) permite assinar de novo, reaproveitando o cliente', async () => {
  for (const existing of [{ status: 'INACTIVE', deleted: false }, { status: 'ACTIVE', deleted: true }]) {
    const w = world({
      db: { billing_get: () => ({ customer_id: 'cus_1', subscription_id: 'sub_old' }), billing_save: () => null },
      asaas: {
        'GET /subscriptions/sub_X': () => existing,
        'POST /subscriptions': () => ({ id: 'sub_new' }),
        'GET /subscriptions/sub_X/payments': () => ({ data: [{ id: 'pay_n', status: 'PENDING', invoiceUrl: 'https://sandbox.asaas.com/i/pay_n' }] }),
      },
    })
    try {
      const res = await checkout({ name: 'Maria Silva', cpf: CPF })
      assert.equal(res.status, 200)
      assert.ok(!names(w.calls).includes('POST /customers'))
      assert.equal(w.calls.find((c) => c.name === 'POST /subscriptions')?.body?.customer, 'cus_1')
      assert.deepEqual(w.calls.filter((c) => c.name === 'billing_save').map((c) => c.body?.p_subscription), ['sub_new'])
    } finally {
      w.restore()
    }
  }
})

test('checkout: o Asaas recusa os dados (4xx) = pedido para conferir o CPF; erro do Asaas (5xx) ou chave recusada (401) = 503', async () => {
  const run = async (status: number) => {
    const w = world({ db: { billing_get: () => null }, asaas: { 'POST /customers': () => new Response('{"errors":[{"description":"x"}]}', { status }) } })
    try {
      return await checkout({ name: 'Maria Silva', cpf: CPF })
    } finally {
      w.restore()
    }
  }
  assert.equal((await run(400)).status, 400)
  assert.equal((await run(500)).status, 503)
  assert.equal((await run(401)).status, 503)
  assert.equal((await run(429)).status, 503)
})

test('checkout: assinatura criada mas a fatura nunca aparece = 503 (sem travar esperando)', async () => {
  const originalTimeout = globalThis.setTimeout
  globalThis.setTimeout = ((fn: () => void) => originalTimeout(fn, 0)) as typeof setTimeout // as esperas de 1 s viram instantâneas
  const w = world({
    db: { billing_get: () => null, billing_save: () => null },
    asaas: { 'POST /customers': () => ({ id: 'cus_1' }), 'POST /subscriptions': () => ({ id: 'sub_1' }), 'GET /subscriptions/sub_X/payments': () => ({ data: [] }) },
  })
  try {
    const res = await checkout({ name: 'Maria Silva', cpf: CPF })
    assert.equal(res.status, 503)
    assert.equal(w.calls.filter((c) => c.name === 'GET /subscriptions/sub_X/payments').length, 4)
  } finally {
    w.restore()
    globalThis.setTimeout = originalTimeout
  }
})

test('checkout: banco fora do ar = 503', async () => {
  const w = world({ db: { billing_get: () => new Response('erro', { status: 500 }) } })
  try {
    assert.equal((await checkout({ name: 'Maria Silva', cpf: CPF })).status, 503)
  } finally {
    w.restore()
  }
})

test('as chaves (Asaas e banco) nunca aparecem nas respostas ao usuário, nem no sucesso nem no erro', async () => {
  const texts: string[] = []
  let w = newCustomerWorld()
  try {
    texts.push(await (await checkout({ name: 'Maria Silva', cpf: CPF })).text())
  } finally {
    w.restore()
  }
  w = world({ db: { billing_get: () => null }, asaas: { 'POST /customers': () => new Response('erro com asaas-secret-key no meio', { status: 500 }) } })
  try {
    texts.push(await (await checkout({ name: 'Maria Silva', cpf: CPF })).text())
  } finally {
    w.restore()
  }
  assert.equal(texts.length, 2)
  for (const text of texts) assert.ok(!text.includes('asaas-secret-key') && !text.includes('service-secret'), text)
})

// ---------------------------------------------------------------- cancelamento

const cancel = () => handleCancel(post('/api/billing/cancel'), { env, userId: 'user-1' })

test('cancelar: apaga a assinatura no Asaas; o plano segue até o fim do período pago (nada muda no banco de créditos)', async () => {
  const w = world({ db: { billing_get: () => ({ customer_id: 'cus_1', subscription_id: 'sub_1' }) }, asaas: { 'DELETE /subscriptions/sub_X': () => ({ deleted: true, id: 'sub_1' }) } })
  try {
    const res = await cancel()
    assert.equal(res.status, 200)
    assert.deepEqual(names(w.calls), ['billing_get', 'DELETE /subscriptions/sub_X'])
  } finally {
    w.restore()
  }
})

test('cancelar: sem assinatura = 404; já cancelada no Asaas (404) = sucesso; Asaas fora do ar = 503', async () => {
  let w = world({ db: { billing_get: () => null } })
  try {
    assert.equal((await cancel()).status, 404)
  } finally {
    w.restore()
  }
  w = world({ db: { billing_get: () => ({ customer_id: 'c', subscription_id: 'sub_1' }) }, asaas: { 'DELETE /subscriptions/sub_X': () => new Response('{}', { status: 404 }) } })
  try {
    assert.equal((await cancel()).status, 200)
  } finally {
    w.restore()
  }
  w = world({ db: { billing_get: () => ({ customer_id: 'c', subscription_id: 'sub_1' }) }, asaas: { 'DELETE /subscriptions/sub_X': () => new Response('{}', { status: 500 }) } })
  try {
    assert.equal((await cancel()).status, 503)
  } finally {
    w.restore()
  }
})

// ---------------------------------------------------------------- aviso de pagamento (webhook)

const hook = (body: unknown, token: string | null = env.ASAAS_WEBHOOK_TOKEN!, e: BillingEnv = env) =>
  handleWebhook(post('/api/payment/webhook', body, token === null ? {} : { 'asaas-access-token': token }), e)

const event = (name: string, patch: Record<string, unknown> = {}) => ({ event: name, payment: { id: 'pay_1', customer: 'cus_1', subscription: 'sub_1', status: 'RECEIVED', value: 39.9, ...patch } })
const owner = { user_id: 'user-1', subscription_id: 'sub_1' }

test('aviso: sem o cabeçalho, com senha errada ou sem a senha configurada, é recusado e nada é gravado', async () => {
  const w = world({ db: { billing_user_by_customer: () => owner, grant_paid_plan: () => ({ granted: true }) } })
  try {
    assert.equal((await hook(event('PAYMENT_RECEIVED'), null)).status, 401)
    assert.equal((await hook(event('PAYMENT_RECEIVED'), 'senha-errada')).status, 401)
    assert.equal((await hook(event('PAYMENT_RECEIVED'), env.ASAAS_WEBHOOK_TOKEN, { ...env, ASAAS_WEBHOOK_TOKEN: undefined })).status, 503)
    assert.equal(w.calls.length, 0)
  } finally {
    w.restore()
  }
})

test('aviso: pagamento recebido ou confirmado aplica o plano pro (60 créditos, 31 dias) para o dono da assinatura', async () => {
  for (const name of ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED']) {
    const w = world({ db: { billing_user_by_customer: () => owner, grant_paid_plan: () => ({ granted: true }) } })
    try {
      const res = await hook(event(name))
      assert.equal(res.status, 200)
      assert.equal(((await res.json()) as { granted: boolean }).granted, true)
      assert.deepEqual(w.calls.find((c) => c.name === 'grant_paid_plan')?.body, { p_user: 'user-1', p_payment: 'pay_1', p_credits: PRO_CREDITS, p_days: PRO_ACCESS_DAYS })
      assert.equal(w.calls.find((c) => c.name === 'billing_user_by_customer')?.body?.p_customer, 'cus_1')
    } finally {
      w.restore()
    }
  }
})

test('aviso repetido (o banco diz que a cobrança já foi aplicada): responde 200 sem conceder de novo', async () => {
  const w = world({ db: { billing_user_by_customer: () => owner, grant_paid_plan: () => ({ granted: false }) } })
  try {
    const res = await hook(event('PAYMENT_RECEIVED'))
    assert.equal(res.status, 200)
    assert.equal(((await res.json()) as { granted: boolean }).granted, false)
  } finally {
    w.restore()
  }
})

test('aviso: cliente desconhecido, cobrança avulsa ou de outra assinatura é ignorada (200), sem conceder nada', async () => {
  const cases = [
    { db: () => null, ev: event('PAYMENT_RECEIVED') },
    { db: () => owner, ev: event('PAYMENT_RECEIVED', { subscription: undefined }) },
    { db: () => owner, ev: event('PAYMENT_RECEIVED', { subscription: 'sub_de_outro' }) },
    { db: () => owner, ev: event('PAYMENT_RECEIVED', { customer: undefined }) },
  ]
  for (const c of cases) {
    const w = world({ db: { billing_user_by_customer: c.db, grant_paid_plan: () => ({ granted: true }) } })
    try {
      const res = await hook(c.ev)
      assert.equal(res.status, 200)
      assert.ok(!names(w.calls).includes('grant_paid_plan'), JSON.stringify(c.ev))
    } finally {
      w.restore()
    }
  }
})

test('aviso: outros eventos (cobrança criada, vencida...) não mudam o plano e nem tocam no banco', async () => {
  const w = world({ db: { billing_user_by_customer: () => owner } })
  try {
    for (const name of ['PAYMENT_CREATED', 'PAYMENT_OVERDUE', 'PAYMENT_UPDATED', 'PAYMENT_DELETED', 'ALGO_NOVO']) assert.equal((await hook(event(name))).status, 200)
    assert.equal(w.calls.length, 0)
  } finally {
    w.restore()
  }
})

test('aviso: estorno e chargeback chamam a revogação da cobrança', async () => {
  for (const name of ['PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED']) {
    const w = world({ db: { revoke_paid_plan: () => ({ revoked: true }) } })
    try {
      const res = await hook(event(name))
      assert.equal(res.status, 200)
      assert.deepEqual(w.calls.find((c) => c.name === 'revoke_paid_plan')?.body, { p_payment: 'pay_1' })
    } finally {
      w.restore()
    }
  }
})

test('aviso: se o banco falhar, responde 500 (o Asaas tenta de novo); aviso fora do formato = 400', async () => {
  const w = world({ db: { billing_user_by_customer: () => owner, grant_paid_plan: () => new Response('erro', { status: 500 }) } })
  try {
    assert.equal((await hook(event('PAYMENT_RECEIVED'))).status, 500)
    assert.equal((await hook({ foo: 1 })).status, 400)
    assert.equal((await hook({ event: 'PAYMENT_RECEIVED', payment: {} })).status, 400)
    const bad = handleWebhook(new Request('https://x/api/payment/webhook', { method: 'POST', headers: { 'asaas-access-token': env.ASAAS_WEBHOOK_TOKEN! }, body: '{nao e json' }), env)
    assert.equal((await bad).status, 400)
    assert.equal((await handleWebhook(new Request('https://x/api/payment/webhook'), env)).status, 405)
  } finally {
    w.restore()
  }
})

// ---------------------------------------------------------------- plano fantasma (preço de teste só para um e-mail)

test('preço de teste: só o e-mail configurado paga R$ 5,00 (sem diferenciar maiúsculas); todos os outros pagam o preço normal', () => {
  const e = { ...env, BILLING_TEST_EMAIL: ' Eu@Exemplo.com ' }
  assert.equal(priceFor(e, 'eu@exemplo.com'), PRO_TEST_PRICE_BRL)
  assert.equal(priceFor(e, 'EU@EXEMPLO.COM'), PRO_TEST_PRICE_BRL)
  assert.equal(priceFor(e, 'outra@exemplo.com'), PRO_PRICE_BRL)
  assert.equal(priceFor(e, null), PRO_PRICE_BRL)
})

test('preço de teste: sem BILLING_TEST_EMAIL (ou vazio), o preço de teste não existe para ninguém', () => {
  assert.equal(priceFor(env, 'eu@exemplo.com'), PRO_PRICE_BRL)
  assert.equal(priceFor({ ...env, BILLING_TEST_EMAIL: '' }, ''), PRO_PRICE_BRL)
  assert.equal(priceFor({ ...env, BILLING_TEST_EMAIL: '   ' }, '   '), PRO_PRICE_BRL)
})

test('preço de teste: o checkout do e-mail de teste cria a assinatura de R$ 5,00; o de outro e-mail, a de R$ 39,90', async () => {
  const run = async (email: string) => {
    const w = newCustomerWorld()
    try {
      await handleCheckout(post('/api/checkout', { name: 'Maria Silva', cpf: CPF }), { env: { ...env, BILLING_TEST_EMAIL: 'eu@exemplo.com' }, userId: 'user-1', email })
      return w.calls.find((c) => c.name === 'POST /subscriptions')?.body?.value
    } finally {
      w.restore()
    }
  }
  assert.equal(await run('eu@exemplo.com'), 5)
  assert.equal(await run('maria@x.com'), 39.9)
})
