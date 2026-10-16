import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

/**
 * Testes do banco (supabase/migrations): rodam as migrações de verdade num PostgreSQL em memória (PGlite), com um Supabase de mentira
 * (esquema auth, papéis anon/authenticated/service_role e auth.uid()). Conferem o que o servidor promete: isolamento por usuário (RLS),
 * créditos (cobrança, devolução, validade), plano pro (concessão única por cobrança, estorno) e o que cada papel pode ou não chamar.
 */

const migration = (name: string) => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8')

const STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
`

let db: PGlite

type Role = 'anon' | 'authenticated' | 'service_role'

/** Executa como um dos papéis do Supabase (e, para authenticated, como um usuário); volta a ser administrador no fim. */
async function as<T>(role: Role, uid: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false); set role ${role};`)
  try {
    return await fn()
  } finally {
    await db.exec('reset role')
  }
}

async function newUser(email: string): Promise<string> {
  const r = await db.query<{ id: string }>('insert into auth.users (email) values ($1) returning id', [email])
  return r.rows[0].id
}

const rpc = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> => (await db.query<{ r: T }>(`select ${sql} as r`, params)).rows[0].r

const spend = (uid: string, kind: 'ai' | 'translate' | 'export') => as('service_role', null, () => rpc<{ ok: boolean; spent?: number; reason?: string; credits: number; locked: boolean }>('public.spend_credit($1, $2)', [uid, kind]))
const account = (uid: string) => db.query<{ plan: string; credits: number; credits_granted: number; paid_until: string | null }>('select plan, credits, credits_granted, paid_until from public.credit_accounts where user_id = $1', [uid]).then((r) => r.rows[0])

before(async () => {
  db = new PGlite()
  await db.exec(STUB)
  for (const f of ['20261006000000_resumes.sql', '20261008000000_credits.sql', '20261012000000_billing.sql']) await db.exec(migration(f))
})

after(async () => {
  await db.close()
})

test('as três migrações rodam em ordem num banco novo', async () => {
  const r = await db.query<{ n: string }>(`select count(*)::text as n from information_schema.tables where table_schema = 'public' and table_name in ('resumes','credit_accounts','billing_customers','credit_payments')`)
  assert.equal(r.rows[0].n, '4')
})

test('resumes: cada usuário só enxerga e altera os próprios currículos; visitante sem login não acessa', async () => {
  const a = await newUser('a@x.com')
  const b = await newUser('b@x.com')
  await as('authenticated', a, () => db.query(`insert into public.resumes (user_id, lang, content) values ($1, 'pt', '{"v":1}')`, [a]))
  assert.equal((await as('authenticated', a, () => db.query('select * from public.resumes'))).rows.length, 1)
  assert.equal((await as('authenticated', b, () => db.query('select * from public.resumes'))).rows.length, 0)
  // B não consegue gravar currículo no nome de A, nem apagar o de A
  await assert.rejects(as('authenticated', b, () => db.query(`insert into public.resumes (user_id, lang, content) values ($1, 'en', '{}')`, [a])), /row-level security/)
  await as('authenticated', b, () => db.query('delete from public.resumes'))
  assert.equal((await as('authenticated', a, () => db.query('select * from public.resumes'))).rows.length, 1)
  await assert.rejects(as('anon', null, () => db.query('select * from public.resumes')), /permission denied/)
  // um currículo por idioma e usuário
  await assert.rejects(as('authenticated', a, () => db.query(`insert into public.resumes (user_id, lang, content) values ($1, 'pt', '{}')`, [a])), /unique|duplicate/)
})

test('conta nova nasce com 5 créditos, gratuita e liberada (gatilho do cadastro)', async () => {
  const u = await newUser('nova@x.com')
  const acc = await account(u)
  assert.equal(acc.plan, 'free')
  assert.equal(acc.credits, 5)
  const st = await as('authenticated', u, () => rpc<{ plan: string; credits: number; locked: boolean; paid: boolean }>('public.get_my_account()'))
  assert.deepEqual({ plan: st.plan, credits: st.credits, locked: st.locked, paid: st.paid }, { plan: 'free', credits: 5, locked: false, paid: false })
})

test('o usuário não mexe nas tabelas de créditos nem de pagamento, nem chama as funções de cobrança', async () => {
  const u = await newUser('curioso@x.com')
  for (const t of ['credit_accounts', 'credit_payments', 'billing_customers']) {
    await assert.rejects(as('authenticated', u, () => db.query(`select * from public.${t}`)), /permission denied/, t)
    await assert.rejects(as('anon', null, () => db.query(`select * from public.${t}`)), /permission denied/, t)
  }
  await assert.rejects(as('authenticated', u, () => db.query(`update public.credit_accounts set credits = 9999 where user_id = $1`, [u])), /permission denied/)
  await assert.rejects(as('authenticated', u, () => rpc('public.spend_credit($1, $2)', [u, 'ai'])), /permission denied/)
  await assert.rejects(as('authenticated', u, () => rpc('public.grant_plan($1, $2, $3, $4)', [u, 'paid', 999, 30])), /permission denied/)
  await assert.rejects(as('authenticated', u, () => rpc('public.grant_paid_plan($1, $2, $3, $4)', [u, 'pay_x', 60, 31])), /permission denied/)
  await assert.rejects(as('anon', null, () => rpc('public.get_my_account()')), /permission denied/)
})

test('cobrança: IA e tradução gastam 1 crédito; ao zerar, a conta trava e a cobrança recusa', async () => {
  const u = await newUser('gasta@x.com')
  for (let i = 5; i > 0; i--) {
    const r = await spend(u, i % 2 ? 'ai' : 'translate')
    assert.equal(r.ok, true)
    assert.equal(r.spent, 1)
    assert.equal(r.credits, i - 1)
  }
  const sem = await spend(u, 'ai')
  assert.equal(sem.ok, false)
  assert.equal(sem.reason, 'no_credits')
  assert.equal(sem.locked, true)
  assert.equal((await account(u)).credits, 0)
  // exportar também gasta 1 na conta gratuita (e recusa sem crédito)
  assert.equal((await spend(u, 'export')).ok, false)
  await assert.rejects(as('service_role', null, () => rpc('public.spend_credit($1, $2)', [u, 'xyz'])), /tipo de uso inválido/)
})

test('exportar na conta gratuita gasta 1 crédito; na paga não gasta nenhum, mas IA e tradução gastam', async () => {
  const free = await newUser('livre@x.com')
  assert.equal((await spend(free, 'export')).spent, 1)
  assert.equal((await account(free)).credits, 4)

  const paid = await newUser('paga@x.com')
  await as('service_role', null, () => rpc('public.grant_plan($1, $2, $3, $4)', [paid, 'paid', 60, 31]))
  const ex = await spend(paid, 'export')
  assert.equal(ex.ok, true)
  assert.equal(ex.spent, 0)
  assert.equal((await account(paid)).credits, 60)
  assert.equal((await spend(paid, 'ai')).spent, 1)
  assert.equal((await account(paid)).credits, 59)
})

test('devolução: volta 1 crédito, nunca passa do que foi concedido e não devolve crédito vencido', async () => {
  const u = await newUser('devolve@x.com')
  await spend(u, 'ai')
  const back = () => as('service_role', null, () => rpc<{ credits: number }>('public.refund_credit($1)', [u]))
  assert.equal((await back()).credits, 5)
  assert.equal((await back()).credits, 5) // já no limite concedido
  await db.query(`update public.credit_accounts set credits = 1, credits_expire_at = now() - interval '1 day' where user_id = $1`, [u])
  await back()
  assert.equal((await account(u)).credits, 1) // vencido: não devolve
})

test('validade: crédito vencido não vale e a conta trava', async () => {
  const u = await newUser('vence@x.com')
  await db.query(`update public.credit_accounts set credits_expire_at = now() - interval '1 minute' where user_id = $1`, [u])
  const st = await as('authenticated', u, () => rpc<{ credits: number; locked: boolean }>('public.get_my_account()'))
  assert.equal(st.credits, 0)
  assert.equal(st.locked, true)
  assert.equal((await spend(u, 'ai')).reason, 'no_credits')
})

test('plano pago vencido (paid_until no passado) volta a valer como gratuito', async () => {
  const u = await newUser('venceu@x.com')
  await as('service_role', null, () => rpc('public.grant_plan($1, $2, $3, $4)', [u, 'paid', 60, 31]))
  await db.query(`update public.credit_accounts set paid_until = now() - interval '1 hour', credits = 0 where user_id = $1`, [u])
  const st = await as('authenticated', u, () => rpc<{ plan: string; paid: boolean; locked: boolean }>('public.get_my_account()'))
  assert.deepEqual({ plan: st.plan, paid: st.paid, locked: st.locked }, { plan: 'free', paid: false, locked: true })
})

test('grant_plan substitui o saldo (não soma) e recusa valores inválidos', async () => {
  const u = await newUser('plano@x.com')
  await spend(u, 'ai')
  await as('service_role', null, () => rpc('public.grant_plan($1, $2, $3, $4)', [u, 'paid', 60, 31]))
  const acc = await account(u)
  assert.equal(acc.credits, 60)
  assert.equal(acc.plan, 'paid')
  await assert.rejects(as('service_role', null, () => rpc('public.grant_plan($1, $2, $3, $4)', [u, 'vip', 1, 1])), /plano inválido/)
  await assert.rejects(as('service_role', null, () => rpc('public.grant_plan($1, $2, $3, $4)', [u, 'paid', -1, 1])), /positivos/)
})

test('pagamento: cada cobrança do Asaas libera o pacote uma única vez (aviso repetido não zera o saldo)', async () => {
  const u = await newUser('paga-uma-vez@x.com')
  const grant = () => as('service_role', null, () => rpc<{ granted: boolean }>('public.grant_paid_plan($1, $2, $3, $4)', [u, 'pay_001', 60, 31]))
  assert.equal((await grant()).granted, true)
  await spend(u, 'ai')
  await spend(u, 'translate')
  assert.equal((await account(u)).credits, 58)
  assert.equal((await grant()).granted, false) // aviso repetido
  assert.equal((await account(u)).credits, 58)
  // a cobrança do mês seguinte é outra: renova o pacote
  const next = await as('service_role', null, () => rpc<{ granted: boolean }>('public.grant_paid_plan($1, $2, $3, $4)', [u, 'pay_002', 60, 31]))
  assert.equal(next.granted, true)
  assert.equal((await account(u)).credits, 60)
})

test('estorno: trava a conta, uma vez só; estornar um mês antigo não tira o plano de quem já pagou o seguinte', async () => {
  const u = await newUser('estorno@x.com')
  const grant = (id: string) => as('service_role', null, () => rpc('public.grant_paid_plan($1, $2, $3, $4)', [u, id, 60, 31]))
  const revoke = (id: string) => as('service_role', null, () => rpc<{ revoked: boolean }>('public.revoke_paid_plan($1)', [id]))
  await grant('pay_a')
  assert.equal((await revoke('pay_a')).revoked, true)
  assert.equal((await account(u)).plan, 'free')
  assert.equal((await revoke('pay_a')).revoked, false) // já estornada
  assert.equal((await revoke('pay_inexistente')).revoked, false)

  const v = await newUser('estorno2@x.com')
  const grantV = (id: string) => as('service_role', null, () => rpc('public.grant_paid_plan($1, $2, $3, $4)', [v, id, 60, 31]))
  await grantV('pay_old')
  await db.query(`update public.credit_payments set granted_at = now() - interval '40 days' where payment_id = 'pay_old'`)
  await grantV('pay_new')
  assert.equal((await revoke('pay_old')).revoked, false) // há cobrança mais nova e válida
  assert.equal((await account(v)).plan, 'paid')
})

test('cliente do Asaas: guarda e acha o dono; a assinatura não é apagada por uma gravação sem ela', async () => {
  const u = await newUser('cliente@x.com')
  const w = <T>(sql: string, p: unknown[]) => as('service_role', null, () => rpc<T>(sql, p))
  assert.equal(await w('public.billing_get($1)', [u]), null)
  await w('public.billing_save($1, $2, $3)', [u, 'cus_1', null])
  assert.deepEqual(await w('public.billing_get($1)', [u]), { customer_id: 'cus_1', subscription_id: null })
  await w('public.billing_save($1, $2, $3)', [u, 'cus_1', 'sub_1'])
  await w('public.billing_save($1, $2, $3)', [u, 'cus_1', null])
  assert.deepEqual(await w('public.billing_get($1)', [u]), { customer_id: 'cus_1', subscription_id: 'sub_1' })
  assert.deepEqual(await w('public.billing_user_by_customer($1)', ['cus_1']), { user_id: u, subscription_id: 'sub_1' })
  assert.equal(await w('public.billing_user_by_customer($1)', ['cus_desconhecido']), null)
})

test('apagar a conta apaga os dados dela (cascata): currículo, créditos, cliente e pagamentos', async () => {
  const u = await newUser('apaga@x.com')
  await db.query(`insert into public.resumes (user_id, lang, content) values ($1, 'pt', '{}')`, [u])
  await as('service_role', null, () => rpc('public.billing_save($1, $2, $3)', [u, 'cus_apaga', 'sub_apaga']))
  await as('service_role', null, () => rpc('public.grant_paid_plan($1, $2, $3, $4)', [u, 'pay_apaga', 60, 31]))
  await db.query('delete from auth.users where id = $1', [u])
  for (const t of ['resumes', 'credit_accounts', 'billing_customers', 'credit_payments']) {
    const r = await db.query<{ n: string }>(`select count(*)::text as n from public.${t} where user_id = $1`, [u])
    assert.equal(r.rows[0].n, '0', t)
  }
})
