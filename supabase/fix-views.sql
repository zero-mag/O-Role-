-- Rode isso no SQL Editor do Supabase (além do schema.sql e fix-payments.sql).
-- Adiciona a contagem real de "visitas ao perfil" pros negócios — antes o
-- painel mostrava sempre "Sem dados ainda" porque essa coluna nem existia.

alter table public.rooms add column if not exists profile_views int not null default 0;

-- soma 1 de forma atômica (evita perder contagem quando duas pessoas veem
-- o perfil ao mesmo tempo); roda com privilégio de dono da função, então
-- funciona mesmo com RLS de update restrito ao dono do room.
create or replace function public.increment_profile_views(p_room_id bigint)
returns void as $$
  update public.rooms set profile_views = profile_views + 1 where id = p_room_id;
$$ language sql security definer;

grant execute on function public.increment_profile_views(bigint) to anon, authenticated;
