-- Rode isso no SQL Editor do Supabase (além dos outros fix-*.sql já rodados).
-- Bug: apertar "Salvar" (🔖) num local às vezes dava "Não deu pra sincronizar com o
-- servidor." A tabela user_room_flags só tinha política de select/insert/delete —
-- faltava a de UPDATE. sbAddFlag() faz um upsert (insert ... on conflict do update),
-- e quando o Postgres precisa rodar a parte de UPDATE desse upsert (a flag já existia),
-- a falta dessa política bloqueia a operação pelo RLS.

create policy "usuário atualiza só a própria flag" on public.user_room_flags for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant update on public.user_room_flags to authenticated;
