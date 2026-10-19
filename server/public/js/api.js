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

  function finiteNum(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  const STATUS_RANK = {
    cancelled: 0,
    pending: 1,
    preparing: 2,
    ready: 3,
    accepted: 4,
    picked_up: 5,
    on_the_way: 5,
    delivered: 6,
  };
  function statusRank(s) {
    return STATUS_RANK[s] || 0;
  }
  function mergeStatus(a, b) {
    if (a === 'delivered' || b === 'delivered') return 'delivered';
    if (a === 'cancelled' && statusRank(b) < 1) return 'cancelled';
    if (b === 'cancelled' && statusRank(a) < 1) return 'cancelled';
    if (a === 'cancelled') return b || a;
    if (b === 'cancelled') return a || b;
    if (statusRank(b) > statusRank(a)) return b || a || 'pending';
    return a || b || 'pending';
  }
  function locOnlyBody(body) {
    if (!body || typeof body !== 'object') return false;
    const keys = Object.keys(body).filter((k) => body[k] != null);
    return keys.length > 0 && keys.every((k) => k === 'riderLat' || k === 'riderLng');
  }
  function shopOf(id) {
    const hit = API.shops.find((s) => s.id === id);
    if (hit) return hit;
    return { id: id || '', name: 'Shop', emoji: '🏪', eta: '20 min' };
  }

  let _fp = null;
  function fingerprint() {
    const orders = (API.orders || []).map((o) =>
      [o.id, o.status, o.riderName || '', o.riderLat, o.riderLng, o.paymentStatus || '', o.paid ? '1' : '0'].join(':')
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
      lat: finiteNum(r.lat) != null ? finiteNum(r.lat) : undefined,
      lng: finiteNum(r.lng) != null ? finiteNum(r.lng) : undefined,
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

  function asRows(v) {
    if (Array.isArray(v)) return v;
    if (!v || typeof v !== 'object') return [];
    if (Array.isArray(v.data)) return v.data;
    if (Array.isArray(v.accounts)) return v.accounts;
    if (Array.isArray(v.shops)) return v.shops;
    if (Array.isArray(v.items)) return v.items;
    if (Array.isArray(v.orders)) return v.orders;
    if (Array.isArray(v.messages)) return v.messages;
    return [];
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
    let parsed = [];
    try { parsed = text ? JSON.parse(text) : []; } catch (_) { parsed = []; }
    return asRows(parsed);
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

  function isHttpUrl(v) {
    return /^https?:\/\//i.test(String(v || ''));
  }
  function accountPhoto(r) {
    if (!r) return '';
    const cands = [r.photo, r.picture, r.image, r.avatar];
    if (isHttpUrl(r.vehicle) && sameRole(r.role, 'customer')) cands.push(r.vehicle);
    for (let i = 0; i < cands.length; i++) {
      if (isHttpUrl(cands[i])) return String(cands[i]);
    }
    return '';
  }
  function mapAccount(r) {
    const a = { id: r.id, name: r.name, phone: r.phone, email: r.email, role: r.role, address: r.address };
    if (r.pin != null) a.pin = r.pin;
    if (r.shop_id || r.shopId) a.shopId = r.shop_id || r.shopId;
    if (r.shopName || r.shop_name) a.shopName = r.shopName || r.shop_name;
    const photo = accountPhoto(r);
    if (photo) a.photo = photo;
    if (r.vehicle && !isHttpUrl(r.vehicle)) a.vehicle = r.vehicle;
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
    o.customerEmail = String(d.customerEmail || d.email || r.customer_email || '').trim().toLowerCase();
    o.address = d.address || r.address || '';
    o.status = mergeStatus(r.status, d.status);
    o.items = d.items || o.items || [];
    o.totalAmount = Number(d.totalAmount != null ? d.totalAmount : r.total_amount) || 0;
    o.deliveryLat = Number(d.deliveryLat != null ? d.deliveryLat : o.deliveryLat);
    o.deliveryLng = Number(d.deliveryLng != null ? d.deliveryLng : o.deliveryLng);
    o.riderId = d.riderId || o.riderId || null;
    o.riderName = d.riderName || o.riderName || null;
    o.riderPhone = d.riderPhone || o.riderPhone || null;
    o.riderLat = d.riderLat != null ? d.riderLat : o.riderLat;
    o.riderLng = d.riderLng != null ? d.riderLng : o.riderLng;
    o.shopLat = finiteNum(d.shopLat != null ? d.shopLat : o.shopLat);
    o.shopLng = finiteNum(d.shopLng != null ? d.shopLng : o.shopLng);
    o.shopAddress = d.shopAddress || o.shopAddress || o.shop_address || '';
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
      try { rows = await sbGet('accounts?select=*'); } catch (_) { rows = []; }
    } else {
      try { rows = asRows(await getJSON('/api/accounts')); } catch (_) { rows = []; }
    }
    API._accs = asRows(rows).map(function (r) { return mapAccount(r); }).filter(function (a) { return a && a.id && !isDemoAccount(a); });
    API._accsAt = Date.now();
    return API._accs;
  }
  function isPlaceholderPhone(phone) {
    const p = normalizePhone(phone);
    if (!p) return true;
    if (/^07\d{8}$/.test(p)) return false;
    return /^99\d{8}$/.test(p) || /^98\d{8}$/.test(p);
  }
  function mineOrder(o, me) {
    if (!o || !me) return false;
    if (sameRole(me.role, 'customer')) {
      const email = String(me.email || '').trim().toLowerCase();
      const oEmail = String(o.customerEmail || o.customer_email || '').trim().toLowerCase();
      const wa = typeof API.isWhatsAppVerified === 'function' ? API.isWhatsAppVerified(me) : /^07\d{8}$/.test(normalizePhone(me.phone));
      if (!wa) {
        if (email && oEmail && email === oEmail) return true;
        if (o.userId && me.id && String(o.userId) === String(me.id)) return true;
        if (o.user_id && me.id && String(o.user_id) === String(me.id)) return true;
        return false;
      }
      if (o.userId && me.id && String(o.userId) === String(me.id)) return true;
      if (o.user_id && me.id && String(o.user_id) === String(me.id)) return true;
      const p = normalizePhone(o.customerPhone || o.customer_phone || '');
      const mine = normalizePhone(me.phone);
      if (p && mine && !isPlaceholderPhone(mine) && (p === mine || phoneKey(p) === phoneKey(mine))) return true;
      return false;
    }
    if (sameRole(me.role, 'shop')) {
      const sid = me.shopId || me.shop_id || (me.phone && shopIdFor(me.phone)) || '';
      return !!(sid && String(o.shopId || o.shop_id || '') === String(sid));
    }
    if (sameRole(me.role, 'rider')) {
      if (me.id && (o.riderId === me.id || o.rider_id === me.id)) return true;
      const rp = normalizePhone(o.riderPhone || o.rider_phone || '');
      const mine = normalizePhone(me.phone);
      if (rp && mine && (rp === mine || phoneKey(rp) === phoneKey(mine))) return true;
      if (o.status === 'ready' && !o.riderId && !o.rider_id) return true;
      return false;
    }
    return false;
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
      API.messages = {};
      return;
    }
    if (sameRole(me.role, 'shop')) {
      const sid = me.shopId || me.shop_id || (me.phone && shopIdFor(me.phone)) || '';
      API.shops = API.shops.filter((s) => s.id === sid);
      API.items = API.items.filter((it) => it.shopId === sid);
    }
    API.orders = API.orders.filter((o) => mineOrder(o, me));
    mergeKept();
    const allow = {};
    (API.orders || []).forEach(function (o) { if (o && o.id) allow[o.id] = 1; });
    const msgs = API.messages || {};
    const nextMsgs = {};
    Object.keys(msgs).forEach(function (k) { if (allow[k]) nextMsgs[k] = msgs[k]; });
    API.messages = nextMsgs;
  }
  const keptOrders = [];
  function keptStorageKey() {
    const u = API.user || {};
    const email = String(u.email || '').trim().toLowerCase();
    if (email) return 'qb_kept_orders_e_' + email;
    if (u.id) return 'qb_kept_orders_' + u.id;
    return 'qb_kept_orders_' + phoneKey(u.phone || '');
  }
  function resetKept() {
    keptOrders.length = 0;
  }
  function persistKept() {
    try { localStorage.setItem(keptStorageKey(), JSON.stringify(keptOrders.slice(0, 40))); } catch (_) {}
  }
  function keepOrder(o) {
    if (!o || !o.id) return o;
    if (API.user && !mineOrder(o, API.user)) return o;
    const i = keptOrders.findIndex((x) => x.id === o.id);
    if (i >= 0) {
      const prev = keptOrders[i];
      const next = Object.assign({}, prev, o);
      next.status = mergeStatus(prev.status, o.status);
      keptOrders[i] = next;
    } else keptOrders.unshift(o);
    persistKept();
    return o;
  }
  function applyLocalOrder(id, body) {
    if (!id || !body) return null;
    const i = API.orders.findIndex((o) => o.id === id);
    if (i < 0) {
      if (!body.status && !body.riderId) return null;
      const next = Object.assign({ id: id }, body);
      next.status = mergeStatus(null, body.status);
      next.updatedAt = new Date().toISOString();
      API.orders.unshift(next);
      keepOrder(next);
      return next;
    }
    const prev = API.orders[i];
    const next = Object.assign({}, prev, body);
    next.id = id;
    next.status = body.status ? mergeStatus(prev.status, body.status) : prev.status;
    if (prev.status === 'delivered' && body.status !== 'cancelled') next.status = 'delivered';
    if (body.status === 'picked_up' || body.status === 'on_the_way') next.pickedUpAt = next.pickedUpAt || new Date().toISOString();
    if (body.status === 'delivered') {
      next.deliveredAt = next.deliveredAt || new Date().toISOString();
      if (next.paid && next.paymentStatus === 'captured' && !next.riderPaidAt) next.riderPaidAt = next.deliveredAt;
    }
    next.updatedAt = new Date().toISOString();
    if (next.status === 'cancelled' && next.paid && next.paymentStatus === 'captured') {
      next.paymentStatus = 'refunded';
      next.refundedAt = next.updatedAt;
    }
    API.orders[i] = next;
    keepOrder(next);
    return next;
  }
  function loadKept() {
    resetKept();
    try {
      const arr = JSON.parse(localStorage.getItem(keptStorageKey()) || '[]');
      if (!Array.isArray(arr)) return;
      arr.forEach((o) => {
        if (!o || !o.id) return;
        if (API.user && !mineOrder(o, API.user)) return;
        const i = keptOrders.findIndex((x) => x.id === o.id);
        if (i < 0) keptOrders.push(o);
        else {
          const status = mergeStatus(keptOrders[i].status, o.status);
          keptOrders[i] = Object.assign({}, keptOrders[i], o, { status: status });
        }
      });
    } catch (_) {}
  }
  function mergeKept() {
    if (!API.user) return;
    loadKept();
    keptOrders.forEach((o, idx) => {
      if (!o || !o.id) return;
      if (!mineOrder(o, API.user)) return;
      const i = API.orders.findIndex((x) => x.id === o.id);
      if (i < 0) {
        API.orders.unshift(o);
        return;
      }
      const cur = API.orders[i];
      const status = mergeStatus(cur.status, o.status);
      if (status !== cur.status) API.orders[i] = Object.assign({}, cur, { status: status });
      if (statusRank(API.orders[i].status) >= statusRank(o.status)) keptOrders[idx] = Object.assign({}, o, API.orders[i]);
    });
    persistKept();
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
    const rec = (user.phone && API.recallShopProfile(user.phone)) || {};
    const p = pendingShop() || {};
    const pinLat = finiteNum(p.lat != null ? p.lat : rec.lat);
    const pinLng = finiteNum(p.lng != null ? p.lng : rec.lng);
    const pinAddr = String(p.address || rec.address || '').trim();
    if (!shop) {
      const name = String(p.shopName || rec.shopName || '').trim();
      if (!name) {
        if (opts && opts.required) throw new Error('Register your shop first.');
        return user;
      }
      if (pinLat == null || pinLng == null) {
        if (opts && opts.required) throw new Error('Pin your shop on the map.');
        return user;
      }
      shop = {
        id: sid,
        name: name,
        category: 'Bakery',
        rating: 5,
        reviews: 0,
        is_open: true,
        lat: pinLat,
        lng: pinLng,
        km: 0,
        eta: '20–35 min',
        fee: 200,
        hours: '08:00 AM – 10:00 PM',
        address: pinAddr,
        image: '/img/shop-bakery.jpg',
        promo: rec.promo || '',
      };
      if (sbConfigured()) await sbUpsert('shops', [shop]);
    } else if (pinLat != null && pinLng != null && (finiteNum(shop.lat) == null || pinAddr)) {
      shop.lat = pinLat;
      shop.lng = pinLng;
      if (pinAddr) shop.address = pinAddr;
      if (p.shopName) shop.name = p.shopName;
      try { await sbUpsert('shops', [shop]); } catch (_) {}
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
        asRows(await sbGet('accounts?id=eq.' + encodeURIComponent(id) + '&select=*')).forEach(add);
      } catch (_) {}
      for (let i = 0; i < variants.length; i++) {
        try {
          asRows(await sbGet('accounts?phone=eq.' + encodeURIComponent(variants[i]) + '&select=*')).forEach(add);
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

  async function hydrateUser() {
    const u = API.user;
    if (!u || !u.id || !sbConfigured()) return;
    try {
      const rows = asRows(await sbGet('accounts?id=eq.' + encodeURIComponent(u.id) + '&select=*'));
      if (rows[0] && !isDemoAccount(rows[0])) {
        const mapped = mapAccount(rows[0]);
        const photo = mapped.photo || u.photo || '';
        const name = mapped.name || u.name || '';
        const email = mapped.email || u.email || '';
        API.user = Object.assign({}, u, mapped);
        if (photo) API.user.photo = photo;
        if (name) API.user.name = name;
        if (email) API.user.email = email;
        if (sameRole(API.user.role, 'shop')) API.user = attachShopIdentity(API.user);
      }
    } catch (_) {}
  }

  async function fetchMyOrderRows() {
    const me = API.user;
    if (!me) return [];
    const tries = [];
    if (sameRole(me.role, 'customer')) {
      const wa = API.isWhatsAppVerified(me);
      if (me.id) tries.push('orders?user_id=eq.' + encodeURIComponent(me.id) + '&select=*');
      if (!wa && me.email) {
        tries.push('orders?data->>customerEmail=eq.' + encodeURIComponent(String(me.email).toLowerCase()) + '&select=*');
      }
      if (wa) {
        const parts = [];
        if (me.id) parts.push('user_id.eq.' + me.id);
        phoneVariants(me.phone).forEach(function (p) {
          if (!isPlaceholderPhone(p)) parts.push('customer_phone.eq.' + p);
        });
        if (parts.length) tries.push('orders?or=(' + parts.join(',') + ')&select=*');
      }
    } else if (sameRole(me.role, 'shop')) {
      const sid = me.shopId || me.shop_id || shopIdFor(me.phone);
      if (sid) tries.push('orders?shop_id=eq.' + encodeURIComponent(sid) + '&select=*');
    } else if (sameRole(me.role, 'rider')) {
      const parts = ['and(status.eq.ready,rider_id.is.null)', 'status.eq.ready'];
      if (me.id) {
        parts.push('rider_id.eq.' + me.id);
        parts.push('data->>riderId.eq.' + me.id);
      }
      phoneVariants(me.phone).forEach(function (p) {
        parts.push('rider_phone.eq.' + p);
        parts.push('data->>riderPhone.eq.' + p);
      });
      tries.push('orders?or=(' + parts.join(',') + ')&select=*');
    }
    const seen = {};
    const out = [];
    let ok = false;
    for (let i = 0; i < tries.length; i++) {
      try {
        asRows(await sbGet(tries[i])).forEach(function (r) {
          if (r && r.id && !seen[r.id]) { seen[r.id] = 1; out.push(r); }
        });
        ok = true;
      } catch (_) {}
    }
    if (ok) return out;
    try { return asRows(await sbGet('orders?select=*')); } catch (_) { return []; }
  }

  async function pullSupabase() {
    await wipeTestNumber();
    await wipeDemo();
    await hydrateUser();
    if (API.user && sameRole(API.user.role, 'shop')) {
      try { API.user = await ensureShopRow(API.user); } catch (_) {}
    }
    if (API.user) saveSession();
    const me = API.user;
    let shopQ = 'shops?select=*&order=id.asc';
    let itemQ = 'menu_items?select=*&order=id.asc';
    if (me && sameRole(me.role, 'shop')) {
      const sid = me.shopId || me.shop_id || shopIdFor(me.phone);
      if (sid) {
        shopQ = 'shops?id=eq.' + encodeURIComponent(sid) + '&select=*';
        itemQ = 'menu_items?shop_id=eq.' + encodeURIComponent(sid) + '&select=*';
      }
    }
    const [shopRows, itemRows, orderRows] = await Promise.all([
      sbGet(shopQ),
      sbGet(itemQ),
      fetchMyOrderRows(),
    ]);
    const prevById = {};
    (API.orders || []).forEach((o) => { if (o && o.id) prevById[o.id] = o; });
    API.shops = asRows(shopRows).map(mapShop);
    API.items = asRows(itemRows).map(mapItem);
    API.orders = asRows(orderRows).map(mapOrder).map((o) => {
      const p = prevById[o.id];
      if (p) o.status = mergeStatus(p.status, o.status);
      return o;
    });
    scopeData();
    API.messages = {};
    const ids = (API.orders || []).map(function (o) { return o && o.id; }).filter(Boolean);
    if (ids.length) {
      try {
        const inList = ids.map(function (id) { return '"' + String(id).replace(/"/g, '') + '"'; }).join(',');
        const msgRows = asRows(await sbGet('messages?order_id=in.(' + inList + ')&select=*'));
        for (const m of msgRows) {
          const list = API.messages[m.order_id] || (API.messages[m.order_id] = []);
          list.push({ id: m.id, from: m.sender, role: m.role, text: m.body, ts: m.ts, thread: m.thread });
        }
      } catch (_) {}
    }
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
    API.shops = asRows(data && data.shops);
    API.items = asRows(data && data.items);
    API.orders = asRows(data && data.orders);
    API.messages = (data && data.messages && typeof data.messages === 'object' && !Array.isArray(data.messages)) ? data.messages : {};
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
        const rows = asRows(await sbGet(q));
        const picked = rows.find((a) => !isDemoAccount(a) && String(a.pin) === String(pin))
          || rows.find((a) => !isDemoAccount(a));
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
    const email = String(payload.email || '').trim().toLowerCase();
    const password = String(payload.password || '');
    if (email.includes('@') && password.length >= 4) {
      return API.signUpPassword({ name: payload.name, email: email, password: password });
    }
    if (!phone) throw new Error('Enter your WhatsApp number, or sign up with email and password.');
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
      const rec = API.recallShopProfile(phone) || {};
      if (!p.shopName && !p.ownerName && !rec.shopName) {
        throw new Error('Register your shop first.');
      }
      const shopId = shopIdFor(phone);
      const lat = finiteNum(p.lat != null ? p.lat : rec.lat);
      const lng = finiteNum(p.lng != null ? p.lng : rec.lng);
      const address = String(p.address || rec.address || '').trim();
      if (lat == null || lng == null) throw new Error('Pin your shop on the map.');
      if (!address) throw new Error('Enter the shop address.');
      let shop = null;
      try {
        const existing = await sbGet('shops?id=eq.' + encodeURIComponent(shopId) + '&select=*');
        if (existing && existing[0]) shop = existing[0];
      } catch (_) {}
      shop = Object.assign({}, shop || {}, {
        id: shopId,
        name: p.shopName || rec.shopName || (shop && shop.name) || 'New Shop',
        category: (shop && shop.category) || 'Bakery',
        rating: (shop && shop.rating) || 5,
        reviews: (shop && shop.reviews) || 0,
        is_open: true,
        lat: lat,
        lng: lng,
        km: 0,
        eta: '20–35 min',
        fee: 200,
        hours: (shop && shop.hours) || '08:00 AM – 10:00 PM',
        address: address,
        image: (shop && shop.image) || '/img/shop-bakery.jpg',
        promo: (shop && (shop.promo || shop.about)) || 'Freshly baked cakes, pastries and desserts made with love. We use the best ingredients to bring happiness to your table.',
      });
      try { await sbUpsert('shops', [shop]); } catch (_) {
        try { await sbPutRow('shops', shop); } catch (_) {}
      }
      row = {
        id: accountIdFor(phone, 'shop'),
        name: p.ownerName || rec.ownerName || 'Shop Owner',
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
      try {
        const mapped = mapShop(shop);
        const i = API.shops.findIndex((s) => s.id === shopId);
        if (i >= 0) API.shops[i] = Object.assign({}, API.shops[i], mapped);
        else API.shops.push(mapped);
      } catch (_) {}
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
    const mapped = mapAccount(row);
    if (!API.user || API.user.id !== mapped.id) {
      resetKept();
      API.orders = [];
      API.messages = {};
    }
    API.user = mapped;
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
    if (want === 'customer' && API.user && sameRole(API.user.role, 'customer')) {
      return API.attachWhatsApp(phone);
    }
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

  function emailKey(email) {
    const s = String(email || '').trim().toLowerCase();
    let n = 0;
    for (let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) >>> 0;
    return n.toString(36);
  }
  function accountIdForEmail(email, role) {
    return 'ACC_' + roleTag(role) + '_e_' + emailKey(email);
  }
  function googlePhone(sub, email) {
    const seed = String(sub || '') + '|' + String(email || '').toLowerCase();
    let d = String(sub || '').replace(/\D/g, '');
    if (!d) {
      let n = 0;
      for (let i = 0; i < seed.length; i++) n = (n * 31 + seed.charCodeAt(i)) >>> 0;
      d = String(n);
    }
    d = (d + '00000000').slice(-8);
    return '99' + d;
  }
  function googleProfile(raw) {
    raw = raw || {};
    const email = String(raw.email || raw.emailAddress || '').trim().toLowerCase();
    const name = String(raw.name || [raw.given_name, raw.family_name].filter(Boolean).join(' ') || raw.given_name || '').trim();
    const sub = String(raw.sub || raw.id || raw.user_id || '').trim();
    const photo = String(raw.picture || raw.photo || raw.photoURL || raw.avatar || '').trim();
    return { email: email, name: name, sub: sub, photo: isHttpUrl(photo) ? photo : '' };
  }

  async function lookupEmail(email, role) {
    email = String(email || '').trim().toLowerCase();
    if (!email || email.indexOf('@') < 0) return null;
    const want = roleTag(role || 'customer');
    if (sbConfigured()) {
      try {
        const rows = asRows(await sbGet('accounts?email=ilike.' + encodeURIComponent(email) + '&role=eq.' + encodeURIComponent(want) + '&select=*'));
        for (let i = 0; i < rows.length; i++) {
          const a = mapAccount(rows[i]);
          if (a && !isDemoAccount(a) && String(a.email || '').toLowerCase() === email) return a;
        }
      } catch (_) {}
    }
    const list = await allAccounts();
    return list.find(function (a) {
      return String(a.email || '').toLowerCase() === email && sameRole(a.role, want) && !isDemoAccount(a);
    }) || null;
  }

  function parseJwt(tok) {
    const parts = String(tok || '').split('.');
    if (parts.length < 2) return {};
    const p = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = p + '==='.slice((p.length + 3) % 4);
    try {
      return JSON.parse(atob(pad));
    } catch (_) {
      return {};
    }
  }

  API.parseGoogleJwt = parseJwt;

  API.signInGoogle = async function (profile) {
    const g = googleProfile(profile);
    const email = g.email;
    const name = g.name || (email.split('@')[0] || 'Google user');
    if (!email.includes('@')) throw new Error('Google did not share an email for this account.');
    const role = 'customer';
    let row = await lookupEmail(email, role);
    if (!row && g.sub) {
      const byPhone = await lookupPhone(googlePhone(g.sub, email), role);
      if (byPhone && String(byPhone.email || '').toLowerCase() === email) row = byPhone;
    }
    const photo = g.photo || (row && row.photo) || '';
    if (!row) {
      row = await saveAccount({
        id: accountIdForEmail(email, role),
        name: name,
        phone: googlePhone(g.sub, email),
        email: email,
        pin: 'google',
        role: role,
        address: 'Sri Lanka',
        vehicle: photo || null,
      });
    } else {
      const patch = { email: email };
      if (name) patch.name = name;
      if (photo) patch.vehicle = photo;
      try { await sbSend('accounts?id=eq.' + encodeURIComponent(row.id), 'PATCH', patch); } catch (_) {}
      Object.assign(row, patch);
    }
    row.photo = photo || row.photo;
    row.name = name || row.name;
    row.email = email;
    return enterMapped(row);
  };

  function withWaPin(pin) {
    const s = String(pin || 'otp');
    if (s === 'otp' || s === 'wa' || /\|wa$/.test(s)) return s;
    return s + '|wa';
  }

  function passwordPhone(email) {
    let d = String(email || '').replace(/\D/g, '');
    if (!d) {
      let n = 0;
      const s = String(email || '');
      for (let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) >>> 0;
      d = String(n);
    }
    d = (d + '00000000').slice(-8);
    return '98' + d;
  }

  function pinSecret(pin) {
    let s = String(pin || '').replace(/\|wa$/, '');
    if (s.indexOf('p:') === 0) return s.slice(2);
    return s;
  }

  API.isWhatsAppVerified = function (user) {
    const u = user || API.user;
    if (!u) return false;
    const pin = String(u.pin || '');
    if (pin === 'otp' || pin === 'wa' || /\|wa$/.test(pin)) return true;
    return /^07\d{8}$/.test(normalizePhone(u.phone));
  };

  function enterMapped(row) {
    const next = mapAccount(row);
    if (row && row.pin != null) next.pin = row.pin;
    if (row && row.photo) next.photo = row.photo;
    if (row && row.email) next.email = row.email;
    if (row && row.name) next.name = row.name;
    if (!API.user || API.user.id !== next.id) {
      resetKept();
      API.orders = [];
      API.messages = {};
    }
    API.user = next;
    API.token = 'sb_' + row.id;
    saveSession();
    notify(true);
    return API.user;
  }

  API.signInPassword = async function (email, password) {
    email = String(email || '').trim().toLowerCase();
    password = String(password || '');
    if (!email.includes('@')) throw new Error('Enter your email address.');
    if (password.length < 4) throw new Error('Enter your password.');
    const row = await lookupEmail(email, 'customer');
    if (!row) throw new Error('No User account for this email. Sign up, use Google, or sign in with WhatsApp.');
    const secret = pinSecret(row.pin);
    if (secret === 'google') throw new Error('This email uses Google. Tap Continue with Google.');
    if (secret === 'otp' || secret === 'wa' || !secret) {
      throw new Error('This email signed up with WhatsApp. Sign in with your phone number.');
    }
    if (secret !== password) throw new Error('Wrong email or password.');
    return enterMapped(row);
  };

  API.signUpPassword = async function (payload) {
    const email = String((payload && payload.email) || '').trim().toLowerCase();
    const password = String((payload && payload.password) || '');
    const name = String((payload && payload.name) || '').trim() || (email.split('@')[0] || 'User');
    if (!email.includes('@')) throw new Error('Enter your email address.');
    if (password.length < 4) throw new Error('Create a password (at least 4 characters).');
    const existing = await lookupEmail(email, 'customer');
    if (existing) throw new Error('This email already has a User account. Sign in instead.');
    const phone = passwordPhone(email);
    const row = await saveAccount({
      id: accountIdForEmail(email, 'customer'),
      name: name,
      phone: phone,
      email: email,
      pin: 'p:' + password,
      role: 'customer',
      address: 'Sri Lanka',
    });
    enterMapped(row);
    return { ok: true, next: 'app', user: API.user };
  };

  API.attachWhatsApp = async function (phone) {
    phone = normalizePhone(phone);
    if (!/^07\d{8}$/.test(phone)) throw new Error('Enter a valid WhatsApp number');
    const u = API.user;
    if (!u || !sameRole(u.role, 'customer')) throw new Error('Sign in first');
    if (API.isWhatsAppVerified(u) && normalizePhone(u.phone) === phone) return u;
    const taken = await lookupPhone(phone, 'customer');
    if (taken && taken.id !== u.id) {
      const uEmail = String(u.email || '').toLowerCase();
      const tEmail = String(taken.email || '').toLowerCase();
      if (!(uEmail && (!tEmail || tEmail === uEmail))) throw alreadyThisRoleError('customer');
      const patch = { pin: withWaPin(taken.pin || 'otp') };
      if (uEmail && tEmail !== uEmail) patch.email = uEmail;
      if (u.name && (!taken.name || taken.name === 'Guest')) patch.name = u.name;
      try { await sbSend('accounts?id=eq.' + encodeURIComponent(taken.id), 'PATCH', patch); } catch (_) {}
      if (u.id && u.email) {
        try { await sbSend('accounts?id=eq.' + encodeURIComponent(u.id), 'PATCH', { email: null }); } catch (_) {}
      }
      Object.assign(taken, patch);
      return enterMapped(taken);
    }
    const nextPin = withWaPin(u.pin || 'google');
    try {
      await sbSend('accounts?id=eq.' + encodeURIComponent(u.id), 'PATCH', { phone: phone, pin: nextPin });
    } catch (_) {}
    u.phone = phone;
    u.pin = nextPin;
    API.user = u;
    saveSession();
    notify(true);
    return API.user;
  };

  API.googleSignIn = function () {
    return new Promise(function (resolve, reject) {
      const clientId = String(window.QB_GOOGLE_CLIENT_ID || '118084532686-6qb8plju6ed79pt32t9m9av0f4f6nad4.apps.googleusercontent.com').trim();
      if (!clientId) {
        reject(new Error('Google Sign-In is not configured yet. Add a Google Web Client ID for this site.'));
        return;
      }
      function done(profile) {
        const g = googleProfile(profile);
        if (g.email) resolve(Object.assign({}, profile, g));
        else reject(new Error('Google did not share an email for this account.'));
      }
      function fromAccessToken(accessToken) {
        fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: 'Bearer ' + accessToken },
        }).then(function (r) { return r.json(); }).then(done).catch(reject);
      }
      function start() {
        try {
          if (window.google && google.accounts && google.accounts.oauth2) {
            const tc = google.accounts.oauth2.initTokenClient({
              client_id: clientId,
              scope: 'openid email profile',
              callback: function (resp) {
                if (!resp || resp.error) {
                  reject(new Error((resp && (resp.error_description || resp.error)) || 'Google sign-in was cancelled'));
                  return;
                }
                fromAccessToken(resp.access_token);
              },
            });
            tc.requestAccessToken({ prompt: 'select_account' });
            return;
          }
        } catch (e) {
          reject(e);
          return;
        }
        const redirect = location.origin + location.pathname;
        const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirect,
          response_type: 'token',
          scope: 'openid email profile',
          prompt: 'select_account',
          include_granted_scopes: 'true',
        }).toString();
        location.assign(url);
      }
      if (window.google && google.accounts && google.accounts.oauth2) {
        start();
        return;
      }
      const existing = document.querySelector('script[data-gsi]');
      if (existing) {
        existing.addEventListener('load', start);
        existing.addEventListener('error', function () { reject(new Error('Could not load Google Sign-In.')); });
        return;
      }
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.dataset.gsi = '1';
      s.onload = start;
      s.onerror = function () { reject(new Error('Could not load Google Sign-In.')); };
      document.head.appendChild(s);
    });
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
        id: user.id, phone: user.phone, role: user.role, shopId: user.shopId || '', name: user.name || '', email: user.email || '', photo: user.photo || '', token: API.token || '',
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
    API.orders = [];
    API.messages = {};
    resetKept();
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

  function luhnOk(num) {
    const d = String(num || '').replace(/\D/g, '');
    if (d.length < 13 || d.length > 19) return false;
    let s = 0, alt = false;
    for (let i = d.length - 1; i >= 0; i--) {
      let n = d.charCodeAt(i) - 48;
      if (n < 0 || n > 9) return false;
      if (alt) { n *= 2; if (n > 9) n -= 9; }
      s += n; alt = !alt;
    }
    return s % 10 === 0;
  }
  API.isCardMethod = function (m) {
    const s = String(m || '').toLowerCase();
    if (s.indexOf('cash') !== -1) return false;
    return /visa|master|amex|unionpay|jcb|discover|card|••••/.test(s);
  };
  API.shopCreditOf = function (o) {
    if (!o || o.status === 'cancelled' || o.paymentStatus === 'refunded') return 0;
    if (!o.paid && !API.isCardMethod(o.paymentMethod)) return 0;
    if (o.shopCredit != null && o.shopCredit !== '') return Math.max(0, Number(o.shopCredit) || 0);
    const sub = Number(o.subtotal);
    if (sub > 0) return sub;
    const fee = Number(o.deliveryFee) || 0;
    return Math.max(0, (Number(o.totalAmount) || 0) - fee);
  };
  API.riderCreditOf = function (o) {
    if (!o || o.status === 'cancelled' || o.paymentStatus === 'refunded') return 0;
    if (o.riderCredit != null && o.riderCredit !== '') return Math.max(0, Number(o.riderCredit) || 0);
    const fee = Number(o.deliveryFee);
    if (fee > 0) return fee;
    return 0;
  };
  function applyPay(order, pay, method) {
    if (!order || !pay) return order;
    order.paid = true;
    order.paymentStatus = pay.status || 'captured';
    order.paymentId = pay.paymentId;
    order.paidAt = pay.paidAt || new Date().toISOString();
    order.shopCredit = Math.round(Number(pay.shopCredit) || 0);
    order.riderCredit = Math.round(Number(pay.riderCredit) || 0);
    order.paymentBrand = pay.brand || '';
    order.paymentLast4 = pay.last4 || '';
    order.shopPaidAt = order.paidAt;
    if (method) order.paymentMethod = method;
    return order;
  }
  API.chargeCard = async function (input) {
    input = input || {};
    const number = String(input.number || '').replace(/\D/g, '');
    const amount = Math.round(Number(input.amount) || 0);
    if (amount < 1) throw new Error('Invalid payment amount.');
    await new Promise((r) => setTimeout(r, 700));
    if (number === '4000000000000002' || number === '4000000000000341') {
      throw new Error('Card declined. Use another card.');
    }
    if (number && number.length >= 13 && !luhnOk(number)) {
      throw new Error('Card declined.');
    }
    const last4 = String(input.last4 || (number ? number.slice(-4) : '')).replace(/\D/g, '').slice(-4);
    const shopCredit = Math.round(Number(input.shopCredit != null ? input.shopCredit : amount));
    const riderCredit = Math.round(Number(input.riderCredit != null ? input.riderCredit : 0));
    return {
      ok: true,
      paymentId: 'PAY-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase(),
      status: 'captured',
      amount: amount,
      shopCredit: shopCredit,
      riderCredit: riderCredit,
      brand: input.brand || 'Card',
      last4: last4,
      paidAt: new Date().toISOString(),
    };
  };

  API.placeOrder = async function (payload) {
    if (!API.isWhatsAppVerified()) {
      const err = new Error('Verify WhatsApp before placing an order.');
      err.code = 'WHATSAPP_REQUIRED';
      throw err;
    }
    if (API.user) {
      payload = Object.assign({}, payload, {
        customerPhone: API.user.phone || payload.customerPhone,
        customerEmail: API.user.email || payload.customerEmail || '',
        customerName: API.user.name || payload.customerName,
        userId: API.user.id || payload.userId,
      });
    }
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
        customerEmail: payload.customerEmail || (API.user && API.user.email) || '',
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
    if (payload.payment && payload.payment.paymentId) {
      applyPay(order, payload.payment, payload.paymentMethod);
    } else if (API.isCardMethod(payload.paymentMethod) && !order.paid) {
      const sub = Number(order.subtotal) || 0;
      const fee = Number(order.deliveryFee) || 0;
      applyPay(order, {
        paymentId: 'PAY-' + Date.now().toString(36).toUpperCase(),
        status: 'captured',
        shopCredit: sub,
        riderCredit: fee,
        brand: String(payload.paymentMethod || 'Card').split(' ')[0],
        last4: String(payload.paymentMethod || '').replace(/\D/g, '').slice(-4),
        paidAt: new Date().toISOString(),
      }, payload.paymentMethod);
    }
    const shopPin = shopOf(order.shopId);
    const sLat = finiteNum(order.shopLat != null ? order.shopLat : shopPin.lat);
    const sLng = finiteNum(order.shopLng != null ? order.shopLng : shopPin.lng);
    if (sLat != null && sLng != null) {
      order.shopLat = sLat;
      order.shopLng = sLng;
    }
    order.shopAddress = order.shopAddress || shopPin.address || '';
    if (shopPin.name && (!order.shopName || order.shopName === 'Shop')) order.shopName = shopPin.name;
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

  const _patchTail = {};
  const _locPend = {};
  const _locTimer = {};
  function enqueuePatch(id, task) {
    const prev = _patchTail[id] || Promise.resolve();
    const next = prev.then(task, task);
    _patchTail[id] = next.catch(function () {});
    return next;
  }
  async function writePatch(id, body) {
    const local = applyLocalOrder(id, body);
    notify(true);
    if (locOnlyBody(body) && local && (local.status === 'delivered' || local.status === 'cancelled')) return local;
    let order = null;
    try {
      order = await getJSON('/api/orders/' + encodeURIComponent(id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (_) {}
    if (sbConfigured()) {
      const cur = API.orders.find((o) => o.id === id) || order || local;
      if (cur) {
        const next = Object.assign({}, cur, body);
        next.status = mergeStatus(cur.status, body.status);
        if (cur.status === 'delivered' && body.status !== 'cancelled') next.status = 'delivered';
        if (API.user && API.user.role === 'rider' && (body.status === 'accepted' || body.status === 'picked_up' || body.status === 'on_the_way')) {
          next.riderId = next.riderId || API.user.id;
          next.riderName = next.riderName || API.user.name;
          next.riderPhone = next.riderPhone || API.user.phone;
        }
        if (body.status === 'picked_up' || body.status === 'on_the_way') next.pickedUpAt = next.pickedUpAt || new Date().toISOString();
        if (body.status === 'delivered') next.deliveredAt = next.deliveredAt || new Date().toISOString();
        next.updatedAt = new Date().toISOString();
        await sbSend('orders?id=eq.' + encodeURIComponent(id), 'PATCH', orderRow(next));
        applyLocalOrder(id, next);
        order = next;
      }
    }
    if (!locOnlyBody(body)) {
      try { await API.refresh(); } catch (_) {}
      const after = API.orders.find((o) => o.id === id);
      const want = local || order;
      if (after && want && mergeStatus(after.status, want.status) !== after.status) {
        after.status = mergeStatus(after.status, want.status);
        keepOrder(after);
        notify(true);
      }
    }
    return API.orders.find((o) => o.id === id) || order || local;
  }
  API.patch = async function (id, body) {
    body = Object.assign({}, body || {});
    if (API.user && sameRole(API.user.role, 'rider') && (body.status === 'accepted' || body.riderId || body.status === 'picked_up')) {
      if (!API.isRiderRegistered()) throw new Error('Register as a rider first, then accept orders.');
    }
    if (locOnlyBody(body)) {
      const local = applyLocalOrder(id, body);
      if (local && (local.status === 'delivered' || local.status === 'cancelled')) return local;
      notify();
      _locPend[id] = Object.assign({}, _locPend[id] || {}, body);
      if (!_locTimer[id]) {
        _locTimer[id] = setTimeout(function () {
          _locTimer[id] = null;
          const extra = _locPend[id];
          delete _locPend[id];
          if (extra) enqueuePatch(id, function () { return writePatch(id, extra); });
        }, 1200);
      }
      return local || API.orders.find((o) => o.id === id);
    }
    if (_locTimer[id]) {
      clearTimeout(_locTimer[id]);
      _locTimer[id] = null;
    }
    if (_locPend[id]) {
      body = Object.assign({}, _locPend[id], body);
      delete _locPend[id];
    }
    return enqueuePatch(id, function () { return writePatch(id, body); });
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
      lat: finiteNum(shop.lat != null ? shop.lat : prev.lat),
      lng: finiteNum(shop.lng != null ? shop.lng : prev.lng),
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
        pending: 'Waiting for confirm',
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
