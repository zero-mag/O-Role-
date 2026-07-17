-- Rode isso no SQL Editor do Supabase (depois dos outros fix-*.sql já rodados).
-- Libera admin apagar um negócio catalogado ainda sem dono — hoje só existia
-- política de admin criar/editar, faltava a de apagar (usada pelo botão
-- "Excluir negócio" na ferramenta).

create policy "admin apaga negócio sem dono" on public.rooms for delete using (
  owner_id is null
  and exists (select 1 from public.profiles p where p.id = auth.uid() and (p.is_admin or p.email = 'felipegust59@gmail.com'))
);
