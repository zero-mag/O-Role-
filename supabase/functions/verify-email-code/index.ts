// O ROLÊ+ — verify-email-code (Supabase Edge Function)
// Confere o código de 6 dígitos mandado por send-verify-code e, se bater,
// marca profiles.email_verified=true (só a service_role pode gravar esse
// campo — ver protect_email_verified_trigger em fix-email-verify.sql).
// Exige sessão válida — só confirma o e-mail da própria conta logada.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};
const MAX_ATTEMPTS = 5;

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

    const { code } = await req.json();
    if (!code) return new Response(JSON.stringify({ error: 'dados incompletos' }), { status: 400, headers: CORS });

    const { data: pending, error: findErr } = await supabase
      .from('email_verify_codes').select('*').eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (findErr) return new Response(JSON.stringify({ error: findErr.message }), { status: 500, headers: CORS });
    if (!pending) return new Response(JSON.stringify({ error: 'nenhum código pendente — peça um novo' }), { status: 404, headers: CORS });

    if (new Date(pending.expires_at).getTime() < Date.now()) {
      return new Response(JSON.stringify({ error: 'código expirado — peça um novo' }), { status: 410, headers: CORS });
    }
    if (pending.attempts >= MAX_ATTEMPTS) {
      return new Response(JSON.stringify({ error: 'muitas tentativas erradas — peça um novo código' }), { status: 429, headers: CORS });
    }

    if (String(code).trim() !== pending.code) {
      await supabase.from('email_verify_codes').update({ attempts: pending.attempts + 1 }).eq('id', pending.id);
      const restantes = MAX_ATTEMPTS - (pending.attempts + 1);
      return new Response(JSON.stringify({ error: `código incorreto — ${restantes} tentativa(s) restante(s)` }), { status: 401, headers: CORS });
    }

    await supabase.from('profiles').update({ email_verified: true }).eq('id', user.id);
    await supabase.from('email_verify_codes').delete().eq('user_id', user.id);

    return new Response(JSON.stringify({ ok: true }), { headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS });
  }
});
