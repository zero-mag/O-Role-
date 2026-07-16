// O ROLÊ+ — promote-admin (Supabase Edge Function)
// Promove (ou remove) o acesso de admin à ferramenta "Adicionar Empresa".
// Roda no servidor com a service_role — só assim dá pra mudar is_admin, porque
// o gatilho protect_is_admin bloqueia qualquer mudança que não venha daqui.
// Só aceita pedido de quem está autenticado como felipegust59@gmail.com — o
// e-mail vem do token verificado pelo Supabase, nunca do que o navegador manda.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const DEV_EMAIL = 'felipegust59@gmail.com';
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
    if (user.email !== DEV_EMAIL) {
      return new Response(JSON.stringify({ error: 'só o dono do app pode promover admin' }), { status: 403, headers: CORS });
    }

    const { target_email, is_admin } = await req.json();
    if (!target_email || typeof is_admin !== 'boolean') {
      return new Response(JSON.stringify({ error: 'dados incompletos' }), { status: 400, headers: CORS });
    }

    const { data: target, error: findErr } = await supabase
      .from('profiles').select('id, email, is_admin').eq('email', target_email).maybeSingle();
    if (findErr) return new Response(JSON.stringify({ error: findErr.message }), { status: 500, headers: CORS });
    if (!target) return new Response(JSON.stringify({ error: 'conta não encontrada' }), { status: 404, headers: CORS });

    const { error: updErr } = await supabase.from('profiles').update({ is_admin }).eq('id', target.id);
    if (updErr) return new Response(JSON.stringify({ error: updErr.message }), { status: 500, headers: CORS });

    return new Response(JSON.stringify({ ok: true, email: target.email, is_admin }), { headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS });
  }
});
