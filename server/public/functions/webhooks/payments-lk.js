import { handleWebhook, json, optionsResponse } from '../_lib/payments-lk.js';

export async function onRequest(context) {
  const request = context.request;
  const env = context.env || {};
  if (request.method === 'OPTIONS') return optionsResponse();
  if (request.method === 'GET') return json(200, { ok: true, provider: 'payments.lk' });
  if (request.method !== 'POST') return json(405, { message: 'Method not allowed', error: 'Method not allowed' });
  const raw = await request.text();
  const signature = request.headers.get('Payments-Signature') || request.headers.get('payments-signature');
  try {
    const out = await handleWebhook(env, raw, signature);
    return json(out.status, out.body);
  } catch (e) {
    return json(400, { message: (e && e.message) || 'not signed by Payments.lk', error: (e && e.message) || 'not signed by Payments.lk' });
  }
}
