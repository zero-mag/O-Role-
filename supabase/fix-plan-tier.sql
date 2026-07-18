-- Rode isso no SQL Editor do Supabase (além dos outros fix-*.sql já rodados).
-- Fecha uma falha de segurança real: hoje qualquer dono de negócio/perfil pode
-- escrever direto em club_until/boost_until pelo próprio navegador (o RLS de
-- update só confere dono da linha, não confere QUAL coluna está mudando — o
-- mesmo buraco que fix-admin-tool.sql já tinha fechado pra is_admin nunca foi
-- fechado pra essas duas colunas). Também adiciona plan_tier, que hoje não
-- existe em lugar nenhum — Start e Plus viram a mesma coisa depois de pagar.

-- ============================================================
-- 1) plan_tier — qual plano a conta assinou (null = não assinante)
-- ============================================================
alter table public.profiles add column if not exists plan_tier text check (plan_tier in ('start','plus','premium'));
alter table public.rooms add column if not exists plan_tier text check (plan_tier in ('start','plus','premium'));

-- ============================================================
-- 2) protege club_until / boost_until / plan_tier: só a service_role
-- (Edge Function verify-payment) pode mudar esses campos. Um usuário comum
-- não consegue se auto-conceder Rolê+/Boost editando o próprio perfil/room.
-- ============================================================
create or replace function public.protect_plan_fields()
returns trigger as $$
begin
  if auth.role() <> 'service_role' then
    new.club_until := old.club_until;
    new.boost_until := old.boost_until;
    new.plan_tier := old.plan_tier;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists protect_plan_fields_profiles on public.profiles;
create trigger protect_plan_fields_profiles before update on public.profiles
for each row execute procedure public.protect_plan_fields();

drop trigger if exists protect_plan_fields_rooms on public.rooms;
create trigger protect_plan_fields_rooms before update on public.rooms
for each row execute procedure public.protect_plan_fields();
