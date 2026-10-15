'use strict';

const fs = require('fs');
const path = require('path');

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
      if (k && process.env[k] == null) process.env[k] = v;
    }
  } catch (_) {}
}

loadDotEnv();

function supabaseUrl() {
  return String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
}
function supabaseKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || '';
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
  const t = setTimeout(() => ctrl.abort(), ms || 12000);
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
  if (!res.ok) throw new Error('Supabase ' + path.split('?')[0] + ' ' + res.status + ' ' + text.slice(0, 180));
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
    isOpen: r.is_open !== false,
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
    shopId: r.shop_id,
    name: r.name,
    category: r.category,
    price: Number(r.price || 0),
    isAvailable: r.is_available !== false,
    desc: r.description || '',
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
  if (r.shop_id) a.shopId = r.shop_id;
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
  };
}

async function supabaseLoad() {
  const rows = await rest('app_state?id=eq.main&select=payload');
  const payload = Array.isArray(rows) && rows[0] ? rows[0].payload : null;
  if (payload && Array.isArray(payload.shops) && payload.shops.length) return payload;

  let shops = [];
  let items = [];
  let accounts = [];
  let orders = [];
  const messages = {};
  try {
    shops = ((await rest('shops?select=*')) || []).map(shopFrom);
    items = ((await rest('menu_items?select=*')) || []).map(itemFrom);
    accounts = ((await rest('accounts?select=*')) || []).map(accountFrom);
    const orderRows = (await rest('orders?select=*')) || [];
    orders = orderRows.map((r) => r.data || r);
    const msgs = (await rest('messages?select=*')) || [];
    for (const m of msgs) {
      const list = messages[m.order_id] || (messages[m.order_id] = []);
      list.push({ id: m.id, from: m.sender, role: m.role, text: m.body, ts: m.ts });
    }
  } catch (_) {}

  if (shops.length || orders.length) {
    return {
      shops,
      items,
      accounts,
      orders,
      messages,
      seq: payload && payload.seq ? payload.seq : 1004,
    };
  }
  return payload || null;
}

async function upsert(table, rows) {
  if (!rows || !rows.length) return;
  await rest(table, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
}

async function supabaseSave(payload) {
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
  try {
    if (Array.isArray(payload.shops)) await upsert('shops', payload.shops.map(shopRow));
    if (Array.isArray(payload.items)) await upsert('menu_items', payload.items.map(itemRow));
    if (Array.isArray(payload.accounts)) await upsert('accounts', payload.accounts.map(accountRow));
    if (Array.isArray(payload.orders)) await upsert('orders', payload.orders.map(orderRow));
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
    if (msgs.length) await upsert('messages', msgs);
  } catch (err) {
    console.error('Supabase table sync skipped:', err.message);
  }
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
  };
}

module.exports = { name, load, save, info };
