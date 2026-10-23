import { DIDIT_FREE, DIDIT_STANDALONE, diditConfigured } from '../_lib/didit.js';
import { json, optionsResponse } from '../_lib/id-verify.js';

export async function onRequest(context) {
  const request = context.request;
  const env = context.env || {};
  const method = String(request.method || 'GET').toUpperCase();
  if (method === 'OPTIONS') return optionsResponse();
  if (method === 'GET' || method === 'HEAD') {
    return json(200, {
      ok: true,
      provider: 'didit',
      configured: diditConfigured(env),
      free: DIDIT_FREE,
      apis: DIDIT_STANDALONE,
    });
  }
  return json(405, { ok: false, message: 'Use /api/verify-session for free rider ID checks.' });
}

export const onRequestGet = onRequest;
export const onRequestPost = onRequest;
export const onRequestOptions = onRequest;
