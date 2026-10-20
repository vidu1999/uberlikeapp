'use strict';

const API_BASE = 'https://api.payments.lk';
const FALLBACK_KEY = 'sk_test_ocrYCakUIleiRHlJEhtP5E9xsxFBh3N9';

function secret() {
  return String(process.env.PAYMENTS_LK_SECRET_KEY || process.env.PAYMENTS_LK_KEY || FALLBACK_KEY).trim();
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
  if (amountCents < 100) return { status: 400, body: { error: 'Invalid amount.' } };
  const idem = String(body.idempotencyKey || body.reference || (Date.now() + '-' + Math.random().toString(36).slice(2))).slice(0, 180);
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
  if (!r.ok) return { status: r.status >= 400 ? r.status : 502, body: { error: errMsg(data, 'Payments.lk declined the checkout.') } };
  const pay = data.payment || {};
  if (!data.url) return { status: 502, body: { error: 'Payments.lk did not return a checkout URL.' } };
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

async function confirmCheckout(key, body) {
  const id = String(body.checkoutId || body.id || '').trim();
  if (!checkoutIdOk(id)) return { status: 400, body: { error: 'Invalid checkout.' } };
  const r = await fetch(API_BASE + '/v1/checkouts/' + encodeURIComponent(id), {
    headers: {
      Authorization: 'Bearer ' + key,
      Accept: 'application/json',
    },
  });
  const text = await r.text();
  let data = {};
  try { data = JSON.parse(text); } catch (_) {}
  if (!r.ok) return { status: r.status >= 400 ? r.status : 502, body: { error: errMsg(data, 'Could not confirm payment.') } };
  const pay = data.payment || {};
  const expected = Math.round(Number(body.amountCents) || 0);
  const paid = Math.round(Number(pay.amountCents) || 0);
  if (pay.status !== 'succeeded') {
    return {
      status: 402,
      body: {
        error: pay.failureMessage || 'Payment was not completed.',
        status: pay.status || data.status || 'open',
        checkoutId: data.id,
      },
    };
  }
  if (expected && paid !== expected) {
    return { status: 400, body: { error: 'Paid amount does not match this order.' } };
  }
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

async function handle(method, body) {
  const key = secret();
  if (method === 'GET') return { status: 200, body: { ok: true, provider: 'payments.lk' } };
  if (method !== 'POST') return { status: 405, body: { error: 'Method not allowed' } };
  const action = String((body && body.action) || 'create');
  try {
    if (action === 'create') return await createCheckout(key, body || {});
    if (action === 'confirm') return await confirmCheckout(key, body || {});
    return { status: 400, body: { error: 'Unknown action.' } };
  } catch (e) {
    return { status: 502, body: { error: (e && e.message) || 'Payments.lk is unavailable.' } };
  }
}

module.exports = { handle };
