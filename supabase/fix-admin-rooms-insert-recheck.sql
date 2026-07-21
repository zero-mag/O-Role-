-- Corrige "new row violates row level security policy for table `rooms`" ao usar
-- a Ferramenta de negócios (Adicionar Empresa / busca por nome).
-- Idempotente — seguro rodar de novo mesmo que já tenha rodado fix-admin-tool.sql antes,
-- recria a policy do zero e garante que a conta do dev está marcada como admin.

-- 1) diagnóstico — roda antes de mais nada, mostra quem está marcado como admin hoje
select id, email, is_admin from public.profiles order by is_admin desc, email;

-- 2) garante que a conta do dev sempre conta como admin, mesmo que is_admin nunca
--    tenha sido marcado nesse perfil (ou tenha sido resetado por algum outro fix)
update public.profiles set is_admin = true where email = 'felipegust59@gmail.com';

-- 3) recria as policies de negócio-sem-dono do zero (drop+create em vez de só create,
--    pra não dar erro "policy already exists" se elas já estiverem lá)
drop policy if exists "admin cria negócio sem dono" on public.rooms;
create policy "admin cria negócio sem dono" on public.rooms for insert with check (
  owner_id is null and is_business
  and exists (select 1 from public.profiles p where p.id = auth.uid() and (p.is_admin or p.email = 'felipegust59@gmail.com'))
);

drop policy if exists "admin edita negócio sem dono" on public.rooms;
create policy "admin edita negócio sem dono" on public.rooms for update using (
  owner_id is null
  and exists (select 1 from public.profiles p where p.id = auth.uid() and (p.is_admin or p.email = 'felipegust59@gmail.com'))
);

-- 4) confere que RLS está mesmo ligado na tabela (se por algum motivo foi desligada,
--    NENHUMA policy roda e todo insert cairia direto no "dono cria seu room" só)
alter table public.rooms enable row level security;
