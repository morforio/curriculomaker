-- Plano e créditos de cada conta.
-- Rodar uma vez no Supabase: SQL Editor > New query > colar tudo > Run.
--
-- Regras:
--   * Conta gratuita: 5 créditos que valem 30 dias desde a criação da conta (cada uso da IA, tradução ou exportação gasta 1).
--   * Conta paga: 60 créditos que valem 30 dias desde o pagamento (só IA e tradução gastam; exportar é ilimitado).
--   * "Travada" = conta não paga e sem crédito válido (acabaram ou venceram).
-- Só o Worker (chave service_role) cobra, devolve e concede créditos. O usuário só LÊ o próprio estado, pela função get_my_account().

create table public.credit_accounts (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  plan              text not null default 'free' check (plan in ('free', 'paid')),
  credits           integer not null default 5 check (credits >= 0),
  -- Quantos créditos a última concessão deu: limite para devolver um crédito (reembolso) sem passar do que foi dado.
  credits_granted   integer not null default 5 check (credits_granted >= 0),
  credits_expire_at timestamptz not null default (now() + interval '30 days'),
  -- Até quando a assinatura vale. Só existe em conta paga.
  paid_until        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (plan = 'free' or paid_until is not null)
);

-- Sem nenhuma política e sem permissão para anon e authenticated: a tabela é invisível pela API pública.
alter table public.credit_accounts enable row level security;
revoke all on public.credit_accounts from anon, authenticated;
grant select, insert, update, delete on public.credit_accounts to service_role;

-- Estado calculado de uma conta, com a hora do servidor (o relógio do navegador não vale).
create function public.credit_status(a public.credit_accounts) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'plan', case when a.plan = 'paid' and coalesce(a.paid_until, '-infinity') > now() then 'paid' else 'free' end,
    'paid', (a.plan = 'paid' and coalesce(a.paid_until, '-infinity') > now()),
    'credits', case when a.credits_expire_at > now() then a.credits else 0 end,
    'credits_expire_at', a.credits_expire_at,
    'paid_until', a.paid_until,
    'locked', not (a.plan = 'paid' and coalesce(a.paid_until, '-infinity') > now())
              and not (a.credits > 0 and a.credits_expire_at > now()),
    'server_now', now()
  );
$$;

-- Garante a linha da conta (contas criadas antes desta migração, ou se o gatilho falhar) e a trava para alteração.
create function public.ensure_credit_account(p_user uuid) returns public.credit_accounts
language plpgsql security definer
set search_path = ''
as $$
declare
  a public.credit_accounts;
begin
  insert into public.credit_accounts (user_id) values (p_user) on conflict (user_id) do nothing;
  select * into a from public.credit_accounts where user_id = p_user for update;
  return a;
end;
$$;

-- Leitura do próprio estado (usada pelo site para mostrar créditos e decidir o que fica travado).
create function public.get_my_account() returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  a public.credit_accounts;
begin
  if uid is null then
    raise exception 'não autenticado' using errcode = '28000';
  end if;
  a := public.ensure_credit_account(uid);
  return public.credit_status(a);
end;
$$;

-- Cobra 1 crédito (ou nenhum, se for exportação de conta paga). Atômico: a linha fica travada durante a conta.
create function public.spend_credit(p_user uuid, p_kind text) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  a public.credit_accounts;
  is_paid boolean;
  has_credit boolean;
begin
  if p_kind not in ('ai', 'translate', 'export') then
    raise exception 'tipo de uso inválido: %', p_kind;
  end if;
  a := public.ensure_credit_account(p_user);
  is_paid := a.plan = 'paid' and coalesce(a.paid_until, '-infinity') > now();
  has_credit := a.credits > 0 and a.credits_expire_at > now();

  if p_kind = 'export' and is_paid then
    return jsonb_build_object('ok', true, 'spent', 0) || public.credit_status(a);
  end if;
  if not has_credit then
    return jsonb_build_object('ok', false, 'reason', 'no_credits') || public.credit_status(a);
  end if;

  update public.credit_accounts set credits = credits - 1, updated_at = now() where user_id = p_user returning * into a;
  return jsonb_build_object('ok', true, 'spent', 1) || public.credit_status(a);
end;
$$;

-- Devolve 1 crédito quando o serviço falhou (IA fora do ar, por exemplo). Nunca passa do que foi concedido e não devolve crédito vencido.
create function public.refund_credit(p_user uuid) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  a public.credit_accounts;
begin
  a := public.ensure_credit_account(p_user);
  if a.credits_expire_at > now() then
    update public.credit_accounts
       set credits = least(credits + 1, credits_granted), updated_at = now()
     where user_id = p_user returning * into a;
  end if;
  return public.credit_status(a);
end;
$$;

-- Concede um plano: define créditos e validade (substitui o que havia, não soma). Será usada pelo aviso de pagamento e, por enquanto, à mão:
--   select public.grant_plan('<id do usuário>', 'paid', 60, 30);   -- vira conta paga: 60 créditos por 30 dias
--   select public.grant_plan('<id do usuário>', 'free', 5, 30);    -- volta a conta gratuita com 5 créditos
create function public.grant_plan(p_user uuid, p_plan text, p_credits integer, p_days integer) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  a public.credit_accounts;
begin
  if p_plan not in ('free', 'paid') then
    raise exception 'plano inválido: %', p_plan;
  end if;
  if p_credits < 0 or p_days <= 0 then
    raise exception 'créditos e dias precisam ser positivos';
  end if;
  insert into public.credit_accounts (user_id, plan, credits, credits_granted, credits_expire_at, paid_until)
  values (p_user, p_plan, p_credits, p_credits, now() + make_interval(days => p_days),
          case when p_plan = 'paid' then now() + make_interval(days => p_days) end)
  on conflict (user_id) do update
     set plan = excluded.plan,
         credits = excluded.credits,
         credits_granted = excluded.credits_granted,
         credits_expire_at = excluded.credits_expire_at,
         paid_until = excluded.paid_until,
         updated_at = now()
  returning * into a;
  return public.credit_status(a);
end;
$$;

-- Toda conta nova nasce com a linha de créditos (5 créditos por 30 dias).
create function public.handle_new_user_credits() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.credit_accounts (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created_credits
  after insert on auth.users
  for each row execute function public.handle_new_user_credits();

-- Contas que já existem ganham os 5 créditos, válidos por 30 dias a partir de agora.
insert into public.credit_accounts (user_id) select id from auth.users on conflict (user_id) do nothing;

-- Quem pode chamar o quê:
--   * Só get_my_account() é chamável pelo usuário logado (e só enxerga a própria conta).
--   * Cobrar, devolver e conceder créditos: só o service_role (o Worker).
--   * As demais funções são internas.
revoke execute on function public.credit_status(public.credit_accounts) from public, anon, authenticated;
revoke execute on function public.ensure_credit_account(uuid) from public, anon, authenticated;
revoke execute on function public.get_my_account() from public, anon;
revoke execute on function public.spend_credit(uuid, text) from public, anon, authenticated;
revoke execute on function public.refund_credit(uuid) from public, anon, authenticated;
revoke execute on function public.grant_plan(uuid, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.handle_new_user_credits() from public, anon, authenticated;

grant execute on function public.get_my_account() to authenticated;
grant execute on function public.spend_credit(uuid, text) to service_role;
grant execute on function public.refund_credit(uuid) to service_role;
grant execute on function public.grant_plan(uuid, text, integer, integer) to service_role;
