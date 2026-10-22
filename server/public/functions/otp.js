const FALLBACK = {
  greenId: '710722770031',
  greenToken: '81a5c51bd44b48a08367d01f3ca546b5a4e7409696654a8b9a',
  apiUrl: 'https://7107.api.green-api.com',
};

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function optionsResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store',
    },
  });
}

function waNumberCandidates(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.indexOf('00') === 0) d = d.slice(2);
  if (d.startsWith('940') && d.length === 12) d = '94' + d.slice(3);
  if (d.startsWith('0') && d.length === 10) d = '94' + d.slice(1);
  if (d.startsWith('7') && d.length === 9) d = '94' + d;
  const out = [];
  function add(v) {
    v = String(v || '').replace(/\D/g, '');
    if (!v || v.length < 9 || v.length > 15) return;
    if (v.charAt(0) === '0') return;
    if (out.indexOf(v) >= 0) return;
    out.push(v);
  }
  add(d);
  return out;
}

function waPhoneValue(to) {
  const n = Number(to);
  if (Number.isSafeInteger(n) && n > 0) return n;
  return to;
}

function friendlyWaError(msg) {
  const s = String(msg || '').slice(0, 240);
  if (/existsWhatsapp|not on WhatsApp|not registered on WhatsApp/i.test(s)) {
    return 'This number is not on WhatsApp. Use the number that opens WhatsApp on the phone.';
  }
  if (/466|not authorized|unauthorized|stateInstance/i.test(s)) {
    return 'WhatsApp sender is offline. Try again in a minute.';
  }
  if (/field|validation|chatId|message/i.test(s)) {
    return 'WhatsApp did not accept this number. Check the digits and tap Continue.';
  }
  if (!s || /failed|error|send/i.test(s)) {
    return 'WhatsApp did not send the code. Check the number and tap Continue.';
  }
  return s;
}

async function greenPost(host, id, token, method, payload) {
  const res = await fetch(String(host).replace(/\/$/, '') + '/waInstance' + id + '/' + method + '/' + token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data: data || {} };
}

async function sendViaGreen(env, phone, text) {
  const message = String(text || '').trim();
  if (!message) throw new Error('WhatsApp message is empty.');
  const id = String((env && (env.GREEN_ID || env.GREEN_API_ID)) || FALLBACK.greenId);
  const token = String((env && (env.GREEN_TOKEN || env.GREEN_API_TOKEN)) || FALLBACK.greenToken);
  const hosts = [];
  function addHost(h) {
    const v = String(h || '').replace(/\/$/, '');
    if (v && hosts.indexOf(v) === -1) hosts.push(v);
  }
  addHost((env && (env.GREEN_API_URL || env.GREEN_URL)) || FALLBACK.apiUrl);
  if (id.length >= 4) addHost('https://' + id.slice(0, 4) + '.api.green-api.com');
  addHost('https://api.green-api.com');
  const numbers = waNumberCandidates(phone);
  if (!numbers.length) throw new Error('Enter a valid WhatsApp number.');
  let last = 'WhatsApp did not send the code. Check the number and tap Continue.';
  for (let h = 0; h < hosts.length; h++) {
    for (let n = 0; n < numbers.length; n++) {
      const to = numbers[n];
      const chk = await greenPost(hosts[h], id, token, 'checkWhatsapp', { phone: waPhoneValue(to) });
      if (chk.data && chk.data.existsWhatsapp === false) {
        last = 'This number is not on WhatsApp. Use the number that opens WhatsApp on the phone.';
        continue;
      }
      if (chk.status === 466) {
        last = 'WhatsApp sender is offline. Try again in a minute.';
        continue;
      }
      const sent = await greenPost(hosts[h], id, token, 'sendMessage', {
        chatId: to + '@c.us',
        message: message,
      });
      if (sent.ok && sent.data && sent.data.idMessage) return { ok: true, to: to, idMessage: sent.data.idMessage };
      if (sent.ok && !sent.data.error && sent.status < 300) return { ok: true, to: to };
      const err = sent.data.message || sent.data.error || sent.data.reason || '';
      last = friendlyWaError(typeof err === 'string' ? err : JSON.stringify(err || sent.status));
    }
  }
  throw new Error(last);
}

export async function onRequest(context) {
  const request = context.request;
  const env = context.env || {};
  const method = String(request.method || 'GET').toUpperCase();
  if (method === 'OPTIONS') return optionsResponse();
  if (method === 'GET' || method === 'HEAD') return json(200, { ok: true, provider: 'green-api' });
  if (method !== 'POST') return json(405, { ok: false, error: 'Use POST to send a WhatsApp code.' });
  let body = {};
  try { body = await request.json(); } catch (_) { body = {}; }
  const phone = body.phone || body.to || '';
  const text = body.body || body.message || body.text || '';
  try {
    const out = await sendViaGreen(env, phone, text);
    return json(200, { ok: true, provider: 'green-api', to: out.to });
  } catch (e) {
    return json(502, { ok: false, error: (e && e.message) || 'WhatsApp did not send the code.' });
  }
}

export const onRequestPost = onRequest;
export const onRequestGet = onRequest;
export const onRequestOptions = onRequest;
