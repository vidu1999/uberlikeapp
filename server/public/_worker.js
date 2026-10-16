const GREEN_ID = '710722770031';
const GREEN_TOKEN = '81a5c51bd44b48a08367d01f3ca546b5a4e7409696654a8b9a';
const GREEN_HOSTS = ['7107.api.green-api.com', 'api.green-api.com'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
  'Content-Type': 'application/json',
};

function e164(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('0') && d.length === 10) d = '94' + d.slice(1);
  if (!d.startsWith('94') && d.length === 9) d = '94' + d;
  return d;
}

function json(data, status) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: CORS });
}

async function sendGreen(to, text) {
  let last = 'no host';
  for (const host of GREEN_HOSTS) {
    try {
      const r = await fetch('https://' + host + '/waInstance' + GREEN_ID + '/sendMessage/' + GREEN_TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: to + '@c.us', message: text }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) return { ok: true, via: host, to, result: j };
      last = 'HTTP ' + r.status + ' ' + JSON.stringify(j).slice(0, 220);
    } catch (e) {
      last = String(e && e.message ? e.message : e);
    }
  }
  return { ok: false, error: last };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/otp' || path === '/otp/') {
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      if (request.method !== 'POST') return json({ ok: false, error: 'POST { phone, body }' }, 405);
      try {
        const { phone, body } = await request.json();
        const to = e164(phone);
        const text = String(body || '');
        if (!to || !text) return json({ ok: false, error: 'phone and body required' }, 400);
        const out = await sendGreen(to, text);
        return json(out, out.ok ? 200 : 502);
      } catch (e) {
        return json({ ok: false, error: String(e) }, 500);
      }
    }

    if (!env || !env.ASSETS) return new Response('Not found', { status: 404 });
    return env.ASSETS.fetch(request);
  },
};
