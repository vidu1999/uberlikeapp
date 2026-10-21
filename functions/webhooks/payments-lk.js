/**
 * Payments.lk webhook. Never return 405 — they retry anything but 2xx.
 * POST https://quickbite-2ao.pages.dev/webhooks/payments-lk
 */
const API_BASE = 'https://api.payments.lk';
const FALLBACK_KEY = 'sk_test_ocrYCakUIleiRHlJEhtP5E9xsxFBh3N9';

function headers() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,HEAD,POST,PUT,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Payments-Signature, Idempotency-Key',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  };
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status: status, headers: headers() });
}

function secret(env) {
  return String((env && (env.PAYMENTS_LK_SECRET_KEY || env.PAYMENTS_LK_KEY)) || FALLBACK_KEY).trim();
}

function webhookSecret(env) {
  return String((env && (env.PAYMENTS_LK_WEBHOOK_SECRET || env.PAYMENTS_LK_WHSEC)) || '').trim();
}

function hexEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function hmacHex(sec, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(sec), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
}

async function verify(raw, header, sec) {
  const value = Array.isArray(header) ? header.join(',') : String(header || '');
  let timestamp;
  const candidates = [];
  value.split(',').forEach(function (part) {
    const bits = part.trim().split('=');
    const k = bits[0];
    const item = bits.slice(1).join('=');
    if (k === 't' && item && /^[0-9]{1,12}$/.test(item)) timestamp = Number(item);
    if (k === 'v1' && item && /^[0-9a-f]{64}$/.test(item)) candidates.push(item);
  });
  if (timestamp == null || !candidates.length) throw new Error('The Payments-Signature header is not in the expected t=...,v1=... form.');
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 300) throw new Error('The webhook timestamp is outside the tolerance.');
  const expected = await hmacHex(sec, timestamp + '.' + raw);
  if (!candidates.some(function (c) { return hexEqual(c, expected); })) throw new Error('No signature matches this body and secret.');
  const event = JSON.parse(raw);
  if (!event || event.object !== 'event' || typeof event.id !== 'string' || typeof event.type !== 'string') {
    throw new Error('The webhook body is not a Payments.lk event.');
  }
  return event;
}

async function retrievePayment(key, paymentId) {
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(String(paymentId || ''))) return null;
  const r = await fetch(API_BASE + '/v1/payments/' + encodeURIComponent(paymentId), {
    headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' },
  });
  const text = await r.text();
  try { return JSON.parse(text); } catch (_) { return null; }
}

async function handlePost(request, env) {
  const raw = await request.text();
  const signature = request.headers.get('Payments-Signature') || request.headers.get('payments-signature');
  const whsec = webhookSecret(env);
  let event;
  try {
    if (whsec && signature) event = await verify(raw, signature, whsec);
    else event = raw ? JSON.parse(raw) : { type: 'test.ping', object: 'event', id: 'ping' };
  } catch (e) {
    // Still 200 so Payments.lk stops retrying a dashboard ping with a missing secret.
    return json(200, { received: true, warning: (e && e.message) || 'signature' });
  }
  if (!event || typeof event !== 'object') return json(200, { received: true });
  if (event.type === 'test.ping' || event.type === 'ping' || !event.type) {
    return json(200, { received: true, type: event.type || 'test.ping' });
  }
  if (event.type === 'payment.succeeded') {
    const data = event.data || {};
    const paymentId = data.id || data.paymentId;
    const live = paymentId ? await retrievePayment(secret(env), paymentId) : null;
    const pay = live && live.status ? live : data;
    return json(200, {
      received: true,
      type: 'payment.succeeded',
      paymentId: pay.id || paymentId || null,
      reference: pay.reference || null,
      amountCents: pay.amountCents || null,
      status: pay.status || 'succeeded',
    });
  }
  return json(200, { received: true, type: event.type });
}

export async function onRequest(context) {
  const request = context.request;
  const env = context.env || {};
  const method = String(request.method || 'GET').toUpperCase();
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: headers() });
  if (method === 'GET' || method === 'HEAD') {
    const body = JSON.stringify({ ok: true, provider: 'payments.lk' });
    return new Response(method === 'HEAD' ? null : body, { status: 200, headers: headers() });
  }
  try {
    return await handlePost(request, env);
  } catch (e) {
    return json(200, { received: true, warning: (e && e.message) || 'ok' });
  }
}

export const onRequestPost = onRequest;
export const onRequestPut = onRequest;
export const onRequestPatch = onRequest;
export const onRequestGet = onRequest;
export const onRequestHead = onRequest;
export const onRequestOptions = onRequest;
