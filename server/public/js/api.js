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
      headers: sbHeaders(),
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

  function nextOrderId() {
    let seq = 1000;
    for (const o of API.orders) {
      const n = Number(String(o.id || '').replace(/\D/g, ''));
      if (n > seq) seq = n;
    }
    return 'ORD-' + (seq + 1);
  }

  async function pullSupabase() {
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
    API.orders = data.orders;
    API.messages = data.messages || {};
    notify();
  };

  API.login = async function (role, phone, pin) {
    pin = pin || '1234';
    if (sbConfigured()) {
      try {
        let q = 'accounts?select=*&role=eq.' + encodeURIComponent(role);
        if (phone) q += '&phone=eq.' + encodeURIComponent(phone);
        const rows = await sbGet(q);
        const picked = (rows || []).find((a) => String(a.pin) === String(pin)) || (rows && rows[0]);
        if (picked) {
          API.user = mapAccount(picked);
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

  API.register = function (payload) {
    return getJSON('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
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
    if (sbConfigured()) {
      try {
        let q = 'accounts?select=*&role=eq.' + encodeURIComponent(role || 'shop');
        if (email) q += '&email=eq.' + encodeURIComponent(email);
        else q += '&phone=eq.' + encodeURIComponent(phone);
        const rows = await sbGet(q);
        if (rows && rows[0]) return mapAccount(rows[0]);
      } catch (_) {}
    }
    try {
      const list = await getJSON('/api/accounts');
      const hit = (list || []).find((a) => a.role === role && (
        (phone && normalizePhone(a.phone) === phone) ||
        (email && String(a.email || '').toLowerCase() === email)
      ));
      if (hit) return hit;
    } catch (_) {}
    if (role === 'shop' && phone === '0772223333') {
      return { id: 'SHOP_STAFF', name: 'Shop staff', phone, role: 'shop', shopId: 'SHOP_1', shopName: 'Kandy Bakers' };
    }
    const local = API.recallShopProfile(phone);
    if (role === 'shop' && local && local.shopId) {
      return { id: 'SHOP_LOCAL_' + phone.slice(-4), name: local.ownerName || 'Shop Owner', phone, role: 'shop', shopId: local.shopId, shopName: local.shopName };
    }
    return null;
  };

  async function enterAccount(role, phone) {
    phone = normalizePhone(phone);
    let rows = [];
    try {
      rows = await sbGet('accounts?select=*&role=eq.' + encodeURIComponent(role) + '&phone=eq.' + encodeURIComponent(phone));
    } catch (_) {}
    let row = rows && rows[0];
    if (!row && role === 'shop' && phone === '0772223333') {
      row = { id: 'SHOP_STAFF', name: 'Shop staff', phone, role: 'shop', shop_id: 'SHOP_1', shopName: 'Kandy Bakers' };
      API.setPendingShop(null);
    }
    if (!row && role === 'shop') {
      const local = API.recallShopProfile(phone);
      if (local && local.shopId) {
        row = {
          id: 'SHOP_STAFF_' + phone.slice(-4),
          name: local.ownerName || 'Shop Owner',
          phone,
          role: 'shop',
          shop_id: local.shopId,
          shopName: local.shopName,
        };
      }
    }
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
      try { await sbSend('accounts', 'POST', [row]); } catch (_) {}
      API.rememberShopProfile(phone, {
        shopId, shopName: shop.name, ownerName: row.name, address: shop.address, lat: shop.lat, lng: shop.lng,
      });
      row.shopName = shop.name;
      API.setPendingShop(null);
      try { API.shops.push(mapShop(shop)); } catch (_) {}
    }
    if (!row) {
      row = {
        id: String(role || 'user').toUpperCase() + '_' + phone.slice(-4) + '_' + Date.now().toString(36),
        name: role === 'rider' ? 'Courier' : 'Guest',
        phone,
        pin: 'otp',
        role: role || 'customer',
        address: 'No.123, Lake View Road, Anuradhapura',
      };
      if (role === 'rider') {
        row.vehicle = 'Bike';
        row.rating = 5;
      }
      try { await sbSend('accounts', 'POST', [row]); } catch (_) {}
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
        userId: payload.userId || (API.user && API.user.id) || 'USER_1',
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
      if (body.status === 'on_the_way') {
        next.riderId = next.riderId || 'RIDER_77';
        next.riderName = next.riderName || 'Kamal Perera';
        next.riderPhone = next.riderPhone || '0775556666';
      }
      if (body.status === 'delivered') next.deliveredAt = new Date().toISOString();
      next.updatedAt = new Date().toISOString();
      await sbSend('orders?id=eq.' + encodeURIComponent(id), 'PATCH', orderRow(next));
      order = next;
    }
    await API.refresh();
    return order;
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
      shop_id: item.shopId || item.shop_id || (API.user && API.user.shopId) || 'SHOP_1',
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
        on_the_way: 'On the way',
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
