// O ROLÊ+ — start-claim (Supabase Edge Function)
// Passo 1 do fluxo "Encontre a sua empresa": recebe um CNPJ, confere se bate
// com um negócio catalogado sem dono, busca o e-mail oficial na Receita
// Federal e manda o código de confirmação pra lá (nunca pro e-mail que o
// navegador mandar — só o que a Receita Federal tem cadastrado).
// Não exige login — nessa etapa a pessoa ainda não criou a conta (isso só
// acontece depois de confirmar o código, na tela de criar senha).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};
const CODE_TTL_MIN = 15;
// troque pelo remetente do seu domínio verificado no Resend assim que tiver um
const FROM_EMAIL = 'O Rolê+ <onboarding@resend.dev>';

function maskEmail(email: string) {
  const [user, domain] = email.split('@');
  if (!domain) return email;
  const visible = user.slice(0, 1);
  return `${visible}${'*'.repeat(Math.max(user.length - 1, 3))}@${domain}`;
}

function renderEmailHtml(codigo: string, cnpjFmt: string, nomeNegocio: string) {
  // mesmo template de supabase/email-templates/confirmar-cnpj.html, com os
  // placeholders já substituídos
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
  <body style="margin:0;padding:0;background-color:#F3EDEE;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F3EDEE;padding:32px 16px;"><tr><td align="center">
  <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:100%;background-color:#FFF9F9;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(198,39,74,0.08);">
  <tr><td style="background-color:#E8365B;background-image:linear-gradient(135deg,#EF4467,#C6274A);padding:40px 32px 32px;text-align:center;">
  <div style="font-size:30px;line-height:1.2;font-weight:800;color:#ffffff;letter-spacing:-0.3px;">O Rolê<span style="color:#FFD9E1;">+</span></div>
  <div style="font-size:13.5px;color:#FBD7DE;margin-top:6px;font-weight:500;">o que tá rolando perto de você</div>
  </td></tr>
  <tr><td style="padding:36px 32px 8px;">
  <p style="margin:0 0 4px;font-size:19px;font-weight:700;color:#211417;">Confirme que a empresa é sua</p>
  <p style="margin:0 0 28px;font-size:14.5px;line-height:1.6;color:#6B565B;">Encontramos um cadastro com o CNPJ <b style="color:#211417;">${cnpjFmt}</b> (<b style="color:#211417;">${nomeNegocio}</b>) no Rolê+. Digite o código abaixo no app pra confirmar que é você quem está assumindo essa vitrine.</p>
  </td></tr>
  <tr><td style="padding:0 32px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FDEEF0;border:1px solid #F5CFD6;border-radius:14px;"><tr><td style="padding:22px 16px;text-align:center;">
  <div style="font-size:34px;font-weight:800;letter-spacing:10px;color:#C6274A;font-variant-numeric:tabular-nums;">${codigo}</div>
  </td></tr></table></td></tr>
  <tr><td style="padding:20px 32px 36px;">
  <p style="margin:0;font-size:13px;line-height:1.6;color:#8C7A7E;">Esse código vale por ${CODE_TTL_MIN} minutos. Se você não pediu pra reivindicar essa empresa, pode ignorar este e-mail — nada muda até alguém confirmar o código.</p>
  </td></tr>
  <tr><td style="padding:18px 32px;border-top:1px solid #F0DCE0;">
  <p style="margin:0;font-size:11.5px;color:#B79FA5;text-align:center;">O Rolê+ · este é um e-mail automático, não precisa responder.</p>
  </td></tr>
  </table></td></tr></table></body></html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { cnpj } = await req.json();
    const digits = String(cnpj || '').replace(/\D/g, '');
    if (digits.length !== 14) {
      return new Response(JSON.stringify({ error: 'CNPJ inválido' }), { status: 400, headers: CORS });
    }

    // 1) existe negócio catalogado com esse CNPJ, ainda sem dono?
    const { data: room, error: roomErr } = await supabase
      .from('rooms').select('id, nome, cnpj')
      .eq('cnpj', digits).is('owner_id', null).not('cataloged_by', 'is', null)
      .maybeSingle();
    if (roomErr) return new Response(JSON.stringify({ error: roomErr.message }), { status: 500, headers: CORS });
    if (!room) {
      return new Response(JSON.stringify({ found: false }), { headers: CORS });
    }

    // 2) busca o e-mail oficial na Receita Federal
    const cnpjRes = await fetch('https://brasilapi.com.br/api/cnpj/v1/' + digits);
    if (!cnpjRes.ok) {
      return new Response(JSON.stringify({ found: true, room, needsManualReview: true, reason: 'cnpj_lookup_failed' }), { headers: CORS });
    }
    const cnpjData = await cnpjRes.json();
    const officialEmail: string | undefined = cnpjData.email || undefined;
    if (!officialEmail) {
      return new Response(JSON.stringify({ found: true, room, needsManualReview: true, reason: 'no_official_email' }), { headers: CORS });
    }

    // 3) gera código, grava e manda o e-mail
    const codigo = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + CODE_TTL_MIN * 60_000).toISOString();
    const masked = maskEmail(officialEmail);

    const { data: inserted, error: insertErr } = await supabase.from('claim_codes').insert({
      room_id: room.id, cnpj: digits, code: codigo,
      sent_to_masked: masked, expires_at: expiresAt,
    }).select('token').single();
    if (insertErr) return new Response(JSON.stringify({ error: insertErr.message }), { status: 500, headers: CORS });

    const cnpjFmt = digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (resendKey) {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: officialEmail,
          subject: 'Confirme o CNPJ da sua empresa no Rolê+',
          html: renderEmailHtml(codigo, cnpjFmt, room.nome),
        }),
      });
      if (!emailRes.ok) {
        const errBody = await emailRes.text();
        return new Response(JSON.stringify({ error: 'falha ao enviar e-mail: ' + errBody }), { status: 502, headers: CORS });
      }
    } else {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY não configurada no Supabase' }), { status: 500, headers: CORS });
    }

    return new Response(JSON.stringify({ found: true, room, sentTo: masked, claimToken: inserted.token }), { headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS });
  }
});
