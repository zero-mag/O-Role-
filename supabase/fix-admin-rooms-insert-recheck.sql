-- Corrige "new row violates row level security policy for table `rooms`" ao usar
-- a Ferramenta de negócios (Adicionar Empresa / busca por nome).
-- Idempotente — seguro rodar de novo, mesmo que já tenha rodado antes.
--
-- IMPORTANTE: seleciona o SQL INTEIRO (da linha 1 até o fim) e roda tudo de uma vez,
-- não só a primeira consulta — o Supabase só mostra o resultado da ÚLTIMA linha rodada,
-- por isso a consulta de confirmação (nº 4) fica por último de propósito.

-- 1) diagnóstico — a policy que está REALMENTE ativa no banco agora (pode ser
--    diferente do que tá no arquivo fix-admin-tool.sql do repositório, se ela
--    nunca tiver sido recriada depois de alguma mudança)
select policyname, cmd, qual, with_check from pg_policies where tablename='rooms';

-- 2) garante que a conta do dev sempre conta como admin, mesmo que is_admin nunca
--    tenha sido marcado nesse perfil (ou tenha sido resetado por algum outro fix)
update public.profiles set is_admin = true where email = 'felipegust59@gmail.com';

-- 3) recria as policies de negócio-sem-dono do zero (drop+create em vez de só create,
--    pra garantir que ficam com essa definição exata, não a antiga que possa ter ficado
--    salva no banco de uma versão anterior)
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

alter table public.rooms enable row level security;

-- 4) confirmação final — isso é o que deve aparecer na tela depois de rodar tudo.
--    Se "is_admin" aqui vier "true" e a policy de insert aparecer com o texto certo
--    (owner_id is null e o e-mail/is_admin), o cadastro deve funcionar.
select
  (select is_admin from public.profiles where email='felipegust59@gmail.com') as is_admin_agora,
  (select with_check from pg_policies where tablename='rooms' and policyname='admin cria negócio sem dono') as regra_de_insercao;
