/** GET/POST https://quickbite-2ao.pages.dev/webhook */
const API_BASE = 'https://api.payments.lk';
const FALLBACK_KEY = 'sk_test_ocrYCakUIleiRHlJEhtP5E9xsxFBh3N9';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,HEAD,POST,PUT,PATCH,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Payments-Signature, Idempotency-Key',
    },
  });
}

export async function onRequest(context) {
  const request = context.request;
  const env = context.env || {};
  const method = String(request.method || 'GET').toUpperCase();
  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,HEAD,POST,PUT,PATCH,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Payments-Signature, Idempotency-Key' } });
  }
  if (method === 'GET' || method === 'HEAD') {
    return json(200, { ok: true, provider: 'payments.lk' });
  }
  const raw = await request.text();
  let event = {};
  try { event = raw ? JSON.parse(raw) : {}; } catch (_) { event = {}; }
  if (event.type === 'test.ping' || event.type === 'ping' || !event.type) {
    return json(200, { received: true, type: event.type || 'test.ping' });
  }
  if (event.type === 'payment.succeeded') {
    const data = event.data || {};
    const paymentId = data.id || data.paymentId;
    const key = String((env.PAYMENTS_LK_SECRET_KEY || env.PAYMENTS_LK_KEY) || FALLBACK_KEY).trim();
    if (paymentId && /^[A-Za-z0-9_-]{6,128}$/.test(paymentId)) {
      try {
        await fetch(API_BASE + '/v1/payments/' + encodeURIComponent(paymentId), {
          headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' },
        });
      } catch (_) {}
    }
    return json(200, { received: true, type: 'payment.succeeded', paymentId: paymentId || null });
  }
  return json(200, { received: true, type: event.type || 'ok' });
}

export const onRequestPost = onRequest;
export const onRequestGet = onRequest;
export const onRequestHead = onRequest;
export const onRequestOptions = onRequest;
