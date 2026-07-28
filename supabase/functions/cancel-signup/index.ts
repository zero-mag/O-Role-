// O ROLÊ+ — cancel-signup (Supabase Edge Function)
// Deixa quem travou na tela de confirmar e-mail (código não chegou, ou
// usou o e-mail errado) cancelar a conta que acabou de criar e recomeçar
// do zero. Só apaga a PRÓPRIA conta de quem chama, e só se ela ainda não
// tiver confirmado o e-mail — protege contra apagar conta já estabelecida.
//
// Deletar o usuário via admin.deleteUser cascateia sozinho (profiles →
// rooms → vitrine_items/promocoes/business_photos/payment_intents/
// notifications), então não precisa apagar tabela por tabela aqui.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'não autenticado' }), { status: 401, headers: CORS });
    }

    const { data: profile, error: profErr } = await supabase
      .from('profiles').select('email_verified').eq('id', user.id).maybeSingle();
    if (profErr || !profile) {
      return new Response(JSON.stringify({ error: 'perfil não encontrado' }), { status: 404, headers: CORS });
    }
    if (profile.email_verified) {
      return new Response(JSON.stringify({ error: 'essa conta já tem o e-mail confirmado — não pode ser cancelada por aqui' }), { status: 403, headers: CORS });
    }

    const { error: delErr } = await supabase.auth.admin.deleteUser(user.id);
    if (delErr) {
      return new Response(JSON.stringify({ error: 'falha ao apagar conta: ' + delErr.message }), { status: 500, headers: CORS });
    }

    return new Response(JSON.stringify({ ok: true }), { headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS });
  }
});
