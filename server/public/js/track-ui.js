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

  function viewerRole(viewer) {
    return viewer === 'customer' ? 'customer' : viewer === 'shop' ? 'shop' : 'rider';
  }

  function unreadDot(orderId, viewer) {
    const n = (typeof API !== 'undefined' && API.unreadCount) ? API.unreadCount(orderId, viewerRole(viewer)) : 0;
    return `<i class="unread-dot${n ? '' : ' hidden'}" data-unread-dot></i>`;
  }

  function statusLabel(s) {
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
  }

  function goingToShop(order) {
    return !!(order && (order.status === 'accepted' || (order.status === 'ready' && order.riderId)));
  }

  function riderOnJob(order) {
    if (!order) return false;
    const st = order.status;
    if (st !== 'accepted' && st !== 'picked_up' && st !== 'on_the_way' && st !== 'delivered') return false;
    return !!(order.riderName || (order.riderId && String(order.riderId) !== 'null' && String(order.riderId) !== ''));
  }

  const ICO_SHOP_SIDE =
    '<div class="rd-shop-side"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2"><path d="M4 10V20h16V10"/><path d="M3 10l9-7 9 7"/><path d="M9 20v-6h6v6"/></svg></div>';

  const CLOSE_M = 200;

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

  function shopPosOf(order) {
    const shop =
      typeof API !== 'undefined' && API.shopOf ? API.shopOf(order.shopId) : {};
    const lat = Number(order.shopLat != null ? order.shopLat : shop.lat);
    const lng = Number(order.shopLng != null ? order.shopLng : shop.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
    return [Number(order.deliveryLat), Number(order.deliveryLng)];
  }

  function targetOf(order) {
    if (goingToShop(order)) return shopPosOf(order);
    return [Number(order.deliveryLat), Number(order.deliveryLng)];
  }

  function kmLeft(order) {
    const shop =
      typeof API !== 'undefined' && API.shopOf ? API.shopOf(order.shopId) : {};
    const dest = targetOf(order);
    const live =
      typeof document !== 'undefined' &&
      document.documentElement.getAttribute('data-role') === 'rider' &&
      window.QB_LIVE &&
      window.QB_LIVE.lat != null
        ? window.QB_LIVE
        : null;
    const from = live
      ? [Number(live.lat), Number(live.lng)]
      : order.riderLat != null
        ? [Number(order.riderLat), Number(order.riderLng)]
        : [Number(shop.lat || dest[0]), Number(shop.lng || dest[1])];
    const km = typeof haversineKm === 'function' ? haversineKm(from, dest) : 2.3;
    return Math.max(0.05, km);
  }

  function metersLeft(order) {
    return kmLeft(order) * 1000;
  }

  function isClose(order) {
    const live =
      typeof document !== 'undefined' &&
      document.documentElement.getAttribute('data-role') === 'rider' &&
      window.QB_LIVE &&
      window.QB_LIVE.lat != null;
    if (!live && (order.riderLat == null || order.riderLng == null)) return false;
    return metersLeft(order) <= CLOSE_M;
  }

  function etaRange(km) {
    const min = Math.max(8, Math.round(km * 4));
    return min + ' – ' + (min + 3) + ' min';
  }

  function shopOf(order) {
    return typeof API !== 'undefined' && API.shopOf ? API.shopOf(order && order.shopId) : {};
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
        side: 'bike',
      };
    }
    if (viewer !== 'rider' && !riderOnJob(order)) {
      const shop = shopOf(order) || {};
      const name = (window.API && API.shopTitle && API.shopTitle(shop)) || shop.name || order.shopName || 'Shop';
      const bits = [shop.category, shop.address].filter(Boolean);
      return {
        name,
        role: bits.length ? bits.join(' · ') : 'Waiting for confirm',
        phone: null,
        photo: shop.image || '/img/shop-bakery.jpg',
        rating: Number(shop.rating || 0).toFixed(1),
        reviews: shop.reviews >= 100 ? shop.reviews + '+' : String(shop.reviews || 0),
        initials: initials(name),
        side: 'shop',
      };
    }
    if (order.riderName || riderOnJob(order)) {
      return {
        name: order.riderName || 'Rider',
        role: goingToShop(order) ? 'Heading to the shop' : (order.status === 'picked_up' || order.status === 'on_the_way' ? 'On the way to you' : 'Delivery Partner'),
        phone: order.riderPhone,
        photo: '/img/avatar-rider.jpg',
        rating: '4.9',
        reviews: '120+',
        initials: initials(order.riderName || 'Rider'),
        side: 'bike',
      };
    }
    return {
      name: statusLabel(order.status),
      role: order.shopName || 'Waiting for confirm',
      phone: null,
      photo: '/img/shop-bakery.jpg',
      rating: '5.0',
      reviews: 'New',
      initials: 'SH',
      side: 'shop',
    };
  }

  function sideHtml(p) {
    return p && p.side === 'shop' ? ICO_SHOP_SIDE : '🛵';
  }

  function trackTitle(order, viewer) {
    if (order.status === 'delivered') return 'Delivered';
    if (viewer === 'rider' && goingToShop(order)) return 'To shop';
    if (viewer === 'rider' && (order.status === 'picked_up' || order.status === 'on_the_way')) return 'On the way';
    if (viewer !== 'rider' && !riderOnJob(order)) return statusLabel(order.status);
    if (goingToShop(order)) return 'Rider accepted';
    if (order.status === 'picked_up' || order.status === 'on_the_way') return 'Picked up';
    return 'Track Order';
  }

  function screen(order, viewer, opts) {
    opts = opts || {};
    const back = opts.back || 'data-track-back';
    const p = person(order, viewer);
    const href = telHref(p.phone);
    const km = kmLeft(order);
    const toShop = goingToShop(order);
    const picked = order.status === 'picked_up' || order.status === 'on_the_way';
    const close = isClose(order);
    const showPickup = viewer === 'rider' && toShop;
    const showComplete = viewer === 'rider' && picked;
    const showDone = order.status === 'delivered' && viewer !== 'rider';
    const chatOn = typeof API !== 'undefined' && API.canChat ? API.canChat(order, viewerRole(viewer)) : false;
    const title = trackTitle(order, viewer);
    const nearTxt = showPickup
      ? (close ? 'You are at the shop — confirm pickup' : Math.round(metersLeft(order)) + ' m to shop · get closer to confirm')
      : showComplete
        ? (close ? 'You are at the customer — confirm delivered' : Math.round(metersLeft(order)) + ' m to customer · get closer to confirm')
        : '';
    return `<div class="rd-screen" data-track-root="${esc(order.id)}" data-viewer="${esc(viewer)}" data-has-rider="${order.riderName ? '1' : '0'}">
      <div id="map" class="map"></div>
      <div class="rd-top">
        <button class="rd-menu" type="button" ${back} aria-label="Back">${ICO_MENU}</button>
        <div>
          <h1>${title}</h1>
          <small>Order ${esc(oid(order.id))}</small>
        </div>
        <button class="rd-chat-fab ${chatOn ? '' : 'hidden'}" type="button" data-chat="${esc(order.id)}" aria-label="Chat">${ICO_CHAT}${unreadDot(order.id, viewer)}</button>
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
          <div class="rd-scooter" data-side-ico>${sideHtml(p)}</div>
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
          <button class="btn-chat ${chatOn ? '' : 'hidden'}" type="button" data-chat="${esc(order.id)}">${ICO_CHAT} Chat${unreadDot(order.id, viewer)}</button>
        </div>
        <p class="rd-near ${close ? 'ok' : ''} ${nearTxt ? '' : 'hidden'}" data-near>${esc(nearTxt)}</p>
        <button class="btn-drop ${showPickup ? '' : 'hidden'}" data-pickup="${esc(order.id)}" type="button" ${close ? '' : 'disabled'}>Confirm pickup</button>
        <button class="btn-drop ${showComplete ? '' : 'hidden'}" data-drop="${esc(order.id)}" type="button" ${close ? '' : 'disabled'}>Mark delivered</button>
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
    const avatar = root.querySelector('[data-avatar]');
    if (avatar && p.photo) avatar.src = p.photo;
    const side = root.querySelector('[data-side-ico]');
    if (side) side.innerHTML = sideHtml(p);
    const call = root.querySelector('[data-call]');
    if (call) {
      call.classList.toggle('hidden', !p.phone);
      if (p.phone) call.href = telHref(p.phone);
    }
    const eta = root.querySelector('[data-eta]');
    if (eta) eta.textContent = etaRange(km);
    const kmel = root.querySelector('[data-km]');
    if (kmel) kmel.textContent = km.toFixed(1) + ' km';
    const toShop = goingToShop(order);
    const picked = order.status === 'picked_up' || order.status === 'on_the_way';
    const close = isClose(order);
    const pickup = root.querySelector('[data-pickup]');
    if (pickup) {
      pickup.classList.toggle('hidden', !(viewer === 'rider' && toShop));
      pickup.disabled = !close;
    }
    const complete = root.querySelector('[data-drop]');
    if (complete) {
      complete.classList.toggle('hidden', !(viewer === 'rider' && picked));
      complete.disabled = !close;
    }
    const near = root.querySelector('[data-near]');
    if (near) {
      const showPickup = viewer === 'rider' && toShop;
      const showComplete = viewer === 'rider' && picked;
      const txt = showPickup
        ? (close ? 'You are at the shop — confirm pickup' : Math.round(metersLeft(order)) + ' m to shop · get closer to confirm')
        : showComplete
          ? (close ? 'You are at the customer — confirm delivered' : Math.round(metersLeft(order)) + ' m to customer · get closer to confirm')
          : '';
      near.textContent = txt;
      near.classList.toggle('hidden', !txt);
      near.classList.toggle('ok', close && !!txt);
    }
    const h1 = root.querySelector('.rd-top h1');
    if (h1) h1.textContent = trackTitle(order, viewer);
    const done = root.querySelector('[data-done]');
    if (done) done.classList.toggle('hidden', !(order.status === 'delivered' && viewer !== 'rider'));
    root.dataset.hasRider = order.riderName ? '1' : '0';
    const n = (typeof API !== 'undefined' && API.unreadCount) ? API.unreadCount(order.id, viewerRole(viewer)) : 0;
    root.querySelectorAll('[data-unread-dot]').forEach((el) => {
      el.classList.toggle('hidden', !n);
    });
    const chatOn = typeof API !== 'undefined' && API.canChat ? API.canChat(order, viewerRole(viewer)) : false;
    root.querySelectorAll('[data-chat]').forEach((el) => {
      el.classList.toggle('hidden', !chatOn);
    });
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
