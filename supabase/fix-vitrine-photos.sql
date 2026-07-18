-- Rode isso no SQL Editor do Supabase (além dos outros fix-*.sql já rodados).
-- 1) Adiciona a foto por item de vitrine (galeria prometida no modal de planos
-- — "5/12/sem limite fotos" = 1 foto por item, mesmo cap do limite de itens).
-- 2) Trava o limite de itens de vitrine por plano no servidor (não só no
-- navegador — um dono de negócio conseguiria burlar o limite do client
-- chamando a API direto). Cadastros do admin (owner_id null, ferramenta de
-- catalogação) caem no limite "free"=3, igual aos 3 slots fixos que o form
-- admin já usa hoje.

alter table public.vitrine_items add column if not exists imagem_url text;

create or replace function public.enforce_vitrine_limit()
returns trigger as $$
declare
  tier text;
  club_active boolean;
  lim int;
  cnt int;
begin
  select p.plan_tier, (r.club_until is not null and r.club_until > now()) into tier, club_active
  from public.rooms r join public.profiles p on p.id = r.owner_id
  where r.id = new.room_id;

  lim := case
    -- assinante de antes da migração de plan_tier (club_until ativo mas tier
    -- ainda não gravado) fica ilimitado até renovar, mesma regra do client
    -- (ver planLimits() em index.html) — evita rejeitar quem já pagava.
    when tier is null and club_active then 2147483647
    when coalesce(tier,'free') = 'start' then 5
    when coalesce(tier,'free') = 'plus' then 12
    when coalesce(tier,'free') = 'premium' then 2147483647
    else 3
  end;

  select count(*) into cnt from public.vitrine_items where room_id = new.room_id;

  -- o dev (felipegust59@gmail.com) pode adicionar item em QUALQUER negócio
  -- mesmo já no limite do plano — mesma exceção que a policy "dev gerencia
  -- vitrine de qualquer negócio" já dá pra ele (fix-admin-tool.sql), usada
  -- pro caso "fui lá, vi o cardápio, adicionei os itens que faltavam".
  if cnt >= lim and auth.role() <> 'service_role'
     and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.email = 'felipegust59@gmail.com') then
    raise exception 'limite de vitrine do plano atingido';
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists enforce_vitrine_limit_trigger on public.vitrine_items;
create trigger enforce_vitrine_limit_trigger before insert on public.vitrine_items
for each row execute procedure public.enforce_vitrine_limit();
