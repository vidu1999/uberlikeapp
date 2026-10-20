/**
 * Payments.lk checkout proxy. Secret stays on the server (Pages Function).
 * POST { action: "create" | "confirm", ... }
 */
const API_BASE = 'https://api.payments.lk';
const FALLBACK_KEY = 'sk_test_ocrYCakUIleiRHlJEhtP5E9xsxFBh3N9';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  };
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status: status, headers: corsHeaders() });
}

function secret(env) {
  return String((env && (env.PAYMENTS_LK_SECRET_KEY || env.PAYMENTS_LK_KEY)) || FALLBACK_KEY).trim();
}

function errMsg(data, fallback) {
  if (!data) return fallback;
  if (typeof data.error === 'string' && data.error) return data.error;
  if (data.error && data.error.message) return data.error.message;
  if (data.message) return data.message;
  return fallback;
}

function checkoutIdOk(id) {
  return /^[A-Za-z0-9_-]{6,128}$/.test(String(id || ''));
}

async function createCheckout(key, body) {
  const amountCents = Math.round(Number(body.amountCents) || 0);
  if (amountCents < 100) return json(400, { error: 'Invalid amount.' });
  const idem = String(body.idempotencyKey || body.reference || crypto.randomUUID()).slice(0, 180);
  const payload = {
    amountCents: amountCents,
    description: String(body.description || 'QuickBite order').slice(0, 200),
    locale: 'en',
  };
  if (body.reference) payload.reference = String(body.reference).slice(0, 120);
  if (body.successUrl) payload.successUrl = String(body.successUrl).slice(0, 500);
  if (body.cancelUrl) payload.cancelUrl = String(body.cancelUrl).slice(0, 500);
  const c = body.customer || {};
  const customer = {};
  if (c.name) customer.name = String(c.name).slice(0, 80);
  if (c.email) customer.email = String(c.email).slice(0, 120);
  if (c.phone) customer.phone = String(c.phone).slice(0, 20);
  if (customer.name || customer.email || customer.phone) payload.customer = customer;
  const r = await fetch(API_BASE + '/v1/checkouts', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Idempotency-Key': idem,
    },
    body: JSON.stringify(payload),
  });
  const text = await r.text();
  let data = {};
  try { data = JSON.parse(text); } catch (_) {}
  if (!r.ok) return json(r.status >= 400 ? r.status : 502, { error: errMsg(data, 'Payments.lk declined the checkout.') });
  const pay = data.payment || {};
  if (!data.url) return json(502, { error: 'Payments.lk did not return a checkout URL.' });
  return json(200, {
    id: data.id,
    url: data.url,
    status: data.status,
    paymentId: pay.id || null,
    amountCents: pay.amountCents || amountCents,
  });
}

async function confirmCheckout(key, body) {
  const id = String(body.checkoutId || body.id || '').trim();
  if (!checkoutIdOk(id)) return json(400, { error: 'Invalid checkout.' });
  const r = await fetch(API_BASE + '/v1/checkouts/' + encodeURIComponent(id), {
    headers: {
      Authorization: 'Bearer ' + key,
      Accept: 'application/json',
    },
  });
  const text = await r.text();
  let data = {};
  try { data = JSON.parse(text); } catch (_) {}
  if (!r.ok) return json(r.status >= 400 ? r.status : 502, { error: errMsg(data, 'Could not confirm payment.') });
  const pay = data.payment || {};
  const expected = Math.round(Number(body.amountCents) || 0);
  const paid = Math.round(Number(pay.amountCents) || 0);
  if (pay.status !== 'succeeded') {
    return json(402, {
      error: pay.failureMessage || 'Payment was not completed.',
      status: pay.status || data.status || 'open',
      checkoutId: data.id,
    });
  }
  if (expected && paid !== expected) {
    return json(400, { error: 'Paid amount does not match this order.' });
  }
  const card = pay.card || {};
  return json(200, {
    ok: true,
    status: 'succeeded',
    checkoutId: data.id,
    paymentId: pay.id,
    amountCents: paid,
    brand: card.scheme || 'Card',
    last4: card.last4 || '',
    paidAt: pay.succeededAt || new Date().toISOString(),
    reference: pay.reference || null,
  });
}

export async function onRequest(context) {
  const request = context.request;
  const env = context.env || {};
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  const key = secret(env);
  if (request.method === 'GET') {
    return json(200, { ok: true, provider: 'payments.lk' });
  }
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });
  let body = {};
  try { body = await request.json(); } catch (_) { return json(400, { error: 'Invalid JSON' }); }
  const action = String(body.action || 'create');
  try {
    if (action === 'create') return await createCheckout(key, body);
    if (action === 'confirm') return await confirmCheckout(key, body);
    return json(400, { error: 'Unknown action.' });
  } catch (e) {
    return json(502, { error: (e && e.message) || 'Payments.lk is unavailable.' });
  }
}
