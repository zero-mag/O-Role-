-- ============================================================
-- O ROLÊ+ — liga o interruptor "tier3Visible" que já existia no código
-- ============================================================
-- renderPins() já checava s.tier3Visible pra decidir se mostra um negócio
-- fora do nosso nicho curado (tier 3) no mapa — só que nada nunca setava essa
-- coluna, ela sempre vinha undefined/false. Pensado originalmente como
-- "desbloqueio pago" (ainda não construído), mas serve igual pra destacar um
-- negócio específico na mão, tipo agora.
alter table public.rooms add column if not exists tier3_visible boolean not null default false;

-- exemplo pra ligar num negócio específico (ajuste o nome):
-- update rooms set tier3_visible = true where nome ilike '%Santa Rosa celulares%';
