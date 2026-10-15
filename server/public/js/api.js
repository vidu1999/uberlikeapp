(function (global) {
  const API = {
    shops: [],
    items: [],
    orders: [],
    listeners: [],
  };

  function shopOf(id) {
    return API.shops.find((s) => s.id === id) || { name: 'Shop', emoji: '🏪', lat: 6.93, lng: 79.85 };
  }

  function notify() {
    API.listeners.forEach((fn) => fn(API));
  }

  async function getJSON(path, opts) {
    const res = await fetch(path, opts);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
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
    notify();
  };

  API.placeOrder = async function (item) {
    const shop = shopOf(item.shopId);
    return getJSON('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shopId: item.shopId,
        customerName: 'Sahan Perera',
        userId: 'USER_1',
        deliveryLat: 6.9271,
        deliveryLng: 79.8612,
        items: [{ name: item.name, qty: 1, price: item.price }],
      }),
    }).then(async (order) => {
      await API.refresh();
      return order;
    });
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
    const es = new EventSource('/api/stream');
    es.onmessage = (ev) => {
      const data = JSON.parse(ev.data);
      if (data.type === 'state') {
        API.shops = data.shops;
        API.items = data.items;
        API.orders = data.orders;
        notify();
      }
    };
  } catch (_) {}

  API.refresh().catch(() => {});
  global.API = API;
})(window);
