// O ROLÊ+ — verify-cnpj-code (Supabase Edge Function)
// Passo 2 da verificação de posse no cadastro direto de negócio: confere o
// código de 6 dígitos contra o pedido (verifyToken) que o start-cnpj-verify
// devolveu. Não exige login ainda — a conta só é criada pelo cliente depois
// que essa checagem responde ok:true (ver doSignup() no index.html).
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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { verifyToken, code } = await req.json();
    if (!verifyToken || !code) return new Response(JSON.stringify({ error: 'dados incompletos' }), { status: 400, headers: CORS });

    const { data: reg, error: regErr } = await supabase
      .from('cnpj_signup_codes').select('*').eq('token', verifyToken).maybeSingle();
    if (regErr) return new Response(JSON.stringify({ error: regErr.message }), { status: 500, headers: CORS });
    if (!reg) return new Response(JSON.stringify({ error: 'verificação não encontrada — peça um novo código' }), { status: 404, headers: CORS });

    if (reg.verified) {
      return new Response(JSON.stringify({ ok: true, alreadyVerified: true }), { headers: CORS });
    }
    if (new Date(reg.expires_at).getTime() < Date.now()) {
      return new Response(JSON.stringify({ error: 'código expirado — peça um novo' }), { status: 410, headers: CORS });
    }
    if (reg.attempts >= MAX_ATTEMPTS) {
      return new Response(JSON.stringify({ error: 'muitas tentativas erradas — peça um novo código' }), { status: 429, headers: CORS });
    }

    if (String(code).trim() !== reg.code) {
      await supabase.from('cnpj_signup_codes').update({ attempts: reg.attempts + 1 }).eq('id', reg.id);
      const restantes = MAX_ATTEMPTS - (reg.attempts + 1);
      return new Response(JSON.stringify({ error: `código incorreto — ${restantes} tentativa(s) restante(s)` }), { status: 401, headers: CORS });
    }

    await supabase.from('cnpj_signup_codes').update({ verified: true }).eq('id', reg.id);
    return new Response(JSON.stringify({ ok: true }), { headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS });
  }
});
