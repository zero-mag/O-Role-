-- ============================================================
-- O ROLÊ+ — protege profiles.type contra troca pelo próprio usuário
-- ============================================================
-- Achado em 2026-07-23 revisando o plano de login com Google: a policy de
-- update em profiles só checa "auth.uid() = id", sem nenhuma trava na coluna
-- "type" — ou seja, hoje qualquer usuário autenticado consegue virar uma
-- conta business sozinho, direto do console do navegador
-- (sbUpdateProfile(meuId,{type:'business'})), sem passar por nenhuma etapa
-- de cadastro. O aviso "tipo de conta é permanente" na tela é só cosmético,
-- não é garantido pelo banco. Isso é anterior a qualquer mudança do Google e
-- vale corrigir de qualquer forma.
--
-- Mesmo padrão já usado pra proteger is_admin (ver fix-admin-tool.sql):
-- um trigger que ignora qualquer troca de "type" que não venha da
-- service_role (ou seja, só uma Edge Function rodando com a chave de
-- serviço pode mudar o tipo da conta depois de criada).
create or replace function public.protect_account_type()
returns trigger as $$
begin
  if auth.role() <> 'service_role' then
    new.type := old.type;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists protect_account_type_trigger on public.profiles;
create trigger protect_account_type_trigger before update on public.profiles
for each row execute procedure public.protect_account_type();
