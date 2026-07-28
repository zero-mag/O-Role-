// O ROLÊ+ — upgrade-to-business (Supabase Edge Function)
// Deixa uma conta Google que acabou de nascer (sempre criada como 'personal',
// já que o Google não manda CNPJ/segmento) virar 'business' — só nessa janela
// de onboarding logo após o primeiro login, nunca depois. Roda com a
// service_role porque o gatilho protect_account_type bloqueia qualquer troca
// de "type" que não venha daqui.
// Só mexe na PRÓPRIA conta de quem chama (o id vem do token verificado pelo
// Supabase, nunca de um parâmetro que o cliente manda), e só se ainda for
// 'personal' — não deixa reverter nem trocar de novo depois.
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
      .from('profiles').select('type').eq('id', user.id).maybeSingle();
    if (profErr || !profile) {
      return new Response(JSON.stringify({ error: 'perfil não encontrado' }), { status: 404, headers: CORS });
    }
    if (profile.type !== 'personal') {
      return new Response(JSON.stringify({ error: 'essa conta já não é mais pessoal — não pode trocar de novo' }), { status: 403, headers: CORS });
    }

    const { error: updErr } = await supabase.from('profiles').update({ type: 'business' }).eq('id', user.id);
    if (updErr) return new Response(JSON.stringify({ error: updErr.message }), { status: 500, headers: CORS });

    return new Response(JSON.stringify({ ok: true }), { headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS });
  }
});
