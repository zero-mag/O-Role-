// O ROLÊ+ — verify-claim (Supabase Edge Function)
// Passo 2 do fluxo "Encontre a sua empresa": confere o código de 6 dígitos
// contra o pedido de reivindicação (claim_id) que o start-claim devolveu.
// Não exige login ainda — só marca esse pedido como "código confirmado".
// Quem de fato transfere a posse é o finalize-claim, chamado depois que a
// pessoa cria a senha (só aí existe uma conta pra virar dona do negócio).
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

    const { claimToken, code } = await req.json();
    if (!claimToken || !code) return new Response(JSON.stringify({ error: 'dados incompletos' }), { status: 400, headers: CORS });

    const { data: claim, error: claimErr } = await supabase
      .from('claim_codes').select('*').eq('token', claimToken).maybeSingle();
    if (claimErr) return new Response(JSON.stringify({ error: claimErr.message }), { status: 500, headers: CORS });
    if (!claim) return new Response(JSON.stringify({ error: 'reivindicação não encontrada — peça um novo código' }), { status: 404, headers: CORS });

    if (claim.verified) {
      return new Response(JSON.stringify({ ok: true, alreadyVerified: true }), { headers: CORS });
    }
    if (new Date(claim.expires_at).getTime() < Date.now()) {
      return new Response(JSON.stringify({ error: 'código expirado — peça um novo' }), { status: 410, headers: CORS });
    }
    if (claim.attempts >= MAX_ATTEMPTS) {
      return new Response(JSON.stringify({ error: 'muitas tentativas erradas — peça um novo código' }), { status: 429, headers: CORS });
    }

    if (String(code).trim() !== claim.code) {
      await supabase.from('claim_codes').update({ attempts: claim.attempts + 1 }).eq('id', claim.id);
      const restantes = MAX_ATTEMPTS - (claim.attempts + 1);
      return new Response(JSON.stringify({ error: `código incorreto — ${restantes} tentativa(s) restante(s)` }), { status: 401, headers: CORS });
    }

    await supabase.from('claim_codes').update({ verified: true }).eq('id', claim.id);
    return new Response(JSON.stringify({ ok: true }), { headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS });
  }
});
