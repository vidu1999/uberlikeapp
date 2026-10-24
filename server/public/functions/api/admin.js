import {
  STATE_KEYS, PERMS, can, json, optionsResponse, corsHeaders, cookieHeader, readCookie,
  bootstrapAdmin, signSession, verifySession, hashPassword, safeEq, sha256b64,
  parseOrder, isDemoAccount, isDemoShop, isDemoOrder, maskPhone, maskEmail, maskBank,
  normalizeWallet, applyWithdrawDecision, walletHeld, defaultConfig, normalizeConfig,
  metricsFrom, parseRiderDocs, riderVerified, normalizeSupport, parseSupportKey,
  supportPublicMessages, ordersToCsv, paginate, searchHay, applyOrderCancel, canCancelOrder,
  orderRow, auditEntry, pushAudit, accountMeta, applyAccountStatus, requirePerm,
  roleTag, accountIdFor, shopIdFor, phoneKey, phoneDigits, envConfigured, colomboParts,
} from '../_lib/admin.js';

function fail(status, message, extra, cors) {
  return json(status, Object.assign({ ok: false, message: message }, extra || {}), cors);
}

function sbEnv(env) {
  const url = String((env && (env.SUPABASE_URL || env.QB_SUPABASE_URL)) || '').replace(/\/$/, '');
  const key = String((env && (env.SUPABASE_KEY || env.SUPABASE_SERVICE_ROLE || env.SUPABASE_ANON_KEY)) || '').trim();
  return { url: url, key: key };
}

async function sb(env, path, method, body, extraHeaders) {
  const { url, key } = sbEnv(env);
  if (!url || !key) {
    const err = new Error('Supabase is not configured on the server.');
    err.status = 503;
    throw err;
  }
  const headers = Object.assign({
    apikey: key,
    Authorization: 'Bearer ' + key,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }, extraHeaders || {});
  const res = await fetch(url + '/rest/v1/' + path, {
    method: method || 'GET',
    headers: headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!res.ok) {
    const err = new Error('Database ' + path.split('?')[0] + ' ' + res.status);
    err.status = 502;
    err.detail = typeof data === 'string' ? data.slice(0, 160) : data;
    throw err;
  }
  return data;
}

function asRows(data) {
  return Array.isArray(data) ? data : [];
}

async function getState(env, id) {
  const rows = asRows(await sb(env, 'app_state?id=eq.' + encodeURIComponent(id) + '&select=*', 'GET'));
  let p = rows[0] && rows[0].payload;
  if (typeof p === 'string') {
    try { p = JSON.parse(p); } catch (_) { p = null; }
  }
  return p || null;
}

async function putState(env, id, payload) {
  try {
    await sb(env, 'app_state?on_conflict=id', 'POST', [{ id: id, payload: payload, updated_at: new Date().toISOString() }]);
  } catch (_) {
    await sb(env, 'app_state?id=eq.' + encodeURIComponent(id), 'PATCH', { payload: payload, updated_at: new Date().toISOString() });
  }
}

async function loadAccounts(env) {
  const rows = asRows(await sb(env, 'accounts?select=*&order=name.asc', 'GET'));
  return rows.filter((a) => a && a.id && !isDemoAccount(a));
}

async function loadShops(env) {
  const rows = asRows(await sb(env, 'shops?select=*&order=name.asc', 'GET'));
  return rows.filter((s) => s && s.id && !isDemoShop(s.id));
}

async function loadOrders(env) {
  const rows = asRows(await sb(env, 'orders?select=*&order=updated_at.desc', 'GET'));
  return rows.map(parseOrder).filter((o) => o && o.id && !isDemoOrder(o));
}

async function loadItems(env, shopId) {
  const q = shopId
    ? 'menu_items?shop_id=eq.' + encodeURIComponent(shopId) + '&select=*'
    : 'menu_items?select=*';
  return asRows(await sb(env, q, 'GET'));
}

async function loadWallets(env, accounts) {
  const rows = asRows(await sb(env, 'app_state?id=like.qb_wallet_*&select=*', 'GET'));
  const byId = {};
  rows.forEach((r) => { if (r && r.id) byId[r.id] = normalizeWallet(r.payload); });
  const out = [];
  (accounts || []).forEach((a) => {
    if (!a || (a.role !== 'shop' && a.role !== 'rider')) return;
    const key = 'qb_wallet_' + roleTag(a.role) + '_' + String(a.id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 72);
    const w = byId[key] || emptySafe();
    (w.requests || []).forEach((req) => {
      out.push({
        walletId: key,
        accountId: a.id,
        name: a.name,
        role: a.role,
        request: req,
        bank: {
          bankName: w.bank.bankName,
          accountName: w.bank.accountName,
          accountNoMasked: maskBank(w.bank.accountNo),
          branch: w.bank.branch,
        },
      });
    });
  });
  out.sort((a, b) => (b.request.ts || 0) - (a.request.ts || 0));
  return { list: out, byId: byId };
}

function emptySafe() {
  return { bank: { bankName: '', accountName: '', accountNo: '', branch: '' }, requests: [] };
}

async function loadSupport(env, accounts) {
  const rows = asRows(await sb(env, 'app_state?id=like.qb_support_*&select=*', 'GET'));
  const accMap = {};
  (accounts || []).forEach((a) => { if (a && a.id) accMap[a.id] = a; });
  return rows.map((r) => {
    const t = normalizeSupport(r.payload, r.id);
    const parsed = parseSupportKey(r.id);
    const acc = accMap[parsed.accountId] || {};
    t.role = parsed.role;
    t.accountId = parsed.accountId;
    t.userName = acc.name || parsed.accountId;
    t.userPhoneMasked = maskPhone(acc.phone);
    t.unread = t.mode === 'agent' && t.status !== 'resolved' && t.status !== 'closed';
    return t;
  }).sort((a, b) => {
    const ta = (a.messages[a.messages.length - 1] && a.messages[a.messages.length - 1].ts) || a.escalatedAt || 0;
    const tb = (b.messages[b.messages.length - 1] && b.messages[b.messages.length - 1].ts) || b.escalatedAt || 0;
    return tb - ta;
  });
}

async function staffList(env) {
  const raw = await getState(env, STATE_KEYS.staff);
  const people = (raw && Array.isArray(raw.people)) ? raw.people : [];
  return people.map((p) => ({
    id: p.id,
    email: p.email,
    name: p.name,
    role: p.role,
    active: p.active !== false,
    createdAt: p.createdAt,
  }));
}

async function findStaff(env, email) {
  const raw = await getState(env, STATE_KEYS.staff) || { people: [] };
  const people = Array.isArray(raw.people) ? raw.people : [];
  return people.find((p) => String(p.email || '').toLowerCase() === String(email || '').toLowerCase()) || null;
}

async function loginActor(env, email, password) {
  const boot = bootstrapAdmin(env);
  email = String(email || '').trim().toLowerCase();
  password = String(password || '');
  if (boot && email === boot.email && safeEq(password, boot.password)) {
    return { email: boot.email, name: boot.name, role: 'super', source: 'env' };
  }
  const staff = await findStaff(env, email);
  if (!staff || staff.active === false) return null;
  const hash = await hashPassword(password, staff.salt || staff.email);
  if (!safeEq(hash, staff.passwordHash)) return null;
  return { email: staff.email, name: staff.name || staff.email, role: staff.role || 'operations', source: 'staff' };
}

async function appendAudit(env, actor, action, target, detail) {
  try {
    const bag = (await getState(env, STATE_KEYS.audit)) || { entries: [] };
    const next = pushAudit(bag, auditEntry(actor && actor.email, action, target, detail));
    await putState(env, STATE_KEYS.audit, next);
  } catch (_) {}
}

function publicAccount(a, meta) {
  const docs = a.role === 'rider' ? parseRiderDocs(a.address) : null;
  return {
    id: a.id,
    name: a.name,
    emailMasked: maskEmail(a.email),
    phoneMasked: maskPhone(a.phone),
    email: a.email || '',
    phone: a.phone || '',
    role: roleTag(a.role),
    rawRole: a.role,
    address: a.role === 'rider' ? '' : (a.address || ''),
    shopId: a.shop_id || a.shopId || '',
    vehicle: a.vehicle && !/^https?:/i.test(String(a.vehicle)) ? a.vehicle : '',
    rating: a.rating != null ? Number(a.rating) : null,
    status: (meta && meta.status) || 'active',
    statusReason: (meta && meta.reason) || '',
    history: (meta && meta.history) || [],
    verified: a.role === 'rider' ? riderVerified(docs) : true,
    rider: docs,
  };
}

function publicShop(s) {
  return {
    id: s.id,
    name: s.name,
    category: s.category || '',
    rating: Number(s.rating) || 0,
    reviews: Number(s.reviews) || 0,
    isOpen: s.is_open !== false,
    lat: s.lat,
    lng: s.lng,
    hours: s.hours || '',
    address: s.address || '',
    image: s.image || '',
    promo: s.promo || '',
    fee: s.fee != null ? Number(s.fee) : 0,
  };
}

function publicOrder(o) {
  return {
    id: o.id,
    status: o.status,
    shopId: o.shopId,
    shopName: o.shopName,
    customerName: o.customerName,
    customerPhoneMasked: maskPhone(o.customerPhone),
    address: o.address,
    totalAmount: Math.round(Number(o.totalAmount) || 0),
    deliveryFee: Math.round(Number(o.deliveryFee) || 0),
    subtotal: Math.round(Number(o.subtotal) || 0),
    paymentMethod: isCardLabel(o),
    paid: !!o.paid,
    paymentStatus: o.paymentStatus || '',
    riderName: o.riderName || '',
    riderId: o.riderId || '',
    items: (o.items || []).map((it) => ({
      id: it.id, name: it.name, qty: it.qty, price: it.price,
    })),
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    deliveredAt: o.deliveredAt || '',
    cancelReason: o.cancelReason || '',
    refundNote: o.refundNote || '',
    ratings: o.ratings || null,
    riderLat: o.riderLat,
    riderLng: o.riderLng,
    shopLat: o.shopLat,
    shopLng: o.shopLng,
    deliveryLat: o.deliveryLat,
    deliveryLng: o.deliveryLng,
  };
}

function isCardLabel(o) {
  const s = String(o.paymentMethod || '').toLowerCase();
  if (s.indexOf('cash') !== -1) return 'cod';
  if (/visa|master|amex|card|••••/.test(s)) return 'card';
  return o.paid ? 'card' : 'cod';
}

function clockNow() {
  const p = colomboParts(Date.now());
  return {
    label: p.day + ' ' + monthName(p.month) + ' ' + p.year + '  ' + p.hour + ':' + p.minute,
    iso: new Date().toISOString(),
    tz: 'Asia/Colombo',
  };
}

function monthName(mm) {
  const n = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return n[Math.max(0, parseInt(mm, 10) - 1)] || mm;
}

async function buildNotices(env, actor, withdrawals, support, orders) {
  const stored = (await getState(env, STATE_KEYS.notices)) || { read: [] };
  const read = Array.isArray(stored.read) ? stored.read : [];
  const items = [];
  (withdrawals || []).forEach((w) => {
    if (w.request.status === 'pending') {
      items.push({
        id: 'wd-' + w.request.id,
        type: 'withdrawal',
        title: 'Withdrawal · ' + w.name,
        body: 'Rs. ' + w.request.amount + ' · ' + w.role,
        ts: w.request.ts,
        href: '#/withdrawals',
      });
    }
  });
  (support || []).forEach((t) => {
    if (t.mode === 'agent' && t.status !== 'resolved' && t.status !== 'closed') {
      items.push({
        id: 'sup-' + t.id,
        type: 'support',
        title: 'Support · ' + t.userName,
        body: t.subject,
        ts: t.escalatedAt || (t.messages[0] && t.messages[0].ts) || Date.now(),
        href: '#/support/' + encodeURIComponent(t.id),
      });
    }
  });
  (orders || []).slice(0, 40).forEach((o) => {
    if (o.status === 'cancelled') {
      items.push({
        id: 'ord-' + o.id,
        type: 'order',
        title: 'Cancelled ' + o.id,
        body: o.cancelReason || o.shopName || '',
        ts: new Date(o.updatedAt || Date.now()).getTime(),
        href: '#/orders/' + encodeURIComponent(o.id),
      });
    }
  });
  items.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return items.slice(0, 80).map((it) => Object.assign({}, it, { read: read.indexOf(it.id) >= 0 }));
}

async function dispatch(env, actor, body, request) {
  const action = String(body.action || '').trim();
  if (!action || action === 'session.me') {
    return { ok: true, actor: { email: actor.email, name: actor.name, role: actor.role }, configured: envConfigured(env), clock: clockNow() };
  }

  if (action === 'dashboard') {
    requirePerm(actor, 'dashboard');
    const range = parseRange(body);
    const [accounts, shops, orders] = await Promise.all([loadAccounts(env), loadShops(env), loadOrders(env)]);
    const metaBag = (await getState(env, STATE_KEYS.accounts)) || {};
    const config = normalizeConfig(await getState(env, STATE_KEYS.config));
    const wallets = await loadWallets(env, accounts);
    const support = await loadSupport(env, accounts);
    const metrics = metricsFrom(orders, accounts, shops, range, config);
    const notices = await buildNotices(env, actor, wallets.list, support, orders);
    const live = [];
    shops.forEach((s) => {
      if (s.lat != null && s.lng != null) live.push({ kind: 'shop', id: s.id, name: s.name, lat: Number(s.lat), lng: Number(s.lng) });
    });
    orders.forEach((o) => {
      if (o.status === 'delivered' || o.status === 'cancelled') return;
      if (o.riderLat != null && o.riderLng != null) {
        live.push({ kind: 'rider', id: o.riderId || o.id, name: o.riderName || 'Rider', lat: Number(o.riderLat), lng: Number(o.riderLng), status: o.status });
      }
      if (o.deliveryLat != null && o.deliveryLng != null) {
        live.push({ kind: 'customer', id: o.id, name: o.customerName || 'Customer', lat: Number(o.deliveryLat), lng: Number(o.deliveryLng) });
      }
    });
    return {
      ok: true,
      clock: clockNow(),
      metrics: metrics,
      recentOrders: orders.slice(0, 8).map(publicOrder),
      recentWithdrawals: wallets.list.slice(0, 8).map(publicWithdraw),
      live: live,
      notices: notices.filter((n) => !n.read).slice(0, 12),
      unread: notices.filter((n) => !n.read).length,
      permissions: Object.keys(PERMS).filter((p) => can(actor.role, p)),
      warnings: [
        'Approve on a withdrawal does not send money to a bank.',
        config.maintenance ? 'Maintenance flag is on in Settings (apps are not auto-gated).' : '',
      ].filter(Boolean),
    };
  }

  if (action === 'search') {
    const q = String(body.q || '').trim().toLowerCase();
    if (q.length < 2) return { ok: true, hits: [] };
    const [accounts, shops, orders] = await Promise.all([loadAccounts(env), loadShops(env), loadOrders(env)]);
    const hits = [];
    accounts.forEach((a) => {
      if (searchHay({ n: a.name, e: a.email, p: a.phone, i: a.id }).indexOf(q) >= 0) {
        hits.push({ type: 'user', id: a.id, title: a.name, sub: roleTag(a.role), href: '#/users/' + encodeURIComponent(a.id) });
      }
    });
    shops.forEach((s) => {
      if (searchHay({ n: s.name, c: s.category, i: s.id }).indexOf(q) >= 0) {
        hits.push({ type: 'shop', id: s.id, title: s.name, sub: s.category || 'Shop', href: '#/shops/' + encodeURIComponent(s.id) });
      }
    });
    orders.forEach((o) => {
      if (searchHay({ i: o.id, c: o.customerName, s: o.shopName }).indexOf(q) >= 0) {
        hits.push({ type: 'order', id: o.id, title: o.id, sub: o.status, href: '#/orders/' + encodeURIComponent(o.id) });
      }
    });
    return { ok: true, hits: hits.slice(0, 20) };
  }

  if (action === 'accounts.list') {
    requirePerm(actor, 'usersRead');
    const accounts = await loadAccounts(env);
    const metaBag = (await getState(env, STATE_KEYS.accounts)) || {};
    let rows = accounts.map((a) => publicAccount(a, accountMeta(metaBag, a.id)));
    const role = String(body.role || 'all');
    const status = String(body.status || 'all');
    const q = String(body.q || '').trim().toLowerCase();
    if (role === 'customer' || role === 'shop' || role === 'rider') rows = rows.filter((r) => r.role === role);
    if (status !== 'all') rows = rows.filter((r) => r.status === status);
    if (q) rows = rows.filter((r) => searchHay(r).indexOf(q) >= 0);
    const sort = String(body.sort || 'name');
    rows.sort((a, b) => String(a[sort] || a.name || '').localeCompare(String(b[sort] || b.name || '')));
    const page = paginate(rows, body.page, body.size);
    return { ok: true, counts: countRoles(accounts), ...page };
  }

  if (action === 'accounts.get') {
    requirePerm(actor, 'usersRead');
    const accounts = await loadAccounts(env);
    const a = accounts.find((x) => x.id === body.id);
    if (!a) return { ok: false, message: 'Account not found.' };
    const metaBag = (await getState(env, STATE_KEYS.accounts)) || {};
    const orders = (await loadOrders(env)).filter((o) => relatedOrder(o, a));
    const support = (await loadSupport(env, accounts)).filter((t) => t.accountId === a.id);
    return { ok: true, account: publicAccount(a, accountMeta(metaBag, a.id)), orders: orders.slice(0, 40).map(publicOrder), tickets: support };
  }

  if (action === 'accounts.patch') {
    requirePerm(actor, 'users');
    const reason = String(body.reason || '').trim();
    const status = String(body.status || '');
    if ((status === 'suspended' || status === 'restricted') && reason.length < 3) {
      return { ok: false, message: 'Record a reason.' };
    }
    const bag = (await getState(env, STATE_KEYS.accounts)) || {};
    const next = applyAccountStatus(bag, String(body.id), status, reason, actor.email);
    await putState(env, STATE_KEYS.accounts, next);
    await appendAudit(env, actor, 'account.' + status, body.id, reason);
    return { ok: true, meta: accountMeta(next, body.id) };
  }

  if (action === 'accounts.create') {
    requirePerm(actor, 'users');
    const role = roleTag(body.role);
    const name = String(body.name || '').trim();
    const phone = phoneDigits(body.phone);
    const email = String(body.email || '').trim().toLowerCase();
    if (name.length < 2) return { ok: false, message: 'Enter a name.' };
    if (phone.length < 9) return { ok: false, message: 'Enter a valid Sri Lanka mobile.' };
    const accounts = await loadAccounts(env);
    const id = accountIdFor(phone, role);
    if (accounts.some((a) => a.id === id || (roleTag(a.role) === role && phoneKey(a.phone) === phoneKey(phone)))) {
      return { ok: false, message: 'This number already has a ' + role + ' account.' };
    }
    if (email && accounts.some((a) => roleTag(a.role) === role && String(a.email || '').toLowerCase() === email)) {
      return { ok: false, message: 'This email already has a ' + role + ' account.' };
    }
    const row = {
      id: id,
      name: name,
      phone: phone.length === 9 ? '0' + phone.slice(-9) : phone,
      email: email || null,
      pin: 'admin',
      role: role === 'customer' ? 'customer' : role,
      address: String(body.address || ''),
    };
    if (role === 'shop') {
      const sid = shopIdFor(phone);
      row.shop_id = sid;
      const existingShop = asRows(await sb(env, 'shops?id=eq.' + encodeURIComponent(sid) + '&select=id', 'GET'));
      if (!existingShop.length) {
        await sb(env, 'shops', 'POST', [{
          id: sid,
          name: String(body.shopName || name).trim() || 'Shop',
          category: String(body.category || 'Grocery'),
          is_open: true,
          address: String(body.address || ''),
          fee: 200,
        }]);
      }
    }
    await sb(env, 'accounts', 'POST', [row]);
    await appendAudit(env, actor, 'account.create', id, role + ' ' + name);
    return { ok: true, id: id, note: 'Account created. They still must verify WhatsApp in their app before the dashboard opens.' };
  }

  if (action === 'shops.list') {
    requirePerm(actor, 'shopsRead');
    const shops = await loadShops(env);
    const accounts = await loadAccounts(env);
    const q = String(body.q || '').trim().toLowerCase();
    const status = String(body.status || 'all');
    const cat = String(body.category || 'all');
    let rows = shops.map((s) => {
      const owner = accounts.find((a) => a.role === 'shop' && String(a.shop_id || a.shopId || '') === s.id);
      const pub = publicShop(s);
      pub.ownerName = owner ? owner.name : '';
      pub.ownerId = owner ? owner.id : '';
      pub.listStatus = s.is_open === false ? 'closed' : 'active';
      return pub;
    });
    if (q) rows = rows.filter((r) => searchHay(r).indexOf(q) >= 0);
    if (cat !== 'all') rows = rows.filter((r) => String(r.category) === cat);
    if (status === 'active') rows = rows.filter((r) => r.listStatus === 'active');
    if (status === 'closed' || status === 'suspended') rows = rows.filter((r) => r.listStatus === 'closed');
    const page = paginate(rows, body.page, body.size);
    return {
      ok: true,
      counts: {
        all: shops.length,
        active: shops.filter((s) => s.is_open !== false).length,
        closed: shops.filter((s) => s.is_open === false).length,
      },
      ...page,
    };
  }

  if (action === 'shops.get') {
    requirePerm(actor, 'shopsRead');
    const shops = await loadShops(env);
    const s = shops.find((x) => x.id === body.id);
    if (!s) return { ok: false, message: 'Shop not found.' };
    const items = await loadItems(env, s.id);
    const orders = (await loadOrders(env)).filter((o) => o.shopId === s.id);
    const accounts = await loadAccounts(env);
    const owner = accounts.find((a) => a.role === 'shop' && String(a.shop_id || '') === s.id);
    return { ok: true, shop: publicShop(s), owner: owner ? publicAccount(owner) : null, items: items, orders: orders.slice(0, 40).map(publicOrder) };
  }

  if (action === 'shops.patch') {
    requirePerm(actor, 'shops');
    const id = String(body.id || '');
    const patch = {};
    ['name', 'category', 'hours', 'address', 'promo', 'image'].forEach((k) => {
      if (body[k] != null) patch[k] = String(body[k]);
    });
    if (body.is_open != null) patch.is_open = !!body.is_open;
    if (body.fee != null) patch.fee = Math.max(0, Number(body.fee) || 0);
    if (!id || !Object.keys(patch).length) return { ok: false, message: 'Nothing to update.' };
    await sb(env, 'shops?id=eq.' + encodeURIComponent(id), 'PATCH', patch);
    await appendAudit(env, actor, 'shop.patch', id, JSON.stringify(patch).slice(0, 200));
    return { ok: true };
  }

  if (action === 'shops.create') {
    requirePerm(actor, 'shops');
    const name = String(body.name || '').trim();
    const phone = phoneDigits(body.phone);
    const ownerName = String(body.ownerName || '').trim() || name;
    if (name.length < 2) return { ok: false, message: 'Enter the shop name.' };
    if (phone.length < 9) return { ok: false, message: 'Enter the owner WhatsApp number.' };
    const sid = shopIdFor(phone);
    const existing = asRows(await sb(env, 'shops?id=eq.' + encodeURIComponent(sid) + '&select=id', 'GET'));
    if (existing.length) return { ok: false, message: 'This number already has a shop.' };
    await sb(env, 'shops', 'POST', [{
      id: sid,
      name: name,
      category: String(body.category || 'Grocery'),
      is_open: true,
      address: String(body.address || ''),
      image: String(body.image || ''),
      fee: 200,
    }]);
    const accId = accountIdFor(phone, 'shop');
    const accs = asRows(await sb(env, 'accounts?id=eq.' + encodeURIComponent(accId) + '&select=id', 'GET'));
    if (!accs.length) {
      await sb(env, 'accounts', 'POST', [{
        id: accId,
        name: ownerName,
        phone: phone.length === 9 ? '0' + phone.slice(-9) : phone,
        email: String(body.email || '') || null,
        pin: 'admin',
        role: 'shop',
        shop_id: sid,
        address: String(body.address || ''),
      }]);
    }
    await appendAudit(env, actor, 'shop.create', sid, name);
    return { ok: true, id: sid, note: 'Shop saved. Owner must verify WhatsApp in the Shop app.' };
  }

  if (action === 'shops.menuPatch') {
    requirePerm(actor, 'shops');
    const id = String(body.itemId || '');
    if (!id) return { ok: false, message: 'Missing item.' };
    const patch = {};
    if (body.is_available != null) patch.is_available = !!body.is_available;
    if (body.price != null) patch.price = Math.max(0, Number(body.price) || 0);
    if (body.name) patch.name = String(body.name);
    await sb(env, 'menu_items?id=eq.' + encodeURIComponent(id), 'PATCH', patch);
    await appendAudit(env, actor, 'menu.patch', id, JSON.stringify(patch).slice(0, 160));
    return { ok: true };
  }

  if (action === 'riders.list' || action === 'riders.get') {
    requirePerm(actor, 'ridersRead');
    const accounts = await loadAccounts(env);
    const orders = await loadOrders(env);
    const metaBag = (await getState(env, STATE_KEYS.accounts)) || {};
    let riders = accounts.filter((a) => a.role === 'rider').map((a) => {
      const pub = publicAccount(a, accountMeta(metaBag, a.id));
      const jobs = orders.filter((o) => o.riderId === a.id || phoneKey(o.riderPhone) === phoneKey(a.phone));
      const active = jobs.find((o) => o.status !== 'delivered' && o.status !== 'cancelled');
      pub.online = !!(active && active.riderLat != null);
      pub.activeOrder = active ? active.id : '';
      pub.deliveries = jobs.filter((o) => o.status === 'delivered').length;
      pub.vehicleType = (pub.rider && pub.rider.vehicleType) || (String(a.vehicle || '').split('·')[0] || '').trim();
      return pub;
    });
    if (action === 'riders.get') {
      const r = riders.find((x) => x.id === body.id);
      if (!r) return { ok: false, message: 'Rider not found.' };
      const jobs = orders.filter((o) => o.riderId === r.id).slice(0, 40).map(publicOrder);
      return { ok: true, rider: r, orders: jobs };
    }
    const q = String(body.q || '').trim().toLowerCase();
    const status = String(body.status || 'all');
    const counts = {
      all: riders.length,
      online: riders.filter((r) => r.online).length,
      offline: riders.filter((r) => !r.online).length,
    };
    if (q) riders = riders.filter((r) => searchHay(r).indexOf(q) >= 0);
    if (status === 'online') riders = riders.filter((r) => r.online);
    if (status === 'offline') riders = riders.filter((r) => !r.online);
    const page = paginate(riders, body.page, body.size);
    return {
      ok: true,
      counts: counts,
      ...page,
    };
  }

  if (action === 'orders.list') {
    requirePerm(actor, 'ordersRead');
    let orders = await loadOrders(env);
    const status = String(body.status || 'all');
    const pay = String(body.pay || 'all');
    const q = String(body.q || '').trim().toLowerCase();
    if (status !== 'all') orders = orders.filter((o) => normStatus(o.status) === status);
    if (pay === 'card' || pay === 'cod') orders = orders.filter((o) => isCardLabel(o) === pay);
    if (q) orders = orders.filter((o) => searchHay(publicOrder(o)).indexOf(q) >= 0);
    const counts = countOrderStatus(await loadOrders(env));
    const page = paginate(orders, body.page, body.size);
    return { ok: true, counts: counts, ...Object.assign({}, page, { rows: page.rows.map(publicOrder) }) };
  }

  if (action === 'orders.get') {
    requirePerm(actor, 'ordersRead');
    const orders = await loadOrders(env);
    const o = orders.find((x) => x.id === body.id);
    if (!o) return { ok: false, message: 'Order not found.' };
    let msgs = [];
    try {
      msgs = asRows(await sb(env, 'messages?order_id=eq.' + encodeURIComponent(o.id) + '&select=*&order=ts.asc', 'GET'));
    } catch (_) {}
    return { ok: true, order: publicOrder(o), messages: msgs.map((m) => ({ id: m.id, from: m.sender, role: m.role, text: m.body, ts: m.ts })), canCancel: canCancelOrder(o).ok };
  }

  if (action === 'orders.cancel') {
    requirePerm(actor, 'orders');
    const reason = String(body.reason || '').trim();
    if (reason.length < 3) return { ok: false, message: 'Record a cancellation reason.' };
    const rows = asRows(await sb(env, 'orders?id=eq.' + encodeURIComponent(body.id) + '&select=*', 'GET'));
    if (!rows[0]) return { ok: false, message: 'Order not found.' };
    const cur = parseOrder(rows[0]);
    const next = applyOrderCancel(cur, reason, actor.email);
    await sb(env, 'orders?id=eq.' + encodeURIComponent(cur.id), 'PATCH', orderRow(next));
    await appendAudit(env, actor, 'order.cancel', cur.id, reason);
    return { ok: true, order: publicOrder(next), note: next.refundNote || 'Order cancelled.' };
  }

  if (action === 'withdrawals.list') {
    requirePerm(actor, 'withdrawals');
    const accounts = await loadAccounts(env);
    const wallets = await loadWallets(env, accounts);
    let list = wallets.list;
    const status = String(body.status || 'all');
    const role = String(body.role || 'all');
    const q = String(body.q || '').trim().toLowerCase();
    if (status !== 'all') list = list.filter((w) => mapWdStatus(w.request.status) === status);
    if (role === 'shop' || role === 'rider') list = list.filter((w) => w.role === role);
    if (q) list = list.filter((w) => searchHay(w).indexOf(q) >= 0);
    const counts = {
      all: wallets.list.length,
      pending: wallets.list.filter((w) => w.request.status === 'pending').length,
      approved: wallets.list.filter((w) => w.request.status === 'transferred').length,
      rejected: wallets.list.filter((w) => w.request.status === 'rejected').length,
    };
    const page = paginate(list, body.page, body.size);
    return {
      ok: true,
      counts: counts,
      warning: 'Approve marks the in-app wallet transferred. It does not pay a bank. Record a payment reference if you already paid outside QuickBite.',
      ...Object.assign({}, page, { rows: page.rows.map(publicWithdraw) }),
    };
  }

  if (action === 'withdrawals.decide') {
    requirePerm(actor, 'withdrawals');
    const walletId = String(body.walletId || '');
    const requestId = String(body.requestId || '');
    const decision = String(body.decision || '');
    if ((decision === 'reject' || decision === 'approve') && String(body.reason || '').trim().length < 3) {
      return { ok: false, message: 'Record a reason.' };
    }
    const raw = await getState(env, walletId);
    if (!raw) return { ok: false, message: 'Wallet not found.' };
    const idem = String(body.idempotencyKey || request.headers.get('Idempotency-Key') || '');
    let result;
    try {
      result = applyWithdrawDecision(raw, requestId, decision, {
        actor: actor.email,
        reason: body.reason,
        paymentRef: body.paymentRef,
        idempotencyKey: idem,
      });
    } catch (e) {
      return { ok: false, message: e.message, code: e.code };
    }
    await putState(env, walletId, result.wallet);
    await appendAudit(env, actor, 'withdraw.' + decision, requestId, body.reason || '');
    return {
      ok: true,
      replay: !!result.replay,
      request: result.request,
      note: result.request.note,
    };
  }

  if (action === 'support.list' || action === 'support.get') {
    requirePerm(actor, 'support');
    const accounts = await loadAccounts(env);
    let tickets = await loadSupport(env, accounts);
    if (action === 'support.get') {
      const t = tickets.find((x) => x.id === body.id);
      if (!t) return { ok: false, message: 'Ticket not found.' };
      return { ok: true, ticket: t };
    }
    const status = String(body.status || 'all');
    const role = String(body.role || 'all');
    const q = String(body.q || '').trim().toLowerCase();
    if (status === 'new') tickets = tickets.filter((t) => t.status === 'new' || t.status === 'open');
    else if (status !== 'all') tickets = tickets.filter((t) => t.status === status);
    if (role !== 'all') tickets = tickets.filter((t) => t.role === role);
    if (q) tickets = tickets.filter((t) => searchHay(t).indexOf(q) >= 0);
    const counts = {
      all: tickets.length,
      new: tickets.filter((t) => t.status === 'new' || t.status === 'open').length,
      in_progress: tickets.filter((t) => t.status === 'in_progress').length,
      resolved: tickets.filter((t) => t.status === 'resolved' || t.status === 'closed').length,
    };
    const page = paginate(tickets, body.page, body.size);
    return { ok: true, counts: counts, ...page };
  }

  if (action === 'support.reply') {
    requirePerm(actor, 'support');
    const id = String(body.id || '');
    const text = String(body.text || '').trim();
    const internal = !!body.internal;
    if (!text) return { ok: false, message: 'Type a message.' };
    const raw = await getState(env, id);
    if (!raw && id.indexOf('qb_support_') !== 0) return { ok: false, message: 'Ticket not found.' };
    const t = normalizeSupport(raw, id);
    const msg = { role: internal ? 'system' : 'agent', text: text, ts: Date.now(), internal: internal };
    if (internal) t.internal = (t.internal || []).concat([{ text: text, ts: msg.ts, actor: actor.email }]);
    else t.messages = (t.messages || []).concat([msg]);
    t.mode = 'agent';
    if (t.status === 'new' || t.status === 'open') t.status = 'in_progress';
    await putState(env, id, t);
    await appendAudit(env, actor, internal ? 'support.note' : 'support.reply', id, text.slice(0, 80));
    return { ok: true, ticket: t };
  }

  if (action === 'support.patch') {
    requirePerm(actor, 'support');
    const id = String(body.id || '');
    const raw = await getState(env, id);
    const t = normalizeSupport(raw, id);
    if (body.status) t.status = String(body.status);
    if (body.priority) t.priority = String(body.priority);
    if (body.assignee != null) t.assignee = String(body.assignee);
    await putState(env, id, t);
    await appendAudit(env, actor, 'support.patch', id, t.status);
    return { ok: true, ticket: t };
  }

  if (action === 'notifications.list') {
    requirePerm(actor, 'notifications');
    const accounts = await loadAccounts(env);
    const orders = await loadOrders(env);
    const wallets = await loadWallets(env, accounts);
    const support = await loadSupport(env, accounts);
    const notices = await buildNotices(env, actor, wallets.list, support, orders);
    return { ok: true, rows: notices, integrations: { push: false, email: false, sms: false, note: 'No admin push/email/SMS provider is configured. This inbox is in-panel only.' } };
  }

  if (action === 'notifications.read') {
    requirePerm(actor, 'notifications');
    const stored = (await getState(env, STATE_KEYS.notices)) || { read: [] };
    const read = Array.isArray(stored.read) ? stored.read.slice() : [];
    const ids = Array.isArray(body.ids) ? body.ids : [body.id];
    ids.forEach((id) => { if (id && read.indexOf(id) < 0) read.push(String(id)); });
    stored.read = read.slice(-500);
    await putState(env, STATE_KEYS.notices, stored);
    return { ok: true };
  }

  if (action === 'analytics' || action === 'reports') {
    requirePerm(actor, 'analytics');
    const range = parseRange(body);
    const [accounts, shops, orders] = await Promise.all([loadAccounts(env), loadShops(env), loadOrders(env)]);
    const config = normalizeConfig(await getState(env, STATE_KEYS.config));
    return { ok: true, clock: clockNow(), metrics: metricsFrom(orders, accounts, shops, range, config) };
  }

  if (action === 'export.csv') {
    requirePerm(actor, 'reports');
    const orders = await loadOrders(env);
    const range = parseRange(body);
    const filtered = orders.filter((o) => {
      const ts = new Date(o.createdAt || o.updatedAt || 0).getTime();
      if (range.from && ts < range.from) return false;
      if (range.to && ts > range.to) return false;
      return true;
    });
    await appendAudit(env, actor, 'export.csv', 'orders', String(filtered.length));
    return { ok: true, filename: 'quickbite-orders.csv', csv: ordersToCsv(filtered) };
  }

  if (action === 'config.get') {
    requirePerm(actor, 'config');
    return { ok: true, config: normalizeConfig(await getState(env, STATE_KEYS.config)) };
  }

  if (action === 'config.set') {
    requirePerm(actor, 'config');
    const prev = normalizeConfig(await getState(env, STATE_KEYS.config));
    const incoming = body.config || body || {};
    const merged = Object.assign({}, prev);
    Object.keys(incoming).forEach((k) => {
      if (incoming[k] !== undefined && k !== 'action') merged[k] = incoming[k];
    });
    if (incoming.brand) merged.brand = Object.assign({}, prev.brand, incoming.brand);
    if (incoming.templates) merged.templates = Object.assign({}, prev.templates, incoming.templates);
    const next = normalizeConfig(merged);
    await putState(env, STATE_KEYS.config, next);
    await appendAudit(env, actor, 'config.set', 'qb_admin_config', 'commission ' + next.commissionPct);
    return {
      ok: true,
      config: next,
      note: 'Coupons, zones, and commission are stored here. Customer checkout does not auto-apply them yet. Existing orders are not repriced.',
    };
  }

  if (action === 'staff.list') {
    requirePerm(actor, 'staff');
    return { ok: true, people: await staffList(env), bootstrap: bootstrapAdmin(env) ? { email: bootstrapAdmin(env).email, role: 'super' } : null };
  }

  if (action === 'staff.upsert') {
    requirePerm(actor, 'staff');
    const email = String(body.email || '').trim().toLowerCase();
    const name = String(body.name || '').trim() || email;
    const role = String(body.role || 'operations');
    if (!email.includes('@')) return { ok: false, message: 'Enter an email.' };
    if (PERMS.dashboard.indexOf(role) < 0 && role !== 'finance' && role !== 'support' && role !== 'operations' && role !== 'super') {
      return { ok: false, message: 'Unknown role.' };
    }
    if (['super', 'finance', 'support', 'operations'].indexOf(role) < 0) return { ok: false, message: 'Unknown role.' };
    const raw = (await getState(env, STATE_KEYS.staff)) || { people: [] };
    const people = Array.isArray(raw.people) ? raw.people.slice() : [];
    let row = people.find((p) => p.email === email);
    if (!row) {
      row = { id: 'ADM-' + Date.now().toString(36), email: email, createdAt: Date.now() };
      people.push(row);
    }
    row.name = name;
    row.role = role;
    row.active = body.active !== false;
    if (body.password) {
      if (String(body.password).length < 8) return { ok: false, message: 'Password must be at least 8 characters.' };
      row.salt = await sha256b64(email + Date.now());
      row.passwordHash = await hashPassword(body.password, row.salt);
    }
    if (!row.passwordHash && !body.password) return { ok: false, message: 'Set a password for new staff.' };
    await putState(env, STATE_KEYS.staff, { people: people });
    await appendAudit(env, actor, 'staff.upsert', email, role);
    return { ok: true, people: people.map((p) => ({ id: p.id, email: p.email, name: p.name, role: p.role, active: p.active !== false })) };
  }

  if (action === 'audit.list') {
    requirePerm(actor, 'audit');
    const bag = (await getState(env, STATE_KEYS.audit)) || { entries: [] };
    const page = paginate(bag.entries || [], body.page, body.size || 50);
    return { ok: true, ...page };
  }

  return { ok: false, message: 'Unknown action.' };
}

function publicWithdraw(w) {
  const st = w.request.status;
  return {
    walletId: w.walletId,
    accountId: w.accountId,
    name: w.name,
    role: w.role,
    amount: w.request.amount,
    method: 'Bank transfer',
    status: mapWdStatus(st),
    rawStatus: st,
    ts: w.request.ts,
    transferredAt: w.request.transferredAt || 0,
    requestId: w.request.id,
    bank: w.bank,
    paymentRef: w.request.paymentRef || '',
    reason: w.request.reason || '',
    note: w.request.note || '',
  };
}

function mapWdStatus(st) {
  if (st === 'transferred') return 'approved';
  if (st === 'rejected' || st === 'cancelled') return 'rejected';
  return 'pending';
}

function countRoles(accounts) {
  const c = { all: 0, customer: 0, shop: 0, rider: 0 };
  accounts.forEach((a) => {
    c.all += 1;
    c[roleTag(a.role)] = (c[roleTag(a.role)] || 0) + 1;
  });
  return c;
}

function relatedOrder(o, a) {
  if (!o || !a) return false;
  if (a.role === 'shop') return o.shopId === (a.shop_id || a.shopId);
  if (a.role === 'rider') return o.riderId === a.id || phoneKey(o.riderPhone) === phoneKey(a.phone);
  return o.userId === a.id || phoneKey(o.customerPhone) === phoneKey(a.phone);
}

function normStatus(s) {
  s = String(s || '');
  if (s === 'on_the_way' || s === 'picked_up') return 'on_the_way';
  if (s === 'accepted') return 'preparing';
  if (s === 'ready') return 'ready';
  return s;
}

function countOrderStatus(orders) {
  const c = { all: orders.length, pending: 0, preparing: 0, ready: 0, on_the_way: 0, delivered: 0, cancelled: 0 };
  orders.forEach((o) => {
    const s = normStatus(o.status);
    if (c[s] != null) c[s] += 1;
    else c.pending += 1;
  });
  return c;
}

function parseRange(body) {
  const days = Math.max(1, Math.min(90, Number(body.days) || 7));
  if (body.from && body.to) {
    return { from: new Date(body.from).getTime(), to: new Date(body.to).getTime() };
  }
  const to = Date.now();
  return { from: to - days * 86400000, to: to, days: days };
}

export async function onRequest(context) {
  const request = context.request;
  const env = context.env || {};
  const cors = corsHeaders(request);
  const method = String(request.method || 'GET').toUpperCase();
  if (method === 'OPTIONS') return optionsResponse(cors);

  if (method === 'GET' || method === 'HEAD') {
    const actor = await verifySession(env, readCookie(request, 'qb_admin'));
    return json(200, {
      ok: true,
      configured: envConfigured(env),
      signedIn: !!actor,
      actor: actor ? { email: actor.email, name: actor.name, role: actor.role } : null,
    }, cors);
  }

  if (method !== 'POST') return fail(405, 'POST JSON with an action.', null, cors);

  let body = {};
  try { body = await request.json(); } catch (_) { body = {}; }
  const action = String(body.action || '');

  try {
    if (action === 'session.login') {
      if (!envConfigured(env)) {
        return fail(503, 'Admin sign-in is not configured. Set ADMIN_EMAIL and ADMIN_PASSWORD (min 8 characters) on Cloudflare Pages → Production.', null, cors);
      }
      const actor = await loginActor(env, body.email, body.password);
      if (!actor) return fail(401, 'Wrong email or password.', null, cors);
      const token = await signSession(env, actor);
      const headers = Object.assign({}, cors, { 'Set-Cookie': cookieHeader(token, request, false) });
      return json(200, { ok: true, actor: { email: actor.email, name: actor.name, role: actor.role } }, headers);
    }

    if (action === 'session.logout') {
      const headers = Object.assign({}, cors, { 'Set-Cookie': cookieHeader('', request, true) });
      return json(200, { ok: true }, headers);
    }

    const actor = await verifySession(env, readCookie(request, 'qb_admin'));
    if (!actor) return fail(401, 'Sign in.', { code: 'AUTH' }, cors);

    const out = await dispatch(env, actor, body, request);
    const status = out && out.ok === false ? 400 : 200;
    return json(status, out, cors);
  } catch (e) {
    const status = e && e.status ? e.status : (e && e.code === 'FORBIDDEN' ? 403 : 500);
    return fail(status, (e && e.message) || 'Server error', { code: e && e.code }, cors);
  }
}

export const onRequestGet = onRequest;
export const onRequestPost = onRequest;
export const onRequestOptions = onRequest;
