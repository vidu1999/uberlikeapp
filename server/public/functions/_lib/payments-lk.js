const API_BASE = 'https://api.payments.lk';
const FALLBACK_KEY = 'sk_test_ocrYCakUIleiRHlJEhtP5E9xsxFBh3N9';

export function secretFromEnv(env) {
  return String((env && (env.PAYMENTS_LK_SECRET_KEY || env.PAYMENTS_LK_KEY)) || FALLBACK_KEY).trim();
}

export function webhookSecretFromEnv(env) {
  return String((env && (env.PAYMENTS_LK_WEBHOOK_SECRET || env.PAYMENTS_LK_WHSEC)) || '').trim();
}

export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Idempotency-Key, Payments-Signature',
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

export function optionsResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Idempotency-Key, Payments-Signature',
      'Cache-Control': 'no-store',
    },
  });
}

function errMsg(data, fallback) {
  if (!data) return fallback;
  if (typeof data.error === 'string' && data.error) return data.error;
  if (data.error && data.error.message) return data.error.message;
  if (data.message) return data.message;
  return fallback;
}

function fail(status, message) {
  return { status: status, body: { message: message, error: message } };
}

function checkoutIdOk(id) {
  return /^[A-Za-z0-9_-]{6,128}$/.test(String(id || ''));
}

function originOf(request) {
  const o = request && request.headers && request.headers.get('Origin');
  if (o && /^https?:\/\//i.test(o)) return o.replace(/\/$/, '');
  try { return new URL(request.url).origin; } catch (_) {}
  return 'https://quickbite-2ao.pages.dev';
}

function customerOf(c) {
  const customer = {};
  if (!c) return null;
  if (c.name) customer.name = String(c.name).slice(0, 80);
  if (c.email) customer.email = String(c.email).slice(0, 120);
  if (c.phone) customer.phone = String(c.phone).slice(0, 20);
  if (customer.name || customer.email || customer.phone) return customer;
  return null;
}

function lineItemsOf(body) {
  if (!Array.isArray(body.lineItems) || !body.lineItems.length) return null;
  const lines = [];
  for (let i = 0; i < body.lineItems.length && lines.length < 10; i++) {
    const it = body.lineItems[i] || {};
    const unit = Math.round(Number(it.unitAmountCents) || 0);
    const qty = Math.min(99, Math.max(1, Math.round(Number(it.quantity) || 1)));
    const name = String(it.name || 'Item').slice(0, 80);
    if (unit < 100) continue;
    const row = { name: name, unitAmountCents: unit, quantity: qty };
    if (it.description) row.description = String(it.description).slice(0, 120);
    lines.push(row);
  }
  return lines.length ? lines : null;
}

export async function createCheckout(env, body, opts) {
  body = body || {};
  opts = opts || {};
  const key = secretFromEnv(env);
  const lines = lineItemsOf(body);
  const amountCents = Math.round(Number(body.amountCents) || 0);
  if (!lines && amountCents < 100) return fail(400, 'Invalid amount.');
  const idem = String(opts.idempotencyKey || body.idempotencyKey || body.reference || crypto.randomUUID()).slice(0, 180);
  const origin = String(opts.origin || body.origin || 'https://quickbite-2ao.pages.dev').replace(/\/$/, '');
  const payload = {
    locale: 'en',
    description: String(body.description || 'QuickBite order').slice(0, 200),
    successUrl: String(body.successUrl || (origin + '/user.html?paid=1')).slice(0, 500),
    cancelUrl: String(body.cancelUrl || (origin + '/user.html?paid=0')).slice(0, 500),
  };
  if (lines) payload.lineItems = lines;
  else payload.amountCents = amountCents;
  if (body.reference) payload.reference = String(body.reference).slice(0, 120);
  const customer = customerOf(body.customer);
  if (customer) payload.customer = customer;
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
  if (!r.ok) return fail(r.status >= 400 ? r.status : 502, errMsg(data, 'Payments.lk declined the checkout.'));
  if (!data.url) return fail(502, 'Payments.lk did not return a checkout URL.');
  const pay = data.payment || {};
  return {
    status: 200,
    body: {
      id: data.id,
      url: data.url,
      status: data.status,
      paymentId: pay.id || null,
      amountCents: pay.amountCents || amountCents,
    },
  };
}

export async function confirmCheckout(env, body) {
  body = body || {};
  const key = secretFromEnv(env);
  const id = String(body.checkoutId || body.id || '').trim();
  if (!checkoutIdOk(id)) return fail(400, 'Invalid checkout.');
  const r = await fetch(API_BASE + '/v1/checkouts/' + encodeURIComponent(id), {
    headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' },
  });
  const text = await r.text();
  let data = {};
  try { data = JSON.parse(text); } catch (_) {}
  if (!r.ok) return fail(r.status >= 400 ? r.status : 502, errMsg(data, 'Could not confirm payment.'));
  const pay = data.payment || {};
  const expected = Math.round(Number(body.amountCents) || 0);
  const paid = Math.round(Number(pay.amountCents) || 0);
  if (pay.status !== 'succeeded') {
    return {
      status: 402,
      body: {
        message: pay.failureMessage || 'Payment was not completed.',
        error: pay.failureMessage || 'Payment was not completed.',
        status: pay.status || data.status || 'open',
        checkoutId: data.id,
      },
    };
  }
  if (expected && paid !== expected) return fail(400, 'Paid amount does not match this order.');
  const card = pay.card || {};
  return {
    status: 200,
    body: {
      ok: true,
      status: 'succeeded',
      checkoutId: data.id,
      paymentId: pay.id,
      amountCents: paid,
      brand: card.scheme || 'Card',
      last4: card.last4 || '',
      paidAt: pay.succeededAt || new Date().toISOString(),
      reference: pay.reference || null,
    },
  };
}

function parseSignature(header) {
  const value = Array.isArray(header) ? header.join(',') : String(header || '');
  let timestamp;
  const candidates = [];
  value.split(',').forEach(function (part) {
    const bits = part.trim().split('=');
    const k = bits[0];
    const item = bits.slice(1).join('=');
    if (k === 't' && item && /^[0-9]{1,12}$/.test(item)) timestamp = Number(item);
    if (k === 'v1' && item && /^[0-9a-f]{64}$/.test(item)) candidates.push(item);
  });
  return { timestamp: timestamp, candidates: candidates };
}

function hexEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
}

export async function verifyWebhook(raw, header, secret) {
  if (!secret) throw new Error('Pass the endpoint\'s signing secret, which starts with whsec_.');
  const parsed = parseSignature(header);
  if (parsed.timestamp == null || !parsed.candidates.length) throw new Error('The Payments-Signature header is not in the expected t=...,v1=... form.');
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parsed.timestamp) > 300) throw new Error('The webhook\'s timestamp is outside the tolerance.');
  const expected = await hmacHex(secret, parsed.timestamp + '.' + raw);
  if (!parsed.candidates.some(function (c) { return hexEqual(c, expected); })) {
    throw new Error('No signature matches this body and secret.');
  }
  const event = JSON.parse(raw);
  if (!event || event.object !== 'event' || typeof event.id !== 'string' || typeof event.type !== 'string') {
    throw new Error('The webhook body is not a Payments.lk event.');
  }
  return event;
}

async function retrievePayment(key, paymentId) {
  if (!checkoutIdOk(paymentId)) return null;
  const r = await fetch(API_BASE + '/v1/payments/' + encodeURIComponent(paymentId), {
    headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' },
  });
  const text = await r.text();
  let data = {};
  try { data = JSON.parse(text); } catch (_) {}
  if (!r.ok) return null;
  return data;
}

export async function handleWebhook(env, raw, signatureHeader) {
  const key = secretFromEnv(env);
  const whsec = webhookSecretFromEnv(env);
  let event;
  try {
    if (whsec) {
      event = await verifyWebhook(raw, signatureHeader, whsec);
    } else {
      event = JSON.parse(raw || '{}');
    }
  } catch (e) {
    return fail(400, (e && e.message) || 'not signed by Payments.lk');
  }
  if (!event || typeof event !== 'object') return fail(400, 'The webhook body is not JSON.');
  if (event.type === 'test.ping' || event.type === 'ping') {
    return { status: 200, body: { received: true, type: event.type } };
  }
  if (event.type === 'payment.succeeded') {
    const data = event.data || {};
    const paymentId = data.id || data.paymentId;
    const live = paymentId ? await retrievePayment(key, paymentId) : null;
    const pay = live || data;
    if (!pay || pay.status !== 'succeeded') return fail(402, 'Payment was not completed.');
    return {
      status: 200,
      body: {
        received: true,
        type: 'payment.succeeded',
        paymentId: pay.id || paymentId,
        reference: pay.reference || null,
        amountCents: pay.amountCents || null,
        status: 'succeeded',
      },
    };
  }
  return { status: 200, body: { received: true, type: event.type || 'unknown' } };
}

export { originOf };
