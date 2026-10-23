/**
 * Catch /webhooks/* even when the nested function file is not mapped.
 * Other paths fall through to static files / more specific functions.
 */
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

function isDiditPath(path) {
  const p = String(path || '').replace(/\/$/, '') || '/';
  return p === '/webhooks/didit' || p === '/api/webhooks/didit';
}

function isWebhookPath(path) {
  const p = String(path || '').replace(/\/$/, '') || '/';
  return p === '/webhook' || p === '/webhooks/payments-lk' || p.indexOf('/webhooks/') === 0;
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (isDiditPath(url.pathname)) return context.next();
  if (!isWebhookPath(url.pathname)) return context.next();
  const method = String(context.request.method || 'GET').toUpperCase();
  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,HEAD,POST,PUT,PATCH,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Payments-Signature, Idempotency-Key' } });
  }
  if (method === 'GET' || method === 'HEAD') {
    return json(200, { ok: true, provider: 'payments.lk' });
  }
  let event = {};
  try {
    const raw = await context.request.text();
    event = raw ? JSON.parse(raw) : {};
  } catch (_) {
    event = {};
  }
  return json(200, { received: true, type: event.type || 'test.ping' });
}
