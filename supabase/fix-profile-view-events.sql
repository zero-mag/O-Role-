-- Rode isso no SQL Editor do Supabase (além dos outros fix-*.sql já rodados).
-- O contador total "Alcance no mapa" (profile_views) já existia; isso aqui
-- adiciona o registro de CADA visita com horário, pra dar pra montar o
-- gráfico "Visitas ao perfil por hora" de verdade (antes ficava sempre
-- vazio, porque esse dado nunca era guardado).

create table if not exists public.profile_view_events (
  id bigint generated always as identity primary key,
  room_id bigint not null references public.rooms(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists profile_view_events_room_idx on public.profile_view_events(room_id, created_at);

alter table public.profile_view_events enable row level security;

create policy "dono vê os próprios eventos de visita" on public.profile_view_events for select using (
  exists (select 1 from public.rooms r where r.id = room_id and r.owner_id = auth.uid())
);

grant select on public.profile_view_events to authenticated;
grant select, insert on public.profile_view_events to service_role;

-- agora a função de incrementar visita também registra o evento com horário
create or replace function public.increment_profile_views(p_room_id bigint)
returns void as $$
  update public.rooms set profile_views = profile_views + 1 where id = p_room_id;
  insert into public.profile_view_events (room_id) values (p_room_id);
$$ language sql security definer;

grant execute on function public.increment_profile_views(bigint) to anon, authenticated;
