-- Rode isso no SQL Editor do Supabase. Não corrige nada — só lista candidatos
-- a pin errado, publicados antes do fix que passou a bloquear cadastro sem
-- confirmação manual no mapa. Revise a lista manualmente e corrija cada um
-- pela ferramenta admin (editar negócio → confirmar/ajustar no mapa).

-- 1) Negócios pinados exatamente no fallback antigo (Vila Madalena / CENTER),
-- que era o valor usado quando a geocodificação do autocadastro falhava em
-- silêncio.
select id, nome, owner_id, cataloged_by, lat, lng, created_at
from public.rooms
where is_business and round(lat::numeric,4) = -23.5545 and round(lng::numeric,4) = -46.6870;

-- 2) Grupos de 2+ negócios distintos com coordenadas quase idênticas
-- (arredondado a ~11m) — indício de terem herdado o GPS de quem cadastrou,
-- o bug da ferramenta admin quando a geocodificação por CNPJ falhava.
select round(lat::numeric,4) as lat_r, round(lng::numeric,4) as lng_r,
       count(*) as qtd, array_agg(id) as room_ids, array_agg(nome) as nomes
from public.rooms
where is_business
group by 1,2
having count(*) > 1
order by qtd desc;
