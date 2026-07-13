-- Rode isso uma vez no SQL Editor do Supabase, além do schema.sql.
-- O RLS controla QUAIS linhas cada um vê; isso aqui libera o acesso à TABELA em si
-- (sem isso, dá "permission denied" antes mesmo do RLS entrar em ação).
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.profiles to anon, authenticated;
grant select, insert, update, delete on public.rooms to anon, authenticated;
grant select, insert, update, delete on public.vitrine_items to anon, authenticated;
grant select, insert, update, delete on public.promocoes to anon, authenticated;
grant select, insert, update, delete on public.messages to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
