/**
 * Didit identity webhook.
 * POST https://quickbite-2ao.pages.dev/webhooks/didit
 * Paste that URL in Didit → API & Webhooks. Secret stays on the server.
 */
function headers() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,HEAD,POST,PUT,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Signature, X-Signature-V2, X-Timestamp',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  };
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status: status, headers: headers() });
}

function webhookSecret(env) {
  return String((env && (env.DIDIT_WEBHOOK_SECRET || env.DIDIT_WHSEC)) || '').trim();
}

function hexEqual(a, b) {
  const x = String(a || '').toLowerCase();
  const y = String(b || '').toLowerCase();
  if (x.length !== y.length || !x.length) return false;
  let out = 0;
  for (let i = 0; i < x.length; i++) out |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return out === 0;
}

function canon(value) {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'boolean') return value ? 'true' : 'false';
  if (t === 'number') {
    if (!Number.isFinite(value)) return 'null';
    if (Math.floor(value) === value) return String(value);
    return JSON.stringify(value);
  }
  if (t === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canon).join(',') + ']';
  if (t === 'object') {
    const keys = Object.keys(value).sort();
    return '{' + keys.map(function (k) { return JSON.stringify(k) + ':' + canon(value[k]); }).join(',') + '}';
  }
  return 'null';
}

async function hmacHex(sec, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(sec), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
}

function headerVal(request, name) {
  return request.headers.get(name) || request.headers.get(name.toLowerCase()) || '';
}

async function signatureOk(raw, request, sec) {
  if (!sec) return true;
  const ts = Number(headerVal(request, 'X-Timestamp'));
  if (Number.isFinite(ts) && ts > 0) {
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - ts) > 300) return false;
  }
  const v2 = headerVal(request, 'X-Signature-V2') || headerVal(request, 'X-Signature-V2-Previous');
  const v1 = headerVal(request, 'X-Signature') || headerVal(request, 'X-Signature-Previous');
  const simple = headerVal(request, 'X-Signature-Simple');
  let parsed = null;
  try { parsed = raw ? JSON.parse(raw) : {}; } catch (_) { parsed = null; }
  if (v2) {
    const canonical = parsed ? canon(parsed) : raw;
    const expect = await hmacHex(sec, canonical);
    if (hexEqual(v2, expect)) return true;
    const expectRaw = await hmacHex(sec, raw);
    if (hexEqual(v2, expectRaw)) return true;
  }
  if (v1) {
    const expect = await hmacHex(sec, raw);
    if (hexEqual(v1, expect)) return true;
  }
  if (simple && parsed) {
    const line = [parsed.timestamp || ts || '', parsed.session_id || '', parsed.status || '', parsed.webhook_type || ''].join(':');
    const expect = await hmacHex(sec, line);
    if (hexEqual(simple, expect)) return true;
  }
  if (!v2 && !v1 && !simple) return true;
  return false;
}

async function handlePost(request, env) {
  const raw = await request.text();
  const sec = webhookSecret(env);
  let event = {};
  try { event = raw ? JSON.parse(raw) : {}; } catch (_) { event = {}; }
  try {
    const ok = await signatureOk(raw, request, sec);
    if (!ok) return json(200, { received: true, warning: 'signature' });
  } catch (_) {
    return json(200, { received: true, warning: 'signature' });
  }
  const type = String(event.webhook_type || event.type || 'status.updated');
  const status = String(event.status || '');
  return json(200, {
    received: true,
    provider: 'didit',
    webhook_type: type,
    status: status || null,
    session_id: event.session_id || null,
  });
}

export async function onRequest(context) {
  const request = context.request;
  const env = context.env || {};
  const method = String(request.method || 'GET').toUpperCase();
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: headers() });
  if (method === 'GET' || method === 'HEAD') {
    const body = JSON.stringify({ ok: true, provider: 'didit' });
    return new Response(method === 'HEAD' ? null : body, { status: 200, headers: headers() });
  }
  try {
    return await handlePost(request, env);
  } catch (e) {
    return json(200, { received: true, provider: 'didit', warning: (e && e.message) || 'ok' });
  }
}

export const onRequestPost = onRequest;
export const onRequestPut = onRequest;
export const onRequestPatch = onRequest;
export const onRequestGet = onRequest;
export const onRequestHead = onRequest;
export const onRequestOptions = onRequest;
