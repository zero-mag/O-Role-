// O ROLÊ+ — finalize-claim (Supabase Edge Function)
// Passo 3 (final) do fluxo "Encontre a sua empresa": chamado logo depois que
// a pessoa cria a senha (já existe conta/sessão nesse ponto). Confere que o
// claimToken foi verificado por código antes, e só então transfere a posse
// do negócio (owner_id) pra conta que acabou de ser criada.
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

    const { claimToken } = await req.json();
    if (!claimToken) return new Response(JSON.stringify({ error: 'dados incompletos' }), { status: 400, headers: CORS });

    const { data: claim, error: claimErr } = await supabase
      .from('claim_codes').select('*').eq('token', claimToken).maybeSingle();
    if (claimErr) return new Response(JSON.stringify({ error: claimErr.message }), { status: 500, headers: CORS });
    if (!claim) return new Response(JSON.stringify({ error: 'reivindicação não encontrada' }), { status: 404, headers: CORS });
    if (!claim.verified) return new Response(JSON.stringify({ error: 'código ainda não foi confirmado' }), { status: 403, headers: CORS });
    if (claim.finalized) return new Response(JSON.stringify({ error: 'essa reivindicação já foi concluída' }), { status: 409, headers: CORS });

    const { data: room, error: roomErr } = await supabase
      .from('rooms').select('*').eq('id', claim.room_id).maybeSingle();
    if (roomErr || !room) return new Response(JSON.stringify({ error: 'negócio não encontrado' }), { status: 404, headers: CORS });
    if (room.owner_id) return new Response(JSON.stringify({ error: 'esse negócio já foi reivindicado por outra conta' }), { status: 409, headers: CORS });

    const { error: updRoomErr } = await supabase.from('rooms').update({ owner_id: user.id }).eq('id', room.id);
    if (updRoomErr) return new Response(JSON.stringify({ error: updRoomErr.message }), { status: 500, headers: CORS });

    // vira uma conta business de verdade, com os dados do negócio já catalogado
    await supabase.from('profiles').update({
      type: 'business', segment: room.cat, emoji: room.emoji, address: room.address,
      lat: room.lat, lng: room.lng, cnpj: room.cnpj, verified: true,
      whatsapp: room.whatsapp, cover_url: room.cover_url, horario: room.horario,
      oferece: room.oferece,
    }).eq('id', user.id);

    await supabase.from('claim_codes').update({ finalized: true, claiming_user_id: user.id }).eq('id', claim.id);

    return new Response(JSON.stringify({ ok: true, room: { ...room, owner_id: user.id } }), { headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS });
  }
});
