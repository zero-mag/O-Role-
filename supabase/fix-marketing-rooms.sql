-- ============================================================
-- O ROLÊ+ — rolês de marketing (persona fictícia, dev-only)
-- ============================================================
-- Pedido do Felipe: poder criar rolês pessoais 100% funcionais, mas exibidos
-- com um nome de exibição fictício (não o nome real da conta), pra ações de
-- marketing/divulgação — com duração livre e boost sem pagar. owner_id
-- continua sendo a conta real (felipegust59@gmail.com), então segue vinculado
-- ao criador certo e usa a MESMA RLS de dono que qualquer rolê pessoal já usa
-- (só o dono edita/apaga o seu). Só a exibição pública do nome/foto do
-- criador é substituída, e só quando is_marketing=true.
--
-- is_marketing nunca é exposto na UI pública — é só uma marcação interna pra
-- o Felipe conseguir auditar/filtrar os próprios rolês de marketing depois
-- (aparecem com uma tag "🎭 marketing" só na tela "Meus rolês" dele mesmo).

alter table public.rooms add column if not exists is_marketing boolean not null default false;
alter table public.rooms add column if not exists creator_name_override text;
alter table public.rooms add column if not exists creator_avatar_override text;

-- protege as 3 colunas: só quem está logado como felipegust59@gmail.com
-- consegue gravar is_marketing=true ou os overrides — qualquer outra conta
-- que tentar (mesmo editando seu próprio rolê, já que a policy de update
-- normal só checa auth.uid()=owner_id) tem esses campos zerados de volta.
-- Mesmo padrão já usado por protect_is_admin/protect_account_type.
create or replace function public.protect_marketing_room()
returns trigger as $$
declare
  is_dev boolean;
begin
  select (email = 'felipegust59@gmail.com') into is_dev from public.profiles where id = auth.uid();
  if not coalesce(is_dev, false) then
    new.is_marketing := false;
    new.creator_name_override := null;
    new.creator_avatar_override := null;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists protect_marketing_room_trigger on public.rooms;
create trigger protect_marketing_room_trigger before insert or update on public.rooms
for each row execute procedure public.protect_marketing_room();
