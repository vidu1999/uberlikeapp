(function (global) {
  const API = {
    shops: [],
    items: [],
    orders: [],
    messages: {},
    listeners: [],
    user: null,
    token: null,
    base: (typeof window !== 'undefined' && window.QB_API) ? String(window.QB_API).replace(/\/$/, '') : '',
    roleHint: document.documentElement.getAttribute('data-role') || '',
  };

  function shopOf(id) {
    return API.shops.find((s) => s.id === id) || { name: 'Shop', emoji: '🏪', lat: 6.93, lng: 79.85, eta: '20 min' };
  }

  let _fp = null;
  function fingerprint() {
    const orders = (API.orders || []).map((o) =>
      [o.id, o.status, o.riderName || '', o.riderLat, o.riderLng].join(':')
    ).join('|');
    const items = (API.items || []).map((i) => i.id + ':' + i.name + ':' + i.price + ':' + (i.image || '') + ':' + (i.isAvailable === false ? '0' : '1')).join('|');
    const msgs = Object.keys(API.messages || {}).sort().map((k) => k + ':' + ((API.messages[k] || []).length)).join('|');
    return [(API.user && API.user.id) || '', (API.shops || []).length, items, orders, msgs].join('~');
  }
  function notify(force) {
    const fp = fingerprint();
    if (!force && _fp === fp) return;
    _fp = fp;
    API.listeners.forEach((fn) => {
      try { fn(API); } catch (e) { console.error(e); }
    });
  }

  function url(path) {
    if (/^https?:\/\//i.test(path)) return path;
    return (API.base || '') + path;
  }

  function sbConfigured() {
    return Boolean(window.QB_SUPABASE_URL && window.QB_SUPABASE_ANON);
  }

  function mapShop(r) {
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
  function mapItem(r) {
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

  function sbHeaders(extra) {
    return Object.assign({
      apikey: window.QB_SUPABASE_ANON,
      Authorization: 'Bearer ' + window.QB_SUPABASE_ANON,
      'Content-Type': 'application/json',
      Prefer: 'return=representation,resolution=merge-duplicates',
    }, extra || {});
  }

  function abortAfter(ms) {
    const c = new AbortController();
    setTimeout(function () { c.abort(); }, ms);
    return c.signal;
  }

  function e164(phone) {
    let d = String(phone || '').replace(/\D/g, '');
    if (d.startsWith('0') && d.length === 10) d = '94' + d.slice(1);
    return d;
  }

  async function sendWhatsApp(phone, body) {
    const wa = window.QB_WA || {};
    const to = e164(phone);
    const payload = JSON.stringify({ phone: to, body: body });
    try {
        const res = await fetch('/otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          signal: abortAfter(12000),
        });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) return true;
    } catch (_) {}
    const sb = String(window.QB_SUPABASE_URL || '').replace(/\/$/, '');
    if (sb && window.QB_SUPABASE_ANON) {
      try {
        const res = await fetch(sb + '/functions/v1/send-otp', {
          method: 'POST',
          headers: {
            apikey: window.QB_SUPABASE_ANON,
            Authorization: 'Bearer ' + window.QB_SUPABASE_ANON,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ phone: to, body }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) return true;
        if (res.status && res.status !== 404) {
          const msg = (data && data.error) ? (typeof data.error === 'string' ? data.error : JSON.stringify(data.error)) : ('WhatsApp ' + res.status);
          throw new Error(msg);
        }
      } catch (e) {
        if (e && e.message && /WhatsApp|GREEN_|META_|Set GREEN|send failed/i.test(e.message)) throw e;
      }
    }
    if (!(wa.greenId && wa.greenToken)) {
      try {
        const cfg = await fetch('/js/wa.json', { cache: 'no-store' }).then((r) => r.json());
        if (cfg) Object.assign(wa, cfg);
      } catch (_) {}
    }
    if (wa.greenId && wa.greenToken) {
      const id = String(wa.greenId);
      const hosts = [];
      function addHost(h) {
        const v = String(h || '').replace(/\/$/, '');
        if (v && hosts.indexOf(v) === -1) hosts.push(v);
      }
      addHost(wa.apiUrl);
      if (id.length >= 4) addHost('https://' + id.slice(0, 4) + '.api.green-api.com');
      addHost('https://api.green-api.com');
      let last = 'WhatsApp send failed';
      for (let i = 0; i < hosts.length; i++) {
        try {
          const res = await fetch(
            hosts[i] + '/waInstance' + wa.greenId + '/sendMessage/' + wa.greenToken,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chatId: to + '@c.us', message: body }),
              signal: abortAfter(8000),
            },
          );
          if (res.ok) return true;
          last = 'WhatsApp send failed (' + res.status + ')';
        } catch (e) {
          last = e && e.message ? e.message : last;
        }
      }
      throw new Error(last);
    }
    if (wa.metaToken && wa.metaPhoneId) {
      const res = await fetch('https://graph.facebook.com/v21.0/' + wa.metaPhoneId + '/messages', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + wa.metaToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: to,
          type: 'text',
          text: { body: body },
        }),
      });
      if (!res.ok) throw new Error('WhatsApp Cloud send failed (' + res.status + ')');
      return true;
    }
    throw new Error('WhatsApp sender is not connected. Paste your Green-API idInstance and apiTokenInstance.');
  }

  async function sbGet(table) {
    const base = String(window.QB_SUPABASE_URL).replace(/\/$/, '');
    const ctrl = new AbortController();
    const t = setTimeout(function () { ctrl.abort(); }, 8000);
    let res;
    try {
      res = await fetch(base + '/rest/v1/' + table, { headers: sbHeaders(), signal: ctrl.signal });
    } finally {
      clearTimeout(t);
    }
    const text = await res.text();
    if (!res.ok) throw new Error('Supabase ' + table.split('?')[0] + ' ' + res.status);
    return text ? JSON.parse(text) : [];
  }

  async function sbSend(path, method, body) {
    const base = String(window.QB_SUPABASE_URL).replace(/\/$/, '');
    const res = await fetch(base + '/rest/v1/' + path, {
      method: method,
      headers: sbHeaders(method === 'DELETE' ? { Prefer: 'return=minimal' } : null),
      body: body != null ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) throw new Error('Supabase ' + path.split('?')[0] + ' ' + res.status + ' ' + String(text).slice(0, 160));
    return text ? JSON.parse(text) : null;
  }

  async function sbUpsert(table, rows) {
    return sbSend(table + '?on_conflict=id', 'POST', rows);
  }

  async function sbPutRow(table, row) {
    if (!row || !row.id) throw new Error('Missing id');
    try {
      await sbSend(table + '?on_conflict=id', 'POST', [row]);
    } catch (_) {
      try {
        await sbSend(table + '?id=eq.' + encodeURIComponent(row.id), 'PATCH', row);
      } catch (e2) {
        await sbSend(table, 'POST', [row]);
      }
    }
  }

  function mapAccount(r) {
    const a = { id: r.id, name: r.name, phone: r.phone, email: r.email, role: r.role, address: r.address };
    if (r.shop_id || r.shopId) a.shopId = r.shop_id || r.shopId;
    if (r.shopName || r.shop_name) a.shopName = r.shopName || r.shop_name;
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

  function mapOrder(r) {
    if (!r) return r;
    let d = r.data;
    if (typeof d === 'string') {
      try { d = JSON.parse(d); } catch (_) { d = null; }
    }
    if (!d || typeof d !== 'object') d = {};
    const o = Object.assign({}, r, d);
    o.id = d.id || r.id;
    o.userId = d.userId || r.user_id || r.userId || '';
    o.shopId = d.shopId || r.shop_id || r.shopId || '';
    o.shopName = d.shopName || r.shop_name || r.shopName || '';
    o.customerName = d.customerName || r.customer_name || r.customerName || '';
    o.customerPhone = d.customerPhone || r.customer_phone || r.customerPhone || '';
    o.address = d.address || r.address || '';
    o.status = d.status || r.status || 'pending';
    o.items = d.items || o.items || [];
    o.totalAmount = Number(d.totalAmount != null ? d.totalAmount : r.total_amount) || 0;
    o.deliveryLat = Number(d.deliveryLat != null ? d.deliveryLat : o.deliveryLat);
    o.deliveryLng = Number(d.deliveryLng != null ? d.deliveryLng : o.deliveryLng);
    o.riderId = d.riderId || o.riderId || null;
    o.riderName = d.riderName || o.riderName || null;
    o.riderPhone = d.riderPhone || o.riderPhone || null;
    o.riderLat = d.riderLat != null ? d.riderLat : o.riderLat;
    o.riderLng = d.riderLng != null ? d.riderLng : o.riderLng;
    o.pickedUpAt = d.pickedUpAt || o.pickedUpAt || r.picked_up_at || null;
    return o;
  }

  const DEMO_SHOP_IDS = ['SHOP_1','SHOP_2','SHOP_3','SHOP_4','SHOP_5','SHOP_6','SHOP_7','SHOP_8','SHOP_9','SHOP_10','SHOP_11'];
  const DEMO_ACCOUNT_IDS = ['USER_1','USER_2','SHOP_STAFF','RIDER_77'];
  const DEMO_PHONES = ['0771234567','0771112222','0772223333','0775556666'];

  function isDemoShop(id) {
    return DEMO_SHOP_IDS.indexOf(String(id || '')) >= 0;
  }
  function isDemoPhone(phone) {
    return DEMO_PHONES.indexOf(normalizePhone(phone || '')) >= 0;
  }
  function isDemoAccount(a) {
    if (!a) return false;
    return DEMO_ACCOUNT_IDS.indexOf(String(a.id || '')) >= 0 || isDemoPhone(a.phone);
  }
  function isDemoOrder(o) {
    const id = String((o && o.id) || '');
    if (/^ORD-100[1-4]$/.test(id) || id === 'ORD-NONE') return true;
    if (isDemoShop(o && (o.shopId || o.shop_id))) return true;
    if (DEMO_ACCOUNT_IDS.indexOf(String((o && (o.userId || o.user_id)) || '')) >= 0) return true;
    if (isDemoPhone((o && (o.customerPhone || o.customer_phone)) || '')) return true;
    return false;
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
  function roleTag(role) {
    if (role === 'shop') return 'shop';
    if (role === 'rider') return 'rider';
    return 'customer';
  }
  function phoneKey(raw) {
    const d = normalizePhone(raw);
    return d.length >= 9 ? d.slice(-9) : d;
  }
  function accountIdFor(phone, role) {
    return 'ACC_' + roleTag(role) + '_' + phoneKey(phone);
  }
  function shopIdFor(phone) {
    return 'SHOP_' + phoneKey(phone);
  }
  function alreadyThisRoleError(role) {
    const have = roleLabel(role);
    return new Error('This number already has a ' + have + ' account. Login instead — you cannot create another ' + have + ' with the same number. You can still use this number for the other apps.');
  }
  function clearAccCache() {
    API._accs = null;
    API._accsAt = 0;
  }
  async function allAccounts() {
    if (API._accs && Date.now() - API._accsAt < 4000) return API._accs;
    let rows = [];
    if (sbConfigured()) {
      try { rows = await sbGet('accounts?select=*'); } catch (_) {}
    }
    if (!rows || !rows.length) {
      try { rows = await getJSON('/api/accounts') || []; } catch (_) { rows = []; }
    }
    API._accs = (rows || []).map(function (r) { return mapAccount(r); }).filter(function (a) { return a && a.id && !isDemoAccount(a); });
    API._accsAt = Date.now();
    return API._accs;
  }
  function scopeData() {
    API.shops = (API.shops || []).filter((s) => !isDemoShop(s.id));
    API.items = (API.items || []).filter((it) => !isDemoShop(it.shopId));
    API.orders = (API.orders || []).filter((o) => !isDemoOrder(o));
    const u = API.user;
    if (u && isDemoAccount(u)) {
      API.user = null;
      API.token = null;
      try {
        localStorage.removeItem(sessionKey(u.role));
        sessionStorage.removeItem(sessionKey(u.role));
      } catch (_) {}
    }
    const me = API.user;
    if (!me) {
      API.orders = [];
      return;
    }
    if (me.role === 'customer' || me.role === 'user') {
      const phone = normalizePhone(me.phone);
      const key = phoneKey(phone);
      API.orders = API.orders.filter((o) => {
        if (o.userId === me.id || o.user_id === me.id) return true;
        const p = normalizePhone(o.customerPhone || o.customer_phone || '');
        return p && (p === phone || phoneKey(p) === key);
      });
      mergeKept();
    } else if (me.role === 'shop') {
      const sid = me.shopId;
      API.shops = API.shops.filter((s) => s.id === sid);
      API.items = API.items.filter((it) => it.shopId === sid);
      API.orders = API.orders.filter((o) => o.shopId === sid);
    } else if (me.role === 'rider') {
      API.orders = API.orders.filter((o) => {
        if (o.riderId === me.id || o.riderPhone === me.phone) return true;
        if (o.status === 'ready' && !o.riderId) return true;
        return false;
      });
    }
  }
  const keptOrders = [];
  function keptStorageKey() {
    return 'qb_kept_orders_' + phoneKey((API.user && API.user.phone) || '');
  }
  function persistKept() {
    try { localStorage.setItem(keptStorageKey(), JSON.stringify(keptOrders.slice(0, 40))); } catch (_) {}
  }
  function keepOrder(o) {
    if (!o || !o.id) return o;
    const i = keptOrders.findIndex((x) => x.id === o.id);
    if (i >= 0) keptOrders[i] = Object.assign({}, keptOrders[i], o);
    else keptOrders.unshift(o);
    persistKept();
    return o;
  }
  function loadKept() {
    try {
      const arr = JSON.parse(localStorage.getItem(keptStorageKey()) || '[]');
      if (!Array.isArray(arr)) return;
      arr.forEach((o) => {
        if (o && o.id && !keptOrders.some((x) => x.id === o.id)) keptOrders.push(o);
      });
    } catch (_) {}
  }
  function mergeKept() {
    if (!API.user) return;
    loadKept();
    keptOrders.forEach((o) => {
      if (!o || !o.id) return;
      if (!API.orders.some((x) => x.id === o.id)) API.orders.unshift(o);
    });
  }

  function phoneVariants(phone) {
    const key = phoneKey(phone);
    const n = normalizePhone(phone);
    return [n, key, '0' + key, '94' + key, '+94' + key].filter(function (v, i, a) {
      return v && a.indexOf(v) === i;
    });
  }

  function dropLocalShop(raw) {
    const key = phoneKey(raw);
    if (!key) return;
    try {
      [localStorage, sessionStorage].forEach(function (store) {
        try {
          const raws = store.getItem('sd_user_shop');
          if (!raws) return;
          const data = JSON.parse(raws);
          const p = (data && data.user && data.user.phone) || (data && data.phone);
          if (!p || phoneKey(p) === key) store.removeItem('sd_user_shop');
        } catch (_) {}
      });
      localStorage.removeItem(shopProfileKey(normalizePhone(raw)));
      sessionStorage.removeItem('sd_pending_shop');
    } catch (_) {}
    if (API.user && sameRole(API.user.role, 'shop') && phoneKey(API.user.phone) === key) {
      API.user = null;
      API.token = null;
    }
  }

  async function wipeShopRole(raw) {
    if (!sbConfigured()) return;
    const key = phoneKey(raw);
    if (!key) return;
    const n = normalizePhone(raw);
    const variants = phoneVariants(raw);
    const shopIds = [shopIdFor(n)];
    const accIds = [accountIdFor(n, 'shop')];
    let accList = [];
    try { accList = await sbGet('accounts?select=id,phone,role,shop_id') || []; } catch (_) {}
    accList.forEach(function (a) {
      if (!a || !sameRole(a.role, 'shop')) return;
      if (phoneKey(a.phone) !== key && accIds.indexOf(a.id) < 0) return;
      if (accIds.indexOf(a.id) < 0) accIds.push(a.id);
      if (a.shop_id && shopIds.indexOf(a.shop_id) < 0) shopIds.push(a.shop_id);
    });
    let orderList = [];
    try { orderList = await sbGet('orders?select=*') || []; } catch (_) {}
    const orderIds = [];
    orderList.forEach(function (o) {
      const d = o.data || {};
      if (shopIds.indexOf(o.shop_id) >= 0 || shopIds.indexOf(d.shopId) >= 0) orderIds.push(o.id);
    });
    for (let i = 0; i < orderIds.length; i++) {
      const id = orderIds[i];
      try { await sbSend('messages?order_id=eq.' + encodeURIComponent(id), 'DELETE'); } catch (_) {}
      try { await sbSend('orders?id=eq.' + encodeURIComponent(id), 'DELETE'); } catch (_) {}
    }
    for (let i = 0; i < shopIds.length; i++) {
      const sid = shopIds[i];
      try { await sbSend('menu_items?shop_id=eq.' + encodeURIComponent(sid), 'DELETE'); } catch (_) {}
      try { await sbSend('shops?id=eq.' + encodeURIComponent(sid), 'DELETE'); } catch (_) {}
    }
    for (let i = 0; i < accIds.length; i++) {
      try { await sbSend('accounts?id=eq.' + encodeURIComponent(accIds[i]), 'DELETE'); } catch (_) {}
    }
    for (let i = 0; i < variants.length; i++) {
      try {
        await sbSend('accounts?phone=eq.' + encodeURIComponent(variants[i]) + '&role=eq.shop', 'DELETE');
      } catch (_) {}
      try {
        await sbSend('otp_codes?phone=eq.' + encodeURIComponent(variants[i]) + '&role=eq.shop', 'DELETE');
      } catch (_) {}
    }
    dropLocalShop(raw);
    clearAccCache();
  }

  function attachShopIdentity(user) {
    if (!user || !sameRole(user.role, 'shop')) return user;
    let sid = user.shopId || user.shop_id || '';
    if (!sid || isDemoShop(sid)) sid = user.phone ? shopIdFor(user.phone) : '';
    if (sid) {
      user.shopId = sid;
      user.shop_id = sid;
    }
    return user;
  }

  function isPlaceholderName(name) {
    const n = String(name || '').trim().toLowerCase();
    return !n || n === 'rider' || n === 'guest' || n === 'user' || n === 'shop owner' || n === 'delivery partner';
  }

  API.isShopRegistered = function () {
    const u = API.user;
    if (!u || !sameRole(u.role, 'shop')) return false;
    const sid = u.shopId || u.shop_id || (u.phone && shopIdFor(u.phone)) || '';
    if (!sid || isDemoShop(sid)) return false;
    const shop = (API.shops || []).find((s) => s.id === sid);
    if (shop && String(shop.name || '').trim()) return true;
    const rec = u.phone && API.recallShopProfile ? API.recallShopProfile(u.phone) : null;
    return !!(rec && String(rec.shopName || '').trim());
  };

  API.isRiderRegistered = function () {
    const u = API.user;
    if (!u || !sameRole(u.role, 'rider') || !u.id) return false;
    return !isPlaceholderName(u.name);
  };

  API.parkForRegister = function (role) {
    const u = API.user;
    const phone = (u && u.phone) || (API.verifiedPhone && API.verifiedPhone(role)) || '';
    API.user = null;
    API.token = null;
    try {
      sessionKeys(role).forEach(storeDel);
      sessionKeys(API.roleHint).forEach(storeDel);
      cookieClear(role);
      cookieClear(API.roleHint);
    } catch (_) {}
    if (phone) persistVerified({ role: roleTag(role), phone: normalizePhone(phone) });
  };

  async function ensureShopRow(user, opts) {
    user = attachShopIdentity(user);
    if (!user || !sameRole(user.role, 'shop')) return user;
    const sid = user.shopId;
    if (!sid) throw new Error('Shop is not linked to this account.');
    if (user.id && sbConfigured()) {
      try { await sbSend('accounts?id=eq.' + encodeURIComponent(user.id), 'PATCH', { shop_id: sid }); } catch (_) {}
    }
    let shop = null;
    if (sbConfigured()) {
      try {
        const rows = await sbGet('shops?id=eq.' + encodeURIComponent(sid) + '&select=*');
        if (rows && rows[0]) shop = rows[0];
      } catch (_) {}
    }
    if (!shop) {
      const rec = (user.phone && API.recallShopProfile(user.phone)) || {};
      const p = pendingShop() || {};
      const name = String(p.shopName || rec.shopName || '').trim();
      if (!name) {
        if (opts && opts.required) throw new Error('Register your shop first.');
        return user;
      }
      shop = {
        id: sid,
        name: name,
        category: 'Bakery',
        rating: 5,
        reviews: 0,
        is_open: true,
        lat: Number(p.lat || rec.lat) || 8.335,
        lng: Number(p.lng || rec.lng) || 80.4108,
        km: 0,
        eta: '20–35 min',
        fee: 200,
        hours: '08:00 AM – 10:00 PM',
        address: p.address || rec.address || '',
        image: '/img/shop-bakery.jpg',
        promo: rec.promo || '',
      };
      if (sbConfigured()) await sbUpsert('shops', [shop]);
    }
    const mapped = mapShop(shop);
    const i = API.shops.findIndex((s) => s.id === sid);
    if (i >= 0) API.shops[i] = Object.assign({}, API.shops[i], mapped);
    else API.shops.push(mapped);
    if (mapped.name) user.shopName = mapped.name;
    return user;
  }

  function clearAllLocalAuth() {
    API.user = null;
    API.token = null;
    API._verified = null;
    API._pendingShop = null;
    API._pendingRider = null;
    API.shops = [];
    API.items = [];
    API.orders = [];
    API.messages = {};
    try { if (typeof keptOrders !== 'undefined') keptOrders.length = 0; } catch (_) {}
    ['customer', 'user', 'shop', 'rider'].forEach(function (role) {
      try { sessionKeys(role).forEach(storeDel); } catch (_) {}
      try { cookieClear(role); } catch (_) {}
      try { storeDel(verifiedKey(role)); } catch (_) {}
    });
    try { storeDel('sd_pending_shop'); storeDel('sd_pending_rider'); } catch (_) {}
    try {
      const dump = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && /^(sd_|qb_)/.test(k)) dump.push(k);
      }
      dump.forEach(function (k) {
        try { localStorage.removeItem(k); } catch (_) {}
        try { sessionStorage.removeItem(k); } catch (_) {}
      });
    } catch (_) {}
    clearAccCache();
  }

  async function wipeAllData() {
    if (API._wipedAll) return true;
    let failed = 0;
    if (sbConfigured()) {
      const paths = [
        'messages?order_id=not.is.null',
        'orders?id=not.is.null',
        'menu_items?id=not.is.null',
        'shops?id=not.is.null',
        'accounts?id=not.is.null',
        'otp_codes?id=not.is.null',
        'app_state?id=not.is.null',
      ];
      for (let i = 0; i < paths.length; i++) {
        try { await sbSend(paths[i], 'DELETE'); } catch (_) { failed++; }
      }
    } else {
      failed = 1;
    }
    if (failed) return false;
    API._wipedAll = true;
    clearAllLocalAuth();
    notify(true);
    return true;
  }

  async function wipeTestNumber() {
    let force = '';
    try { force = new URLSearchParams(location.search || '').get('wipe') || ''; } catch (_) {}
    if (!force) return;
    const f = String(force).trim().toLowerCase();
    if (f === 'all' || f === '*' || f === 'reset') {
      const ok = await wipeAllData();
      try {
        alert(ok
          ? 'All User, Shop, and Rider data was deleted. Start again from WhatsApp OTP.'
          : 'Could not fully wipe the database. Refresh this wipe link.');
        if (ok) {
          API._phoneWiped = true;
          const u = new URL(location.href);
          u.searchParams.delete('wipe');
          history.replaceState({}, '', u.pathname + (u.search || '') + u.hash);
        }
      } catch (_) {}
      return;
    }
    if (API._phoneWiped || !sbConfigured()) return;
    API._phoneWiped = true;
    await wipeShopRole(force);
  }

  async function wipeDemo() {
    if (API._wipedDemo || !sbConfigured()) return;
    API._wipedDemo = true;
    const shopsIn = DEMO_SHOP_IDS.map((id) => '"' + id + '"').join(',');
    const paths = [
      'messages?order_id=in.("ORD-1001","ORD-1002","ORD-1003","ORD-1004","ORD-NONE")',
      'orders?id=in.("ORD-1001","ORD-1002","ORD-1003","ORD-1004","ORD-NONE")',
      'orders?shop_id=in.(' + shopsIn + ')',
      'orders?user_id=in.("USER_1","USER_2")',
      'menu_items?shop_id=in.(' + shopsIn + ')',
      'shops?id=in.(' + shopsIn + ')',
      'accounts?id=in.("USER_1","USER_2","SHOP_STAFF","RIDER_77")',
      'accounts?phone=in.("0771234567","0771112222","0772223333","0775556666")',
    ];
    for (let i = 0; i < paths.length; i++) {
      try { await sbSend(paths[i], 'DELETE'); } catch (_) {}
    }
    clearAccCache();
  }
  async function lookupPhone(phone, role) {
    const key = phoneKey(phone);
    if (!key) return null;
    const want = roleTag(role || 'customer');
    const id = accountIdFor(phone, want);
    const n = normalizePhone(phone);
    const variants = [n, key, '0' + key, '94' + key];
    const byId = {};
    function add(raw) {
      if (!raw) return;
      const a = mapAccount(raw);
      if (!a || !a.id || isDemoAccount(a)) return;
      if (phoneKey(a.phone) !== key && a.id !== id) return;
      if (!sameRole(a.role, want)) return;
      byId[a.id] = a;
    }
    if (sbConfigured()) {
      try {
        (await sbGet('accounts?id=eq.' + encodeURIComponent(id) + '&select=*') || []).forEach(add);
      } catch (_) {}
      for (let i = 0; i < variants.length; i++) {
        try {
          (await sbGet('accounts?phone=eq.' + encodeURIComponent(variants[i]) + '&select=*') || []).forEach(add);
        } catch (_) {}
      }
    }
    (await allAccounts()).forEach(add);
    const list = Object.keys(byId).map(function (k) { return byId[k]; });
    if (!list.length) return null;
    const keep = byId[id] || list[0];
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === keep.id) continue;
      try { await sbSend('accounts?id=eq.' + encodeURIComponent(list[i].id), 'DELETE'); } catch (_) {}
    }
    if (list.length > 1) clearAccCache();
    return keep;
  }

  async function saveAccount(row) {
    const orig = normalizePhone(row.phone);
    row.phone = orig;
    try {
      await sbSend('accounts', 'POST', [row]);
      clearAccCache();
      return row;
    } catch (_) {}
    const key = phoneKey(orig);
    const alts = sameRole(row.role, 'shop') ? ['94' + key] : sameRole(row.role, 'rider') ? [key] : [];
    for (let i = 0; i < alts.length; i++) {
      try {
        await sbSend('accounts', 'POST', [Object.assign({}, row, { phone: alts[i] })]);
        clearAccCache();
        row.phone = orig;
        return row;
      } catch (_) {}
    }
    clearAccCache();
    return (await lookupPhone(orig, row.role)) || row;
  }

  function nextOrderId() {
    return 'ORD-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  async function pullSupabase() {
    await wipeTestNumber();
    await wipeDemo();
    if (API.user && sameRole(API.user.role, 'shop')) {
      try { API.user = await ensureShopRow(API.user); } catch (_) {}
    }
    if (API.user) saveSession();
    const [shopRows, itemRows, orderRows, msgRows] = await Promise.all([
      sbGet('shops?select=*&order=id.asc'),
      sbGet('menu_items?select=*&order=id.asc'),
      sbGet('orders?select=*'),
      sbGet('messages?select=*'),
    ]);
    API.shops = (shopRows || []).map(mapShop);
    API.items = (itemRows || []).map(mapItem);
    API.orders = (orderRows || []).map(mapOrder);
    API.messages = {};
    for (const m of msgRows || []) {
      const list = API.messages[m.order_id] || (API.messages[m.order_id] = []);
      list.push({ id: m.id, from: m.sender, role: m.role, text: m.body, ts: m.ts, thread: m.thread });
    }
    scopeData();
    notify();
  }

  async function getJSON(path, opts) {
    const res = await fetch(url(path), opts);
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { error: text }; }
    if (!res.ok) throw new Error(data.error || text || res.status);
    return data;
  }

  API.on = function (fn) {
    API.listeners.push(fn);
    fn(API);
  };

  API.refresh = async function () {
    if (!window.QB_SUPABASE_URL) {
      try {
        const cfg = await getJSON('/api/config');
        if (cfg.supabaseUrl) window.QB_SUPABASE_URL = cfg.supabaseUrl;
        if (cfg.supabaseAnon) window.QB_SUPABASE_ANON = cfg.supabaseAnon;
      } catch (_) {}
    }
    if (sbConfigured()) {
      await pullSupabase();
      return;
    }
    const data = await getJSON('/api/state');
    API.shops = data.shops;
    API.items = data.items;
    API.orders = data.orders || [];
    API.messages = data.messages || {};
    scopeData();
    notify();
  };

  API.login = async function (role, phone, pin) {
    pin = pin || '1234';
    if (phone) {
      const taken = await lookupPhone(phone, role);
      if (taken) {
        API.user = taken;
        API.token = 'sb_' + taken.id;
        saveSession();
        notify();
        return API.user;
      }
    }
    if (sbConfigured()) {
      try {
        let q = 'accounts?select=*&role=eq.' + encodeURIComponent(role === 'user' ? 'customer' : role);
        if (phone) q += '&phone=eq.' + encodeURIComponent(normalizePhone(phone));
        const rows = await sbGet(q);
        const picked = (rows || []).find((a) => !isDemoAccount(a) && String(a.pin) === String(pin))
          || (rows || []).find((a) => !isDemoAccount(a));
        if (picked) {
          const acc = mapAccount(picked);
          API.user = acc;
          API.token = 'sb_' + picked.id;
          saveSession();
          notify();
          return API.user;
        }
      } catch (_) {}
    }
    const data = await getJSON('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, phone, pin: pin }),
    });
    API.user = data.user;
    API.token = data.token;
    saveSession();
    notify();
    return data.user;
  };

  API.register = async function (payload) {
    const role = payload.role === 'shop' || payload.role === 'rider' ? payload.role : 'customer';
    const phone = normalizePhone(payload.phone);
    if (phone) {
      const taken = await lookupPhone(phone, role);
      if (taken && (role === 'shop' || role === 'rider')) throw alreadyThisRoleError(role);
    }
    if (role === 'shop' || role === 'rider') {
      try {
        return await getJSON('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch (e) {
        if (e && String(e.message || '').indexOf('already') >= 0) throw e;
        return {
          ok: true,
          app: role,
          web: role === 'shop' ? '/shop.html' : '/rider.html',
        };
      }
    }
    API.setPendingRider({
      name: payload.name || 'Guest',
      email: payload.email || '',
      phone,
    });
    const out = await API.sendOtp('customer', phone);
    return { ok: true, next: 'otp', ...out };
  };

  function normalizePhone(raw) {
    let d = String(raw || '').replace(/\D/g, '');
    if (d.startsWith('94') && d.length === 11) d = '0' + d.slice(2);
    if (d.length === 9 && d.startsWith('7')) d = '0' + d;
    return d;
  }

  function storeGet(key) {
    try {
      return localStorage.getItem(key) || sessionStorage.getItem(key);
    } catch (_) { return null; }
  }
  function storeSet(key, val) {
    try { localStorage.setItem(key, val); } catch (_) {}
    try { sessionStorage.setItem(key, val); } catch (_) {}
  }
  function storeDel(key) {
    try { localStorage.removeItem(key); } catch (_) {}
    try { sessionStorage.removeItem(key); } catch (_) {}
  }

  function pendingShop() {
    if (API._pendingShop) return API._pendingShop;
    try { return JSON.parse(storeGet('sd_pending_shop') || 'null'); } catch (_) { return null; }
  }

  API.setPendingShop = function (profile) {
    API._pendingShop = profile || null;
    try {
      if (profile) storeSet('sd_pending_shop', JSON.stringify(profile));
      else storeDel('sd_pending_shop');
    } catch (_) {}
  };

  function pendingRider() {
    if (API._pendingRider) return API._pendingRider;
    try { return JSON.parse(storeGet('sd_pending_rider') || 'null'); } catch (_) { return null; }
  }
  API.setPendingRider = function (profile) {
    API._pendingRider = profile || null;
    try {
      if (profile) storeSet('sd_pending_rider', JSON.stringify(profile));
      else storeDel('sd_pending_rider');
    } catch (_) {}
  };

  function shopProfileKey(phone) {
    return 'sd_shop_profile_' + normalizePhone(phone);
  }
  API.rememberShopProfile = function (phone, profile) {
    try { localStorage.setItem(shopProfileKey(phone), JSON.stringify(profile)); } catch (_) {}
  };
  API.recallShopProfile = function (phone) {
    try { return JSON.parse(localStorage.getItem(shopProfileKey(phone)) || 'null'); } catch (_) { return null; }
  };

  API.findAccount = async function (role, id) {
    const phone = normalizePhone(id);
    const email = String(id || '').includes('@') ? String(id).trim().toLowerCase() : '';
    let hit = null;
    if (email) {
      const list = await allAccounts();
      hit = list.find(function (a) { return String(a.email || '').toLowerCase() === email && sameRole(a.role, role); }) || null;
    }
    if (!hit) hit = await lookupPhone(phone, role);
    if (hit) return hit;
    return null;
  };

  async function enterAccount(role, phone) {
    phone = normalizePhone(phone);
    const taken = await lookupPhone(phone, role);
    let row = taken || null;
    if (row && row.shopId && !row.shop_id) row.shop_id = row.shopId;
    if (!row) {
      try {
        const byId = await sbGet('accounts?id=eq.' + encodeURIComponent(accountIdFor(phone, role)) + '&select=*');
        if (byId && byId[0] && !isDemoAccount(byId[0]) && sameRole(byId[0].role, role)) {
          row = mapAccount(byId[0]);
        }
      } catch (_) {}
    }
    if (!row && role === 'shop') {
      const p = pendingShop() || {};
      if (!p.shopName && !p.ownerName) {
        throw new Error('Register your shop first.');
      }
      const shopId = shopIdFor(phone);
      let shop = null;
      try {
        const existing = await sbGet('shops?id=eq.' + encodeURIComponent(shopId) + '&select=*');
        if (existing && existing[0]) shop = mapShop(existing[0]);
      } catch (_) {}
      if (!shop) {
        shop = {
          id: shopId,
          name: p.shopName || 'New Shop',
          category: 'Bakery',
          rating: 5,
          reviews: 0,
          is_open: true,
          lat: Number(p.lat) || 8.335,
          lng: Number(p.lng) || 80.4108,
          km: 0,
          eta: '20–35 min',
          fee: 200,
          hours: '08:00 AM – 10:00 PM',
          address: p.address || 'Sri Lanka',
          image: '/img/shop-bakery.jpg',
          promo: 'Freshly baked cakes, pastries and desserts made with love. We use the best ingredients to bring happiness to your table.',
        };
        try { await sbSend('shops', 'POST', [shop]); } catch (_) {}
      }
      row = {
        id: accountIdFor(phone, 'shop'),
        name: p.ownerName || 'Shop Owner',
        phone,
        email: p.email || '',
        pin: 'otp',
        role: 'shop',
        shop_id: shopId,
      };
      row = await saveAccount(row);
      API.rememberShopProfile(phone, {
        shopId, shopName: shop.name, ownerName: row.name, address: shop.address, lat: shop.lat, lng: shop.lng,
      });
      row.shopName = shop.name;
      API.setPendingShop(null);
      try { API.shops.push(mapShop(shop)); } catch (_) {}
    }
    if (row && role === 'rider') {
      const pr = pendingRider() || {};
      if (pr.name && !isPlaceholderName(pr.name)) {
        row.name = String(pr.name).trim();
        if (pr.email) row.email = pr.email;
        try {
          await sbSend('accounts?id=eq.' + encodeURIComponent(row.id), 'PATCH', { name: row.name, email: row.email || null });
        } catch (_) {}
      }
      API.setPendingRider(null);
    }
    if (!row && role === 'rider') {
      const pr = pendingRider() || {};
      if (isPlaceholderName(pr.name)) throw new Error('Register as a rider first.');
      row = {
        id: accountIdFor(phone, 'rider'),
        name: String(pr.name).trim(),
        phone,
        email: pr.email || '',
        pin: 'otp',
        role: 'rider',
        address: 'Sri Lanka',
        vehicle: pr.vehicle || 'Honda Dio · BDX 1234',
        rating: 5,
      };
      API.setPendingRider(null);
      row = await saveAccount(row);
    }
    if (!row) {
      const pr = pendingRider() || {};
      row = {
        id: accountIdFor(phone, role),
        name: pr.name || 'Guest',
        phone,
        email: pr.email || '',
        pin: 'otp',
        role: role || 'customer',
        address: 'Sri Lanka',
      };
      API.setPendingRider(null);
      row = await saveAccount(row);
    }
    API.user = mapAccount(row);
    if (row.shopName) API.user.shopName = row.shopName;
    if (role === 'shop') {
      try { API.user = await ensureShopRow(API.user); } catch (_) { API.user = attachShopIdentity(API.user); }
    }
    if (API.user && API.user.shopId) {
      const s = API.shops.find((x) => x.id === API.user.shopId);
      if (s && s.name) API.user.shopName = s.name;
    }
    if (role === 'shop' && API.user && API.user.shopId) {
      API.rememberShopProfile(phone, {
        shopId: API.user.shopId,
        shopName: API.user.shopName || '',
        ownerName: API.user.name,
      });
    }
    API.token = 'sb_' + row.id;
    saveSession();
    notify(true);
    return API.user;
  }

  API.normalizePhone = normalizePhone;
  API.shopIdFor = shopIdFor;

  API.sendOtp = async function (role, phone) {
    phone = normalizePhone(phone);
    if (!/^07\d{8}$/.test(phone) && !/^\d{10,15}$/.test(phone)) {
      throw new Error('Enter a valid mobile number');
    }
    const code = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    const smsToken = 'wa_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const body = 'Your QuickBite code is ' + code + '. Don\'t share this WhatsApp message.';
    API._otp = { id: smsToken, phone, role: role || 'customer', code, body, expires: Date.now() + 300000 };
    if (sbConfigured()) {
      try {
        await sbSend('otp_codes', 'POST', [{
          id: smsToken,
          phone,
          role: role || 'customer',
          code,
          body,
          expires_at: new Date(API._otp.expires).toISOString(),
          attempts: 0,
        }]);
      } catch (_) {}
    }
    await sendWhatsApp(phone, body);
    return { ok: true, phone, smsToken, channel: 'whatsapp', expiresIn: 300 };
  };

  API.readSms = async function (smsToken) {
    if (API._otp && API._otp.id === smsToken) {
      return { from: 'QuickBite', body: API._otp.body, phone: API._otp.phone, channel: 'whatsapp' };
    }
    if (sbConfigured()) {
      try {
        const rows = await sbGet('otp_codes?id=eq.' + encodeURIComponent(smsToken) + '&select=body,phone');
        if (rows && rows[0]) return { from: 'QuickBite', body: rows[0].body, phone: rows[0].phone, channel: 'whatsapp' };
      } catch (_) {}
    }
    return getJSON('/api/otp/sms?token=' + encodeURIComponent(smsToken));
  };

  API.verifyOtp = async function (role, phone, code) {
    phone = normalizePhone(phone);
    code = String(code || '').replace(/\D/g, '');
    let match = false;
    if (API._otp && API._otp.phone === phone && API._otp.code === code && Date.now() < API._otp.expires) {
      match = true;
    }
    if (!match && sbConfigured()) {
      try {
        const rows = await sbGet(
          'otp_codes?phone=eq.' + encodeURIComponent(phone) +
          '&role=eq.' + encodeURIComponent(role || 'customer') +
          '&code=eq.' + encodeURIComponent(code) +
          '&select=*',
        );
        const rec = rows && rows[0];
        if (rec && new Date(rec.expires_at).getTime() > Date.now()) match = true;
      } catch (_) {}
    }
    if (!match && !sbConfigured()) {
      const data = await getJSON('/api/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, phone, code }),
      });
      API.user = data.user;
      API.token = data.token;
      saveSession();
      notify();
      return data.user;
    }
    if (!match) throw new Error('That code does not match this phone number.');
    API._otp = null;
    const want = role || 'customer';
    if (want === 'shop' || want === 'rider') {
      const existing = await lookupPhone(phone, want);
      if (existing) {
        API.setPendingShop(null);
        API.setPendingRider(null);
        clearVerified(want);
        return enterAccount(want, phone);
      }
      persistVerified({ role: want, phone: phone });
      return { needsRegister: true, phone: phone, role: want };
    }
    return enterAccount(want, phone);
  };

  API.verifiedPhone = function (role) {
    const v = API._verified;
    if (!v || !sameRole(v.role, role)) return '';
    return v.phone || '';
  };

  API.completeShopRegister = async function () {
    const phone = API.verifiedPhone('shop');
    if (!phone) throw new Error('Verify WhatsApp first.');
    const p = pendingShop() || {};
    if (!p.shopName && !p.ownerName) throw new Error('Register your shop first.');
    const user = await enterAccount('shop', phone);
    clearVerified('shop');
    return user;
  };

  API.completeRiderRegister = async function () {
    const phone = API.verifiedPhone('rider');
    if (!phone) throw new Error('Verify WhatsApp first.');
    const p = pendingRider() || {};
    if (isPlaceholderName(p.name)) throw new Error('Register as a rider first.');
    const user = await enterAccount('rider', phone);
    clearVerified('rider');
    return user;
  };

  function sessionKey(role) {
    return 'qb_auth_' + roleTag(role || API.roleHint || 'customer');
  }
  function sessionKeys(role) {
    const tag = roleTag(role || API.roleHint || 'customer');
    const keys = ['qb_auth_' + tag, 'sd_session_' + tag, 'sd_user_' + tag, 'sd_user_' + (role || '')];
    if (tag === 'customer') keys.push('sd_user_user', 'sd_user_customer', 'sd_session_user', 'sd_session_customer', 'qb_auth_user', 'qb_auth_customer');
    const out = [];
    keys.forEach(function (k) { if (k && out.indexOf(k) < 0) out.push(k); });
    return out;
  }
  function verifiedKey(role) {
    return 'sd_verified_' + roleTag(role || API.roleHint || 'customer');
  }
  function persistVerified(v) {
    API._verified = v || null;
    try {
      if (v && v.phone) storeSet(verifiedKey(v.role), JSON.stringify(v));
    } catch (_) {}
  }
  function restoreVerified(role) {
    try {
      const raw = storeGet(verifiedKey(role));
      if (!raw) return;
      const v = JSON.parse(raw);
      if (v && v.phone && sameRole(v.role, role)) API._verified = v;
    } catch (_) {}
  }
  function clearVerified(role) {
    API._verified = null;
    storeDel(verifiedKey(role));
  }
  function cookieName(role) {
    return 'qb_auth_' + roleTag(role || API.roleHint || 'customer');
  }
  function cookieWrite(role, user) {
    try {
      const body = encodeURIComponent(JSON.stringify({
        id: user.id, phone: user.phone, role: user.role, shopId: user.shopId || '', name: user.name || '', token: API.token || '',
      }));
      document.cookie = cookieName(role) + '=' + body + ';path=/;max-age=31536000;SameSite=Lax';
    } catch (_) {}
  }
  function cookieRead(role) {
    try {
      const n = cookieName(role) + '=';
      const parts = String(document.cookie || '').split(';');
      for (let i = 0; i < parts.length; i++) {
        const s = parts[i].trim();
        if (s.indexOf(n) !== 0) continue;
        const u = JSON.parse(decodeURIComponent(s.slice(n.length)));
        if (u && u.id && u.phone) return u;
      }
    } catch (_) {}
    return null;
  }
  function cookieClear(role) {
    try { document.cookie = cookieName(role) + '=;path=/;max-age=0;SameSite=Lax'; } catch (_) {}
  }

  function saveSession() {
    if (!API.user) return;
    try {
      if (sameRole(API.user.role, 'shop')) API.user = attachShopIdentity(API.user);
      const payload = JSON.stringify({ user: API.user, token: API.token || null, ts: Date.now() });
      sessionKeys(API.roleHint || API.user.role).forEach(function (k) { storeSet(k, payload); });
      sessionKeys(API.user.role).forEach(function (k) { storeSet(k, payload); });
      cookieWrite(API.roleHint || API.user.role, API.user);
      cookieWrite(API.user.role, API.user);
      clearVerified(API.user.role);
    } catch (_) {}
  }

  API.logout = function () {
    const role = (API.user && API.user.role) || API.roleHint || 'customer';
    API.user = null;
    API.token = null;
    API.setPendingShop(null);
    API.setPendingRider(null);
    clearVerified(role);
    try {
      sessionKeys(role).forEach(storeDel);
      sessionKeys(API.roleHint).forEach(storeDel);
      cookieClear(role);
      cookieClear(API.roleHint);
    } catch (_) {}
    notify();
  };

  API.restore = function () {
    try {
      const hint = roleTag(API.roleHint || 'customer');
      restoreVerified(hint);
      const keys = sessionKeys(hint);
      let raw = null;
      for (let i = 0; i < keys.length; i++) {
        raw = storeGet(keys[i]);
        if (raw) break;
      }
      if (raw) {
        const data = JSON.parse(raw);
        if (data && data.user) {
          API.user = data.user;
          API.token = data.token || null;
        } else if (data && data.id) {
          API.user = data;
        }
      }
      if (!API.user) {
        const c = cookieRead(hint);
        if (c && sameRole(c.role, hint)) {
          API.user = c;
          API.token = c.token || null;
        }
      }
      if (API.user && !sameRole(API.user.role, hint)) {
        API.user = null;
        API.token = null;
        return;
      }
      if (API.user && isDemoAccount(API.user)) {
        API.user = null;
        API.token = null;
        keys.forEach(storeDel);
        cookieClear(hint);
        return;
      }
      if (API.user && sameRole(API.user.role, 'shop')) API.user = attachShopIdentity(API.user);
      if (API.user) {
        clearVerified(hint);
        saveSession();
      }
    } catch (_) {}
  };

  API.placeOrder = async function (payload) {
    let order = null;
    try {
      order = await getJSON('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (_) {}
    if (!order || !order.id) {
      const shop = shopOf(payload.shopId);
      const lineItems = Array.isArray(payload.items) ? payload.items.map((it) => ({
        id: it.id || null,
        name: String(it.name || 'Item'),
        qty: Number(it.qty || 1),
        price: Number(it.price || 0),
      })) : [];
      const subtotal = lineItems.reduce((s, it) => s + it.price * it.qty, 0);
      const deliveryFee = payload.deliveryFee != null ? Number(payload.deliveryFee) : 200;
      order = {
        id: nextOrderId(),
        userId: payload.userId || (API.user && API.user.id) || '',
        shopId: payload.shopId,
        shopName: shop.name,
        shopEmoji: shop.emoji,
        customerName: payload.customerName || (API.user && API.user.name) || 'Guest',
        customerPhone: payload.customerPhone || (API.user && API.user.phone) || '',
        address: payload.address,
        note: payload.note || '',
        paymentMethod: payload.paymentMethod || 'Cash on delivery',
        riderId: null,
        riderName: null,
        riderPhone: null,
        status: 'pending',
        items: lineItems,
        subtotal: subtotal,
        deliveryFee: deliveryFee,
        totalAmount: subtotal + deliveryFee,
        deliveryLat: Number(payload.deliveryLat != null ? payload.deliveryLat : (window.QB_LIVE && window.QB_LIVE.lat) || 8.335),
        deliveryLng: Number(payload.deliveryLng != null ? payload.deliveryLng : (window.QB_LIVE && window.QB_LIVE.lng) || 80.4108),
        riderLat: null,
        riderLng: null,
        timestamp: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    if (sbConfigured()) {
      try {
        await sbPutRow('orders', orderRow(order));
      } catch (_) {}
      try {
        await sbSend('messages', 'POST', [{
          id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          order_id: order.id,
          sender: 'QuickBite',
          role: 'system',
          body: 'Order placed at ' + (order.shopName || 'shop'),
          ts: Date.now(),
        }]);
      } catch (_) {}
    }
    keepOrder(order);
    if (!API.orders.some((o) => o.id === order.id)) API.orders.unshift(order);
    mergeKept();
    notify(true);
    setTimeout(function () {
      API.refresh().then(function () {
        keepOrder(order);
        if (!API.orders.some((o) => o.id === order.id)) {
          API.orders.unshift(order);
          mergeKept();
          notify(true);
        }
      }).catch(function () {});
    }, 400);
    return order;
  };

  API.patch = async function (id, body) {
    if (API.user && sameRole(API.user.role, 'rider') && (body.status === 'accepted' || body.riderId || body.status === 'picked_up')) {
      if (!API.isRiderRegistered()) throw new Error('Register as a rider first, then accept orders.');
    }
    let order = null;
    try {
      order = await getJSON('/api/orders/' + encodeURIComponent(id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (_) {}
    const cur = order || API.orders.find((o) => o.id === id);
    if (cur && sbConfigured()) {
      const next = Object.assign({}, cur, body);
      if (API.user && API.user.role === 'rider' && (body.status === 'accepted' || body.status === 'picked_up' || body.status === 'on_the_way')) {
        next.riderId = next.riderId || API.user.id;
        next.riderName = next.riderName || API.user.name;
        next.riderPhone = next.riderPhone || API.user.phone;
      }
      if (body.status === 'picked_up' || body.status === 'on_the_way') next.pickedUpAt = next.pickedUpAt || new Date().toISOString();
      if (body.status === 'delivered') next.deliveredAt = new Date().toISOString();
      next.updatedAt = new Date().toISOString();
      await sbSend('orders?id=eq.' + encodeURIComponent(id), 'PATCH', orderRow(next));
      order = next;
    }
    await API.refresh();
    return order;
  };

  API.claimOrder = async function (id) {
    const u = API.user || {};
    return API.patch(id, {
      riderId: u.id,
      riderName: u.name,
      riderPhone: u.phone,
    });
  };

  API.toggleItem = async function (id, isAvailable) {
    try {
      await getJSON('/api/items/' + encodeURIComponent(id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAvailable }),
      });
    } catch (_) {}
    if (sbConfigured()) {
      await sbSend('menu_items?id=eq.' + encodeURIComponent(id), 'PATCH', { is_available: isAvailable });
    }
    const hit = API.items.find((i) => i.id === id);
    if (hit) hit.isAvailable = !!isAvailable;
    notify(true);
    return API.refresh();
  };

  API.saveShop = async function (shop) {
    if (API.user && sameRole(API.user.role, 'shop')) {
      try { API.user = await ensureShopRow(API.user); } catch (_) {}
    }
    const id = shop.id || (API.user && API.user.shopId) || (API.user && API.user.phone ? shopIdFor(API.user.phone) : '');
    if (!id) throw new Error('Missing shop');
    const prev = API.shops.find((s) => s.id === id) || {};
    const row = {
      id,
      name: shop.name || prev.name || 'My Shop',
      category: shop.category || prev.category || 'Bakery',
      rating: prev.rating || 5,
      reviews: prev.reviews || 0,
      is_open: shop.isOpen !== false,
      lat: prev.lat != null ? prev.lat : 8.335,
      lng: prev.lng != null ? prev.lng : 80.4108,
      km: prev.km || 0,
      eta: prev.eta || '20–35 min',
      fee: prev.fee || 200,
      hours: shop.hours || prev.hours || '08:00 AM – 10:00 PM',
      address: shop.address || prev.address || '',
      image: shop.image || prev.image || '/img/shop-bakery.jpg',
      promo: shop.promo || shop.about || prev.promo || '',
    };
    if (sbConfigured()) await sbUpsert('shops', [row]);
    const mapped = mapShop(row);
    const i = API.shops.findIndex((s) => s.id === id);
    if (i >= 0) API.shops[i] = Object.assign({}, API.shops[i], mapped);
    else API.shops.push(mapped);
    if (API.user && sameRole(API.user.role, 'shop')) API.user.shopName = mapped.name;
    notify(true);
    try { await API.refresh(); } catch (_) {}
    return mapped;
  };

  API.saveItem = async function (item) {
    if (!API.user || !sameRole(API.user.role, 'shop')) {
      throw new Error('Register as a shop owner first, then add items.');
    }
    try {
      API.user = await ensureShopRow(API.user, { required: true });
      saveSession();
    } catch (e) {
      throw new Error('Register your shop first, then add items.');
    }
    if (!API.isShopRegistered()) throw new Error('Register your shop first, then add items.');
    let sid = item.shopId || item.shop_id || (API.user && API.user.shopId) || '';
    if (!sid || isDemoShop(sid)) {
      sid = (API.user && API.user.phone && shopIdFor(API.user.phone)) || '';
    }
    if (!sid) throw new Error('Shop is not in the database. Register the shop, then add items.');
    if (!String(item.name || '').trim()) throw new Error('Enter an item name.');
    const id = item.id || ('ITM_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
    const row = {
      id,
      shop_id: sid,
      name: String(item.name).trim(),
      category: item.category || 'Food',
      price: Number(item.price || 0),
      is_available: item.isAvailable !== false,
      description: item.desc || item.description || '',
      image: item.image || '/img/shop-bakery.jpg',
    };
    let mapped = mapItem(row);
    if (sbConfigured()) {
      await sbPutRow('menu_items', row);
      try {
        const check = await sbGet('menu_items?id=eq.' + encodeURIComponent(id) + '&select=*');
        if (check && check[0]) mapped = mapItem(check[0]);
        else throw new Error('missing');
      } catch (e) {
        throw new Error('Item did not save to the database. Try again.');
      }
    }
    const i = API.items.findIndex((x) => x.id === id);
    if (i >= 0) API.items[i] = mapped;
    else API.items.push(mapped);
    notify(true);
    try { await API.refresh(); } catch (_) {}
    if (!API.items.some((x) => x.id === id)) API.items.push(mapped);
    notify(true);
    return mapped;
  };

  function chatReadKey(orderId, role) {
    return 'qb_chat_read_' + String(role || '') + '_' + String(orderId || '');
  }
  function normChatRole(role) {
    return role === 'user' ? 'customer' : role;
  }
  function orderHasRider(o) {
    return !!(o && ((o.riderId && String(o.riderId) !== 'null') || o.riderName));
  }
  function orderPicked(o) {
    return !!(o && (o.status === 'picked_up' || o.status === 'on_the_way' || o.status === 'delivered'));
  }
  API.chatLane = function (order) {
    if (!order || order.status === 'cancelled') return null;
    if (orderPicked(order)) return 'customer';
    if (orderHasRider(order) || order.status === 'accepted') return 'shop';
    return null;
  };
  API.canChat = function (order, role) {
    const lane = API.chatLane(order);
    if (!lane) return false;
    const r = normChatRole(role);
    if (r === 'rider') return true;
    if (r === 'shop') return lane === 'shop';
    if (r === 'customer') return lane === 'customer';
    return false;
  };
  API.messageThread = function (m, order) {
    if (!m) return 'system';
    if (m.thread === 'shop' || m.thread === 'customer') return m.thread;
    const id = String(m.id || '');
    if (id.indexOf('qbS.') === 0) return 'shop';
    if (id.indexOf('qbC.') === 0) return 'customer';
    if (m.role === 'shop') return 'shop';
    if (m.role === 'customer' || m.role === 'user') return 'customer';
    if (m.role === 'system') return 'system';
    const pickedAt = order && (order.pickedUpAt || order.picked_up_at);
    if (pickedAt && m.ts) {
      const t = new Date(pickedAt).getTime();
      if (!isNaN(t)) return Number(m.ts) >= t ? 'customer' : 'shop';
    }
    return API.chatLane(order) || 'shop';
  };
  API.chatMessages = function (orderId, role) {
    const order = (API.orders || []).find((o) => o.id === orderId);
    const msgs = (API.messages || {})[orderId] || [];
    const r = normChatRole(role);
    const want = r === 'shop' ? 'shop' : r === 'customer' ? 'customer' : (API.chatLane(order) || 'shop');
    return msgs.filter((m) => {
      if (!m) return false;
      if (m.role === 'system') {
        const th = API.messageThread(m, order);
        if (th === 'system') return true;
        return th === want;
      }
      return API.messageThread(m, order) === want;
    });
  };
  API.chatPeerName = function (order, role) {
    if (!order) return 'Chat';
    const r = normChatRole(role);
    if (r === 'shop') return order.riderName || 'Rider';
    if (r === 'customer') return order.riderName || 'Courier';
    const lane = API.chatLane(order);
    if (lane === 'shop') {
      const shop = API.shopOf ? API.shopOf(order.shopId) : {};
      return order.shopName || shop.name || 'Shop';
    }
    return order.customerName || 'Customer';
  };
  API.unreadCount = function (orderId, myRole) {
    const order = (API.orders || []).find((o) => o.id === orderId);
    const r = normChatRole(myRole);
    if ((r === 'customer' || r === 'shop') && !API.canChat(order, r)) return 0;
    const msgs = API.chatMessages(orderId, r);
    let readAt = 0;
    try { readAt = Number(localStorage.getItem(chatReadKey(orderId, r)) || 0); } catch (_) {}
    let n = 0;
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i];
      if (!m || m.role === r || m.role === 'system') continue;
      if (Number(m.ts || 0) > readAt) n++;
    }
    return n;
  };
  API.markChatRead = function (orderId, myRole) {
    try { localStorage.setItem(chatReadKey(orderId, normChatRole(myRole)), String(Date.now())); } catch (_) {}
  };
  API.quickReplies = function (role, order) {
    const r = normChatRole(role);
    const lane = order ? API.chatLane(order) : null;
    if (r === 'shop') return ['Food is ready', 'Come to the counter', 'Park in front'];
    if (r === 'rider' && lane === 'shop') return ["On my way to the shop", "I've arrived at the shop", 'Which entrance?'];
    if (r === 'rider') return ["I'm on my way", "I've arrived", "I'm downstairs", 'Please come to the gate'];
    return ['Where are you?', "I'm at the gate", 'Please call me', 'Leave at the door', 'Thank you'];
  };

  API.sendMessage = async function (orderId, from, role, text) {
    const body = String(text || '').trim();
    if (!body) return null;
    const r = normChatRole(role);
    const order = (API.orders || []).find((o) => o.id === orderId);
    if (r !== 'system' && !API.canChat(order, r)) {
      const err = r === 'customer'
        ? 'Chat opens after the rider picks up your order.'
        : r === 'shop'
          ? 'Chat with the rider is open until pickup.'
          : 'Chat is not available for this order.';
      throw new Error(err);
    }
    const lane = r === 'system' ? null : API.chatLane(order);
    const prefix = lane === 'shop' ? 'qbS.' : lane === 'customer' ? 'qbC.' : 'm';
    const msg = {
      id: prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      from: from,
      role: r === 'system' ? 'system' : r,
      text: body,
      ts: Date.now(),
      thread: lane || undefined,
    };
    const list = API.messages[orderId] || (API.messages[orderId] = []);
    list.push(msg);
    notify(true);
    try {
      await getJSON('/api/orders/' + encodeURIComponent(orderId) + '/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, role: msg.role, text: body, thread: msg.thread }),
      });
    } catch (_) {}
    if (sbConfigured()) {
      try {
        await sbSend('messages', 'POST', [{
          id: msg.id,
          order_id: orderId,
          sender: from,
          role: msg.role,
          body: body,
          ts: msg.ts,
        }]);
      } catch (_) {}
    }
    try { await API.refresh(); } catch (_) {}
    const after = API.messages[orderId] || (API.messages[orderId] = []);
    if (!after.some((x) => x.id === msg.id || (x.text === msg.text && x.role === msg.role))) {
      after.push(msg);
      notify(true);
    }
    return msg;
  };

  API.reset = function () {
    return getJSON('/api/reset', { method: 'POST' }).then(() => API.refresh());
  };

  API.shopOf = shopOf;

  API.statusLabel = function (s) {
    return (
      {
        pending: 'Pending',
        preparing: 'Preparing',
        ready: 'Ready for pickup',
        accepted: 'Rider accepted',
        picked_up: 'Picked up',
        on_the_way: 'Picked up',
        delivered: 'Delivered',
        cancelled: 'Cancelled',
      }[s] || s
    );
  };

  API.rs = function (n) {
    return 'Rs. ' + Math.round(Number(n) || 0).toLocaleString('en-LK');
  };

  try {
    if (!API.base) throw new Error('no stream');
    const es = new EventSource(url('/api/stream'));
    es.onmessage = (ev) => {
      if (sbConfigured()) {
        API.refresh().catch(() => {});
        return;
      }
      const data = JSON.parse(ev.data);
      if (data.type === 'state') {
        API.shops = data.shops;
        API.items = data.items;
        API.orders = data.orders;
        API.messages = data.messages || {};
        scopeData();
        notify();
      }
    };
  } catch (_) {}

  API.restore();
  try {
    const w = new URLSearchParams(location.search || '').get('wipe');
    if (w && /^(all|\*|reset)$/i.test(String(w).trim())) {
      clearAllLocalAuth();
    } else if (w) dropLocalShop(w);
  } catch (_) {}
  if (API.user) notify(true);
  API.refresh().catch(() => {});
  setInterval(() => {
    if (sbConfigured()) API.refresh().catch(() => {});
  }, 2500);
  global.API = API;
})(window);
