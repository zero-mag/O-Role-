-- Rode isso no SQL Editor do Supabase DEPOIS de publicar a versão do front-end
-- com normalizeWhatsapp() (senão os cadastros novos voltam a gravar torto).
--
-- Reformata os números de WhatsApp já salvos pro formato canônico "55DDNNNNNNNNN"
-- (mesma lógica de normalizeWhatsapp() em index.html) — hoje existem dois
-- formatos incompatíveis na mesma coluna: a ferramenta admin salva dígitos+55,
-- o autocadastro/configurações salvava o texto cru digitado (com parênteses,
-- espaço, traço, sem DDI). Sem isso, o link "wa.me" novo não abre pra ninguém
-- que tenha se cadastrado sozinho.
--
-- IMPORTANTE: rode primeiro o SELECT abaixo e confira uma amostra antes do
-- UPDATE — é uma reformatação cega via regex, não uma validação semântica.

-- Conferência antes de aplicar (não altera nada):
-- select id, whatsapp,
--   '55' || regexp_replace(regexp_replace(regexp_replace(whatsapp,'\D','','g'),'^55',''),'^0','')
--     as whatsapp_normalizado
-- from public.rooms
-- where whatsapp is not null and whatsapp !~ '^55\d{10,11}$';

update public.profiles set whatsapp = (
  case
    when whatsapp is null or whatsapp = '' then whatsapp
    else '55' || regexp_replace(
           regexp_replace(regexp_replace(whatsapp,'\D','','g'),'^55',''),
         '^0','')
  end
) where whatsapp is not null and whatsapp !~ '^55\d{10,11}$';

update public.rooms set whatsapp = (
  case
    when whatsapp is null or whatsapp = '' then whatsapp
    else '55' || regexp_replace(
           regexp_replace(regexp_replace(whatsapp,'\D','','g'),'^55',''),
         '^0','')
  end
) where whatsapp is not null and whatsapp !~ '^55\d{10,11}$';
