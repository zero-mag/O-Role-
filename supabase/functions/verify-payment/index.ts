// O ROLÊ+ — verify-payment (Supabase Edge Function)
// Confirma com o InfinitePay que um pagamento é real antes de liberar
// Boost, assinatura Rolê+ ou publicar um rolê pago. Roda no servidor —
// o navegador nunca vê a chave de serviço nem consegue se auto-aprovar.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const INFINITEPAY_HANDLE = 'nextoria';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { order_nsu, transaction_nsu, slug } = await req.json();
    if (!order_nsu || !transaction_nsu || !slug) {
      return new Response(JSON.stringify({ error: 'dados incompletos' }), { status: 400, headers: CORS });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: intent, error: intentErr } = await supabase
      .from('payment_intents').select('*').eq('order_nsu', order_nsu).single();
    if (intentErr || !intent) {
      return new Response(JSON.stringify({ error: 'pedido não encontrado' }), { status: 404, headers: CORS });
    }
    if (intent.status === 'paid') {
      return new Response(JSON.stringify({ ok: true, already: true, kind: intent.kind }), { headers: CORS });
    }

    // pergunta pro InfinitePay se esse pagamento é de verdade (nunca confia no navegador)
    const checkRes = await fetch('https://api.checkout.infinitepay.io/payment_check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle: INFINITEPAY_HANDLE, order_nsu, transaction_nsu, slug }),
    });
    const check = await checkRes.json();

    if (!check.success || !check.paid || check.amount !== intent.amount_cents) {
      await supabase.from('payment_intents').update({ status: 'failed' }).eq('order_nsu', order_nsu);
      return new Response(JSON.stringify({ error: 'pagamento não confirmado', check }), { status: 402, headers: CORS });
    }

    const now = Date.now();
    if (intent.kind === 'boost_business') {
      const boostUntil = new Date(now + intent.payload.hours * 3600e3).toISOString();
      if (intent.payload.room_id) await supabase.from('rooms').update({ boost_until: boostUntil }).eq('id', intent.payload.room_id);
      await supabase.from('profiles').update({ boost_until: boostUntil }).eq('id', intent.user_id);
    } else if (intent.kind === 'club_subscription') {
      const clubUntil = new Date(now + 30 * 24 * 3600e3).toISOString();
      await supabase.from('profiles').update({ club_until: clubUntil }).eq('id', intent.user_id);
      if (intent.payload.room_id) await supabase.from('rooms').update({ club_until: clubUntil }).eq('id', intent.payload.room_id);
    } else if (intent.kind === 'role_personal') {
      await supabase.from('rooms').insert({ ...intent.payload.room, owner_id: intent.user_id });
    }

    await supabase.from('payment_intents').update({ status: 'paid' }).eq('order_nsu', order_nsu);

    const notifByKind: Record<string, { title: string; body: string }> = {
      boost_business: { title: 'Boost ativado! 🚀', body: 'Seu negócio está em destaque no mapa e no feed.' },
      club_subscription: { title: 'Bem-vindo ao Rolê+! ⭐', body: 'Sua assinatura está ativa — vitrine ilimitada e métricas reais liberadas.' },
      role_personal: { title: 'Rolê publicado! 🎉', body: 'Seu rolê já está no mapa pra galera encontrar.' },
    };
    const n = notifByKind[intent.kind];
    if (n) await supabase.from('notifications').insert({ user_id: intent.user_id, icon: '🎉', title: n.title, body: n.body });

    return new Response(JSON.stringify({ ok: true, kind: intent.kind }), { headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS });
  }
});
