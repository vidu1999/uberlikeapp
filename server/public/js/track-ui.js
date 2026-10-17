(function (global) {
  const ICO_MENU =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
  const ICO_PHONE =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';
  const ICO_CHAT =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>';
  const ICO_CLOCK =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  const ICO_PIN =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.4"/></svg>';

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));
  }

  function oid(id) {
    return '#' + String(id || '').replace('_', '-');
  }

  function statusLabel(s) {
    return (
      {
        pending: 'Confirming',
        preparing: 'Preparing',
        ready: 'Ready for pickup',
        on_the_way: 'On the way',
        delivered: 'Delivered',
        cancelled: 'Cancelled',
      }[s] || s
    );
  }

  function telHref(phone) {
    if (!phone) return '';
    const d = String(phone).replace(/\s/g, '');
    if (d.startsWith('+')) return 'tel:' + d;
    if (d.startsWith('0')) return 'tel:+94' + d.slice(1);
    return 'tel:' + d;
  }

  function initials(name) {
    return String(name || '?')
      .split(/\s+/)
      .map((p) => p[0] || '')
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  function kmLeft(order) {
    const shop =
      typeof API !== 'undefined' && API.shopOf ? API.shopOf(order.shopId) : {};
    const dest = [Number(order.deliveryLat), Number(order.deliveryLng)];
    const from =
      order.riderLat != null
        ? [Number(order.riderLat), Number(order.riderLng)]
        : [Number(shop.lat || dest[0]), Number(shop.lng || dest[1])];
    const km = typeof haversineKm === 'function' ? haversineKm(from, dest) : 2.3;
    return Math.max(0.2, km);
  }

  function etaRange(km) {
    const min = Math.max(8, Math.round(km * 4));
    return min + ' – ' + (min + 3) + ' min';
  }

  function person(order, viewer) {
    if (viewer === 'rider') {
      return {
        name: order.riderName || (typeof API !== 'undefined' && API.user && API.user.name) || 'Rider',
        role: 'Delivery Partner',
        phone: order.customerPhone,
        photo: '/img/avatar-rider.jpg',
        rating: '4.9',
        reviews: '120+',
        initials: initials(order.riderName || 'KP'),
      };
    }
    if (order.riderName) {
      return {
        name: order.riderName,
        role: 'Delivery Partner',
        phone: order.riderPhone,
        photo: '/img/avatar-rider.jpg',
        rating: '4.9',
        reviews: '120+',
        initials: initials(order.riderName),
      };
    }
    return {
      name: statusLabel(order.status),
      role: order.shopName || 'Assigning courier…',
      phone: null,
      photo: '/img/avatar-rider.jpg',
      rating: '5.0',
      reviews: 'New',
      initials: 'GF',
    };
  }

  function screen(order, viewer, opts) {
    opts = opts || {};
    const back = opts.back || 'data-track-back';
    const p = person(order, viewer);
    const href = telHref(p.phone);
    const km = kmLeft(order);
    const showComplete = viewer === 'rider' && order.status === 'on_the_way';
    const showDone = order.status === 'delivered' && viewer !== 'rider';
    const title = order.status === 'delivered' ? 'Delivered' : 'Track Order';
    return `<div class="rd-screen" data-track-root="${esc(order.id)}" data-viewer="${esc(viewer)}" data-has-rider="${order.riderName ? '1' : '0'}">
      <div id="map" class="map"></div>
      <div class="rd-top">
        <button class="rd-menu" type="button" ${back} aria-label="Back">${ICO_MENU}</button>
        <div>
          <h1>${title}</h1>
          <small>Order ${esc(oid(order.id))}</small>
        </div>
        <span class="online-pill"><i></i> Online</span>
      </div>
      <div class="rd-zoom">
        <button type="button" data-locate aria-label="Locate">◎</button>
        <button type="button" data-zoom="in">+</button>
        <button type="button" data-zoom="out">−</button>
      </div>
      <div class="rd-card">
        <div class="rd-who">
          ${p.photo ? `<img data-avatar src="${p.photo}" alt="" />` : `<div class="fallback" data-initials>${esc(p.initials)}</div>`}
          <div class="grow">
            <b data-rider>${esc(p.name)}</b>
            <div class="role" data-sub>${esc(p.role)}</div>
            <div class="rate"><span class="star">★</span> ${esc(p.rating)} <span style="color:#9CA3AF;font-weight:600">(${esc(p.reviews)})</span></div>
          </div>
          <div class="rd-scooter">🛵</div>
        </div>
        <div class="rd-metrics">
          <div class="rd-metric">
            <div class="mi">${ICO_CLOCK}</div>
            <div><small>ETA</small><b data-eta>${esc(etaRange(km))}</b></div>
          </div>
          <div class="rd-metric">
            <div class="mi">${ICO_PIN}</div>
            <div><small>Distance</small><b data-km>${km.toFixed(1)} km</b></div>
          </div>
        </div>
        <div class="rd-btns">
          <a class="btn-call ${p.phone ? '' : 'hidden'}" data-call href="${href || '#'}">${ICO_PHONE} Call</a>
          <button class="btn-chat" type="button" data-chat="${esc(order.id)}">${ICO_CHAT} Chat</button>
        </div>
        <button class="btn-drop ${showComplete ? '' : 'hidden'}" data-drop="${esc(order.id)}" type="button">Mark delivered</button>
        <button class="btn-drop ${showDone ? '' : 'hidden'}" data-done type="button">Done</button>
      </div>
    </div>`;
  }

  function paint(root, order, viewer) {
    if (!root || !order) return;
    const p = person(order, viewer);
    const km = kmLeft(order);
    const name = root.querySelector('[data-rider]');
    if (name) name.textContent = p.name;
    const sub = root.querySelector('[data-sub]');
    if (sub) sub.textContent = p.role || '';
    const call = root.querySelector('[data-call]');
    if (call) {
      call.classList.toggle('hidden', !p.phone);
      if (p.phone) call.href = telHref(p.phone);
    }
    const eta = root.querySelector('[data-eta]');
    if (eta) eta.textContent = etaRange(km);
    const kmel = root.querySelector('[data-km]');
    if (kmel) kmel.textContent = km.toFixed(1) + ' km';
    const complete = root.querySelector('[data-drop]');
    if (complete) complete.classList.toggle('hidden', !(viewer === 'rider' && order.status === 'on_the_way'));
    const done = root.querySelector('[data-done]');
    if (done) done.classList.toggle('hidden', !(order.status === 'delivered' && viewer !== 'rider'));
    root.dataset.hasRider = order.riderName ? '1' : '0';
  }

  function liveOrder(orders) {
    return (orders || []).find((o) => !['delivered', 'cancelled'].includes(o.status));
  }

  function banner(order) {
    if (!order) return '';
    return `<div class="live-banner" data-track="${esc(order.id)}">
      <div><b>Track your order</b><small>${esc(statusLabel(order.status))} · ${esc(order.shopName || '')}</small></div>
      <span>›</span>
    </div>`;
  }

  global.TrackUI = {
    screen,
    paint,
    person,
    liveOrder,
    banner,
    telHref,
    statusLabel,
    oid,
    kmLeft,
    etaRange,
  };
})(window);
