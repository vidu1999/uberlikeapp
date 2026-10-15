#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC = path.join(__dirname, 'public');

const shops = [
  { id: 'SHOP_1', name: 'Kandy Bakers', category: 'Bakery', rating: 4.8, isOpen: true, lat: 6.9278, lng: 79.8502, emoji: '🎂' },
  { id: 'SHOP_2', name: 'Burger House', category: 'Fast Food', rating: 4.5, isOpen: true, lat: 6.9210, lng: 79.8601, emoji: '🍔' },
  { id: 'SHOP_3', name: 'Pizza Town', category: 'Pizza', rating: 4.6, isOpen: true, lat: 6.9340, lng: 79.8475, emoji: '🍕' },
  { id: 'SHOP_4', name: 'Coffee Lab', category: 'Beverages', rating: 4.7, isOpen: true, lat: 6.9188, lng: 79.8544, emoji: '☕' },
  { id: 'SHOP_5', name: 'Rice & Curry', category: 'Sri Lankan', rating: 4.9, isOpen: true, lat: 6.9312, lng: 79.8660, emoji: '🍛' },
];

const items = [
  { id: 'I1', shopId: 'SHOP_1', name: 'Chocolate Cake 1kg', category: 'Bakery', price: 2500, isAvailable: true },
  { id: 'I2', shopId: 'SHOP_1', name: 'Butter Cake Slice', category: 'Bakery', price: 350, isAvailable: true },
  { id: 'I3', shopId: 'SHOP_1', name: 'Fish Bun', category: 'Bakery', price: 180, isAvailable: true },
  { id: 'I4', shopId: 'SHOP_2', name: 'Chicken Burger', category: 'Fast Food', price: 1200, isAvailable: true },
  { id: 'I5', shopId: 'SHOP_2', name: 'Cheese Fries', category: 'Fast Food', price: 700, isAvailable: true },
  { id: 'I6', shopId: 'SHOP_3', name: 'Cheese Pizza', category: 'Pizza', price: 2400, isAvailable: true },
  { id: 'I7', shopId: 'SHOP_3', name: 'Devilled Chicken Pizza', category: 'Pizza', price: 2800, isAvailable: true },
  { id: 'I8', shopId: 'SHOP_4', name: 'Iced Coffee', category: 'Beverages', price: 600, isAvailable: true },
  { id: 'I9', shopId: 'SHOP_4', name: 'Cappuccino', category: 'Beverages', price: 550, isAvailable: true },
  { id: 'I10', shopId: 'SHOP_5', name: 'Chicken Rice & Curry', category: 'Sri Lankan', price: 850, isAvailable: true },
  { id: 'I11', shopId: 'SHOP_5', name: 'Kottu Roti', category: 'Sri Lankan', price: 950, isAvailable: true },
  { id: 'I12', shopId: 'SHOP_5', name: 'Hoppers (3)', category: 'Sri Lankan', price: 400, isAvailable: true },
];

let seq = 1000;
let orders = [];
const sseClients = new Set();

function shopById(id) {
  return shops.find((s) => s.id === id);
}

function makeId() {
  seq += 1;
  return `ORD_${seq}`;
}

function broadcast() {
  const payload = `data: ${JSON.stringify({ type: 'state', orders, shops, items })}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch (_) {
      sseClients.delete(res);
    }
  }
}

function json(res, code, body) {
  const data = JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  });
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
    res.writeHead(200, {
      'Content-Type': mime(file),
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(data);
  });
}

function patchOrder(order, body) {
  if (body.status) order.status = body.status;
  if (body.riderId !== undefined) order.riderId = body.riderId;
  if (body.riderName !== undefined) order.riderName = body.riderName;
  if (body.riderLat !== undefined) order.riderLat = Number(body.riderLat);
  if (body.riderLng !== undefined) order.riderLng = Number(body.riderLng);
  if (body.status === 'on_the_way' && (order.riderLat == null || order.riderLng == null)) {
    const shop = shopById(order.shopId);
    order.riderLat = shop ? shop.lat : 6.93;
    order.riderLng = shop ? shop.lng : 79.855;
    order.riderId = order.riderId || 'RIDER_77';
    order.riderName = order.riderName || 'Kamal Perera';
  }
  order.updatedAt = new Date().toISOString();
  return order;
}

async function handleApi(req, res, url) {
  const { pathname } = url;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  if (pathname === '/api/health') {
    json(res, 200, { ok: true, orders: orders.length, clients: sseClients.size });
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

  if (pathname === '/api/orders' && req.method === 'GET') {
    json(res, 200, orders);
    return;
  }

  if (pathname === '/api/state' && req.method === 'GET') {
    json(res, 200, { orders, shops, items });
    return;
  }

  if (pathname === '/api/reset' && req.method === 'POST') {
    orders = [];
    seq = 1000;
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
          name: String(it.name || 'Item'),
          qty: Number(it.qty || 1),
          price: Number(it.price || 0),
        }))
      : [{ name: 'Custom order', qty: 1, price: Number(body.totalAmount || 0) }];
    const total = lineItems.reduce((s, it) => s + it.price * it.qty, 0);
    const order = {
      id: makeId(),
      userId: body.userId || 'USER_1',
      shopId: shop.id,
      shopName: shop.name,
      customerName: body.customerName || 'Sahan Perera',
      riderId: null,
      riderName: null,
      status: 'pending',
      items: lineItems,
      totalAmount: total,
      deliveryLat: Number(body.deliveryLat ?? 6.9271),
      deliveryLng: Number(body.deliveryLng ?? 79.8612),
      riderLat: null,
      riderLng: null,
      timestamp: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    orders.unshift(order);
    broadcast();
    json(res, 201, order);
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
    patchOrder(order, body);
    broadcast();
    json(res, 200, order);
    return;
  }

  if (pathname === '/api/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(`data: ${JSON.stringify({ type: 'state', orders, shops, items })}\n\n`);
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
