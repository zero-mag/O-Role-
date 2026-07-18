-- Rode isso no SQL Editor do Supabase (além dos outros fix-*.sql já rodados).
-- Adiciona os "links extras" do Plus/Premium (o trio fixo WhatsApp/Instagram/
-- Site já conta como os 3 primeiros da promessa "até N links" do modal de
-- planos — isso aqui é só o que passa disso: 2 extras no Plus, ilimitado no
-- Premium). Trava o limite no servidor também, não só no navegador.

alter table public.rooms add column if not exists extra_links jsonb not null default '[]';
-- formato: [{"label":"Cardápio Delivery","url":"https://..."}]

create or replace function public.enforce_extra_links_limit()
returns trigger as $$
declare
  tier text;
  club_active boolean;
  lim int;
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  select p.plan_tier, (new.club_until is not null and new.club_until > now()) into tier, club_active
  from public.profiles p where p.id = new.owner_id;

  lim := case
    when tier is null and club_active then 2147483647
    when coalesce(tier,'free') = 'plus' then 2
    when coalesce(tier,'free') = 'premium' then 2147483647
    else 0
  end;

  if jsonb_array_length(coalesce(new.extra_links,'[]'::jsonb)) > lim then
    raise exception 'limite de links extras do plano atingido';
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists enforce_extra_links_limit_trigger on public.rooms;
create trigger enforce_extra_links_limit_trigger before update on public.rooms
for each row execute procedure public.enforce_extra_links_limit();
