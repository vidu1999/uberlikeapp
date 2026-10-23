/**
 * Didit identity webhook.
 * POST https://quickbite-2ao.pages.dev/webhooks/didit
 * Also: POST https://quickbite-2ao.pages.dev/api/webhooks/didit
 */
import { handleDiditWebhook, json, optionsResponse } from '../_lib/didit-webhook.js';

export async function onRequest(context) {
  const request = context.request;
  const env = context.env || {};
  const method = String(request.method || 'GET').toUpperCase();
  if (method === 'OPTIONS') return optionsResponse();
  if (method === 'GET' || method === 'HEAD') {
    const body = JSON.stringify({ ok: true, provider: 'didit' });
    return new Response(method === 'HEAD' ? null : body, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
      },
    });
  }
  try {
    return await handleDiditWebhook(env, request, context.waitUntil && context.waitUntil.bind(context));
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
