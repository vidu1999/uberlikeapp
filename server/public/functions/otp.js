const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function e164(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('0') && d.length === 10) d = '94' + d.slice(1);
  if (!d.startsWith('94') && d.length === 9) d = '94' + d;
  return d;
}

function hosts(wa) {
  const id = String(wa.greenId || '');
  const list = [
    wa.apiUrl,
    id.length >= 4 ? 'https://' + id.slice(0, 4) + '.api.green-api.com' : '',
    id.length >= 4 ? 'https://' + id.slice(0, 4) + '.api.greenapi.com' : '',
    'https://api.green-api.com',
    'https://api.greenapi.com',
  ];
  const out = [];
  for (const h of list) {
    const v = String(h || '').replace(/\/$/, '');
    if (v && out.indexOf(v) === -1) out.push(v);
  }
  return out;
}

async function loadWa(origin) {
  try {
    const r = await fetch(origin + '/js/wa.json', { cache: 'no-store' });
    if (r.ok) return r.json();
  } catch (_) {}
  return {
    greenId: '710722770031',
    greenToken: '81a5c51bd44b48a08367d01f3ca546b5a4e7409696654a8b9a',
    apiUrl: 'https://7107.api.green-api.com',
  };
}

async function sendGreen(wa, to, text) {
  const id = wa.greenId;
  const token = wa.greenToken;
  let last = 'no host';
  for (const host of hosts(wa)) {
    try {
      const r = await fetch(host + '/waInstance' + id + '/sendMessage/' + token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: to + '@c.us', message: text }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) return { ok: true, via: host, to, result: j };
      last = 'HTTP ' + r.status + ' ' + JSON.stringify(j).slice(0, 180);
    } catch (e) {
      last = String(e);
    }
  }
  return { ok: false, error: last };
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

export async function onRequestPost(context) {
  try {
    const origin = new URL(context.request.url).origin;
    const { phone, body } = await context.request.json();
    const to = e164(phone);
    const text = String(body || '');
    if (!to || !text) {
      return new Response(JSON.stringify({ ok: false, error: 'phone and body required' }), { status: 400, headers: CORS });
    }
    const wa = await loadWa(origin);
    if (!wa.greenId || !wa.greenToken) {
      return new Response(JSON.stringify({ ok: false, error: 'WhatsApp sender not connected' }), { status: 503, headers: CORS });
    }
    const out = await sendGreen(wa, to, text);
    return new Response(JSON.stringify(out), { status: out.ok ? 200 : 502, headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: CORS });
  }
}
