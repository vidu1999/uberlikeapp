import { confirmCheckout, createCheckout, json, optionsResponse, originOf } from '../_lib/payments-lk.js';

export async function onRequest(context) {
  const request = context.request;
  const env = context.env || {};
  if (request.method === 'OPTIONS') return optionsResponse();
  if (request.method === 'GET') return json(200, { ok: true, provider: 'payments.lk' });
  if (request.method !== 'POST') return json(405, { message: 'Method not allowed', error: 'Method not allowed' });
  let body = {};
  try { body = await request.json(); } catch (_) { return json(400, { message: 'Invalid JSON', error: 'Invalid JSON' }); }
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
