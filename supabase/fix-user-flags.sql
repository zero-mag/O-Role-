-- Rode isso no SQL Editor do Supabase (além dos outros fix-*.sql já rodados).
-- Cria a tabela que guarda "lugares salvos", "rolês que entrei" e "bloqueios"
-- de cada usuário — antes isso só existia no navegador local (sumia ao trocar
-- de aparelho ou limpar o navegador).

create table public.user_room_flags (
  user_id uuid not null references public.profiles(id) on delete cascade,
  room_id bigint not null references public.rooms(id) on delete cascade,
  flag text not null check (flag in ('saved','joined','blocked')),
  created_at timestamptz not null default now(),
  primary key (user_id, room_id, flag)
);

alter table public.user_room_flags enable row level security;

create policy "usuário vê só as próprias flags" on public.user_room_flags for select using (auth.uid() = user_id);
create policy "usuário cria só a própria flag" on public.user_room_flags for insert with check (auth.uid() = user_id);
create policy "usuário apaga só a própria flag" on public.user_room_flags for delete using (auth.uid() = user_id);

grant usage on schema public to authenticated;
grant select, insert, delete on public.user_room_flags to authenticated;
grant select, insert, delete on public.user_room_flags to service_role;
