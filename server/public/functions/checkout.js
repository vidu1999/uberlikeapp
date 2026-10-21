import { createCheckout, json, optionsResponse, originOf } from './_lib/payments-lk.js';

export async function onRequest(context) {
  const request = context.request;
  const env = context.env || {};
  const method = String(request.method || 'GET').toUpperCase();
  if (method === 'OPTIONS') return optionsResponse();
  if (method === 'GET' || method === 'HEAD') return json(200, { ok: true, provider: 'payments.lk' });
  let body = {};
  try { body = await request.json(); } catch (_) { body = {}; }
  try {
    const out = await createCheckout(env, body, {
      idempotencyKey: request.headers.get('Idempotency-Key') || request.headers.get('idempotency-key'),
      origin: originOf(request),
    });
    return json(out.status, out.body);
  } catch (e) {
    return json(502, { message: (e && e.message) || 'Payments.lk is unavailable.', error: (e && e.message) || 'Payments.lk is unavailable.' });
  }
}

export const onRequestPost = onRequest;
export const onRequestGet = onRequest;
export const onRequestOptions = onRequest;
