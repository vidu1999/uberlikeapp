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

  const CLOSE_M = 25;

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
    const sLat = Number(shop && shop.lat);
    const sLng = Number(shop && shop.lng);
    if (Number.isFinite(sLat) && Number.isFinite(sLng)) return [sLat, sLng];
    const lat = Number(order.shopLat);
    const lng = Number(order.shopLng);
    const dLat = Number(order.deliveryLat);
    const dLng = Number(order.deliveryLng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      if (Number.isFinite(dLat) && Math.abs(lat - dLat) < 1e-5 && Math.abs(lng - dLng) < 1e-5) {
        return [dLat, dLng];
      }
      return [lat, lng];
    }
    return [dLat, dLng];
  }

  function destPosOf(order) {
    const lat = Number(order && order.deliveryLat);
    const lng = Number(order && order.deliveryLng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
    return null;
  }

  function shopPinOf(order) {
    const shop =
      typeof API !== 'undefined' && API.shopOf ? API.shopOf(order && order.shopId) : {};
    const sLat = Number(shop && shop.lat);
    const sLng = Number(shop && shop.lng);
    if (Number.isFinite(sLat) && Number.isFinite(sLng)) return [sLat, sLng];
    const lat = Number(order && order.shopLat);
    const lng = Number(order && order.shopLng);
    const dest = destPosOf(order);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      if (dest && Math.abs(lat - dest[0]) < 1e-5 && Math.abs(lng - dest[1]) < 1e-5) return null;
      return [lat, lng];
    }
    return null;
  }

  function targetOf(order) {
    if (goingToShop(order)) return shopPosOf(order);
    return destPosOf(order) || [Number(order.deliveryLat), Number(order.deliveryLng)];
  }

  function closeTargetOf(order) {
    if (goingToShop(order)) return shopPinOf(order);
    return destPosOf(order);
  }

  function riderFrom(order) {
    const live =
      typeof document !== 'undefined' &&
      document.documentElement.getAttribute('data-role') === 'rider' &&
      window.QB_LIVE &&
      window.QB_LIVE.lat != null
        ? window.QB_LIVE
        : null;
    if (live) return [Number(live.lat), Number(live.lng)];
    if (order && order.riderLat != null && order.riderLng != null) {
      return [Number(order.riderLat), Number(order.riderLng)];
    }
    return null;
  }

  function kmLeft(order) {
    const dest = targetOf(order);
    const from = riderFrom(order);
    if (from && dest && typeof haversineKm === 'function') return haversineKm(from, dest);
    const shop = shopPosOf(order);
    const drop = destPosOf(order);
    if (shop && drop && typeof haversineKm === 'function') return haversineKm(shop, drop);
    return 0;
  }

  function metersLeft(order) {
    const dest = closeTargetOf(order);
    const from = riderFrom(order);
    if (!from || !dest || typeof haversineKm !== 'function') return Infinity;
    return haversineKm(from, dest) * 1000;
  }

  function isClose(order) {
    if (!riderFrom(order)) return false;
    return metersLeft(order) < CLOSE_M;
  }

  const CRUISE_KMH = 22;
  const spdBag = {};
  function noteRiderSpeed(order) {
    const from = riderFrom(order);
    if (!order || !order.id || !from) return 0;
    const now = Date.now();
    let rec = spdBag[order.id];
    if (!rec) rec = spdBag[order.id] = { kmh: 0, t: now, lat: from[0], lng: from[1] };
    const dt = (now - rec.t) / 1000;
    if (dt < 2) return rec.kmh || 0;
    if (dt > 120) rec.kmh = 0;
    if (dt < 90 && typeof haversineKm === 'function') {
      const dkm = haversineKm([rec.lat, rec.lng], from);
      if (dkm >= 0.004) {
        const kmh = (dkm / dt) * 3600;
        if (kmh >= 2 && kmh <= 70) rec.kmh = rec.kmh ? rec.kmh * 0.62 + kmh * 0.38 : kmh;
      } else if (dt >= 4 && rec.kmh) {
        rec.kmh = rec.kmh * 0.82 + 8 * 0.18;
      }
    }
    rec.t = now;
    rec.lat = from[0];
    rec.lng = from[1];
    return rec.kmh || 0;
  }
  function fmtKm(km) {
    km = Number(km) || 0;
    if (km < 0.1) return Math.max(1, Math.round(km * 1000)) + ' m';
    return km.toFixed(1) + ' km';
  }
  function etaRange(km, order) {
    km = Number(km);
    if (!Number.isFinite(km) || km < 0) km = 0;
    if (km < 0.05) return 'Arriving';
    const live = noteRiderSpeed(order);
    const speed = live > 3 ? live : CRUISE_KMH;
    const mins = (km / Math.max(4, speed)) * 60;
    const n = Math.max(1, Math.round(mins));
    if (live > 3) return n + ' min';
    const hi = Math.max(n + 1, Math.round(mins * 1.15));
    return n + ' – ' + hi + ' min';
  }

  function shopOf(order) {
    return typeof API !== 'undefined' && API.shopOf ? API.shopOf(order && order.shopId) : {};
  }

  function realRate(rating, reviews) {
    const r = Number(rating);
    const n = Number(String(reviews == null ? '' : reviews).replace(/[^\d]/g, ''));
    if (!Number.isFinite(r) || r <= 0) return { rating: '', reviews: '' };
    if (!Number.isFinite(n) || n <= 0) return { rating: '', reviews: '' };
    return { rating: r.toFixed(1), reviews: n >= 100 ? n + '+' : String(n) };
  }

  function riderPhoto() {
    const u = typeof API !== 'undefined' ? API.user : null;
    const p = u && u.photo ? String(u.photo) : '';
    if (/^https?:\/\//i.test(p) || p.indexOf('/img/') === 0) return p;
    return '/img/avatar-rider.jpg';
  }

  function person(order, viewer) {
    if (viewer === 'rider') {
      const name = order.riderName || (typeof API !== 'undefined' && API.user && API.user.name) || 'Rider';
      return {
        name,
        role: 'Delivery Partner',
        phone: order.customerPhone,
        photo: riderPhoto(),
        rating: '',
        reviews: '',
        initials: initials(name),
        side: 'bike',
      };
    }
    if (viewer !== 'rider' && !riderOnJob(order)) {
      const shop = shopOf(order) || {};
      const name = (window.API && API.shopTitle && API.shopTitle(shop)) || shop.name || order.shopName || 'Shop';
      const bits = [shop.category, shop.address].filter(Boolean);
      const rate = realRate(shop.rating, shop.reviews);
      return {
        name,
        role: bits.length ? bits.join(' · ') : 'Waiting for confirm',
        phone: null,
        photo: shop.image || '/img/shop-bakery.jpg',
        rating: rate.rating,
        reviews: rate.reviews,
        initials: initials(name),
        side: 'shop',
      };
    }
    if (order.riderName || riderOnJob(order)) {
      const name = order.riderName || 'Rider';
      return {
        name,
        role: goingToShop(order) ? 'Heading to the shop' : (order.status === 'picked_up' || order.status === 'on_the_way' ? 'On the way to you' : 'Delivery Partner'),
        phone: order.riderPhone,
        photo: '/img/avatar-rider.jpg',
        rating: '',
        reviews: '',
        initials: initials(name),
        side: 'bike',
      };
    }
    return {
      name: statusLabel(order.status),
      role: order.shopName || 'Waiting for confirm',
      phone: null,
      photo: '/img/shop-bakery.jpg',
      rating: '',
      reviews: '',
      initials: initials(order.shopName || 'Shop'),
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
    const started = viewer !== 'rider' || !!(opts && opts.started);
    const showStart = viewer === 'rider' && !started && order.status !== 'delivered' && order.status !== 'cancelled' && (toShop || picked);
    const showPickup = viewer === 'rider' && started && toShop;
    const showComplete = viewer === 'rider' && started && picked;
    const showDone = order.status === 'delivered' && viewer !== 'rider';
    const chatOn = typeof API !== 'undefined' && API.canChat ? API.canChat(order, viewerRole(viewer)) : false;
    const title = trackTitle(order, viewer);
    const nearM = metersLeft(order);
    const nearAway = Number.isFinite(nearM) ? Math.max(1, Math.round(nearM)) + ' m' : '—';
    const nearTxt = showStart
      ? (toShop ? 'Start to go to the shop' : 'Start to go to the customer')
      : showPickup
        ? (close ? 'You are at the shop — confirm pickup' : nearAway + ' to shop · get within 25 m to confirm')
        : showComplete
          ? (close ? 'You are at the customer — confirm delivered' : nearAway + ' to customer · get within 25 m to confirm')
          : '';
    return `<div class="rd-screen" data-track-root="${esc(order.id)}" data-viewer="${esc(viewer)}" data-started="${started ? '1' : '0'}" data-has-rider="${order.riderName ? '1' : '0'}">
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
        ${stepsHtml(order)}
        <div class="rd-who">
          ${p.photo ? `<img data-avatar src="${p.photo}" alt="" />` : `<div class="fallback" data-initials>${esc(p.initials)}</div>`}
          <div class="grow">
            <b data-rider>${esc(p.name)}</b>
            <div class="role" data-sub>${esc(p.role)}</div>
            <div class="rate ${p.rating ? '' : 'hidden'}" data-rate><span class="star">★</span> ${esc(p.rating || '')} <span style="color:#9CA3AF;font-weight:600">${p.reviews ? '(' + esc(p.reviews) + ')' : ''}</span></div>
          </div>
          <div class="rd-scooter" data-side-ico>${sideHtml(p)}</div>
        </div>
        <div class="rd-metrics">
          <div class="rd-metric">
            <div class="mi">${ICO_CLOCK}</div>
            <div><small>ETA</small><b data-eta>${esc(etaRange(km, order))}</b></div>
          </div>
          <div class="rd-metric">
            <div class="mi">${ICO_PIN}</div>
            <div><small>Distance</small><b data-km>${esc(fmtKm(km))}</b></div>
          </div>
        </div>
          <div class="rd-btns">
          <a class="btn-call ${p.phone ? '' : 'hidden'}" data-call href="${href || '#'}">${ICO_PHONE} Call</a>
          <button class="btn-chat ${chatOn ? '' : 'hidden'}" type="button" data-chat="${esc(order.id)}">${ICO_CHAT} Chat${unreadDot(order.id, viewer)}</button>
        </div>
        <p class="rd-near ${close ? 'ok' : ''} ${nearTxt ? '' : 'hidden'}" data-near>${esc(nearTxt)}</p>
        <button class="btn-start ${showStart ? '' : 'hidden'}" data-start-trip="${esc(order.id)}" type="button">Start</button>
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
    const steps = root.querySelector('[data-steps]');
    if (steps) {
      const next = stepsHtml(order);
      const hold = document.createElement('div');
      hold.innerHTML = next;
      if (hold.firstChild) steps.replaceWith(hold.firstChild);
    }
    const name = root.querySelector('[data-rider]');
    if (name) name.textContent = p.name;
    const sub = root.querySelector('[data-sub]');
    if (sub) sub.textContent = p.role || '';
    const rate = root.querySelector('[data-rate]');
    if (rate) {
      rate.classList.toggle('hidden', !p.rating);
      if (p.rating) rate.innerHTML = '<span class="star">★</span> ' + esc(p.rating) + (p.reviews ? ' <span style="color:#9CA3AF;font-weight:600">(' + esc(p.reviews) + ')</span>' : '');
    }
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
    if (eta) eta.textContent = etaRange(km, order);
    const kmel = root.querySelector('[data-km]');
    if (kmel) kmel.textContent = fmtKm(km);
    const toShop = goingToShop(order);
    const picked = order.status === 'picked_up' || order.status === 'on_the_way';
    const close = isClose(order);
    const started = viewer !== 'rider' || root.dataset.started === '1';
    const showStart = viewer === 'rider' && !started && order.status !== 'delivered' && order.status !== 'cancelled' && (toShop || picked);
    const showPickup = viewer === 'rider' && started && toShop;
    const showComplete = viewer === 'rider' && started && picked;
    const startBtn = root.querySelector('[data-start-trip]');
    if (startBtn) startBtn.classList.toggle('hidden', !showStart);
    const pickup = root.querySelector('[data-pickup]');
    if (pickup) {
      pickup.classList.toggle('hidden', !showPickup);
      pickup.disabled = !close;
    }
    const complete = root.querySelector('[data-drop]');
    if (complete) {
      complete.classList.toggle('hidden', !showComplete);
      complete.disabled = !close;
    }
    const near = root.querySelector('[data-near]');
    if (near) {
      const nearM = metersLeft(order);
      const nearAway = Number.isFinite(nearM) ? Math.max(1, Math.round(nearM)) + ' m' : '—';
      const txt = showStart
        ? (toShop ? 'Start to go to the shop' : 'Start to go to the customer')
        : showPickup
          ? (close ? 'You are at the shop — confirm pickup' : nearAway + ' to shop · get within 25 m to confirm')
          : showComplete
            ? (close ? 'You are at the customer — confirm delivered' : nearAway + ' to customer · get within 25 m to confirm')
            : '';
      near.textContent = txt;
      near.classList.toggle('hidden', !txt);
      near.classList.toggle('ok', close && !!txt && !showStart);
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

  function orderTs(o) {
    return Date.parse((o && (o.timestamp || o.createdAt || o.updatedAt)) || '') || 0;
  }

  function shopAccepted(o) {
    const st = String((o && o.status) || '');
    return !!(st && st !== 'pending' && st !== 'cancelled');
  }
  function riderAccepted(o) {
    const st = String((o && o.status) || '');
    return !!(o && (o.riderName || st === 'accepted' || st === 'picked_up' || st === 'on_the_way'));
  }
  function trackScore(o, earliestId) {
    let n = 0;
    if (shopAccepted(o)) n += 2;
    if (riderAccepted(o)) n += 3;
    if (o && earliestId && String(o.id) === String(earliestId)) n += 1;
    return n;
  }
  function liveOrder(orders) {
    const live = (orders || []).filter((o) => o && o.status !== 'delivered' && o.status !== 'cancelled');
    if (!live.length) return null;
    live.sort(function (a, b) { return orderTs(a) - orderTs(b); });
    const earliestId = live[0] && live[0].id;
    live.sort(function (a, b) {
      const d = trackScore(b, earliestId) - trackScore(a, earliestId);
      if (d) return d;
      return orderTs(a) - orderTs(b);
    });
    return live[0];
  }

  function orderSteps(order) {
    const st = String((order && order.status) || '');
    const placed = st !== 'cancelled';
    const shopOk = placed && st !== 'pending' && st !== '';
    const prepOk = shopOk && st !== '';
    const readyOk = st === 'ready' || st === 'accepted' || st === 'picked_up' || st === 'on_the_way' || st === 'delivered';
    const riderOk = !!(order && (order.riderName || st === 'accepted' || st === 'picked_up' || st === 'on_the_way' || st === 'delivered'));
    let now = 'placed';
    if (riderOk) now = 'rider';
    else if (readyOk) now = 'ready';
    else if (st === 'preparing') now = 'prepared';
    else if (shopOk) now = 'shop';
    return {
      now: now,
      items: [
        { id: 'placed', label: 'Order placed', on: placed },
        { id: 'shop', label: 'Shop accepted', on: shopOk },
        { id: 'prepared', label: 'Prepared', on: prepOk },
        { id: 'ready', label: 'Ready', on: readyOk },
        { id: 'rider', label: 'Rider accepted', on: riderOk },
      ],
    };
  }

  function stepsHtml(order) {
    const s = orderSteps(order);
    let html = '<div class="rd-steps" data-steps>';
    s.items.forEach(function (it, i) {
      html += '<div class="rd-step' + (it.on ? ' on' : '') + (s.now === it.id ? ' now' : '') + '" data-step="' + it.id + '"><i></i><span>' + it.label + '</span></div>';
      if (i < s.items.length - 1) html += '<em class="' + (it.on ? 'on' : '') + '"></em>';
    });
    return html + '</div>';
  }

  function stepLine(order) {
    const s = orderSteps(order);
    if (s.now === 'placed') return 'Waiting for shop to accept';
    if (s.now === 'shop') return 'Shop accepted';
    if (s.now === 'prepared') return 'Order prepared';
    if (s.now === 'ready') return 'Order ready · waiting for rider';
    return 'Rider accepted';
  }

  function banner(order) {
    if (!order) return '';
    return `<div class="live-banner" data-track="${esc(order.id)}">
      <div>
        <b>Track your order</b>
        ${stepsHtml(order)}
        <small>${esc(stepLine(order))} · ${esc(order.shopName || '')}</small>
      </div>
      <span>›</span>
    </div>`;
  }

  global.TrackUI = {
    screen,
    paint,
    person,
    liveOrder,
    banner,
    orderSteps,
    telHref,
    statusLabel,
    oid,
    kmLeft,
    etaRange,
  };
})(window);
