// O ROLÊ+ — payment-webhook (Supabase Edge Function)
// Recebe o aviso do InfinitePay quando um pagamento é confirmado (Pix, cartão
// etc.), mesmo que a pessoa nunca volte pro navegador depois de pagar — hoje
// isso é o único jeito de fechar esse buraco (sem webhook, cobrança via Pix
// feita fora do app fica presa em "pendente" pra sempre).
//
// O InfinitePay NÃO assina esse aviso (sem chave secreta pra conferir quem
// mandou), então NUNCA confiamos nele sozinho — só usamos como um "avisa que
// rolou algo, vai lá conferir": sempre reconferimos direto com o payment_check
// do InfinitePay antes de liberar qualquer coisa. Mesmo princípio da
// verify-payment, só que disparado pelo InfinitePay em vez do navegador.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const INFINITEPAY_HANDLE = 'nextoria';
const CLUB_PLANS: Record<string, { amountCents: number; boostDays: number }> = {
  start: { amountCents: 2990, boostDays: 7 },
  plus: { amountCents: 5990, boostDays: 17 },
  // premium ainda não é comprável (sem botão na UI) — de propósito não entra aqui
};

Deno.serve(async (req: Request) => {
  try {
    const body = await req.json();
    const order_nsu = body.order_nsu;
    const transaction_nsu = body.transaction_nsu;
    const slug = body.invoice_slug;
    if (!order_nsu) {
      return new Response(JSON.stringify({ success: false, message: 'order_nsu ausente' }), { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: intent, error: intentErr } = await supabase
      .from('payment_intents').select('*').eq('order_nsu', order_nsu).maybeSingle();
    if (intentErr || !intent) {
      return new Response(JSON.stringify({ success: false, message: 'pedido não encontrado' }), { status: 400 });
    }
    if (intent.status === 'paid') {
      // já foi confirmado antes (provavelmente pela verify-payment, quando a
      // pessoa voltou pro app) — responde sucesso pra InfinitePay não reenviar
      return new Response(JSON.stringify({ success: true, message: null }), { status: 200 });
    }

    // nunca confia no corpo do webhook sozinho — reconfere direto com o InfinitePay
    const checkRes = await fetch('https://api.checkout.infinitepay.io/payment_check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle: INFINITEPAY_HANDLE, order_nsu, transaction_nsu, slug }),
    });
    const check = await checkRes.json();
    if (!check.success || !check.paid || check.amount !== intent.amount_cents) {
      return new Response(JSON.stringify({ success: false, message: 'pagamento não confirmado no payment_check' }), { status: 400 });
    }

    const now = Date.now();
    if (intent.kind === 'boost_business') {
      const boostUntil = new Date(now + intent.payload.hours * 3600e3).toISOString();
      if (intent.payload.room_id) await supabase.from('rooms').update({ boost_until: boostUntil }).eq('id', intent.payload.room_id);
      await supabase.from('profiles').update({ boost_until: boostUntil }).eq('id', intent.user_id);
    } else if (intent.kind === 'club_subscription') {
      const claimedTier = intent.payload?.tier;
      const plan = claimedTier && CLUB_PLANS[claimedTier];
      if (!plan || plan.amountCents !== intent.amount_cents) {
        await supabase.from('payment_intents').update({ status: 'failed' }).eq('order_nsu', order_nsu);
        return new Response(JSON.stringify({ success: false, message: 'tier inválido ou não confere com o valor pago' }), { status: 400 });
      }
      const clubUntil = new Date(now + 30 * 24 * 3600e3).toISOString();
      const boostUntil = new Date(now + plan.boostDays * 24 * 3600e3).toISOString();
      await supabase.from('profiles').update({ club_until: clubUntil, plan_tier: claimedTier, boost_until: boostUntil }).eq('id', intent.user_id);
      if (intent.payload.room_id) await supabase.from('rooms').update({ club_until: clubUntil, plan_tier: claimedTier, boost_until: boostUntil }).eq('id', intent.payload.room_id);
    } else if (intent.kind === 'role_personal') {
      await supabase.from('rooms').insert({ ...intent.payload.room, owner_id: intent.user_id });
    }

    await supabase.from('payment_intents').update({ status: 'paid' }).eq('order_nsu', order_nsu);

    const notifByKind: Record<string, { title: string; body: string }> = {
      boost_business: { title: 'Boost ativado! 🚀', body: 'Seu negócio está em destaque no mapa e no feed.' },
      club_subscription: { title: 'Bem-vindo ao Rolê+! ⭐', body: 'Sua assinatura está ativa — mais espaço na vitrine e métricas reais liberadas.' },
      role_personal: { title: 'Rolê publicado! 🎉', body: 'Seu rolê já está no mapa pra galera encontrar.' },
    };
    const n = notifByKind[intent.kind];
    if (n) await supabase.from('notifications').insert({ user_id: intent.user_id, icon: '🎉', title: n.title, body: n.body });

    return new Response(JSON.stringify({ success: true, message: null }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, message: String(e) }), { status: 500 });
  }
});
