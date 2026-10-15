(function (global) {
  const API = {
    shops: [],
    items: [],
    orders: [],
    messages: {},
    listeners: [],
    user: null,
    token: null,
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

  async function getJSON(path, opts) {
    const res = await fetch(path, opts);
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
    return 'LKR ' + Math.round(Number(n) || 0).toLocaleString('en-LK');
  };

  try {
    const es = new EventSource('/api/stream');
    es.onmessage = (ev) => {
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
  global.API = API;
})(window);
