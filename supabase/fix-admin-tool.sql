-- Rode isso no SQL Editor do Supabase (além dos outros fix-*.sql já rodados).
-- Prepara o banco pra ferramenta de cadastro de empresa sem dono (admin) e
-- tranca dado sensível de perfil (e-mail, CNPJ, razão social) que hoje está
-- público pra qualquer um ler, mesmo sem estar logado.

-- ============================================================
-- 1) ADMIN — quem pode usar a ferramenta "Adicionar Empresa"
-- ============================================================
alter table public.profiles add column if not exists is_admin boolean not null default false;

-- protege is_admin: só a service_role (Edge Function) pode mudar esse campo.
-- um usuário comum não consegue se autopromover mesmo que edite o próprio perfil.
create or replace function public.protect_is_admin()
returns trigger as $$
begin
  if auth.role() <> 'service_role' then
    new.is_admin := old.is_admin;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists protect_is_admin_trigger on public.profiles;
create trigger protect_is_admin_trigger before update on public.profiles
for each row execute procedure public.protect_is_admin();

-- ============================================================
-- 2) ATRIBUIÇÃO — quem cadastrou o quê, pra pontuar certo por admin
-- ============================================================
alter table public.rooms add column if not exists cataloged_by uuid references public.profiles(id);
alter table public.rooms add column if not exists claim_started_at timestamptz; -- fica marcado quando alguém inicia a reivindicação (bolinha azul) — passo futuro
alter table public.vitrine_items add column if not exists added_by uuid references public.profiles(id);

-- ============================================================
-- 3) RLS — admin cria/edita negócio sem dono (owner_id vazio)
-- ============================================================
-- o dev (felipegust59@gmail.com) sempre conta como admin, mesmo antes de ter
-- is_admin marcado no próprio perfil — evita depender de se autopromover primeiro
create policy "admin cria negócio sem dono" on public.rooms for insert with check (
  owner_id is null and is_business
  and exists (select 1 from public.profiles p where p.id = auth.uid() and (p.is_admin or p.email = 'felipegust59@gmail.com'))
);
create policy "admin edita negócio sem dono" on public.rooms for update using (
  owner_id is null
  and exists (select 1 from public.profiles p where p.id = auth.uid() and (p.is_admin or p.email = 'felipegust59@gmail.com'))
);

-- admin gerencia vitrine de negócio sem dono (fase de cadastro)
create policy "admin gerencia vitrine de negócio sem dono" on public.vitrine_items for all using (
  exists (select 1 from public.rooms r where r.id = room_id and r.owner_id is null)
  and exists (select 1 from public.profiles p where p.id = auth.uid() and (p.is_admin or p.email = 'felipegust59@gmail.com'))
);

-- só o dev (felipegust59@gmail.com) pode mexer na vitrine de QUALQUER negócio,
-- mesmo já reivindicado — pra casos tipo "fui lá, vi o cardápio, adicionei 3 itens"
create policy "dev gerencia vitrine de qualquer negócio" on public.vitrine_items for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.email = 'felipegust59@gmail.com')
);

-- ============================================================
-- 4) PERFIL PÚBLICO RESTRITO — trava e-mail/CNPJ/razão social/is_admin
-- ============================================================
drop policy if exists "profiles são públicos pra leitura" on public.profiles;
create policy "usuário só lê o próprio perfil completo" on public.profiles for select using (auth.uid() = id);

-- vitrine pública: só o que precisa aparecer pra quem visita o mapa/vitrine —
-- sem e-mail, CNPJ, razão social, CEP ou is_admin.
create or replace view public.profiles_public as
select id, type, name, avatar_url, segment, emoji, address, lat, lng, verified,
       whatsapp, instagram, site, cover_url, horario, oferece, club_until, boost_until
from public.profiles;

grant select on public.profiles_public to anon, authenticated;
