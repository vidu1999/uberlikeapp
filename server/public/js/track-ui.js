(function (global) {
  const ICO_BACK =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
  const ICO_MORE =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="#111"><circle cx="12" cy="6" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="18" r="1.7"/></svg>';
  const ICO_PHONE =
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#111" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));
  }

  function money(n) {
    return 'LKR ' + Math.round(Number(n) || 0).toLocaleString('en-LK');
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

  function person(order, viewer) {
    if (viewer === 'rider') {
      return {
        name: order.customerName || 'Customer',
        sub: order.address || 'Meet at door',
        phone: order.customerPhone,
        photo: '',
        initials: initials(order.customerName || 'C'),
        online: order.status === 'on_the_way',
        gray: false,
      };
    }
    if (order.riderName) {
      return {
        name: order.riderName,
        sub:
          order.status === 'delivered'
            ? 'Delivered'
            : order.status === 'on_the_way'
              ? 'On the way to you'
              : 'Your courier',
        phone: order.riderPhone,
        photo: '/img/courier-avatar.jpg',
        initials: initials(order.riderName),
        online: order.status === 'on_the_way',
        gray: false,
      };
    }
    const titles = {
      pending: 'Confirming your order',
      preparing: 'Preparing your order',
      ready: 'Finding a courier…',
      cancelled: 'Order cancelled',
    };
    return {
      name: titles[order.status] || 'Assigning courier…',
      sub: order.shopName || '',
      phone: null,
      photo: '/img/courier-avatar.jpg',
      initials: 'UE',
      online: false,
      gray: true,
    };
  }

  function screen(order, viewer, opts) {
    opts = opts || {};
    const back = opts.back || 'data-track-back';
    const p = person(order, viewer);
    const href = telHref(p.phone);
    const avatar = p.photo
      ? `<img data-avatar src="${p.photo}" alt="" style="${p.gray ? 'filter:grayscale(1)' : ''}" />`
      : `<div class="avatar-fallback" data-initials>${esc(p.initials)}</div>`;
    const items = (order.items || []).map((i) => i.name + ' ×' + i.qty).join(', ');
    const showComplete = viewer === 'rider' && order.status === 'on_the_way';
    const showDone = order.status === 'delivered' && viewer !== 'rider';
    return `<div class="track-screen" data-track-root="${esc(order.id)}" data-viewer="${esc(viewer)}" data-has-rider="${order.riderName ? '1' : '0'}">
      <div id="map" class="map"></div>
      <div class="track-top">
        <button class="fab" type="button" ${back} aria-label="Back">${ICO_BACK}</button>
        <h1>Order Track</h1>
        <button class="fab" type="button" data-more aria-label="More">${ICO_MORE}</button>
      </div>
      <div class="track-more hidden" data-more-panel>
        <b>${esc(order.shopName || '')}</b>
        <p class="muted">${esc(items)}</p>
        <p>${money(order.totalAmount)} · ${esc(statusLabel(order.status))}</p>
        ${viewer === 'customer' || viewer === 'rider' ? `<button class="btn sm ghost" data-chat="${esc(order.id)}">Message</button>` : ''}
      </div>
      <div class="track-card">
        <div class="track-row">
          <div class="avatar-wrap">
            ${avatar}
            <span class="online ${p.online ? '' : 'hidden'}" data-online></span>
          </div>
          <div class="grow">
            <b data-rider>${esc(p.name)}</b>
            <div class="stars">★★★★★</div>
            <div class="muted" data-sub>${esc(p.sub || '')}</div>
          </div>
          <a class="call ${p.phone ? '' : 'hidden'}" data-call href="${href || '#'}" aria-label="Call">${ICO_PHONE}</a>
        </div>
        <div class="track-actions">
          <button class="btn full green ${showComplete ? '' : 'hidden'}" data-drop="${esc(order.id)}">Complete</button>
          <button class="btn full ${showDone ? '' : 'hidden'}" data-done>Done</button>
        </div>
      </div>
    </div>`;
  }

  function paint(root, order, viewer) {
    if (!root || !order) return;
    const p = person(order, viewer);
    const name = root.querySelector('[data-rider]');
    if (name) name.textContent = p.name;
    const sub = root.querySelector('[data-sub]');
    if (sub) sub.textContent = p.sub || '';
    const call = root.querySelector('[data-call]');
    if (call) {
      call.classList.toggle('hidden', !p.phone);
      if (p.phone) call.href = telHref(p.phone);
    }
    root.querySelector('[data-online]')?.classList.toggle('hidden', !p.online);
    const img = root.querySelector('[data-avatar]');
    if (img) img.style.filter = p.gray ? 'grayscale(1)' : 'none';
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
  };
})(window);
