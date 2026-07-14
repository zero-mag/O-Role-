-- Rode isso no SQL Editor do Supabase (além dos outros fix-*.sql já rodados).
-- As Edge Functions (create-checkout, verify-payment) usam a chave de
-- serviço (service_role) pra ler/escrever direto no banco, contornando o
-- RLS. Só que isso exige que o papel "service_role" também tenha
-- permissão de acesso à TABELA em si (GRANT) — isso não vem automático
-- quando as tabelas são criadas via SQL Editor em vez do Table Editor,
-- e é por isso que o pagamento dava "permission denied for table
-- payment_intents".

grant usage on schema public to service_role;
grant select, insert, update, delete on public.payment_intents to service_role;
grant select, insert, update, delete on public.profiles, public.rooms, public.vitrine_items, public.promocoes, public.messages to service_role;
grant usage, select on all sequences in schema public to service_role;
