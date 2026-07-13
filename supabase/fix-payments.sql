-- Rode isso no SQL Editor do Supabase (além do schema.sql e do fix-grants.sql).
-- Cria a tabela que guarda "o que essa cobrança deveria liberar" antes de mandar
-- o usuário pro checkout do InfinitePay. Quem confirma e libera de verdade é a
-- Edge Function "verify-payment" (usando a chave de serviço, nunca o navegador).

create table public.payment_intents (
  order_nsu text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('boost_business','club_subscription','role_personal')),
  amount_cents int not null,
  payload jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending','paid','failed')),
  created_at timestamptz not null default now()
);

alter table public.payment_intents enable row level security;

-- o usuário só cria/vê os próprios pedidos — quem marca como "paid" é só a Edge Function
-- (ela usa a service role key, que ignora RLS, então não precisa de política de update aqui)
create policy "usuário vê só as próprias intents" on public.payment_intents for select using (auth.uid() = user_id);
create policy "usuário cria só a própria intent" on public.payment_intents for insert with check (auth.uid() = user_id);

grant usage on schema public to anon, authenticated;
grant select, insert on public.payment_intents to authenticated;
