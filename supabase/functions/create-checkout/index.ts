// O ROLÊ+ — create-checkout (Supabase Edge Function)
// Cria o link de pagamento no InfinitePay a partir do servidor — o navegador
// não consegue chamar a API do InfinitePay direto (bloqueio de CORS proposital
// deles), então essa função existe só pra repassar o pedido com segurança.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const INFINITEPAY_HANDLE = 'nextoria';
// nome da function que recebe a confirmação de pagamento do InfinitePay —
// nome de exibição é "payment-webhook", mas o painel implantou como "clever-action"
// (mesma pegadinha de sempre: o slug real não segue o nome digitado)
const WEBHOOK_FUNCTION_NAME = 'clever-action';
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

    const { order_nsu, redirect_url } = await req.json();
    if (!order_nsu || !redirect_url) {
      return new Response(JSON.stringify({ error: 'dados incompletos' }), { status: 400, headers: CORS });
    }

    // busca o pedido que o app já criou em payment_intents — nunca confia
    // em valor/descrição vindos direto do navegador nessa chamada
    const { data: intent, error: intentErr } = await supabase
      .from('payment_intents').select('*').eq('order_nsu', order_nsu).maybeSingle();
    if (intentErr) {
      return new Response(JSON.stringify({ error: 'erro ao buscar pedido: ' + intentErr.message, order_nsu }), { status: 500, headers: CORS });
    }
    if (!intent) {
      return new Response(JSON.stringify({ error: 'pedido não encontrado no banco (order_nsu=' + order_nsu + ')' }), { status: 404, headers: CORS });
    }
    if (intent.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'pedido pertence a outro usuário', intent_user: intent.user_id, caller: user.id }), { status: 403, headers: CORS });
    }

    const descByKind: Record<string, string> = {
      role_personal: 'Rolê: ' + (intent.payload?.room?.nome ?? ''),
      boost_business: 'Boost no Rolê+',
      club_subscription: 'Assinatura Rolê+',
    };

    // webhook_url: avisa o servidor assim que o pagamento é confirmado, mesmo que
    // a pessoa nunca volte pro navegador (ex.: pagou Pix pelo celular e fechou a
    // aba) — sem isso, a única confirmação era o retorno via redirect_url, que
    // fica pendente pra sempre se a pessoa não voltar.
    const res = await fetch('https://api.checkout.infinitepay.io/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        handle: INFINITEPAY_HANDLE,
        items: [{ quantity: 1, price: intent.amount_cents, description: descByKind[intent.kind] || 'Rolê+' }],
        order_nsu,
        redirect_url,
        webhook_url: Deno.env.get('SUPABASE_URL') + '/functions/v1/' + WEBHOOK_FUNCTION_NAME,
      }),
    });
    const data = await res.json();
    if (!data.url) {
      return new Response(JSON.stringify({ error: 'infinitepay não retornou link', data }), { status: 502, headers: CORS });
    }

    return new Response(JSON.stringify({ url: data.url }), { headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS });
  }
});
