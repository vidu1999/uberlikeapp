import { apiKeyFromEnv, json, optionsResponse, verifyLiveness } from '../_lib/id-verify.js';

export async function onRequest(context) {
  const request = context.request;
  const env = context.env || {};
  const method = String(request.method || 'GET').toUpperCase();
  if (method === 'OPTIONS') return optionsResponse();
  if (method === 'GET' || method === 'HEAD') {
    return json(200, { ok: true, provider: 'didit', feature: 'passive-liveness', configured: !!apiKeyFromEnv(env) });
  }
  if (method !== 'POST') return json(405, { ok: false, message: 'Use POST.' });
  let body = {};
  try { body = await request.json(); } catch (_) { body = {}; }
  try {
    const out = await verifyLiveness(env, body);
    return json(out.status, out.body);
  } catch (e) {
    return json(502, { ok: false, message: (e && e.message) || 'Could not check this selfie.' });
  }
}

export const onRequestPost = onRequest;
export const onRequestGet = onRequest;
export const onRequestOptions = onRequest;
