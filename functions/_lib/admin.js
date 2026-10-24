/**
 * QuickBite admin — pure helpers (Cloudflare Workers + Node 18).
 * No secrets. No schema changes. Finance actions never claim a bank payout.
 */

const enc = new TextEncoder();

export const ADMIN_ROLES = ['super', 'finance', 'support', 'operations'];

export const PERMS = {
  dashboard: ['super', 'finance', 'support', 'operations'],
  users: ['super', 'operations'],
  usersRead: ['super', 'operations', 'finance', 'support'],
  shops: ['super', 'operations'],
  shopsRead: ['super', 'operations', 'finance', 'support'],
  riders: ['super', 'operations'],
  ridersRead: ['super', 'operations', 'finance', 'support'],
  orders: ['super', 'operations'],
  ordersRead: ['super', 'operations', 'finance', 'support'],
  withdrawals: ['super', 'finance'],
  support: ['super', 'support'],
  analytics: ['super', 'finance'],
  reports: ['super', 'finance'],
  config: ['super'],
  staff: ['super'],
  notifications: ['super', 'finance', 'support', 'operations'],
  audit: ['super', 'finance'],
};

export const STATE_KEYS = {
  config: 'qb_admin_config',
  accounts: 'qb_admin_accounts',
  staff: 'qb_admin_staff',
  audit: 'qb_admin_audit',
  notices: 'qb_admin_notices',
};

export const DEMO_SHOP_IDS = ['SHOP_1','SHOP_2','SHOP_3','SHOP_4','SHOP_5','SHOP_6','SHOP_7','SHOP_8','SHOP_9','SHOP_10','SHOP_11'];
export const DEMO_ACCOUNT_IDS = ['USER_1','USER_2','SHOP_STAFF','RIDER_77'];
export const DEMO_PHONES = ['0771234567','0771112222','0772223333','0775556666'];
export const DEMO_ORDER_IDS = ['ORD-1001','ORD-1002','ORD-1003','ORD-1004','ORD-NONE'];

const ASK_STATUSES = ['new', 'open', 'in_progress', 'waiting', 'resolved', 'closed'];

export function can(role, perm) {
  const list = PERMS[perm];
  if (!list) return false;
  return list.indexOf(String(role || '')) >= 0;
}

export function json(status, body, extra) {
  const headers = Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  }, extra || {});
  return new Response(JSON.stringify(body), { status: status, headers: headers });
}

export function optionsResponse(extra) {
  return new Response(null, {
    status: 204,
    headers: Object.assign({
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Idempotency-Key',
      'Access-Control-Allow-Credentials': 'true',
      'Cache-Control': 'no-store',
    }, extra || {}),
  });
}

export function allowOrigin(request) {
  const o = String((request && request.headers && request.headers.get('Origin')) || '');
  if (!o) return '';
  try {
    const u = new URL(o);
    const h = u.hostname;
    if (h === 'localhost' || h === '127.0.0.1') return o;
    if (h === 'quickbite-2ao.pages.dev' || h.endsWith('.quickbite-2ao.pages.dev')) return o;
    if (/\.e2b\.app$/i.test(h) || /\.arena\.dev$/i.test(h)) return o;
  } catch (_) {}
  return '';
}

export function corsHeaders(request) {
  const origin = allowOrigin(request);
  const h = {
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Idempotency-Key',
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin',
  };
  if (origin) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

export function b64url(buf) {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  const b64 = (typeof btoa === 'function')
    ? btoa(s)
    : Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function fromB64url(str) {
  const pad = str.length % 4 === 2 ? '==' : str.length % 4 === 3 ? '=' : '';
  const b64 = String(str).replace(/-/g, '+').replace(/_/g, '/') + pad;
  if (typeof atob === 'function') {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

export function safeEq(a, b) {
  const x = String(a || '');
  const y = String(b || '');
  const n = Math.max(x.length, y.length);
  let d = x.length ^ y.length;
  for (let i = 0; i < n; i++) d |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return d === 0;
}

export async function sha256b64(text) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(String(text || '')));
  return b64url(buf);
}

export async function hashPassword(password, salt) {
  return sha256b64(String(salt || '') + ':' + String(password || ''));
}

export async function hmacSign(secret, msg) {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(String(secret || '')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(String(msg || '')));
  return b64url(sig);
}

function procEnv(name) {
  try {
    if (typeof process !== 'undefined' && process.env && process.env[name]) return process.env[name];
  } catch (_) {}
  return '';
}

/** Read a Cloudflare Pages var/secret: trim, strip wrapping quotes, try aliases. */
export function envVal(env, names) {
  const list = Array.isArray(names) ? names : [names];
  for (let i = 0; i < list.length; i++) {
    const key = list[i];
    let v = '';
    if (env && env[key] != null) v = env[key];
    if (!v) v = procEnv(key);
    v = String(v == null ? '' : v).trim().replace(/^["']+|["']+$/g, '');
    if (v) return v;
  }
  return '';
}

export function sessionSecret(env) {
  const s = envVal(env, ['ADMIN_SESSION_SECRET', 'ADMIN_PASSWORD', 'ADMIN_PASS']) || 'quickbite-admin';
  return s;
}

export function bootstrapAdmin(env) {
  const email = envVal(env, ['ADMIN_EMAIL', 'ADMIN_USER']).toLowerCase();
  const password = envVal(env, ['ADMIN_PASSWORD', 'ADMIN_PASS', 'ADMIN_SECRET']);
  if (!email || !email.includes('@') || password.length < 8) return null;
  return { email: email, password: password, name: 'Admin', role: 'super' };
}

export function adminConfigHint(env) {
  const email = envVal(env, ['ADMIN_EMAIL', 'ADMIN_USER']).toLowerCase();
  const password = envVal(env, ['ADMIN_PASSWORD', 'ADMIN_PASS', 'ADMIN_SECRET']);
  if (!email || !email.includes('@')) return 'missing_email';
  if (!password) return 'missing_password';
  if (password.length < 8) return 'password_short';
  return 'ok';
}

export async function signSession(env, actor) {
  const payload = {
    email: String(actor.email || '').toLowerCase(),
    role: ADMIN_ROLES.indexOf(actor.role) >= 0 ? actor.role : 'operations',
    name: String(actor.name || 'Admin').slice(0, 80),
    iat: Date.now(),
    exp: Date.now() + 12 * 60 * 60 * 1000,
  };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await hmacSign(sessionSecret(env), body);
  return body + '.' + sig;
}

export async function verifySession(env, token) {
  const raw = String(token || '');
  const i = raw.lastIndexOf('.');
  if (i < 8) return null;
  const body = raw.slice(0, i);
  const sig = raw.slice(i + 1);
  const expect = await hmacSign(sessionSecret(env), body);
  if (!safeEq(sig, expect)) return null;
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(fromB64url(body)));
  } catch (_) {
    return null;
  }
  if (!payload || payload.exp < Date.now()) return null;
  if (!payload.email || ADMIN_ROLES.indexOf(payload.role) < 0) return null;
  return payload;
}

export function cookieHeader(token, request, clear) {
  const url = request && request.url ? new URL(request.url) : null;
  const secure = !url || url.protocol === 'https:';
  const parts = [
    'qb_admin=' + (clear ? '' : encodeURIComponent(token || '')),
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    clear ? 'Max-Age=0' : 'Max-Age=43200',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function readCookie(request, name) {
  const raw = String((request && request.headers && request.headers.get('Cookie')) || '');
  const want = String(name || 'qb_admin') + '=';
  const parts = raw.split(';');
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].trim();
    if (p.indexOf(want) === 0) {
      try { return decodeURIComponent(p.slice(want.length)); } catch (_) { return p.slice(want.length); }
    }
  }
  return '';
}

export function readSessionToken(request) {
  const auth = String((request && request.headers && request.headers.get('Authorization')) || '');
  if (/^bearer\s+/i.test(auth)) return auth.replace(/^bearer\s+/i, '').trim();
  const x = String((request && request.headers && request.headers.get('X-Admin-Token')) || '').trim();
  if (x) return x;
  return readCookie(request, 'qb_admin');
}

export function phoneDigits(raw) {
  return String(raw || '').replace(/\D/g, '');
}

export function phoneKey(raw) {
  const d = phoneDigits(raw);
  return d.length >= 9 ? d.slice(-9) : d;
}

export function roleTag(role) {
  if (role === 'shop') return 'shop';
  if (role === 'rider') return 'rider';
  return 'customer';
}

export function accountIdFor(phone, role) {
  return 'ACC_' + roleTag(role) + '_' + phoneKey(phone);
}

export function shopIdFor(phone) {
  return 'SHOP_' + phoneKey(phone);
}

export function isDemoAccount(a) {
  if (!a) return true;
  if (DEMO_ACCOUNT_IDS.indexOf(String(a.id || '')) >= 0) return true;
  return DEMO_PHONES.indexOf(phoneDigits(a.phone || '').replace(/^94/, '0')) >= 0;
}

export function isDemoShop(id) {
  return DEMO_SHOP_IDS.indexOf(String(id || '')) >= 0;
}

export function isDemoOrder(o) {
  const id = String((o && o.id) || '');
  if (DEMO_ORDER_IDS.indexOf(id) >= 0) return true;
  if (isDemoShop(o && (o.shopId || o.shop_id))) return true;
  return false;
}

export function maskPhone(p) {
  const d = phoneDigits(p);
  if (d.length < 7) return p ? '••••' : '';
  return d.slice(0, 3) + '••••' + d.slice(-2);
}

export function maskEmail(e) {
  const s = String(e || '');
  const i = s.indexOf('@');
  if (i < 1) return s ? '••••' : '';
  return s.slice(0, 1) + '•••' + s.slice(i);
}

export function maskBank(no) {
  const d = String(no || '').replace(/\s+/g, '');
  if (!d) return '';
  if (d.length <= 4) return '••••';
  return '••••' + d.slice(-4);
}

export function parseOrder(row) {
  if (!row) return null;
  let d = row.data;
  if (typeof d === 'string') {
    try { d = JSON.parse(d); } catch (_) { d = null; }
  }
  if (!d || typeof d !== 'object') d = {};
  const o = Object.assign({}, d);
  o.id = d.id || row.id;
  o.userId = d.userId || row.user_id || '';
  o.shopId = d.shopId || row.shop_id || '';
  o.shopName = d.shopName || row.shop_name || '';
  o.customerName = d.customerName || row.customer_name || '';
  o.customerPhone = d.customerPhone || row.customer_phone || '';
  o.customerEmail = String(d.customerEmail || d.email || '').trim().toLowerCase();
  o.address = d.address || row.address || '';
  o.status = d.status || row.status || 'pending';
  o.items = Array.isArray(d.items) ? d.items : [];
  o.totalAmount = Number(d.totalAmount != null ? d.totalAmount : row.total_amount) || 0;
  o.deliveryFee = Number(d.deliveryFee) || 0;
  o.subtotal = Number(d.subtotal) || Math.max(0, o.totalAmount - o.deliveryFee);
  o.paymentMethod = d.paymentMethod || '';
  o.paid = !!d.paid;
  o.paymentStatus = d.paymentStatus || (o.paid ? 'captured' : '');
  o.paymentId = d.paymentId || '';
  o.paidAt = d.paidAt || '';
  o.refundedAt = d.refundedAt || '';
  o.riderId = d.riderId || '';
  o.riderName = d.riderName || '';
  o.riderPhone = d.riderPhone || '';
  o.riderLat = d.riderLat;
  o.riderLng = d.riderLng;
  o.shopLat = d.shopLat;
  o.shopLng = d.shopLng;
  o.deliveryLat = d.deliveryLat;
  o.deliveryLng = d.deliveryLng;
  o.shopAddress = d.shopAddress || '';
  o.updatedAt = d.updatedAt || row.updated_at || '';
  o.createdAt = d.createdAt || d.placedAt || o.updatedAt;
  o.deliveredAt = d.deliveredAt || '';
  o.cancelledAt = d.cancelledAt || '';
  o.cancelReason = d.cancelReason || '';
  o.ratings = d.ratings || null;
  return o;
}

export function isCardMethod(m) {
  const s = String(m || '').toLowerCase();
  if (!s) return false;
  if (s.indexOf('cash') !== -1) return false;
  return /visa|master|amex|unionpay|jcb|card|••••/.test(s);
}

export function shopCreditOf(o) {
  if (!o || o.status === 'cancelled' || o.paymentStatus === 'refunded') return 0;
  if (!o.paid && !isCardMethod(o.paymentMethod)) return 0;
  if (o.shopCredit != null && o.shopCredit !== '') return Math.max(0, Number(o.shopCredit) || 0);
  return Math.max(0, (Number(o.totalAmount) || 0) - (Number(o.deliveryFee) || 0));
}

export function riderCreditOf(o) {
  if (!o || o.status === 'cancelled' || o.paymentStatus === 'refunded') return 0;
  if (o.riderCredit != null && o.riderCredit !== '') return Math.max(0, Number(o.riderCredit) || 0);
  return Math.max(0, Number(o.deliveryFee) || 0);
}

export function emptyWallet() {
  return { bank: { bankName: '', accountName: '', accountNo: '', branch: '' }, requests: [] };
}

export function normalizeWallet(raw) {
  const w = emptyWallet();
  let p = raw;
  if (typeof p === 'string') {
    try { p = JSON.parse(p); } catch (_) { p = null; }
  }
  if (!p || typeof p !== 'object') return w;
  const b = p.bank || {};
  w.bank.bankName = String(b.bankName || b.name || '').trim();
  w.bank.accountName = String(b.accountName || b.holder || '').trim();
  w.bank.accountNo = String(b.accountNo || b.number || '').replace(/\s+/g, '');
  w.bank.branch = String(b.branch || '').trim();
  w.requests = (Array.isArray(p.requests) ? p.requests : []).map(function (r) {
    if (!r) return null;
    const amount = Math.max(0, Math.round(Number(r.amount) || 0));
    if (!amount) return null;
    const st = String(r.status || 'pending');
    const status = st === 'transferred' ? 'transferred'
      : (st === 'rejected' || st === 'cancelled' ? st : 'pending');
    return {
      id: String(r.id || ('WD-' + Date.now().toString(36))),
      amount: amount,
      ts: Number(r.ts) || Date.now(),
      status: status,
      transferredAt: Number(r.transferredAt) || 0,
      rejectedAt: Number(r.rejectedAt) || 0,
      bankName: String(r.bankName || '').trim(),
      accountNo: String(r.accountNo || '').trim(),
      paymentRef: String(r.paymentRef || '').trim(),
      reason: String(r.reason || '').trim(),
      decidedBy: String(r.decidedBy || '').trim(),
      idempotencyKey: String(r.idempotencyKey || '').trim(),
      note: String(r.note || ''),
    };
  }).filter(Boolean);
  return w;
}

export function walletHeld(wallet) {
  return (wallet && wallet.requests || []).reduce(function (n, r) {
    if (!r || r.status === 'cancelled' || r.status === 'rejected') return n;
    return n + Math.max(0, Number(r.amount) || 0);
  }, 0);
}

/**
 * Approve marks the in-app request transferred. It does NOT move money at a bank.
 * Reject releases the hold. Duplicate idempotency keys replay; other re-decides throw.
 */
export function applyWithdrawDecision(wallet, requestId, decision, opts) {
  opts = opts || {};
  const w = normalizeWallet(wallet);
  const req = w.requests.find((r) => r && r.id === String(requestId));
  if (!req) {
    const err = new Error('Withdrawal request not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const decided = req.status === 'transferred' || req.status === 'rejected' || req.status === 'cancelled';
  if (decided) {
    if (opts.idempotencyKey && req.idempotencyKey && safeEq(req.idempotencyKey, opts.idempotencyKey)) {
      return { wallet: w, request: req, replay: true };
    }
    const err = new Error('This withdrawal was already decided.');
    err.code = 'ALREADY';
    throw err;
  }
  const act = String(decision || '');
  if (act !== 'approve' && act !== 'reject') {
    const err = new Error('Decision must be approve or reject.');
    err.code = 'BAD_DECISION';
    throw err;
  }
  req.decidedBy = String(opts.actor || '');
  req.reason = String(opts.reason || '').slice(0, 240);
  req.idempotencyKey = String(opts.idempotencyKey || '');
  req.paymentRef = String(opts.paymentRef || '').slice(0, 80);
  if (act === 'approve') {
    req.status = 'transferred';
    req.transferredAt = Number(opts.now) || Date.now();
    req.note = 'In-app wallet marked transferred. Bank payout is manual and is not confirmed by this action.';
  } else {
    req.status = 'rejected';
    req.rejectedAt = Number(opts.now) || Date.now();
    req.note = 'Request rejected. Held amount released in-app.';
  }
  return { wallet: w, request: req, replay: false };
}

export function defaultConfig() {
  return {
    commissionPct: 0,
    deliveryFeeDefault: 200,
    featuredShopIds: [],
    coupons: [],
    zones: [],
    maintenance: false,
    templates: {
      verify: 'Your QuickBite account is under review.',
      withdraw: 'A withdrawal was updated in your in-app wallet.',
    },
    brand: { name: 'QuickBite', supportEmail: '' },
  };
}

export function normalizeConfig(raw) {
  const c = defaultConfig();
  let p = raw;
  if (typeof p === 'string') {
    try { p = JSON.parse(p); } catch (_) { p = null; }
  }
  if (!p || typeof p !== 'object') return c;
  const pct = Number(p.commissionPct);
  c.commissionPct = Number.isFinite(pct) ? Math.max(0, Math.min(40, pct)) : 0;
  c.deliveryFeeDefault = Math.max(0, Math.round(Number(p.deliveryFeeDefault) || 200));
  c.featuredShopIds = Array.isArray(p.featuredShopIds) ? p.featuredShopIds.map(String).slice(0, 50) : [];
  c.maintenance = p.maintenance === true;
  c.brand = Object.assign({}, c.brand, p.brand || {});
  c.templates = Object.assign({}, c.templates, p.templates || {});
  c.zones = Array.isArray(p.zones) ? p.zones.slice(0, 40) : [];
  c.coupons = (Array.isArray(p.coupons) ? p.coupons : []).map(function (x) {
    if (!x) return null;
    const code = String(x.code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!code) return null;
    return {
      code: code,
      pct: Math.max(1, Math.min(90, Math.round(Number(x.pct) || 0))),
      limit: Math.max(0, Math.round(Number(x.limit) || 0)),
      used: Math.max(0, Math.round(Number(x.used) || 0)),
      from: String(x.from || ''),
      to: String(x.to || ''),
      active: x.active !== false,
    };
  }).filter(Boolean);
  return c;
}

export function colomboParts(ts) {
  const d = new Date(ts || Date.now());
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Colombo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = {};
  fmt.formatToParts(d).forEach((p) => { parts[p.type] = p.value; });
  return parts;
}

export function dayKeyColombo(ts) {
  const p = colomboParts(ts);
  return p.year + '-' + p.month + '-' + p.day;
}

export function inRange(ts, from, to) {
  const n = new Date(ts || 0).getTime();
  if (!Number.isFinite(n) || n <= 0) return false;
  if (from && n < from) return false;
  if (to && n > to) return false;
  return true;
}

export function metricsFrom(orders, accounts, shops, range, config) {
  const from = range && range.from;
  const to = range && range.to;
  const list = (orders || []).filter((o) => o && !isDemoOrder(o) && inRange(o.createdAt || o.updatedAt, from, to));
  const byDay = {};
  let gmv = 0;
  let refunds = 0;
  let shopPay = 0;
  let riderPay = 0;
  let delivered = 0;
  let cancelled = 0;
  let pending = 0;
  const cat = {};
  const shopCount = {};
  list.forEach((o) => {
    const key = dayKeyColombo(o.createdAt || o.updatedAt);
    if (!byDay[key]) byDay[key] = { completed: 0, pending: 0, cancelled: 0, gmv: 0 };
    const st = String(o.status || '');
    if (st === 'delivered') { byDay[key].completed += 1; delivered += 1; }
    else if (st === 'cancelled') { byDay[key].cancelled += 1; cancelled += 1; }
    else { byDay[key].pending += 1; pending += 1; }
    const amt = Number(o.totalAmount) || 0;
    if (st !== 'cancelled') {
      gmv += amt;
      byDay[key].gmv += amt;
      shopPay += shopCreditOf(o);
      riderPay += riderCreditOf(o);
    }
    if (o.paymentStatus === 'refunded') refunds += amt;
    const sid = o.shopId || '';
    if (sid) shopCount[sid] = (shopCount[sid] || 0) + 1;
  });
  (shops || []).forEach((s) => {
    const name = String((s && s.category) || 'Other') || 'Other';
    cat[name] = (cat[name] || 0) + 1;
  });
  const pct = (config && Number(config.commissionPct)) || 0;
  const commission = Math.round(gmv * (pct / 100));
  const users = (accounts || []).filter((a) => a && roleTag(a.role) === 'customer' && !isDemoAccount(a));
  const shopAcc = (accounts || []).filter((a) => a && a.role === 'shop' && !isDemoAccount(a));
  const riders = (accounts || []).filter((a) => a && a.role === 'rider' && !isDemoAccount(a));
  const liveShops = (shops || []).filter((s) => s && !isDemoShop(s.id));
  return {
    totals: {
      users: users.length,
      shops: liveShops.length,
      shopAccounts: shopAcc.length,
      riders: riders.length,
      orders: list.length,
      gmv: Math.round(gmv),
      refunds: Math.round(refunds),
      shopPay: Math.round(shopPay),
      riderPay: Math.round(riderPay),
      commission: commission,
      net: Math.round(commission),
      delivered: delivered,
      cancelled: cancelled,
      pending: pending,
    },
    byDay: byDay,
    categories: cat,
    topShops: Object.keys(shopCount).sort((a, b) => shopCount[b] - shopCount[a]).slice(0, 8).map((id) => {
      const s = (shops || []).find((x) => x && x.id === id) || {};
      return { id: id, name: s.name || id, orders: shopCount[id], rating: Number(s.rating) || 0 };
    }),
    commissionNote: pct
      ? ('Platform commission is ' + pct + '% of GMV in this range. It is a configured estimate and is not auto-deducted from shop or rider wallets.')
      : 'Platform commission rate is 0%. Set it in Settings → Payment. Wallets are not auto-debited.',
    payoutNote: 'Approve on Withdrawals marks the in-app request transferred. It does not send money to a bank.',
  };
}

export function parseRiderDocs(address) {
  const addr = String(address || '');
  const mark = 'QBDOCS:';
  const out = {
    plate: '', vehicleType: '', registered: false,
    nicKyc: '', licenseKyc: '', livenessKyc: '',
    kycSession: '', avatar: '',
  };
  if (addr.indexOf(mark) !== 0) return out;
  try {
    const j = JSON.parse(addr.slice(mark.length));
    out.plate = String(j.plate || '');
    out.vehicleType = String(j.vehicleType || '');
    out.registered = j.registered === true || j.registered === '1';
    out.nicKyc = String(j.nicKyc || '').toLowerCase();
    out.licenseKyc = String(j.licenseKyc || '').toLowerCase();
    out.livenessKyc = String(j.livenessKyc || '').toLowerCase();
    out.kycSession = String(j.kycSession || '');
    out.avatar = /^https?:\/\//i.test(String(j.avatar || '')) ? String(j.avatar) : '';
  } catch (_) {}
  return out;
}

export function riderVerified(docs) {
  const d = docs || {};
  return d.nicKyc === 'approved' && d.licenseKyc === 'approved' && d.livenessKyc === 'approved' && !!d.registered;
}

export function normalizeSupport(raw, id) {
  let p = raw;
  if (typeof p === 'string') {
    try { p = JSON.parse(p); } catch (_) { p = null; }
  }
  const s = {
    id: String(id || ''),
    mode: 'ai',
    ticket: '',
    status: 'open',
    priority: 'normal',
    assignee: '',
    subject: '',
    internal: [],
    messages: [],
    escalatedAt: 0,
    reason: '',
    queuedNote: false,
    awaitingRating: false,
    rating: 0,
    ratings: [],
    sessions: [],
    agentClosedAt: 0,
    closeReason: '',
    ratedAt: 0,
    chatGen: 0,
  };
  if (!p || typeof p !== 'object') return s;
  s.mode = p.mode === 'agent' ? 'agent' : 'ai';
  s.ticket = String(p.ticket || '').trim();
  s.status = ASK_STATUSES.indexOf(p.status) >= 0 ? p.status : (s.mode === 'agent' ? 'in_progress' : 'open');
  s.priority = String(p.priority || 'normal');
  s.assignee = String(p.assignee || '');
  s.subject = String(p.subject || '');
  s.escalatedAt = Number(p.escalatedAt) || 0;
  s.reason = String(p.reason || '');
  s.queuedNote = !!p.queuedNote;
  s.awaitingRating = p.awaitingRating === true;
  s.rating = Math.max(0, Math.min(5, Math.round(Number(p.rating) || 0)));
  s.agentClosedAt = Number(p.agentClosedAt) || 0;
  s.closeReason = String(p.closeReason || '');
  s.ratedAt = Number(p.ratedAt) || 0;
  s.chatGen = Math.max(0, Math.round(Number(p.chatGen) || 0));
  s.ratings = Array.isArray(p.ratings) ? p.ratings : [];
  s.sessions = Array.isArray(p.sessions) ? p.sessions : [];
  s.internal = Array.isArray(p.internal) ? p.internal : [];
  s.messages = (Array.isArray(p.messages) ? p.messages : []).map(function (m) {
    if (!m) return null;
    const text = String(m.text || m.content || '').trim();
    if (!text) return null;
    const role = m.role === 'assistant' || m.role === 'agent' || m.role === 'system' ? m.role : 'user';
    return { role: role, text: text, ts: Number(m.ts) || Date.now(), internal: !!m.internal, gen: Math.max(0, Math.round(Number(m.gen) || 0)) };
  }).filter(Boolean);
  if (!s.subject) {
    const first = s.messages.find((m) => m.role === 'user');
    s.subject = first ? String(first.text).slice(0, 80) : (s.ticket || 'Support');
  }
  return s;
}

export const AGENT_IDLE_MS = 3 * 60 * 1000;

function lastMsgTs(messages, roles) {
  let t = 0;
  (messages || []).forEach((m) => {
    if (!m) return;
    if (roles && roles.indexOf(m.role) < 0) return;
    t = Math.max(t, Number(m.ts) || 0);
  });
  return t;
}

/** Close if the user has not replied after the last agent/system activity for 3 minutes. */
export function shouldIdleClose(thread, now) {
  if (!thread || thread.mode !== 'agent') return false;
  const nowMs = Number(now) || Date.now();
  const lastUser = lastMsgTs(thread.messages, ['user']);
  const lastAgent = Math.max(
    Number(thread.escalatedAt) || 0,
    lastMsgTs(thread.messages, ['agent', 'assistant', 'system'])
  );
  if (lastUser > lastAgent) return false;
  const anchor = lastAgent || Number(thread.escalatedAt) || 0;
  if (!anchor) return false;
  return (nowMs - anchor) >= AGENT_IDLE_MS;
}

export function closeAgentSession(thread, reason, now) {
  const t = thread && typeof thread === 'object' ? thread : {};
  const ts = Number(now) || Date.now();
  const why = String(reason || 'closed');
  t.mode = 'ai';
  t.status = 'closed';
  t.queuedNote = false;
  t.awaitingRating = true;
  t.agentClosedAt = ts;
  t.closeReason = why;
  t.escalatedAt = 0;
  const gen = Math.max(0, Math.round(Number(t.chatGen) || 0));
  t.sessions = (Array.isArray(t.sessions) ? t.sessions : []).concat([{
    closedAt: ts,
    reason: why,
    rating: 0,
    gen: gen,
  }]);
  t.messages = (Array.isArray(t.messages) ? t.messages : []).concat([{
    role: 'system',
    text: why === 'idle'
      ? 'The agent session closed after 3 minutes with no reply. Rate this agent, then AI Help continues.'
      : 'The agent closed this chat. Rate this agent session. AI Help continues after you rate.',
    ts: ts,
    gen: gen,
  }]);
  t.chatGen = gen + 1;
  return t;
}

export function rateAgentSession(thread, stars, now) {
  const n = Math.max(1, Math.min(5, Math.round(Number(stars) || 0)));
  if (!n) {
    const err = new Error('Pick 1 to 5 stars.');
    err.code = 'BAD_RATING';
    throw err;
  }
  const t = thread && typeof thread === 'object' ? thread : {};
  const ts = Number(now) || Date.now();
  t.awaitingRating = false;
  t.rating = n;
  t.ratedAt = ts;
  t.mode = 'ai';
  t.status = 'closed';
  const sessions = Array.isArray(t.sessions) ? t.sessions.slice() : [];
  if (sessions.length) sessions[sessions.length - 1] = Object.assign({}, sessions[sessions.length - 1], { rating: n, ratedAt: ts });
  t.sessions = sessions;
  t.ratings = (Array.isArray(t.ratings) ? t.ratings : []).concat([{ stars: n, ts: ts }]);
  t.messages = (Array.isArray(t.messages) ? t.messages : []).concat([{
    role: 'system',
    text: 'Thanks. You rated this agent ' + n + ' star' + (n === 1 ? '' : 's') + '. AI Help is ready.',
    ts: ts,
    gen: Math.max(0, Math.round(Number(t.chatGen) || 1) - 1),
  }]);
  return t;
}

export function appendAgentReply(thread, text, now) {
  const t = thread && typeof thread === 'object' ? thread : {};
  const ts = Number(now) || Date.now();
  const gen = Math.max(0, Math.round(Number(t.chatGen) || 0));
  const msg = { role: 'agent', text: String(text || '').trim(), ts: ts, internal: false, gen: gen };
  if (!msg.text) return t;
  t.messages = (Array.isArray(t.messages) ? t.messages : []).concat([msg]);
  t.mode = 'agent';
  t.awaitingRating = false;
  t.status = 'in_progress';
  t.escalatedAt = ts;
  t.chatGen = gen;
  return t;
}

export function isLiveAgentThread(thread) {
  if (!thread || thread.mode !== 'agent') return false;
  const st = String(thread.status || '');
  return st !== 'resolved' && st !== 'closed';
}

function currentLaneMessages(thread) {
  const msgs = (thread && Array.isArray(thread.messages) ? thread.messages : []).filter((m) => m && !m.internal);
  const gen = Math.max(0, Math.round(Number(thread && thread.chatGen) || 0));
  const lane = msgs.filter((m) => (Number(m.gen) || 0) === gen);
  return lane.length ? lane : msgs;
}

function laneHasAgent(thread) {
  return currentLaneMessages(thread).some((m) => m && m.role === 'agent');
}

/** Waiting is admin-only, and only after the agent has messaged the user. No agent message stays New. */
export function deriveSupportStatus(thread) {
  const t = thread || {};
  const st = String(t.status || '');
  if (st === 'closed' || st === 'resolved') return 'closed';
  if (t.mode !== 'agent') return st || 'open';
  if (!laneHasAgent(t)) return (st === 'new') ? 'new' : 'open';
  if (st === 'waiting') return 'waiting';
  return 'in_progress';
}

export function assignSupportStatus(thread, status) {
  const t = thread && typeof thread === 'object' ? thread : {};
  const st = String(status || '');
  if (st === 'waiting' && !laneHasAgent(t)) {
    t.status = 'open';
    return t;
  }
  if (st) t.status = st;
  return t;
}

export function applySupportLane(thread) {
  const t = thread && typeof thread === 'object' ? thread : {};
  if (!isLiveAgentThread(t)) return t;
  t.status = deriveSupportStatus(t);
  return t;
}

export function hadAgentSession(thread) {
  if (!thread) return false;
  if (thread.mode === 'agent') return true;
  if (Number(thread.agentClosedAt) > 0) return true;
  return Array.isArray(thread.sessions) && thread.sessions.length > 0;
}

/** Admin queue: New = no agent message; Waiting = admin set it after messaging; In Progress = agent has replied. */
export function filterSupportQueue(tickets, status) {
  const pool = (tickets || []).filter(hadAgentSession).map((t) => applySupportLane(Object.assign({}, t)));
  const live = pool.filter(isLiveAgentThread);
  const closed = pool.filter((t) => !isLiveAgentThread(t));
  const counts = {
    all: pool.length,
    new: live.filter((t) => t.status === 'new' || t.status === 'open').length,
    waiting: live.filter((t) => t.status === 'waiting').length,
    in_progress: live.filter((t) => t.status === 'in_progress').length,
    resolved: closed.length,
  };
  const want = String(status || 'all');
  let rows = pool;
  if (want === 'new') rows = live.filter((t) => t.status === 'new' || t.status === 'open');
  else if (want === 'waiting') rows = live.filter((t) => t.status === 'waiting');
  else if (want === 'in_progress') rows = live.filter((t) => t.status === 'in_progress');
  else if (want === 'resolved' || want === 'closed') rows = closed;
  return { rows: rows, counts: counts };
}

export function supportPublicMessages(thread) {
  return (thread.messages || []).filter((m) => !m.internal);
}

export function parseSupportKey(id) {
  const m = String(id || '').match(/^qb_support_(customer|shop|rider)_(.+)$/);
  if (!m) return { role: 'customer', accountId: '' };
  return { role: m[1], accountId: m[2] };
}

export function csvEscape(v) {
  const s = String(v == null ? '' : v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function ordersToCsv(orders) {
  const head = ['id', 'status', 'shop', 'customer', 'payment', 'paid', 'total_lkr', 'fee_lkr', 'created'];
  const lines = [head.join(',')];
  (orders || []).forEach((o) => {
    lines.push([
      csvEscape(o.id),
      csvEscape(o.status),
      csvEscape(o.shopName),
      csvEscape(o.customerName),
      csvEscape(isCardMethod(o.paymentMethod) ? 'card' : 'cod'),
      csvEscape(o.paid ? 'yes' : 'no'),
      csvEscape(Math.round(Number(o.totalAmount) || 0)),
      csvEscape(Math.round(Number(o.deliveryFee) || 0)),
      csvEscape(o.createdAt || o.updatedAt || ''),
    ].join(','));
  });
  return lines.join('\n');
}

export function paginate(list, page, size) {
  const s = Math.max(1, Math.min(100, Number(size) || 25));
  const p = Math.max(1, Number(page) || 1);
  const total = (list || []).length;
  const start = (p - 1) * s;
  return {
    page: p,
    size: s,
    total: total,
    pages: Math.max(1, Math.ceil(total / s)),
    rows: (list || []).slice(start, start + s),
  };
}

export function searchHay(obj) {
  return JSON.stringify(obj || {}).toLowerCase();
}

export function canCancelOrder(order) {
  if (!order) return { ok: false, reason: 'Order not found.' };
  if (order.status === 'cancelled') return { ok: false, reason: 'Already cancelled.' };
  if (order.status === 'delivered') return { ok: false, reason: 'Delivered orders cannot be cancelled. Financial history is kept.' };
  return { ok: true };
}

export function applyOrderCancel(order, reason, actor) {
  const gate = canCancelOrder(order);
  if (!gate.ok) {
    const err = new Error(gate.reason);
    err.code = 'FORBIDDEN';
    throw err;
  }
  const next = Object.assign({}, order);
  next.status = 'cancelled';
  next.cancelledAt = new Date().toISOString();
  next.cancelReason = String(reason || '').slice(0, 240);
  next.cancelledBy = String(actor || '');
  next.updatedAt = next.cancelledAt;
  if (next.paid && next.paymentStatus === 'captured') {
    next.paymentStatus = 'refunded';
    next.refundedAt = next.cancelledAt;
    next.refundNote = 'Marked refunded on the order record. Payments.lk refund is not automatic.';
  }
  return next;
}

export function orderRow(o) {
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

export function auditEntry(actor, action, target, detail) {
  return {
    id: 'AUD-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    ts: Date.now(),
    actor: String(actor || ''),
    action: String(action || ''),
    target: String(target || ''),
    detail: String(detail || '').slice(0, 400),
  };
}

export function pushAudit(bag, entry) {
  const b = bag && typeof bag === 'object' ? bag : { entries: [] };
  const list = Array.isArray(b.entries) ? b.entries : [];
  list.unshift(entry);
  b.entries = list.slice(0, 2000);
  return b;
}

export function accountMeta(bag, id) {
  const b = bag && typeof bag === 'object' ? bag : {};
  const m = b[id] || { status: 'active', reason: '', history: [] };
  return {
    status: ['active', 'suspended', 'restricted'].indexOf(m.status) >= 0 ? m.status : 'active',
    reason: String(m.reason || ''),
    history: Array.isArray(m.history) ? m.history : [],
  };
}

export function applyAccountStatus(bag, id, status, reason, actor) {
  const next = bag && typeof bag === 'object' ? Object.assign({}, bag) : {};
  const cur = accountMeta(next, id);
  if (['active', 'suspended', 'restricted'].indexOf(status) < 0) {
    const err = new Error('Status must be active, suspended, or restricted.');
    err.code = 'BAD_STATUS';
    throw err;
  }
  const rec = {
    ts: Date.now(),
    from: cur.status,
    to: status,
    reason: String(reason || '').slice(0, 240),
    actor: String(actor || ''),
  };
  next[id] = {
    status: status,
    reason: rec.reason,
    history: [rec].concat(cur.history || []).slice(0, 50),
  };
  return next;
}

export function requirePerm(actor, perm) {
  if (!actor || !can(actor.role, perm)) {
    const err = new Error('You do not have permission for this action.');
    err.code = 'FORBIDDEN';
    err.status = 403;
    throw err;
  }
}

export function envConfigured(env) {
  return !!bootstrapAdmin(env);
}
