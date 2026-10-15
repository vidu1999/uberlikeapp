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

  function notify() {
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

  async function sbGet(table) {
    const base = String(window.QB_SUPABASE_URL).replace(/\/$/, '');
    const res = await fetch(base + '/rest/v1/' + table, {
      headers: {
        apikey: window.QB_SUPABASE_ANON,
        Authorization: 'Bearer ' + window.QB_SUPABASE_ANON,
      },
    });
    const text = await res.text();
    if (!res.ok) throw new Error('Supabase ' + table.split('?')[0] + ' ' + res.status);
    return text ? JSON.parse(text) : [];
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
    const data = await getJSON('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, phone, pin: pin || '1234' }),
    });
    API.user = data.user;
    API.token = data.token;
    try { sessionStorage.setItem('sd_user_' + (data.user.role || API.roleHint), JSON.stringify(data.user)); } catch (_) {}
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

  API.sendOtp = function (role, phone) {
    return getJSON('/api/otp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, phone }),
    });
  };

  API.readSms = function (smsToken) {
    return getJSON('/api/otp/sms?token=' + encodeURIComponent(smsToken));
  };

  API.verifyOtp = async function (role, phone, code) {
    const data = await getJSON('/api/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, phone, code }),
    });
    API.user = data.user;
    API.token = data.token;
    try { sessionStorage.setItem('sd_user_' + (data.user.role || API.roleHint), JSON.stringify(data.user)); } catch (_) {}
    notify();
    return data.user;
  };

  API.restore = function () {
    try {
      const raw = sessionStorage.getItem('sd_user_' + (API.roleHint || 'customer'));
      if (raw) API.user = JSON.parse(raw);
    } catch (_) {}
  };

  API.placeOrder = async function (payload) {
    const order = await getJSON('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    await API.refresh();
    return order;
  };

  API.patch = async function (id, body) {
    const order = await getJSON('/api/orders/' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    await API.refresh();
    return order;
  };

  API.toggleItem = function (id, isAvailable) {
    return getJSON('/api/items/' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isAvailable }),
    }).then(() => API.refresh());
  };

  API.sendMessage = function (orderId, from, role, text) {
    return getJSON('/api/orders/' + encodeURIComponent(orderId) + '/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, role, text }),
    }).then(() => API.refresh());
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
