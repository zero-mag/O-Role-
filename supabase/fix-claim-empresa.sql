-- Rode isso no SQL Editor do Supabase (depois dos outros fix-*.sql já rodados).
-- Prepara o banco pro fluxo "Encontre a sua empresa": guarda o CNPJ de cada
-- negócio catalogado (pra bater com o que a pessoa digitar no cadastro) e cria
-- a tabela que controla os códigos de verificação de posse.

-- ============================================================
-- 1) CNPJ em rooms — pra dar pra buscar "essa empresa já existe catalogada?"
-- ============================================================
alter table public.rooms add column if not exists cnpj text;
create index if not exists rooms_cnpj_idx on public.rooms(cnpj) where cnpj is not null;

-- ============================================================
-- 2) Códigos de verificação de posse (reivindicação de empresa)
-- ============================================================
create table public.claim_codes (
  id bigint generated always as identity primary key,
  token uuid not null default gen_random_uuid() unique, -- referência que o navegador usa (não o id sequencial, pra não dar pra adivinhar/enumerar)
  room_id bigint not null references public.rooms(id) on delete cascade,
  claiming_user_id uuid references public.profiles(id) on delete cascade, -- só preenchido no finalize-claim, depois que a conta existe
  cnpj text not null,
  code text not null,
  sent_to_masked text,           -- ex: r***@bardoze.com.br — só pra mostrar na tela, nunca o e-mail completo
  attempts int not null default 0,
  verified boolean not null default false,
  finalized boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
comment on table public.claim_codes is 'Código de 6 dígitos que confirma que quem está reivindicando um negócio catalogado é o dono de verdade do CNPJ.';

alter table public.claim_codes enable row level security;

-- a pessoa só vê o próprio pedido de reivindicação em andamento (pra mostrar
-- "mandamos pra fulano@..." na tela) — nunca o e-mail completo de outro CNPJ
create policy "usuário vê a própria reivindicação" on public.claim_codes for select using (auth.uid() = claiming_user_id);

-- criar/verificar código passa só pela Edge Function (service_role) — ninguém
-- gera nem confirma código direto pelo navegador, pra não dar pra forçar tentativas
grant select on public.claim_codes to authenticated;
grant all on public.claim_codes to service_role;
