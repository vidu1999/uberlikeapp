'use strict';

const crypto = require('crypto');

const API_BASE = 'https://api.payments.lk';
const FALLBACK_KEY = 'sk_test_ocrYCakUIleiRHlJEhtP5E9xsxFBh3N9';

function secret() {
  return String(process.env.PAYMENTS_LK_SECRET_KEY || process.env.PAYMENTS_LK_KEY || FALLBACK_KEY).trim();
}

function webhookSecret() {
  return String(process.env.PAYMENTS_LK_WEBHOOK_SECRET || process.env.PAYMENTS_LK_WHSEC || '').trim();
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

async function createCheckout(body, opts) {
  body = body || {};
  opts = opts || {};
  const key = secret();
  const lines = lineItemsOf(body);
  const amountCents = Math.round(Number(body.amountCents) || 0);
  if (!lines && amountCents < 100) return fail(400, 'Invalid amount.');
  const idem = String(opts.idempotencyKey || body.idempotencyKey || body.reference || (Date.now() + '-' + Math.random().toString(36).slice(2))).slice(0, 180);
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

async function confirmCheckout(body) {
  body = body || {};
  const key = secret();
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
    const message = pay.failureMessage || 'Payment was not completed.';
    return { status: 402, body: { message: message, error: message, status: pay.status || data.status || 'open', checkoutId: data.id } };
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

function constructEvent(raw, header, secretVal) {
  if (!secretVal) throw new Error('Pass the endpoint\'s signing secret, which starts with whsec_.');
  const value = Array.isArray(header) ? header.join(',') : String(header || '');
  let timestamp;
  const candidates = [];
  String(value).split(',').forEach((part) => {
    const bits = part.trim().split('=');
    const k = bits[0];
    const item = bits.slice(1).join('=');
    if (k === 't' && item && /^[0-9]{1,12}$/.test(item)) timestamp = Number(item);
    if (k === 'v1' && item && /^[0-9a-f]{64}$/.test(item)) candidates.push(item);
  });
  if (timestamp == null || !candidates.length) throw new Error('The Payments-Signature header is not in the expected t=...,v1=... form.');
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 300) throw new Error('The webhook\'s timestamp is outside the tolerance.');
  const expected = crypto.createHmac('sha256', secretVal).update(timestamp + '.' + raw, 'utf8').digest();
  const matched = candidates.some((c) => {
    const got = Buffer.from(c, 'hex');
    return got.length === expected.length && crypto.timingSafeEqual(expected, got);
  });
  if (!matched) throw new Error('No signature matches this body and secret.');
  const event = JSON.parse(raw);
  if (!event || event.object !== 'event' || typeof event.id !== 'string' || typeof event.type !== 'string') {
    throw new Error('The webhook body is not a Payments.lk event.');
  }
  return event;
}

async function retrievePayment(paymentId) {
  if (!checkoutIdOk(paymentId)) return null;
  const r = await fetch(API_BASE + '/v1/payments/' + encodeURIComponent(paymentId), {
    headers: { Authorization: 'Bearer ' + secret(), Accept: 'application/json' },
  });
  const text = await r.text();
  let data = {};
  try { data = JSON.parse(text); } catch (_) {}
  if (!r.ok) return null;
  return data;
}

async function handle(method, body) {
  if (method === 'GET') return { status: 200, body: { ok: true, provider: 'payments.lk' } };
  if (method !== 'POST') return fail(405, 'Method not allowed');
  const action = String((body && body.action) || 'create');
  try {
    if (action === 'create') return await createCheckout(body || {}, { idempotencyKey: body && body.idempotencyKey });
    if (action === 'confirm') return await confirmCheckout(body || {});
    return fail(400, 'Unknown action.');
  } catch (e) {
    return fail(502, (e && e.message) || 'Payments.lk is unavailable.');
  }
}

async function handleCheckout(method, body, opts) {
  if (method === 'GET') return { status: 200, body: { ok: true, provider: 'payments.lk' } };
  if (method !== 'POST') return fail(405, 'Method not allowed');
  try {
    return await createCheckout(body || {}, opts || {});
  } catch (e) {
    return fail(502, (e && e.message) || 'Payments.lk is unavailable.');
  }
}

async function handleWebhook(raw, signatureHeader) {
  const whsec = webhookSecret();
  let event;
  try {
    if (whsec) event = constructEvent(raw, signatureHeader, whsec);
    else event = JSON.parse(raw || '{}');
  } catch (e) {
    return { status: 200, body: { received: true, warning: (e && e.message) || 'not signed by Payments.lk' } };
  }
  if (!event || typeof event !== 'object') return { status: 200, body: { received: true } };
  if (event.type === 'test.ping' || event.type === 'ping') {
    return { status: 200, body: { received: true, type: event.type } };
  }
  if (event.type === 'payment.succeeded') {
    const data = event.data || {};
    const paymentId = data.id || data.paymentId;
    const live = paymentId ? await retrievePayment(paymentId) : null;
    const pay = live || data;
    if (!pay || (pay.status && pay.status !== 'succeeded')) {
      return { status: 200, body: { received: true, type: 'payment.succeeded', warning: 'not confirmed' } };
    }
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

module.exports = { handle, handleCheckout, handleWebhook };
