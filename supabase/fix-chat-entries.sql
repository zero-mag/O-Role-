-- Rode isso no SQL Editor do Supabase (além dos outros fix-*.sql já rodados).
-- "Entradas no chat" no painel business sempre mostrava "Sem dados ainda"
-- porque não existia uma forma seu segura do dono contar quantas pessoas
-- diferentes entraram na sala dele — a tabela user_room_flags só deixa
-- cada usuário ver as PRÓPRIAS flags (por privacidade), então essa função
-- conta por trás, e só devolve algo se quem perguntar for o dono do room.

create or replace function public.count_room_joins(p_room_id bigint)
returns int as $$
  select count(*)::int from public.user_room_flags
  where room_id = p_room_id and flag = 'joined'
  and exists (select 1 from public.rooms r where r.id = p_room_id and r.owner_id = auth.uid());
$$ language sql security definer stable;

grant execute on function public.count_room_joins(bigint) to authenticated;
