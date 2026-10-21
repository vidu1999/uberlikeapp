import { confirmCheckout, createCheckout, handleWebhook, json, optionsResponse, originOf } from '../_lib/payments-lk.js';

export async function onRequest(context) {
  const request = context.request;
  const env = context.env || {};
  const method = String(request.method || 'GET').toUpperCase();
  if (method === 'OPTIONS') return optionsResponse();
  if (method === 'GET' || method === 'HEAD') return json(200, { ok: true, provider: 'payments.lk' });
  const signature = request.headers.get('Payments-Signature') || request.headers.get('payments-signature');
  const raw = await request.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch (_) { body = {}; }
  if (signature || body.object === 'event' || body.type === 'test.ping' || body.type === 'payment.succeeded') {
    try {
      const out = await handleWebhook(env, raw, signature);
      return json(200, out.body || { received: true });
    } catch (e) {
      return json(200, { received: true, warning: (e && e.message) || 'ok' });
    }
  }
  const action = String(body.action || 'create');
  try {
    if (action === 'create') {
      const out = await createCheckout(env, body, {
        idempotencyKey: request.headers.get('Idempotency-Key') || body.idempotencyKey,
        origin: originOf(request),
      });
      return json(out.status, out.body);
    }
    if (action === 'confirm') {
      const out = await confirmCheckout(env, body);
      return json(out.status, out.body);
    }
    return json(400, { message: 'Unknown action.', error: 'Unknown action.' });
  } catch (e) {
    return json(502, { message: (e && e.message) || 'Payments.lk is unavailable.', error: (e && e.message) || 'Payments.lk is unavailable.' });
  }
}

export const onRequestPost = onRequest;
export const onRequestGet = onRequest;
export const onRequestOptions = onRequest;
