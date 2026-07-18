// O ROLÊ+ — send-verify-code (Supabase Edge Function)
// Gera e manda o código de 6 dígitos que confirma o e-mail de uma conta recém
// criada (ou reenvia, se a pessoa pedir de novo). Chamado logo depois do
// signUp() e sempre que a pessoa aperta "Reenviar código" na tela de bloqueio.
// Exige sessão válida — só quem já criou a conta pode pedir um código pra ela.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};
const CODE_TTL_MIN = 15;
const RESEND_COOLDOWN_SEC = 30; // evita spam de reenvio
const FROM_EMAIL = 'O Rolê+ <onboarding@resend.dev>';

function renderEmailHtml(codigo: string) {
  // mesmo template de supabase/email-templates/confirmar-email.html
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
  <body style="margin:0;padding:0;background-color:#F3EDEE;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F3EDEE;padding:32px 16px;"><tr><td align="center">
  <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:100%;background-color:#FFF9F9;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(198,39,74,0.08);">
  <tr><td style="background-color:#E8365B;background-image:linear-gradient(135deg,#EF4467,#C6274A);padding:40px 32px 32px;text-align:center;">
  <div style="font-size:30px;line-height:1.2;font-weight:800;color:#ffffff;letter-spacing:-0.3px;">O Rolê<span style="color:#FFD9E1;">+</span></div>
  <div style="font-size:13.5px;color:#FBD7DE;margin-top:6px;font-weight:500;">o que tá rolando perto de você</div>
  </td></tr>
  <tr><td style="padding:36px 32px 8px;">
  <p style="margin:0 0 4px;font-size:19px;font-weight:700;color:#211417;">Confirme seu e-mail</p>
  <p style="margin:0 0 28px;font-size:14.5px;line-height:1.6;color:#6B565B;">Falta só um passo pra sua conta no Rolê+ ficar pronta. Digite o código abaixo no app pra confirmar que esse e-mail é seu.</p>
  </td></tr>
  <tr><td style="padding:0 32px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FDEEF0;border:1px solid #F5CFD6;border-radius:14px;"><tr><td style="padding:22px 16px;text-align:center;">
  <div style="font-size:34px;font-weight:800;letter-spacing:10px;color:#C6274A;font-variant-numeric:tabular-nums;">${codigo}</div>
  </td></tr></table></td></tr>
  <tr><td style="padding:20px 32px 36px;">
  <p style="margin:0;font-size:13px;line-height:1.6;color:#8C7A7E;">Esse código vale por ${CODE_TTL_MIN} minutos. Se você não criou uma conta no Rolê+, pode ignorar este e-mail.</p>
  </td></tr>
  <tr><td style="padding:18px 32px;border-top:1px solid #F0DCE0;">
  <p style="margin:0;font-size:11.5px;color:#B79FA5;text-align:center;">O Rolê+ · este é um e-mail automático, não precisa responder.</p>
  </td></tr>
  </table></td></tr></table></body></html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (userErr || !user || !user.email) {
      return new Response(JSON.stringify({ error: 'não autenticado' }), { status: 401, headers: CORS });
    }

    // cooldown: não manda de novo se pediu um código há poucos segundos
    const { data: last } = await supabase
      .from('email_verify_codes').select('created_at').eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (last && Date.now() - new Date(last.created_at).getTime() < RESEND_COOLDOWN_SEC * 1000) {
      return new Response(JSON.stringify({ error: 'Aguarde um pouco antes de pedir outro código' }), { status: 429, headers: CORS });
    }

    const codigo = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + CODE_TTL_MIN * 60_000).toISOString();

    const { error: insertErr } = await supabase.from('email_verify_codes').insert({
      user_id: user.id, code: codigo, expires_at: expiresAt,
    });
    if (insertErr) return new Response(JSON.stringify({ error: insertErr.message }), { status: 500, headers: CORS });

    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY não configurada no Supabase' }), { status: 500, headers: CORS });
    }
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: user.email,
        subject: 'Confirme seu e-mail no Rolê+',
        html: renderEmailHtml(codigo),
      }),
    });
    if (!emailRes.ok) {
      const errBody = await emailRes.text();
      return new Response(JSON.stringify({ error: 'falha ao enviar e-mail: ' + errBody }), { status: 502, headers: CORS });
    }

    return new Response(JSON.stringify({ ok: true }), { headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS });
  }
});
