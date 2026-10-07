-- Currículo base de cada usuário: uma linha por idioma (aba pt-BR e aba English).
-- Rodar uma vez no Supabase: SQL Editor > New query > colar tudo > Run.
-- Variantes por vaga (fase 6) vão pedir outra restrição de unicidade; isso se resolve numa migração futura.

create table public.resumes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  lang       text not null check (lang in ('pt', 'en')),
  content    jsonb not null check (octet_length(content::text) <= 500000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, lang)
);

alter table public.resumes enable row level security;

-- Permissões explícitas: só quem está logado ("authenticated") mexe na tabela; visitante sem login ("anon") não tem acesso nenhum.
-- (Com "Automatically expose new tables" desligado no Supabase, isto é o que libera a tabela para a API.)
revoke all on public.resumes from anon;
grant select, insert, update, delete on public.resumes to authenticated;

-- Cada usuário só enxerga e altera as próprias linhas. Sem login, nada.
create policy "resumes_select_own" on public.resumes
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "resumes_insert_own" on public.resumes
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "resumes_update_own" on public.resumes
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "resumes_delete_own" on public.resumes
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Atualiza updated_at a cada alteração.
create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger resumes_set_updated_at
  before update on public.resumes
  for each row execute function public.set_updated_at();

-- A função do gatilho não precisa ser chamável pela API.
revoke execute on function public.set_updated_at() from public, anon, authenticated;
