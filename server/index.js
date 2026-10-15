#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC = path.join(__dirname, 'public');
const DATA_FILE = path.join(__dirname, 'data.json');

const shops = [
  { id: 'SHOP_1', name: 'Kandy Bakers', category: 'Bakery', rating: 4.8, reviews: 312, isOpen: true, lat: 6.9278, lng: 79.8502, emoji: '🎂', eta: '20–35 min', fee: 0, address: 'Galle Road, Colombo 03', image: '/img/shop-bakery.jpg', promo: 'Buy 1, Get 1 Free' },
  { id: 'SHOP_2', name: 'Burger House', category: 'Fast Food', rating: 4.5, reviews: 890, isOpen: true, lat: 6.9210, lng: 79.8601, emoji: '🍔', eta: '25–40 min', fee: 250, address: 'Bambalapitiya', image: '/img/shop-burger.jpg' },
  { id: 'SHOP_3', name: 'Pizza Town', category: 'Pizza', rating: 4.6, reviews: 540, isOpen: true, lat: 6.9340, lng: 79.8475, emoji: '🍕', eta: '30–45 min', fee: 0, address: 'Kollupitiya', image: '/img/shop-pizza.jpg', promo: 'LKR 0 Delivery Fee' },
  { id: 'SHOP_4', name: 'Coffee Lab', category: 'Coffee', rating: 4.7, reviews: 210, isOpen: true, lat: 6.9188, lng: 79.8544, emoji: '☕', eta: '15–25 min', fee: 0, address: 'Wellawatte', image: '/img/shop-coffee.jpg' },
  { id: 'SHOP_5', name: 'Rice & Curry', category: 'Sri Lankan', rating: 4.9, reviews: 1024, isOpen: true, lat: 6.9312, lng: 79.8660, emoji: '🍛', eta: '22–35 min', fee: 0, address: 'Pettah', image: '/img/shop-curry.jpg', promo: 'Top Eats' },
  { id: 'SHOP_6', name: 'Sweet Palace', category: 'Dessert', rating: 4.4, reviews: 156, isOpen: true, lat: 6.9155, lng: 79.8490, emoji: '🧁', eta: '18–30 min', fee: 250, address: 'Dehiwala', image: '/img/shop-dessert.jpg' },
];

let items = [
  { id: 'I1', shopId: 'SHOP_1', name: 'Chocolate Cake 1kg', category: 'Bakery', price: 2500, isAvailable: true, desc: 'Rich ganache, serves 8' },
  { id: 'I2', shopId: 'SHOP_1', name: 'Butter Cake Slice', category: 'Bakery', price: 350, isAvailable: true, desc: 'Warm vanilla butter cake' },
  { id: 'I3', shopId: 'SHOP_1', name: 'Fish Bun', category: 'Bakery', price: 180, isAvailable: true, desc: 'Spicy fish filling' },
  { id: 'I4', shopId: 'SHOP_1', name: 'Egg Roll', category: 'Bakery', price: 220, isAvailable: true, desc: 'Crispy pastry roll' },
  { id: 'I5', shopId: 'SHOP_2', name: 'Chicken Burger', category: 'Fast Food', price: 1200, isAvailable: true, desc: 'Crispy fillet, cheese, slaw' },
  { id: 'I6', shopId: 'SHOP_2', name: 'Cheese Fries', category: 'Fast Food', price: 700, isAvailable: true, desc: 'Loaded cheddar fries' },
  { id: 'I7', shopId: 'SHOP_2', name: 'Beef Burger', category: 'Fast Food', price: 1450, isAvailable: true, desc: 'Double patty, BBQ sauce' },
  { id: 'I8', shopId: 'SHOP_3', name: 'Cheese Pizza', category: 'Pizza', price: 2400, isAvailable: true, desc: '12" mozzarella classic' },
  { id: 'I9', shopId: 'SHOP_3', name: 'Devilled Chicken Pizza', category: 'Pizza', price: 2800, isAvailable: true, desc: 'Sri Lankan spicy chicken' },
  { id: 'I10', shopId: 'SHOP_4', name: 'Iced Coffee', category: 'Beverages', price: 600, isAvailable: true, desc: 'Cold brew, milk, ice' },
  { id: 'I11', shopId: 'SHOP_4', name: 'Cappuccino', category: 'Beverages', price: 550, isAvailable: true, desc: 'Double shot, foam art' },
  { id: 'I12', shopId: 'SHOP_5', name: 'Chicken Rice & Curry', category: 'Sri Lankan', price: 850, isAvailable: true, desc: '4 curries + papadam' },
  { id: 'I13', shopId: 'SHOP_5', name: 'Kottu Roti', category: 'Sri Lankan', price: 950, isAvailable: true, desc: 'Chicken kottu, egg', image: '/img/kottu.jpg' },
  { id: 'I14', shopId: 'SHOP_5', name: 'Hoppers (3)', category: 'Sri Lankan', price: 400, isAvailable: true, desc: 'Plain hoppers, lunu miris' },
  { id: 'I15', shopId: 'SHOP_5', name: 'Pol Sambol Rice', category: 'Sri Lankan', price: 650, isAvailable: true, desc: 'Coconut sambol + dhal' },
  { id: 'I16', shopId: 'SHOP_6', name: 'Watalappan', category: 'Dessert', price: 450, isAvailable: true, desc: 'Jaggery coconut pudding' },
  { id: 'I17', shopId: 'SHOP_6', name: 'Chocolate Mousse', category: 'Dessert', price: 520, isAvailable: true, desc: 'Dark chocolate cup' },
];

const accounts = [
  { id: 'USER_1', name: 'Sahan Perera', phone: '0771234567', pin: '1234', role: 'customer', address: '45 Galle Road, Colombo 03' },
  { id: 'USER_2', name: 'Nimal Silva', phone: '0771112222', pin: '1234', role: 'customer', address: '12 Duplication Road, Colombo 04' },
  { id: 'SHOP_STAFF', name: 'Nadeesha Fernando', phone: '0772223333', pin: '1234', role: 'shop', shopId: 'ALL' },
  { id: 'RIDER_77', name: 'Kamal Perera', phone: '0775556666', pin: '1234', role: 'rider', vehicle: 'Honda Dio · WP CAB-4521', rating: 4.9 },
];

let seq = 1000;
let orders = [];
let messages = {}; // orderId -> [{id, from, role, text, ts}]
let sessions = {};
const sseClients = new Set();

function load() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const d = JSON.parse(raw);
    orders = d.orders || [];
    messages = d.messages || {};
    seq = d.seq || 1000;
    if (Array.isArray(d.items)) {
      const avail = new Map(d.items.map((i) => [i.id, i.isAvailable]));
      items = items.map((i) => ({ ...i, isAvailable: avail.has(i.id) ? avail.get(i.id) : i.isAvailable }));
    }
  } catch (_) {}
}

function save() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(
        { orders, messages, seq, items: items.map((i) => ({ id: i.id, isAvailable: i.isAvailable })) },
        null,
        2,
      ),
    );
  } catch (err) {
    console.error('save failed', err.message);
  }
}

load();

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
  if (body.status === 'on_the_way' && (order.riderLat == null || order.riderLng == null)) {
    const shop = shopById(order.shopId);
    order.riderLat = shop ? shop.lat : 6.93;
    order.riderLng = shop ? shop.lng : 79.855;
    order.riderId = order.riderId || 'RIDER_77';
    order.riderName = order.riderName || 'Kamal Perera';
    order.riderPhone = order.riderPhone || '0775556666';
  }
  if (body.status === 'delivered') order.deliveredAt = new Date().toISOString();
  order.updatedAt = new Date().toISOString();
  return order;
}

function publicUser(u) {
  const { pin, ...rest } = u;
  return rest;
}

async function handleApi(req, res, url) {
  const { pathname } = url;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors(res));
    res.end();
    return;
  }

  if (pathname === '/api/health') {
    json(res, 200, { ok: true, orders: orders.length, clients: sseClients.size });
    return;
  }

  if (pathname === '/api/login' && req.method === 'POST') {
    const body = await readBody(req);
    const role = body.role || 'customer';
    const pin = String(body.pin || '1234');
    let user = accounts.find((a) => a.role === role && a.pin === pin && (!body.phone || a.phone === body.phone));
    if (!user) user = accounts.find((a) => a.role === role && a.pin === pin);
    if (!user) {
      json(res, 401, { error: 'Invalid login. Demo PIN is 1234.' });
      return;
    }
    const tok = token();
    sessions[tok] = user.id;
    json(res, 200, { token: tok, user: publicUser(user) });
    return;
  }

  if (pathname === '/api/accounts' && req.method === 'GET') {
    json(res, 200, accounts.map(publicUser));
    return;
  }

  if (pathname === '/api/shops' && req.method === 'GET') {
    json(res, 200, shops);
    return;
  }

  if (pathname === '/api/items' && req.method === 'GET') {
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
    save();
    broadcast();
    json(res, 200, item);
    return;
  }

  if (pathname === '/api/orders' && req.method === 'GET') {
    json(res, 200, orders);
    return;
  }

  if (pathname === '/api/state' && req.method === 'GET') {
    json(res, 200, { orders, shops, items, messages });
    return;
  }

  if (pathname === '/api/reset' && req.method === 'POST') {
    orders = [];
    messages = {};
    seq = 1000;
    items = items.map((i) => ({ ...i, isAvailable: true }));
    save();
    broadcast();
    json(res, 200, { ok: true });
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
    const deliveryFee = subtotal > 2000 ? 0 : 250;
    const order = {
      id: `ORD_${++seq}`,
      userId: body.userId || 'USER_1',
      shopId: shop.id,
      shopName: shop.name,
      shopEmoji: shop.emoji,
      customerName: body.customerName || 'Sahan Perera',
      customerPhone: body.customerPhone || '0771234567',
      address: body.address || '45 Galle Road, Colombo 03',
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
      deliveryLat: Number(body.deliveryLat ?? 6.9271),
      deliveryLng: Number(body.deliveryLng ?? 79.8612),
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
    save();
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
    const list = messages[order.id] || (messages[order.id] = []);
    const msg = {
      id: 'm' + Date.now(),
      from: body.from || 'User',
      role: body.role || 'customer',
      text: String(body.text || '').slice(0, 500),
      ts: Date.now(),
    };
    if (!msg.text) {
      json(res, 400, { error: 'Empty message' });
      return;
    }
    list.push(msg);
    save();
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
    save();
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
  if (p === '/') p = '/index.html';
  if (p === '/user' || p === '/user/') p = '/user.html';
  if (p === '/shop' || p === '/shop/') p = '/shop.html';
  if (p === '/rider' || p === '/rider/') p = '/rider.html';
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

server.listen(PORT, HOST, () => {
  console.log(`SwiftDrop server listening on http://${HOST}:${PORT}`);
});
