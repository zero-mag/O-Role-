-- ============================================================
-- O ROLÊ+ — apagar mensagens do chat
-- ============================================================
-- Hoje a tabela messages não tem nenhuma policy de delete (nem update), então
-- ninguém consegue apagar mensagem nenhuma pelo cliente. Duas regras novas,
-- que se somam (RLS junta policies do mesmo comando com OR):
--   1) o remetente apaga a própria mensagem ("apagar pra todos" da sua msg)
--   2) o dono da sala apaga QUALQUER mensagem da própria sala — usado tanto
--      pelo botão "Limpar conversa" (3 pontinhos do chat) quanto pela limpeza
--      automática quando o negócio reabre depois de fechado.

create policy "remetente apaga a própria mensagem" on public.messages for delete using (
  auth.uid() = sender_id
);

create policy "dono do room apaga qualquer mensagem da sala" on public.messages for delete using (
  exists (select 1 from public.rooms r where r.id = room_id and r.owner_id = auth.uid())
);
