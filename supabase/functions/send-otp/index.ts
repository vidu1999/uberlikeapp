// Deploy in Supabase → Edge Functions → send-otp
// Secrets: GREEN_ID, GREEN_TOKEN  (or META_TOKEN + META_PHONE_ID)
// Sends the OTP from YOUR connected WhatsApp to the number the user typed.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function e164(raw: string) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('940') && d.length === 12) d = '94' + d.slice(3);
  if (d.startsWith('0') && d.length === 10) d = '94' + d.slice(1);
  if (d.startsWith('7') && d.length === 9) d = '94' + d;
  if (d.startsWith('94') === false && d.length === 9) d = '94' + d;
  return d;
}

async function greenPost(host: string, id: string, token: string, method: string, payload: unknown) {
  const r = await fetch(`${host}/waInstance${id}/${method}/${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data: j as Record<string, unknown> };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { phone, body } = await req.json();
    const to = e164(phone);
    const text = String(body || '');
    if (!to || !text) return Response.json({ ok: false, error: 'phone and body required' }, { status: 400, headers: cors });

    const greenId = Deno.env.get('GREEN_ID') || '';
    const greenToken = Deno.env.get('GREEN_TOKEN') || '';
    const metaToken = Deno.env.get('META_TOKEN') || '';
    const metaPhoneId = Deno.env.get('META_PHONE_ID') || '';
    const metaTemplate = Deno.env.get('META_TEMPLATE') || '';

    if (greenId && greenToken) {
      const host = (Deno.env.get('GREEN_API_URL') || ('https://' + greenId.slice(0, 4) + '.api.green-api.com')).replace(/\/$/, '');
      const phoneNum = Number(to);
      const chk = await greenPost(host, greenId, greenToken, 'checkWhatsapp', {
        phone: Number.isSafeInteger(phoneNum) ? phoneNum : to,
      });
      if (chk.data && chk.data.existsWhatsapp === false) {
        return Response.json({ ok: false, error: 'This number is not on WhatsApp. Use the number that opens WhatsApp on the phone.' }, { status: 400, headers: cors });
      }
      const r = await greenPost(host, greenId, greenToken, 'sendMessage', { chatId: to + '@c.us', message: text });
      if (!r.ok) return Response.json({ ok: false, error: r.data, status: r.status }, { status: 502, headers: cors });
      if (!(r.data && (r.data.idMessage || r.data.existsWhatsapp !== false))) {
        return Response.json({ ok: false, error: r.data || 'WhatsApp send failed' }, { status: 502, headers: cors });
      }
      return Response.json({ ok: true, via: 'green-api', to, result: r.data }, { headers: cors });
    }

    if (metaToken && metaPhoneId) {
      const payload: Record<string, unknown> = metaTemplate
        ? {
            messaging_product: 'whatsapp',
            to,
            type: 'template',
            template: {
              name: metaTemplate,
              language: { code: 'en' },
              components: [
                { type: 'body', parameters: [{ type: 'text', text: text.replace(/\D/g, '').slice(-4) }] },
                { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: text.replace(/\D/g, '').slice(-4) }] },
              ],
            },
          }
        : {
            messaging_product: 'whatsapp',
            to,
            type: 'text',
            text: { body: text },
          };
      const r = await fetch(`https://graph.facebook.com/v21.0/${metaPhoneId}/messages`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + metaToken, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return Response.json({ ok: false, error: j, status: r.status }, { status: 502, headers: cors });
      return Response.json({ ok: true, via: 'meta', to, result: j }, { headers: cors });
    }

    return Response.json(
      { ok: false, error: 'Set GREEN_ID+GREEN_TOKEN or META_TOKEN+META_PHONE_ID on this function' },
      { status: 503, headers: cors },
    );
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500, headers: cors });
  }
});
