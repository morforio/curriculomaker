-- Pagamento do plano pro (Asaas): quem é cliente e quais cobranças já foram aplicadas.
-- Rodar uma vez no Supabase (depois da migração dos créditos): SQL Editor > New query > colar tudo > Run.
--
-- Só o Worker (chave service_role) lê e grava aqui. O usuário não enxerga nada destas tabelas.
-- O CPF do cliente NUNCA é guardado: ele só vai ao Asaas, que o exige para gerar a cobrança.

-- Ligação entre a conta do usuário e o cliente/assinatura no Asaas.
create table public.billing_customers (
  user_id               uuid primary key references auth.users (id) on delete cascade,
  asaas_customer_id     text not null unique,
  asaas_subscription_id text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Cada cobrança paga que já virou plano. A chave é o id da cobrança no Asaas: o aviso de pagamento pode chegar repetido
-- (e no cartão chega duas vezes, com 32 dias de diferença), mas cada cobrança concede o pacote uma única vez.
create table public.credit_payments (
  payment_id text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index credit_payments_user_idx on public.credit_payments (user_id, granted_at desc);

alter table public.billing_customers enable row level security;
alter table public.credit_payments enable row level security;
revoke all on public.billing_customers from anon, authenticated;
revoke all on public.credit_payments from anon, authenticated;
grant select, insert, update, delete on public.billing_customers to service_role;
grant select, insert, update, delete on public.credit_payments to service_role;

-- Cliente e assinatura de um usuário (null se ainda não existem).
create function public.billing_get(p_user uuid) returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object('customer_id', b.asaas_customer_id, 'subscription_id', b.asaas_subscription_id)
  from public.billing_customers b where b.user_id = p_user;
$$;

-- Grava (ou atualiza) o cliente e a assinatura de um usuário. Assinatura nula não apaga a que já existia.
create function public.billing_save(p_user uuid, p_customer text, p_subscription text) returns void
language sql security definer
set search_path = ''
as $$
  insert into public.billing_customers (user_id, asaas_customer_id, asaas_subscription_id)
  values (p_user, p_customer, p_subscription)
  on conflict (user_id) do update
     set asaas_customer_id = excluded.asaas_customer_id,
         asaas_subscription_id = coalesce(excluded.asaas_subscription_id, public.billing_customers.asaas_subscription_id),
         updated_at = now();
$$;

-- Quem é o dono de um cliente do Asaas (usado pelo aviso de pagamento).
create function public.billing_user_by_customer(p_customer text) returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object('user_id', b.user_id, 'subscription_id', b.asaas_subscription_id)
  from public.billing_customers b where b.asaas_customer_id = p_customer;
$$;

-- Aplica o plano pro por uma cobrança paga, uma única vez por cobrança (idempotente). Devolve { granted: true | false }.
create function public.grant_paid_plan(p_user uuid, p_payment text, p_credits integer, p_days integer) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  inserted integer;
begin
  insert into public.credit_payments (payment_id, user_id) values (p_payment, p_user) on conflict (payment_id) do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then
    return jsonb_build_object('granted', false);
  end if;
  perform public.grant_plan(p_user, 'paid', p_credits, p_days);
  return jsonb_build_object('granted', true);
end;
$$;

-- Estorno ou chargeback de uma cobrança: trava a conta, mas só se não houver uma cobrança válida mais nova
-- (estornar um mês antigo não pode tirar o plano de quem já pagou o mês seguinte). Devolve { revoked: true | false }.
create function public.revoke_paid_plan(p_payment text) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  pay public.credit_payments;
begin
  select * into pay from public.credit_payments where payment_id = p_payment for update;
  if not found or pay.revoked_at is not null then
    return jsonb_build_object('revoked', false);
  end if;
  update public.credit_payments set revoked_at = now() where payment_id = p_payment;
  if exists (select 1 from public.credit_payments where user_id = pay.user_id and revoked_at is null and granted_at > pay.granted_at) then
    return jsonb_build_object('revoked', false); -- já existe uma cobrança válida e mais nova: o plano atual vem dela
  end if;
  perform public.grant_plan(pay.user_id, 'free', 0, 1);
  return jsonb_build_object('revoked', true);
end;
$$;

revoke execute on function public.billing_get(uuid) from public, anon, authenticated;
revoke execute on function public.billing_save(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.billing_user_by_customer(text) from public, anon, authenticated;
revoke execute on function public.grant_paid_plan(uuid, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.revoke_paid_plan(text) from public, anon, authenticated;

grant execute on function public.billing_get(uuid) to service_role;
grant execute on function public.billing_save(uuid, text, text) to service_role;
grant execute on function public.billing_user_by_customer(text) to service_role;
grant execute on function public.grant_paid_plan(uuid, text, integer, integer) to service_role;
grant execute on function public.revoke_paid_plan(text) to service_role;
