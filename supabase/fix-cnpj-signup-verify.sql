-- Rode isso no SQL Editor do Supabase (depois dos outros fix-*.sql já rodados).
-- Prepara o banco pra verificar posse de CNPJ também no cadastro DIRETO de
-- negócio (o "Com CNPJ, sem catálogo prévio") — hoje só o fluxo de
-- reivindicação ("Encontre a sua empresa") confirma isso por e-mail oficial;
-- o cadastro direto aceitava qualquer CNPJ ativo sem provar posse.
-- Mesma lógica do claim_codes, mas sem depender de já existir uma room
-- catalogada (aqui ainda não existe negócio nenhum cadastrado).

-- ============================================================
-- Códigos de verificação de posse (cadastro direto de negócio com CNPJ)
-- ============================================================
create table public.cnpj_signup_codes (
  id bigint generated always as identity primary key,
  token uuid not null default gen_random_uuid() unique, -- referência que o navegador usa (não o id sequencial, pra não dar pra adivinhar/enumerar)
  cnpj text not null,
  code text not null,
  sent_to_masked text,           -- ex: r***@bardoze.com.br — só pra mostrar na tela, nunca o e-mail completo
  attempts int not null default 0,
  verified boolean not null default false,
  verified_user_id uuid references public.profiles(id) on delete set null, -- preenchido só depois que a conta é criada, pra auditoria
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
comment on table public.cnpj_signup_codes is 'Código de 6 dígitos que confirma que quem está cadastrando um negócio (sem catálogo prévio) é o dono de verdade do CNPJ, antes da conta ser criada.';

alter table public.cnpj_signup_codes enable row level security;

-- ninguém acessa essa tabela direto pelo navegador — gerar/checar código e ler
-- o resultado passa sempre pela Edge Function (service_role), nunca pelo anon key
grant all on public.cnpj_signup_codes to service_role;
