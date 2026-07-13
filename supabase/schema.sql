-- ============================================================
-- O ROLÊ+ — SCHEMA DO BANCO (SUPABASE / POSTGRES)
-- Fase 1 do plano de migração: fundação de dados.
-- Rode este arquivo inteiro no SQL Editor do seu projeto Supabase.
-- ============================================================

-- ---------- PROFILES (conta — pessoal ou business) ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  type text not null check (type in ('personal','business')),
  name text not null,
  email text not null,
  avatar_url text,
  created_at timestamptz not null default now(),

  -- só preenchido quando type = 'business'
  segment text,
  emoji text,
  cep text,
  address text,
  lat double precision,
  lng double precision,
  cnpj text,
  razao_social text,
  verified boolean not null default false,
  whatsapp text,
  instagram text,
  site text,
  cover_url text,
  horario jsonb,
  oferece text[] not null default '{}',
  club_until timestamptz,
  boost_until timestamptz
);
comment on table public.profiles is 'Conta do usuário. Uma linha por pessoa autenticada, criada automaticamente no signup.';

-- cria o profile sozinho assim que alguém se cadastra (auth.users)
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, type, name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'type','personal'), coalesce(new.raw_user_meta_data->>'name','Você'), new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------- ROOMS (o que aparece no mapa: negócio fixo ou rolê temporário) ----------
create table public.rooms (
  id bigint generated always as identity primary key,
  owner_id uuid references public.profiles(id) on delete cascade,
  is_business boolean not null default false,
  nome text not null,
  emoji text not null default '🎉',
  cat text not null,
  desc_txt text,
  address text,
  lat double precision not null,
  lng double precision not null,
  priv boolean not null default false,
  pass_hash text,
  cover_url text,
  avatar_url text,
  horario jsonb,
  oferece text[] not null default '{}',
  whatsapp text,
  instagram text,
  site text,
  verified boolean not null default false,
  club_until timestamptz,
  boost_until timestamptz,
  expires_at timestamptz,           -- null = permanente (business); preenchido = rolê pessoal expira
  created_at timestamptz not null default now()
);
comment on table public.rooms is 'Pin público no mapa — pode ser um negócio (permanente) ou um rolê pessoal (expira em expires_at).';

create index rooms_owner_idx on public.rooms(owner_id);
create index rooms_cat_idx on public.rooms(cat);
create index rooms_expires_idx on public.rooms(expires_at);

-- ---------- VITRINE (produtos/promoções fixas do negócio) ----------
create table public.vitrine_items (
  id bigint generated always as identity primary key,
  room_id bigint not null references public.rooms(id) on delete cascade,
  emoji text not null,
  nome text not null,
  desc_txt text,
  preco text,
  created_at timestamptz not null default now()
);

-- ---------- PROMOÇÕES (com validade) ----------
create table public.promocoes (
  id bigint generated always as identity primary key,
  room_id bigint not null references public.rooms(id) on delete cascade,
  emoji text not null,
  titulo text not null,
  validade timestamptz not null,
  created_at timestamptz not null default now()
);

-- ---------- MENSAGENS (chat de cada sala) ----------
create table public.messages (
  id bigint generated always as identity primary key,
  room_id bigint not null references public.rooms(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  sender_name text not null,
  texto text not null,
  created_at timestamptz not null default now()
);
create index messages_room_idx on public.messages(room_id, created_at);

-- ---------- PEDIDOS DE PAGAMENTO (InfinitePay) ----------
create table public.payment_intents (
  order_nsu text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('boost_business','club_subscription','role_personal')),
  amount_cents int not null,
  payload jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending','paid','failed')),
  created_at timestamptz not null default now()
);

-- ============================================================
-- GRANTS — sem isso, dá "permission denied" antes do RLS entrar em ação
-- ============================================================
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.profiles, public.rooms, public.vitrine_items, public.promocoes, public.messages to anon, authenticated;
grant select, insert on public.payment_intents to authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- ============================================================
-- ROW LEVEL SECURITY — cada tabela só deixa fazer o que deveria
-- ============================================================
alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.vitrine_items enable row level security;
alter table public.promocoes enable row level security;
alter table public.messages enable row level security;
alter table public.payment_intents enable row level security;

-- pedidos de pagamento: usuário só cria/vê os próprios; quem marca como "paid" é a Edge Function (service role, ignora RLS)
create policy "usuário vê só as próprias intents" on public.payment_intents for select using (auth.uid() = user_id);
create policy "usuário cria só a própria intent" on public.payment_intents for insert with check (auth.uid() = user_id);

-- profiles: todo mundo pode ler (perfil público de negócio), só o dono edita o próprio
create policy "profiles são públicos pra leitura" on public.profiles for select using (true);
create policy "só o dono edita o próprio profile" on public.profiles for update using (auth.uid() = id);

-- rooms: leitura pública (é o mapa), só o dono cria/edita/apaga o que é dele
create policy "rooms são públicos pra leitura" on public.rooms for select using (true);
create policy "dono cria seu room" on public.rooms for insert with check (auth.uid() = owner_id);
create policy "dono edita seu room" on public.rooms for update using (auth.uid() = owner_id);
create policy "dono apaga seu room" on public.rooms for delete using (auth.uid() = owner_id);

-- vitrine/promoções: leitura pública, só o dono do room mexe
create policy "vitrine pública pra leitura" on public.vitrine_items for select using (true);
create policy "dono do room gerencia vitrine" on public.vitrine_items for all using (
  exists (select 1 from public.rooms r where r.id = room_id and r.owner_id = auth.uid())
);
create policy "promoções públicas pra leitura" on public.promocoes for select using (true);
create policy "dono do room gerencia promoções" on public.promocoes for all using (
  exists (select 1 from public.rooms r where r.id = room_id and r.owner_id = auth.uid())
);

-- mensagens: só quem está autenticado lê/escreve (chat não é público feed, é sala)
create policy "autenticados leem mensagens" on public.messages for select using (auth.role() = 'authenticated');
create policy "autenticados enviam mensagens" on public.messages for insert with check (auth.role() = 'authenticated');

-- ============================================================
-- REALTIME — liga a transmissão ao vivo pras tabelas que o mapa/chat usam
-- ============================================================
alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.vitrine_items;
alter publication supabase_realtime add table public.promocoes;
