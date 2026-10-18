#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const otp = require('./otp');
const db = require('./db');
const seed = require('./seed');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC = path.join(__dirname, 'public');
const DATA_FILE = path.join(__dirname, 'data.json');

let shops = seed.shops.map((s) => ({ ...s }));
let items = seed.items.map((i) => ({ ...i }));
let accounts = seed.accounts.map((a) => ({ ...a }));
const pendingReg = new Map();

let seq = 1000;
let orders = [];
let messages = {}; // orderId -> [{id, from, role, text, ts}]
let sessions = {};
const sseClients = new Set();
let dbReady = { db: 'local', cloud: false, error: null };

function snapshot() {
  return {
    orders,
    messages,
    seq,
    shops,
    items,
    accounts,
  };
}

function applySnapshot(d) {
  if (!d || typeof d !== 'object') return;
  const clean = seed.stripDemo(d);
  if (Array.isArray(d.orders)) orders = clean.orders;
  if (d.messages && typeof d.messages === 'object') messages = clean.messages;
  if (d.seq) seq = Number(d.seq) || seq;
  if (Array.isArray(d.shops)) shops = clean.shops;
  if (Array.isArray(d.items)) items = clean.items;
  if (Array.isArray(d.accounts)) accounts = clean.accounts;
}

function seedDemoIfEmpty() {
  shops = shops.filter((s) => !seed.isDemoShop(s.id));
  items = items.filter((i) => !seed.isDemoShop(i.shopId));
  accounts = accounts.filter((a) => !seed.isDemoAccount(a));
  orders = orders.filter((o) => !seed.isDemoOrder(o));
  return false;
}

function load() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    applySnapshot(JSON.parse(raw));
  } catch (_) {}
  if (seedDemoIfEmpty()) save();
}

let lastHydrate = 0;

async function hydrateFromCloud(opts) {
  const force = opts && opts.force;
  if (db.name() === 'local') return false;
  if (!force && Date.now() - lastHydrate < 800) return dbReady.cloud;
  lastHydrate = Date.now();
  try {
    if (opts && opts.seedIfEmpty) {
      await db.ensureSeed(false);
    }
    const cloud = await db.load();
    if (cloud) {
      applySnapshot(cloud);
      dbReady.cloud = true;
      dbReady.error = null;
      try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(snapshot(), null, 2));
      } catch (_) {}
      return true;
    }
  } catch (err) {
    dbReady.cloud = false;
    dbReady.error = err.message;
    console.error('Supabase pull failed:', err.message);
  }
  return false;
}

async function persist() {
  const snap = snapshot();
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(snap, null, 2));
  } catch (err) {
    console.error('save failed', err.message);
  }
  if (db.name() === 'local') return;
  try {
    await db.save(snap);
    dbReady.cloud = true;
    dbReady.error = null;
    lastHydrate = 0;
  } catch (err) {
    dbReady.error = err.message;
    console.error('cloud save failed', err.message);
  }
}

function save() {
  persist().catch(() => {});
}

function shopById(id) {
  return shops.find((s) => s.id === id);
}

function token() {
  return 'tok_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function broadcast() {
  const payload = `data: ${JSON.stringify({ type: 'state', orders, shops, items, messages })}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch (_) {
      sseClients.delete(res);
    }
  }
}

function cors(res, extra) {
  const headers = Object.assign(
    {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Cache-Control': 'no-store',
    },
    extra || {},
  );
  return headers;
}

function json(res, code, body) {
  const data = JSON.stringify(body);
  res.writeHead(code, cors(res, { 'Content-Type': 'application/json; charset=utf-8' }));
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function mime(file) {
  const ext = path.extname(file).toLowerCase();
  return (
    {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.ico': 'image/x-icon',
    }[ext] || 'application/octet-stream'
  );
}

function serveFile(res, file) {
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, cors(res, { 'Content-Type': mime(file), 'Cache-Control': 'no-cache' }));
    res.end(data);
  });
}

function patchOrder(order, body) {
  if (body.status) order.status = body.status;
  if (body.riderId !== undefined) order.riderId = body.riderId;
  if (body.riderName !== undefined) order.riderName = body.riderName;
  if (body.riderPhone !== undefined) order.riderPhone = body.riderPhone;
  if (body.riderLat !== undefined) order.riderLat = Number(body.riderLat);
  if (body.riderLng !== undefined) order.riderLng = Number(body.riderLng);
  if (body.rating !== undefined) order.rating = Number(body.rating);
  if ((body.status === 'accepted' || body.status === 'picked_up' || body.status === 'on_the_way') && (order.riderLat == null || order.riderLng == null)) {
    const shop = shopById(order.shopId);
    order.riderLat = shop ? shop.lat : 8.3514;
    order.riderLng = shop ? shop.lng : 80.3988;
  }
  if (body.status === 'picked_up' || body.status === 'on_the_way') order.pickedUpAt = order.pickedUpAt || new Date().toISOString();
  if (body.status === 'delivered') order.deliveredAt = new Date().toISOString();
  order.updatedAt = new Date().toISOString();
  return order;
}

function publicUser(u) {
  const { pin, ...rest } = u;
  return rest;
}

function roleLabel(role) {
  if (role === 'shop') return 'Shop';
  if (role === 'rider') return 'Rider';
  return 'User';
}

function sameRole(a, b) {
  const x = a === 'user' ? 'customer' : a;
  const y = b === 'user' ? 'customer' : b;
  return x === y;
}

function phoneKey(raw) {
  const d = otp.normalizePhone(raw);
  return d.length >= 9 ? d.slice(-9) : d;
}

function accountByPhone(phone, role) {
  const key = phoneKey(phone);
  if (!key) return null;
  return accounts.find((a) => phoneKey(a.phone) === key && sameRole(a.role, role) && !seed.isDemoAccount(a)) || null;
}

function alreadyRoleMessage(role) {
  const have = roleLabel(role);
  return 'This number already has a ' + have + ' account. Login instead — you cannot create another ' + have + ' with the same number.';
}

function userForVerifiedPhone(phone, role) {
  let user = accountByPhone(phone, role);
  if (user) return user;
  const names = { customer: 'Guest', shop: 'Shop staff', rider: 'Courier' };
  user = {
    id: 'ACC_' + (role === 'shop' ? 'shop' : role === 'rider' ? 'rider' : 'customer') + '_' + phoneKey(phone),
    name: names[role] || 'Guest',
    phone,
    pin: 'otp',
    role: role || 'customer',
    address: '',
  };
  if (role === 'rider') {
    user.vehicle = 'Bike';
    user.rating = 5;
  }
  accounts.push(user);
  save();
  return user;
}

async function handleApi(req, res, url) {
  const { pathname } = url;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors(res));
    res.end();
    return;
  }

  if (pathname === '/api/config' && req.method === 'GET') {
    const inf = db.info();
    json(res, 200, {
      db: inf.db,
      cloud: dbReady.cloud,
      supabaseUrl: inf.supabaseUrl || '',
      supabaseAnon: inf.supabaseAnon || '',
      tables: ['shops', 'menu_items', 'accounts', 'orders', 'messages'],
    });
    return;
  }

  if (pathname === '/api/health') {
    await hydrateFromCloud();
    json(res, 200, {
      ok: true,
      orders: orders.length,
      shops: shops.length,
      items: items.length,
      clients: sseClients.size,
      db: dbReady.db,
      cloud: dbReady.cloud,
      error: dbReady.error,
    });
    return;
  }

  if (pathname === '/api/otp/send' && req.method === 'POST') {
    const body = await readBody(req);
    try {
      let phone = body.phone;
      if (phone && String(phone).includes('@')) {
        const acc = accounts.find((a) => a.email && a.email.toLowerCase() === String(phone).toLowerCase());
        if (acc) phone = acc.phone;
      }
      const want = body.role || 'customer';
      const out = otp.sendOtp(phone, want);
      json(res, 200, out);
    } catch (err) {
      json(res, err.status || 400, { error: err.message });
    }
    return;
  }

  if (pathname === '/api/otp/sms' && req.method === 'GET') {
    const msg = otp.readSms(url.searchParams.get('token'));
    if (!msg) {
      json(res, 404, { error: 'SMS not found' });
      return;
    }
    json(res, 200, msg);
    return;
  }

  if (pathname === '/api/otp/verify' && req.method === 'POST') {
    const body = await readBody(req);
    try {
      const checked = otp.verifyOtp(body.phone, body.role || 'customer', body.code);
      const pending = pendingReg.get(checked.phone);
      const user = userForVerifiedPhone(checked.phone, checked.role);
      if (pending) {
        if (pending.name) user.name = pending.name;
        if (pending.email) user.email = pending.email;
        if (pending.pin) user.pin = pending.pin;
        pendingReg.delete(checked.phone);
        await persist();
      }
      const tok = token();
      sessions[tok] = user.id;
      json(res, 200, { token: tok, user: publicUser(user) });
    } catch (err) {
      json(res, err.status || 400, { error: err.message });
    }
    return;
  }

  if (pathname === '/api/login' && req.method === 'POST') {
    const body = await readBody(req);
    const role = body.role || 'customer';
    const pin = String(body.pin || '1234');
    let user = accounts.find((a) => a.role === role && !seed.isDemoAccount(a) && a.pin === pin && (!body.phone || a.phone === body.phone));
    if (!user) user = accounts.find((a) => a.role === role && !seed.isDemoAccount(a) && a.pin === pin);
    if (!user) {
      json(res, 401, { error: 'Use WhatsApp OTP to sign in.' });
      return;
    }
    const tok = token();
    sessions[tok] = user.id;
    json(res, 200, { token: tok, user: publicUser(user) });
    return;
  }

  if (pathname === '/api/accounts' && req.method === 'GET') {
    await hydrateFromCloud();
    json(res, 200, accounts.map(publicUser));
    return;
  }

  if (pathname === '/api/shops' && req.method === 'GET') {
    await hydrateFromCloud();
    json(res, 200, shops);
    return;
  }

  if (pathname === '/api/items' && req.method === 'GET') {
    await hydrateFromCloud();
    json(res, 200, items);
    return;
  }

  const itemMatch = pathname.match(/^\/api\/items\/([^/]+)$/);
  if (itemMatch && req.method === 'PATCH') {
    const item = items.find((i) => i.id === itemMatch[1]);
    if (!item) {
      json(res, 404, { error: 'Item not found' });
      return;
    }
    const body = await readBody(req);
    if (typeof body.isAvailable === 'boolean') item.isAvailable = body.isAvailable;
    if (body.price != null) item.price = Number(body.price);
    await persist();
    broadcast();
    json(res, 200, item);
    return;
  }

  if (pathname === '/api/orders' && req.method === 'GET') {
    await hydrateFromCloud();
    json(res, 200, orders);
    return;
  }

  if (pathname === '/api/state' && req.method === 'GET') {
    await hydrateFromCloud();
    json(res, 200, { orders, shops, items, messages, db: dbReady.db, cloud: dbReady.cloud });
    return;
  }

  if (pathname === '/api/reset' && req.method === 'POST') {
    shops = seed.shops.map((s) => ({ ...s }));
    items = seed.items.map((i) => ({ ...i }));
    accounts = seed.accounts.map((a) => ({ ...a }));
    orders = [];
    messages = {};
    seq = 1000;
    seedDemoIfEmpty();
    await persist();
    broadcast();
    json(res, 200, { ok: true });
    return;
  }

  if (pathname === '/api/register' && req.method === 'POST') {
    const body = await readBody(req);
    const role = body.role === 'shop' || body.role === 'rider' ? body.role : 'customer';
    const phone = otp.normalizePhone(body.phone);
    if (!otp.isValidPhone(phone)) {
      json(res, 400, { error: 'Enter a valid mobile number' });
      return;
    }
    const name = String(body.name || '').trim() || (role === 'shop' ? 'Shop owner' : role === 'rider' ? 'Rider' : 'Guest');
    const email = String(body.email || '').trim();
    const pin = String(body.password || body.pin || '1234').slice(0, 32);
    const taken = accountByPhone(phone, role);
    if (taken && (role === 'shop' || role === 'rider')) {
      json(res, 409, { error: alreadyRoleMessage(role) });
      return;
    }
    let user = taken || null;
    if (!user) {
      user = {
        id: 'ACC_' + (role === 'shop' ? 'shop' : role === 'rider' ? 'rider' : 'customer') + '_' + phoneKey(phone),
        name,
        phone,
        email,
        pin,
        role,
        address: body.address || '',
      };
      if (role === 'rider') {
        user.vehicle = 'Bike';
        user.rating = 5;
      }
      accounts.push(user);
    } else {
      user.name = name;
      if (email) user.email = email;
      user.pin = pin;
    }
    await persist();
    if (role === 'shop' || role === 'rider') {
      json(res, 200, {
        ok: true,
        app: role,
        download: seed.APKS[role],
        web: role === 'shop' ? '/shop' : '/rider',
        user: publicUser(user),
      });
      return;
    }
    pendingReg.set(phone, { name, email, pin, role });
    try {
      const out = otp.sendOtp(phone, 'customer');
      json(res, 200, { ok: true, next: 'otp', ...out });
    } catch (err) {
      json(res, err.status || 400, { error: err.message });
    }
    return;
  }

  if (pathname === '/api/orders' && req.method === 'POST') {
    const body = await readBody(req);
    const shop = shopById(body.shopId);
    if (!shop) {
      json(res, 400, { error: 'Unknown shop' });
      return;
    }
    const lineItems = Array.isArray(body.items) && body.items.length
      ? body.items.map((it) => ({
          id: it.id || null,
          name: String(it.name || 'Item'),
          qty: Number(it.qty || 1),
          price: Number(it.price || 0),
        }))
      : [{ name: 'Custom order', qty: 1, price: Number(body.totalAmount || 0) }];
    const subtotal = lineItems.reduce((s, it) => s + it.price * it.qty, 0);
    const deliveryFee = body.deliveryFee != null ? Number(body.deliveryFee) : 200;
    const order = {
      id: `ORD-${++seq}`,
      userId: body.userId || '',
      shopId: shop.id,
      shopName: shop.name,
      shopEmoji: shop.emoji,
      customerName: body.customerName || 'Guest',
      customerPhone: body.customerPhone || '',
      address: body.address || '',
      deliveryType: body.deliveryType || 'Standard',
      note: body.note || '',
      paymentMethod: body.paymentMethod || 'Cash on delivery',
      riderId: null,
      riderName: null,
      riderPhone: null,
      status: 'pending',
      items: lineItems,
      subtotal,
      deliveryFee,
      totalAmount: subtotal + deliveryFee,
      deliveryLat: Number(body.deliveryLat ?? 8.3350),
      deliveryLng: Number(body.deliveryLng ?? 80.4108),
      riderLat: null,
      riderLng: null,
      rating: null,
      timestamp: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    orders.unshift(order);
    messages[order.id] = [
      {
        id: 'm0',
        from: 'SwiftDrop',
        role: 'system',
        text: `Order placed at ${shop.name}. We’ll update you live.`,
        ts: Date.now(),
      },
    ];
    await persist();
    broadcast();
    json(res, 201, order);
    return;
  }

  const msgMatch = pathname.match(/^\/api\/orders\/([^/]+)\/messages$/);
  if (msgMatch && req.method === 'GET') {
    json(res, 200, messages[msgMatch[1]] || []);
    return;
  }
  if (msgMatch && req.method === 'POST') {
    const order = orders.find((o) => o.id === msgMatch[1]);
    if (!order) {
      json(res, 404, { error: 'Not found' });
      return;
    }
    const body = await readBody(req);
    const role = body.role || 'customer';
    const picked = order.status === 'picked_up' || order.status === 'on_the_way' || order.status === 'delivered';
    const lane = order.status === 'cancelled'
      ? null
      : picked
        ? 'customer'
        : (order.riderId || order.riderName || order.status === 'accepted')
          ? 'shop'
          : null;
    if (role !== 'system') {
      const r = role === 'user' ? 'customer' : role;
      const ok = lane && (r === 'rider' || (r === 'shop' && lane === 'shop') || (r === 'customer' && lane === 'customer'));
      if (!ok) {
        json(res, 403, { error: 'Chat is not open for this pair yet.' });
        return;
      }
    }
    const list = messages[order.id] || (messages[order.id] = []);
    const thread = body.thread || (role === 'system' ? undefined : lane);
    const prefix = thread === 'shop' ? 'qbS.' : thread === 'customer' ? 'qbC.' : 'm';
    const msg = {
      id: prefix + Date.now(),
      from: body.from || 'User',
      role,
      text: String(body.text || '').slice(0, 500),
      ts: Date.now(),
      thread,
    };
    if (!msg.text) {
      json(res, 400, { error: 'Empty message' });
      return;
    }
    list.push(msg);
    await persist();
    broadcast();
    json(res, 201, msg);
    return;
  }

  const orderMatch = pathname.match(/^\/api\/orders\/([^/]+)$/);
  if (orderMatch && req.method === 'GET') {
    const order = orders.find((o) => o.id === orderMatch[1]);
    if (!order) {
      json(res, 404, { error: 'Not found' });
      return;
    }
    json(res, 200, order);
    return;
  }

  if (orderMatch && req.method === 'PATCH') {
    const order = orders.find((o) => o.id === orderMatch[1]);
    if (!order) {
      json(res, 404, { error: 'Not found' });
      return;
    }
    const body = await readBody(req);
    const prev = order.status;
    patchOrder(order, body);
    if (body.status && body.status !== prev) {
      const list = messages[order.id] || (messages[order.id] = []);
      const labels = {
        preparing: 'Shop accepted and is preparing your order.',
        ready: 'Order is ready. A rider will pick it up shortly.',
        on_the_way: (order.riderName || 'Your rider') + ' picked up the order and is on the way.',
        delivered: 'Delivered. Enjoy your meal!',
        cancelled: 'Order was cancelled.',
      };
      list.push({
        id: 'm' + Date.now(),
        from: 'SwiftDrop',
        role: 'system',
        text: labels[body.status] || 'Status updated.',
        ts: Date.now(),
      });
    }
    await persist();
    broadcast();
    json(res, 200, order);
    return;
  }

  if (pathname === '/api/stream') {
    res.writeHead(
      200,
      cors(res, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      }),
    );
    res.write(`data: ${JSON.stringify({ type: 'state', orders, shops, items, messages })}\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  json(res, 404, { error: 'Unknown API route' });
}

function handleStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/js/live.js') {
    const inf = db.info();
    const body =
      'window.QB_API = ' +
      JSON.stringify(process.env.PUBLIC_API_URL || '') +
      ';\nwindow.QB_SUPABASE_URL = ' +
      JSON.stringify(inf.supabaseUrl || '') +
      ';\nwindow.QB_SUPABASE_ANON = ' +
      JSON.stringify(inf.supabaseAnon || '') +
      ';\n';
    res.writeHead(200, cors(res, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' }));
    res.end(body);
    return;
  }
  if (p === '/') p = '/index.html';
  if (p === '/user' || p === '/user/') p = '/user.html';
  if (p === '/shop' || p === '/shop/') p = '/shop.html';
  if (p === '/rider' || p === '/rider/') p = '/rider.html';
  if (p === '/apps' || p === '/apps/') p = '/apps.html';
  const safe = path.normalize(p).replace(/^(\.\.[/\\])+/, '');
  const file = path.join(PUBLIC, safe);
  if (!file.startsWith(PUBLIC)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  serveFile(res, file);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }
    handleStatic(req, res, url);
  } catch (err) {
    json(res, 500, { error: String(err.message || err) });
  }
});

setInterval(() => {
  for (const res of sseClients) {
    try {
      res.write(':ping\n\n');
    } catch (_) {
      sseClients.delete(res);
    }
  }
}, 15000);

process.on('uncaughtException', (err) => {
  console.error('uncaughtException', err);
});
process.on('unhandledRejection', (err) => {
  console.error('unhandledRejection', err);
});

async function boot() {
  load();
  dbReady.db = db.name();
  try {
    const ok = await hydrateFromCloud({ force: true, seedIfEmpty: true });
    if (ok) {
      console.log('Database: supabase tables (' + shops.length + ' shops, ' + items.length + ' items, ' + orders.length + ' orders)');
    } else if (dbReady.db !== 'local') {
      console.log('Database: ' + dbReady.db + ' configured but empty — pushing demo seed');
      await persist();
    } else {
      console.log('Database: local JSON (set SUPABASE_URL + SUPABASE_KEY in .env)');
    }
  } catch (err) {
    dbReady.cloud = false;
    dbReady.error = err.message;
    console.error('Cloud database unavailable, using local JSON:', err.message);
  }
  server.listen(PORT, HOST, () => {
    console.log(`SwiftDrop server listening on http://${HOST}:${PORT}`);
  });
}

boot();
