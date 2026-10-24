import { apiKeyFromEnv, json, optionsResponse, riderKycDecision, startRiderKycSession } from '../_lib/id-verify.js';

export async function onRequest(context) {
  const request = context.request;
  const env = context.env || {};
  const method = String(request.method || 'GET').toUpperCase();
  if (method === 'OPTIONS') return optionsResponse();
  const url = new URL(request.url);
  if (method === 'GET' || method === 'HEAD') {
    const sid = url.searchParams.get('id') || url.searchParams.get('session_id') || '';
    if (!sid) {
      return json(200, { ok: true, provider: 'didit', feature: 'session', free: true, configured: !!apiKeyFromEnv(env) });
    }
    try {
      const out = await riderKycDecision(env, sid);
      return json(out.status, out.body);
    } catch (e) {
      return json(502, { ok: false, message: (e && e.message) || 'Could not read this ID check.' });
    }
  }
  if (method !== 'POST') return json(405, { ok: false, message: 'Use POST.' });
  let body = {};
  try { body = await request.json(); } catch (_) { body = {}; }
  try {
    const out = await startRiderKycSession(env, body, url.origin);
    return json(out.status, out.body);
  } catch (e) {
    return json(502, { ok: false, message: (e && e.message) || 'Could not start free ID check.' });
  }
}

export const onRequestPost = onRequest;
export const onRequestGet = onRequest;
export const onRequestOptions = onRequest;
