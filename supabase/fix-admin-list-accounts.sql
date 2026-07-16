-- Rode isso no SQL Editor do Supabase (depois do fix-admin-tool.sql).
-- Permite que admins (você ou quem for promovido) leiam a lista de contas
-- pessoais (nome, e-mail, is_admin) pra usar na aba "Prom Adm" — sem isso,
-- a restrição que trancou o e-mail de todo mundo também bloquearia essa lista.

create policy "admin lê contas pessoais pra promover" on public.profiles for select using (
  type = 'personal'
  and exists (select 1 from public.profiles p where p.id = auth.uid() and (p.is_admin or p.email = 'felipegust59@gmail.com'))
);
