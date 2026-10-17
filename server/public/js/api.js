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
  function phoneKey(raw) {
    const d = normalizePhone(raw);
    return d.length >= 9 ? d.slice(-9) : d;
  }
  function phoneTakenError(acc) {
    const have = roleLabel(acc.role);
    return new Error('This number is already a ' + have + ' account. One phone number = one role. It cannot be User and Shop and Rider, and you cannot register it again. Open the ' + have + ' app.');
  }
  function alreadyThisRoleError(role) {
    const have = roleLabel(role);
    return new Error('This number is already a ' + have + '. Login instead — one number cannot have two ' + have + ' accounts.');
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
      API.orders = API.orders.filter((o) => o.userId === me.id || normalizePhone(o.customerPhone) === phone);
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
  async function lookupPhone(phone) {
    const key = phoneKey(phone);
    if (!key) return null;
    let list = (await allAccounts()).filter(function (a) { return phoneKey(a.phone) === key; });
    if (!list.length && sbConfigured()) {
      try {
        const n = normalizePhone(phone);
        const rows = await sbGet('accounts?select=*&phone=eq.' + encodeURIComponent(n));
        list = (rows || []).map(mapAccount).filter(function (a) { return a && !isDemoAccount(a); });
      } catch (_) {}
    }
    if (list.length > 1) {
      const keep = list[0];
      for (let i = 1; i < list.length; i++) {
        try { await sbSend('accounts?id=eq.' + encodeURIComponent(list[i].id), 'DELETE'); } catch (_) {}
      }
      clearAccCache();
      return keep;
    }
    return list[0] || null;
  }

  function nextOrderId() {
    let seq = 1000;
    for (const o of API.orders) {
      const n = Number(String(o.id || '').replace(/\D/g, ''));
      if (n > seq) seq = n;
    }
    return 'ORD-' + (seq + 1);
  }

  async function pullSupabase() {
    await wipeDemo();
    const [shopRows, itemRows, orderRows, msgRows] = await Promise.all([
      sbGet('shops?select=*&order=id.asc'),
      sbGet('menu_items?select=*&order=id.asc'),
      sbGet('orders?select=*'),
      sbGet('messages?select=*'),
    ]);
    API.shops = (shopRows || []).map(mapShop);
    API.items = (itemRows || []).map(mapItem);
    API.orders = (orderRows || []).map((r) => (r.data && r.data.id ? r.data : r));
    API.messages = {};
    for (const m of msgRows || []) {
      const list = API.messages[m.order_id] || (API.messages[m.order_id] = []);
      list.push({ id: m.id, from: m.sender, role: m.role, text: m.body, ts: m.ts });
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
      const taken = await lookupPhone(phone);
      if (taken && !sameRole(taken.role, role)) throw phoneTakenError(taken);
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
        let q = 'accounts?select=*&role=eq.' + encodeURIComponent(role);
        if (phone) q += '&phone=eq.' + encodeURIComponent(normalizePhone(phone));
        const rows = await sbGet(q);
        const picked = (rows || []).find((a) => !isDemoAccount(a) && String(a.pin) === String(pin))
          || (rows || []).find((a) => !isDemoAccount(a));
        if (picked) {
          const acc = mapAccount(picked);
          const clash = await lookupPhone(acc.phone);
          if (clash && !sameRole(clash.role, role)) throw phoneTakenError(clash);
          API.user = acc;
          API.token = 'sb_' + picked.id;
          saveSession();
          notify();
          return API.user;
        }
      } catch (e) {
        if (e && String(e.message || '').indexOf('already') >= 0) throw e;
      }
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
      const taken = await lookupPhone(phone);
      if (taken && !sameRole(taken.role, role)) throw phoneTakenError(taken);
      if (taken && sameRole(taken.role, role) && (role === 'shop' || role === 'rider')) {
        throw alreadyThisRoleError(role);
      }
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

  function pendingShop() {
    if (API._pendingShop) return API._pendingShop;
    try { return JSON.parse(sessionStorage.getItem('sd_pending_shop') || 'null'); } catch (_) { return null; }
  }

  API.setPendingShop = function (profile) {
    API._pendingShop = profile || null;
    try {
      if (profile) sessionStorage.setItem('sd_pending_shop', JSON.stringify(profile));
      else sessionStorage.removeItem('sd_pending_shop');
    } catch (_) {}
  };

  function pendingRider() {
    if (API._pendingRider) return API._pendingRider;
    try { return JSON.parse(sessionStorage.getItem('sd_pending_rider') || 'null'); } catch (_) { return null; }
  }
  API.setPendingRider = function (profile) {
    API._pendingRider = profile || null;
    try {
      if (profile) sessionStorage.setItem('sd_pending_rider', JSON.stringify(profile));
      else sessionStorage.removeItem('sd_pending_rider');
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
      hit = list.find(function (a) { return String(a.email || '').toLowerCase() === email; }) || null;
    }
    if (!hit) hit = await lookupPhone(phone);
    if (hit && !sameRole(hit.role, role)) throw phoneTakenError(hit);
    if (hit) return hit;
    return null;
  };

  async function enterAccount(role, phone) {
    phone = normalizePhone(phone);
    const taken = await lookupPhone(phone);
    if (taken && !sameRole(taken.role, role)) throw phoneTakenError(taken);
    let row = taken && sameRole(taken.role, role) ? taken : null;
    if (row && row.shopId && !row.shop_id) row.shop_id = row.shopId;
    if (!row && role === 'shop') {
      const p = pendingShop() || {};
      if (!p.shopName && !p.ownerName) {
        throw new Error('Register your shop first.');
      }
      const shopId = 'SHOP_' + Date.now().toString(36).toUpperCase();
      const shop = {
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
      row = {
        id: 'SHOP_STAFF_' + phone.slice(-4) + '_' + Date.now().toString(36),
        name: p.ownerName || 'Shop Owner',
        phone,
        email: p.email || '',
        pin: 'otp',
        role: 'shop',
        shop_id: shopId,
      };
      try { await sbSend('accounts', 'POST', [row]); } catch (_) {
        clearAccCache();
        const again = await lookupPhone(phone);
        if (again && !sameRole(again.role, role)) throw phoneTakenError(again);
        if (again) row = again;
      }
      clearAccCache();
      API.rememberShopProfile(phone, {
        shopId, shopName: shop.name, ownerName: row.name, address: shop.address, lat: shop.lat, lng: shop.lng,
      });
      row.shopName = shop.name;
      API.setPendingShop(null);
      try { API.shops.push(mapShop(shop)); } catch (_) {}
    }
    if (!row) {
      const pr = pendingRider() || {};
      row = {
        id: String(role || 'user').toUpperCase() + '_' + phone.slice(-4) + '_' + Date.now().toString(36),
        name: role === 'rider' ? (pr.name || 'Rider') : (pr.name || 'Guest'),
        phone,
        email: pr.email || '',
        pin: 'otp',
        role: role || 'customer',
        address: 'Sri Lanka',
      };
      API.setPendingRider(null);
      if (role === 'rider') {
        row.vehicle = pr.vehicle || 'Honda Dio · BDX 1234';
        row.rating = 5;
      }
      try { await sbSend('accounts', 'POST', [row]); } catch (_) {
        clearAccCache();
        const again = await lookupPhone(phone);
        if (again && !sameRole(again.role, role)) throw phoneTakenError(again);
        if (again) row = again;
      }
      clearAccCache();
    }
    API.user = mapAccount(row);
    if (row.shopName) API.user.shopName = row.shopName;
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

  API.sendOtp = async function (role, phone) {
    phone = normalizePhone(phone);
    if (!/^07\d{8}$/.test(phone) && !/^\d{10,15}$/.test(phone)) {
      throw new Error('Enter a valid mobile number');
    }
    const taken = await lookupPhone(phone);
    const want = role || 'customer';
    if (taken && !sameRole(taken.role, want)) throw phoneTakenError(taken);
    if (taken && sameRole(taken.role, want) && want === 'shop' && pendingShop()) throw alreadyThisRoleError('shop');
    if (taken && sameRole(taken.role, want) && want === 'rider' && pendingRider()) throw alreadyThisRoleError('rider');
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
    return enterAccount(role || 'customer', phone);
  };

  function sessionKey(role) {
    return 'sd_user_' + (role || API.roleHint || 'customer');
  }

  function saveSession() {
    if (!API.user) return;
    try {
      const key = sessionKey(API.user.role);
      const payload = JSON.stringify({ user: API.user, token: API.token || null, ts: Date.now() });
      localStorage.setItem(key, payload);
      sessionStorage.removeItem(key);
    } catch (_) {}
  }

  API.logout = function () {
    const role = (API.user && API.user.role) || API.roleHint || 'customer';
    API.user = null;
    API.token = null;
    API.setPendingShop(null);
    API.setPendingRider(null);
    try {
      localStorage.removeItem(sessionKey(role));
      sessionStorage.removeItem(sessionKey(role));
    } catch (_) {}
    notify();
  };

  API.restore = function () {
    try {
      const key = sessionKey(API.roleHint || 'customer');
      const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data && data.user) {
        API.user = data.user;
        API.token = data.token || null;
      } else if (data && data.id) {
        API.user = data;
      }
      if (API.user && (isDemoAccount(API.user) || isDemoShop(API.user.shopId))) {
        API.user = null;
        API.token = null;
        try {
          localStorage.removeItem(key);
          sessionStorage.removeItem(key);
        } catch (_) {}
        return;
      }
      if (API.user) saveSession();
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
        deliveryLat: Number(payload.deliveryLat ?? 8.335),
        deliveryLng: Number(payload.deliveryLng ?? 80.4108),
        riderLat: null,
        riderLng: null,
        timestamp: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    if (sbConfigured()) {
      await sbSend('orders', 'POST', [orderRow(order)]);
      try {
        await sbSend('messages', 'POST', [{
          id: 'm0',
          order_id: order.id,
          sender: 'QuickBite',
          role: 'system',
          body: 'Order placed at ' + (order.shopName || 'shop'),
          ts: Date.now(),
        }]);
      } catch (_) {}
    }
    await API.refresh();
    return order;
  };

  API.patch = async function (id, body) {
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
    const id = shop.id;
    if (!id) throw new Error('Missing shop');
    const row = {
      name: shop.name,
      category: shop.category || 'Bakery',
      hours: shop.hours || '08:00 AM – 10:00 PM',
      address: shop.address || '',
      image: shop.image || '/img/shop-bakery.jpg',
      promo: shop.promo || shop.about || '',
      is_open: shop.isOpen !== false,
    };
    if (sbConfigured()) {
      await sbSend('shops?id=eq.' + encodeURIComponent(id), 'PATCH', row);
    }
    const mapped = mapShop(Object.assign({}, shop, row, { id, is_open: row.is_open }));
    const i = API.shops.findIndex((s) => s.id === id);
    if (i >= 0) API.shops[i] = Object.assign({}, API.shops[i], mapped);
    else API.shops.push(mapped);
    notify(true);
    try { await API.refresh(); } catch (_) {}
    return mapped;
  };

  API.saveItem = async function (item) {
    const id = item.id || ('ITM_' + Date.now().toString(36));
    const row = {
      id,
      shop_id: item.shopId || item.shop_id || (API.user && API.user.shopId) || '',
      name: item.name,
      category: item.category || 'Food',
      price: Number(item.price || 0),
      is_available: item.isAvailable !== false,
      description: item.desc || item.description || '',
      image: item.image || '',
    };
    if (sbConfigured()) {
      await sbSend('menu_items', 'POST', [row]);
    }
    const mapped = mapItem(row);
    const i = API.items.findIndex((x) => x.id === id);
    if (i >= 0) API.items[i] = mapped;
    else API.items.push(mapped);
    notify(true);
    try { await API.refresh(); } catch (_) {}
    return mapped;
  };

  API.sendMessage = async function (orderId, from, role, text) {
    try {
      await getJSON('/api/orders/' + encodeURIComponent(orderId) + '/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, role, text }),
      });
    } catch (_) {}
    if (sbConfigured()) {
      await sbSend('messages', 'POST', [{
        id: 'm' + Date.now(),
        order_id: orderId,
        sender: from,
        role: role,
        body: text,
        ts: Date.now(),
      }]);
    }
    return API.refresh();
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
  API.refresh().catch(() => {});
  setInterval(() => {
    if (sbConfigured()) API.refresh().catch(() => {});
  }, 2500);
  global.API = API;
})(window);
