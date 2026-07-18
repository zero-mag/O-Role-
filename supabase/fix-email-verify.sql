-- Rode isso no SQL Editor do Supabase (além dos outros fix-*.sql já rodados).
-- Sistema próprio de confirmação de e-mail por código de 6 dígitos (igual ao
-- da reivindicação de CNPJ), em vez do link mágico nativo do Supabase — assim
-- a criação de conta nunca trava esperando confirmação, só o acesso ao app.
--
-- IMPORTANTE: se "Enable email confirmations" estiver ligado em Authentication
-- → Settings no painel do Supabase, desligue — senão o Supabase manda o e-mail
-- nativo dele por cima desse aqui.

-- ============================================================
-- 1) email_verified — flag pública (o app precisa ler isso pra decidir se
-- mostra a tela de bloqueio), protegida contra escrita do próprio cliente.
-- ============================================================
alter table public.profiles add column if not exists email_verified boolean not null default false;

-- contas que já existiam ANTES dessa migração ficam liberadas — ninguém que
-- já usava o app é pego de surpresa pedindo confirmação. Só quem criar conta
-- daqui pra frente passa pelo código (a coluna nasce default false, então
-- todo cadastro novo já entra exigindo confirmação normalmente).
update public.profiles set email_verified = true where email_verified = false;

-- login social (Google) já vem com e-mail confirmado pelo próprio provedor —
-- não faz sentido pedir confirmação de novo. handle_new_user roda em toda
-- criação de conta (senha OU social); aqui só ajustamos pra já nascer
-- verificado quando o provider não for "email" (ou seja, veio de OAuth).
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, type, name, email, email_verified)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'type','personal'),
    coalesce(new.raw_user_meta_data->>'name','Você'),
    new.email,
    coalesce(new.raw_app_meta_data->>'provider','email') <> 'email'
  );
  return new;
end;
$$ language plpgsql security definer;

create or replace function public.protect_email_verified()
returns trigger as $$
begin
  if auth.role() <> 'service_role' then
    new.email_verified := old.email_verified;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists protect_email_verified_trigger on public.profiles;
create trigger protect_email_verified_trigger before update on public.profiles
for each row execute procedure public.protect_email_verified();

-- ============================================================
-- 2) email_verify_codes — o código em si NUNCA pode ser lido pelo próprio
-- cliente (diferente de claim_codes, aqui o dono já está autenticado desde
-- o início, então se desse pra fazer select a pessoa leria o próprio código
-- sem precisar abrir o e-mail). Por isso: RLS ligado, sem nenhuma policy pra
-- authenticated/anon — só a service_role (via Edge Function) enxerga.
-- ============================================================
create table public.email_verify_codes (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  code text not null,
  attempts int not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
comment on table public.email_verify_codes is 'Código de 6 dígitos que confirma o e-mail da conta recém-criada. Nunca exposto ao cliente — só as Edge Functions send-verify-code/verify-email-code leem/escrevem aqui.';

alter table public.email_verify_codes enable row level security;
-- de propósito: nenhuma policy de select/insert/update pra authenticated/anon.
grant all on public.email_verify_codes to service_role;
grant usage, select on sequence email_verify_codes_id_seq to service_role;
