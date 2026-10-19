'use strict';

const fs = require('fs');
const path = require('path');
const seed = require('./seed');

function loadDotEnv() {
  const file = path.join(__dirname, '..', '.env');
  try {
    const raw = fs.readFileSync(file, 'utf8');
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i < 1) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (k && (process.env[k] == null || process.env[k] === '')) process.env[k] = v;
    }
  } catch (_) {}
}

loadDotEnv();

function supabaseUrl() {
  return String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
}
function supabaseKey() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  );
}
function jwtRole(key) {
  try {
    const part = String(key).split('.')[1] || '';
    const json = Buffer.from(part, 'base64').toString('utf8');
    return JSON.parse(json).role || '';
  } catch (_) {
    return '';
  }
}
function anonKey() {
  const explicit = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (explicit) return explicit;
  const k = supabaseKey();
  if (k && jwtRole(k) !== 'service_role') return k;
  return '';
}
function firebaseUrl() {
  return String(process.env.FIREBASE_DB_URL || process.env.FIREBASE_DATABASE_URL || '').replace(/\/$/, '');
}
function firebaseAuth() {
  const s = process.env.FIREBASE_SECRET || process.env.FIREBASE_DATABASE_SECRET || process.env.FIREBASE_AUTH || '';
  return s ? '?auth=' + encodeURIComponent(s) : '';
}

function name() {
  if (supabaseUrl() && supabaseKey()) return 'supabase';
  if (firebaseUrl()) return 'firebase';
  return 'local';
}

async function timedFetch(url, opts, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms || 15000);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function sbHeaders(extra) {
  return Object.assign(
    {
      apikey: supabaseKey(),
      Authorization: 'Bearer ' + supabaseKey(),
    },
    extra || {},
  );
}

async function rest(path, opts) {
  const res = await timedFetch(supabaseUrl() + '/rest/v1/' + path, {
    ...opts,
    headers: sbHeaders(opts && opts.headers),
  });
  const text = await res.text();
  if (!res.ok) throw new Error('Supabase ' + path.split('?')[0] + ' ' + res.status + ' ' + text.slice(0, 220));
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    return text;
  }
}

function shopRow(s) {
  return {
    id: s.id,
    name: s.name,
    category: s.category || null,
    rating: s.rating,
    reviews: s.reviews,
    is_open: s.isOpen !== false,
    lat: s.lat,
    lng: s.lng,
    km: s.km,
    emoji: s.emoji || null,
    eta: s.eta || null,
    fee: s.fee,
    hours: s.hours || null,
    address: s.address || null,
    image: s.image || null,
    promo: s.promo || null,
  };
}
function shopFrom(r) {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    rating: Number(r.rating || 0),
    reviews: Number(r.reviews || 0),
    isOpen: r.is_open !== false && r.isOpen !== false,
    lat: r.lat != null ? Number(r.lat) : undefined,
    lng: r.lng != null ? Number(r.lng) : undefined,
    km: r.km != null ? Number(r.km) : undefined,
    emoji: r.emoji,
    eta: r.eta,
    fee: r.fee != null ? Number(r.fee) : 0,
    hours: r.hours,
    address: r.address,
    image: r.image,
    promo: r.promo,
  };
}
function itemRow(i) {
  return {
    id: i.id,
    shop_id: i.shopId,
    name: i.name,
    category: i.category || null,
    price: i.price,
    is_available: i.isAvailable !== false,
    description: i.desc || i.description || null,
    image: i.image || null,
  };
}
function itemFrom(r) {
  return {
    id: r.id,
    shopId: r.shop_id || r.shopId,
    name: r.name,
    category: r.category,
    price: Number(r.price || 0),
    isAvailable: r.is_available !== false && r.isAvailable !== false,
    desc: r.description || r.desc || '',
    image: r.image,
  };
}
function accountRow(a) {
  return {
    id: a.id,
    name: a.name,
    phone: a.phone,
    email: a.email || null,
    pin: a.pin || null,
    role: a.role,
    address: a.address || null,
    shop_id: a.shopId || null,
    vehicle: a.vehicle || null,
    rating: a.rating != null ? a.rating : null,
  };
}
function accountFrom(r) {
  const a = {
    id: r.id,
    name: r.name,
    phone: r.phone,
    email: r.email,
    pin: r.pin,
    role: r.role,
    address: r.address,
  };
  if (r.shop_id || r.shopId) a.shopId = r.shop_id || r.shopId;
  if (r.vehicle) a.vehicle = r.vehicle;
  if (r.rating != null) a.rating = Number(r.rating);
  return a;
}
function orderRow(o) {
  return {
    id: o.id,
    user_id: o.userId || null,
    shop_id: o.shopId || null,
    shop_name: o.shopName || null,
    customer_name: o.customerName || null,
    customer_phone: o.customerPhone || null,
    address: o.address || null,
    status: o.status || null,
    total_amount: o.totalAmount,
    data: o,
    updated_at: o.updatedAt || new Date().toISOString(),
  };
}
function orderFrom(r) {
  if (r && r.data && typeof r.data === 'object' && r.data.id) return r.data;
  return {
    id: r.id,
    userId: r.user_id,
    shopId: r.shop_id,
    shopName: r.shop_name,
    customerName: r.customer_name,
    customerPhone: r.customer_phone,
    address: r.address,
    status: r.status,
    totalAmount: Number(r.total_amount || 0),
    items: [],
  };
}

async function upsert(table, rows) {
  if (!rows || !rows.length) return;
  const chunk = 80;
  for (let i = 0; i < rows.length; i += chunk) {
    await rest(table, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(rows.slice(i, i + chunk)),
    });
  }
}

async function loadTables() {
  const [shopRows, itemRows, accountRows, orderRows, msgRows] = await Promise.all([
    rest('shops?select=*&order=id.asc'),
    rest('menu_items?select=*&order=id.asc'),
    rest('accounts?select=*'),
    rest('orders?select=*&order=id.asc'),
    rest('messages?select=*'),
  ]);
  const shops = (shopRows || []).map(shopFrom);
  const items = (itemRows || []).map(itemFrom);
  const accounts = (accountRows || []).map(accountFrom);
  const orders = (orderRows || []).map(orderFrom);
  const messages = {};
  for (const m of msgRows || []) {
    const list = messages[m.order_id] || (messages[m.order_id] = []);
    list.push({ id: m.id, from: m.sender, role: m.role, text: m.body, ts: m.ts });
  }
  let seq = 1000;
  for (const o of orders) {
    const n = Number(String(o.id || '').replace(/\D/g, ''));
    if (n > seq) seq = n;
  }
  return { shops, items, accounts, orders, messages, seq };
}

async function ensureSeed() {
  return { seeded: false };
}

async function supabaseLoad() {
  const tables = await loadTables();
  return seed.stripDemo(tables);
}

async function supabaseSave(payload) {
  const jobs = [];
  if (Array.isArray(payload.shops)) jobs.push(upsert('shops', payload.shops.map(shopRow)));
  if (Array.isArray(payload.items)) jobs.push(upsert('menu_items', payload.items.map(itemRow)));
  if (Array.isArray(payload.accounts)) jobs.push(upsert('accounts', payload.accounts.map(accountRow)));
  if (Array.isArray(payload.orders)) jobs.push(upsert('orders', payload.orders.map(orderRow)));
  const msgs = [];
  if (payload.messages && typeof payload.messages === 'object') {
    for (const [orderId, list] of Object.entries(payload.messages)) {
      for (const m of list || []) {
        msgs.push({
          id: m.id,
          order_id: orderId,
          sender: m.from || m.sender || null,
          role: m.role || null,
          body: m.text || m.body || '',
          ts: m.ts || Date.now(),
        });
      }
    }
  }
  if (msgs.length) jobs.push(upsert('messages', msgs));
  await Promise.all(jobs);
  try {
    await rest('app_state', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        id: 'main',
        payload,
        updated_at: new Date().toISOString(),
      }),
    });
  } catch (_) {}
}

async function firebaseLoad() {
  const res = await timedFetch(firebaseUrl() + '/app_state.json' + firebaseAuth());
  if (!res.ok) {
    const text = await res.text();
    throw new Error('Firebase load ' + res.status + ' ' + text.slice(0, 180));
  }
  return await res.json();
}

async function firebaseSave(payload) {
  const res = await timedFetch(firebaseUrl() + '/app_state.json' + firebaseAuth(), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error('Firebase save ' + res.status + ' ' + text.slice(0, 180));
  }
}

async function load() {
  const kind = name();
  if (kind === 'supabase') return supabaseLoad();
  if (kind === 'firebase') return firebaseLoad();
  return null;
}

async function save(payload) {
  const kind = name();
  if (kind === 'supabase') return supabaseSave(payload);
  if (kind === 'firebase') return firebaseSave(payload);
}

function info() {
  const kind = name();
  return {
    db: kind,
    supabase: Boolean(supabaseUrl() && supabaseKey()),
    firebase: Boolean(firebaseUrl()),
    supabaseUrl: supabaseUrl(),
    supabaseAnon: anonKey(),
  };
}

async function countRows(table) {
  const rows = await rest(table + '?select=id&limit=20', { method: 'GET' });
  return Array.isArray(rows) ? rows.length : 0;
}

function demoWipePaths() {
  const shopsIn = seed.DEMO_SHOP_IDS.map((id) => '"' + id + '"').join(',');
  const itemsIn = seed.DEMO_ITEM_IDS.map((id) => '"' + id + '"').join(',');
  const accIn = seed.DEMO_ACCOUNT_IDS.map((id) => '"' + id + '"').join(',');
  const phonesIn = seed.DEMO_PHONES.map((p) => '"' + p + '"').join(',');
  const ordersIn = seed.DEMO_ORDER_IDS.map((id) => '"' + id + '"').join(',');
  return [
    'messages?order_id=in.(' + ordersIn + ')',
    'orders?id=in.(' + ordersIn + ')',
    'orders?shop_id=in.(' + shopsIn + ')',
    'orders?user_id=in.("USER_1","USER_2")',
    'orders?customer_phone=in.(' + phonesIn + ')',
    'menu_items?shop_id=in.(' + shopsIn + ')',
    'menu_items?id=in.(' + itemsIn + ')',
    'shops?id=in.(' + shopsIn + ')',
    'accounts?id=in.(' + accIn + ')',
    'accounts?phone=in.(' + phonesIn + ')',
    'otp_codes?phone=in.(' + phonesIn + ')',
  ];
}

async function wipeDemo() {
  if (name() !== 'supabase') return { ok: false, skipped: true };
  const report = [];
  for (const p of demoWipePaths()) {
    try {
      await rest(p, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
      report.push({ path: p, ok: true });
    } catch (err) {
      report.push({ path: p, ok: false, error: String((err && err.message) || err).slice(0, 120) });
    }
  }
  for (const title of seed.DEMO_SHOP_NAMES) {
    try {
      await rest('orders?shop_name=eq.' + encodeURIComponent(title), {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal', 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop_name: '' }),
      });
    } catch (_) {}
  }
  return { ok: true, report };
}

async function wipeAll() {
  if (name() !== 'supabase') throw new Error('Supabase is not configured');
  const steps = [
    ['messages', 'order_id=not.is.null'],
    ['orders', 'id=not.is.null'],
    ['menu_items', 'id=not.is.null'],
    ['shops', 'id=not.is.null'],
    ['accounts', 'id=not.is.null'],
    ['otp_codes', 'id=not.is.null'],
    ['app_state', 'id=not.is.null'],
  ];
  const report = [];
  for (const [table, filter] of steps) {
    try {
      await rest(table + '?' + filter, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal', 'Content-Type': 'application/json' },
      });
    } catch (err) {
      const msg = String((err && err.message) || err);
      if (/ 404 |does not exist|PGRST205|Could not find/i.test(msg)) {
        report.push({ table, remaining: 0, skipped: true });
        continue;
      }
      throw err;
    }
    const left = await countRows(table);
    report.push({ table, remaining: left });
    if (left > 0) throw new Error('Wipe incomplete: ' + table + ' still has rows');
  }
  return report;
}

async function wipeShops() {
  if (name() !== 'supabase') throw new Error('Supabase is not configured');
  const steps = [
    ['messages', 'order_id=not.is.null'],
    ['orders', 'id=not.is.null'],
    ['menu_items', 'id=not.is.null'],
    ['shops', 'id=not.is.null'],
    ['accounts', 'role=eq.shop'],
    ['otp_codes', 'role=eq.shop'],
  ];
  const report = [];
  for (const [table, filter] of steps) {
    try {
      await rest(table + '?' + filter, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal', 'Content-Type': 'application/json' },
      });
    } catch (err) {
      const msg = String((err && err.message) || err);
      if (/ 404 |does not exist|PGRST205|Could not find/i.test(msg)) {
        report.push({ table, remaining: 0, skipped: true });
        continue;
      }
      throw err;
    }
    let left = 0;
    try {
      const rows = await rest(table + '?' + filter + '&select=id&limit=5', { method: 'GET' });
      left = Array.isArray(rows) ? rows.length : 0;
    } catch (_) {}
    report.push({ table, remaining: left });
    if (left > 0) throw new Error('Wipe incomplete: ' + table + ' still has rows');
  }
  return report;
}

module.exports = {
  name,
  load,
  save,
  info,
  ensureSeed,
  wipeDemo,
  wipeAll,
  wipeShops,
  supabaseUrl,
  anonKey,
  shopFrom,
  itemFrom,
  orderFrom,
};
