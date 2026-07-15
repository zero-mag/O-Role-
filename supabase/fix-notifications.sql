-- Rode isso no SQL Editor do Supabase (além dos outros fix-*.sql já rodados).
-- Cria a tabela de notificações de verdade — antes a aba sempre mostrava só
-- um "Bem-vindo ao Rolê+!" fixo, sem refletir nada que realmente aconteceu.
-- Só as Edge Functions (chave de serviço) podem criar notificação, pra
-- ninguém conseguir se auto-notificar de coisa que não aconteceu de verdade.

create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  icon text not null default '🔔',
  title text not null,
  body text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "usuário vê só as próprias notificações" on public.notifications for select using (auth.uid() = user_id);
create policy "usuário marca como lida a própria notificação" on public.notifications for update using (auth.uid() = user_id);

grant usage on schema public to authenticated;
grant select, update on public.notifications to authenticated;
grant select, insert, update on public.notifications to service_role;
