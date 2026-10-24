(function (global) {
  const GREEN = '#22C55E';
  const GLOW = '#86EFAC';

  function curvePoints(from, to) {
    const lat1 = from[0];
    const lng1 = from[1];
    const lat2 = to[0];
    const lng2 = to[1];
    const dlat = lat2 - lat1;
    const dlng = lng2 - lng1;
    const dist = Math.hypot(dlat, dlng) || 0.01;
    const bulge = dist * 0.32;
    const px = -dlng;
    const py = dlat;
    const plen = Math.hypot(px, py) || 1;
    const cx = (lat1 + lat2) / 2 + (px / plen) * bulge;
    const cy = (lng1 + lng2) / 2 + (py / plen) * bulge;
    const pts = [];
    const steps = 28;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      pts.push([
        u * u * lat1 + 2 * u * t * cx + t * t * lat2,
        u * u * lng1 + 2 * u * t * cy + t * t * lng2,
      ]);
    }
    return pts;
  }

  function nearestIndex(pts, point) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const d = Math.hypot(pts[i][0] - point[0], pts[i][1] - point[1]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  function haversineKm(a, b) {
    const R = 6371;
    const dLat = ((b[0] - a[0]) * Math.PI) / 180;
    const dLng = ((b[1] - a[1]) * Math.PI) / 180;
    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  function bearingDeg(a, b) {
    const lat1 = (a[0] * Math.PI) / 180;
    const lat2 = (b[0] * Math.PI) / 180;
    const dLng = ((b[1] - a[1]) * Math.PI) / 180;
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function lerpHeading(a, b, t) {
    const d = ((b - a + 540) % 360) - 180;
    return (a + d * t + 360) % 360;
  }

  const SHOP_SVG =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2"><path d="M4 10V20h16V10"/><path d="M3 10l9-7 9 7"/><path d="M9 20v-6h6v6"/></svg>';

  function htmlEsc(s) {
    return String(s ?? '').replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function shopIcon() {
    return L.divIcon({
      className: 'pin-shop-wrap',
      html:
        '<div class="pin-lab"><div class="pin-shop-ico">' + SHOP_SVG + '</div><span>Shop</span></div>',
      iconSize: [72, 58],
      iconAnchor: [36, 58],
    });
  }

  function shopOverviewIcon(name, dot) {
    let raw = String(name || 'Shop').trim() || 'Shop';
    if (raw.length > 18) raw = raw.slice(0, 17) + '…';
    const label = htmlEsc(raw);
    const kind = dot === 'red' ? 'red' : (dot === 'green' || dot === true ? 'green' : '');
    return L.divIcon({
      className: 'pin-shop-wrap' + (kind ? ' pin-shop-' + kind : ''),
      html:
        '<div class="pin-lab"><div class="pin-shop-ico">' +
        SHOP_SVG +
        (kind ? '<i class="pin-shop-dot' + (kind === 'red' ? ' red' : '') + '"></i>' : '') +
        '</div><span>' +
        label +
        '</span></div>',
      iconSize: [86, 58],
      iconAnchor: [43, 58],
    });
  }

  function destIcon() {
    return L.divIcon({
      className: 'pin-dest-wrap',
      html:
        '<div class="pin-lab"><div class="pin-home-ico pin-people-ico"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="2.6"/><path d="M3.2 19c.6-3.2 2.8-4.8 4.8-4.8s4.2 1.6 4.8 4.8"/><circle cx="16.2" cy="8.4" r="2.2"/><path d="M12.6 19c.5-2.4 1.8-3.6 3.6-3.6s3.1 1.2 3.6 3.6"/></svg></div><span>Customer</span></div>',
      iconSize: [90, 58],
      iconAnchor: [45, 58],
    });
  }

  function liveDotIcon() {
    return L.divIcon({
      className: 'live-dot-wrap',
      html: '<div class="live-dot"><i></i><i></i><b></b></div>',
      iconSize: [56, 56],
      iconAnchor: [28, 28],
    });
  }

  function dropPinIcon() {
    return L.divIcon({
      className: 'drop-pin-wrap',
      html: '<div class="drop-pin"><span></span></div>',
      iconSize: [36, 48],
      iconAnchor: [18, 44],
    });
  }

  function bikeIcon() {
    return L.divIcon({
      className: 'pin-bike-wrap',
      html: '<div class="pin-bike">🛵</div>',
      iconSize: [40, 40],
      iconAnchor: [20, 20],
    });
  }

  function samePoint(aLat, aLng, bLat, bLng) {
    return Math.abs(Number(aLat) - Number(bLat)) < 1e-5 && Math.abs(Number(aLng) - Number(bLng)) < 1e-5;
  }

  function registeredShopPos(order) {
    const shop =
      typeof API !== 'undefined' && API.shopOf ? API.shopOf(order && order.shopId) : {};
    const sLat = Number(shop && shop.lat);
    const sLng = Number(shop && shop.lng);
    if (Number.isFinite(sLat) && Number.isFinite(sLng)) return [sLat, sLng];
    const oLat = Number(order && order.shopLat);
    const oLng = Number(order && order.shopLng);
    const dLat = Number(order && order.deliveryLat);
    const dLng = Number(order && order.deliveryLng);
    if (Number.isFinite(oLat) && Number.isFinite(oLng)) {
      if (Number.isFinite(dLat) && samePoint(oLat, oLng, dLat, dLng)) return null;
      return [oLat, oLng];
    }
    return null;
  }

  function positions(order) {
    const dest = [Number(order.deliveryLat), Number(order.deliveryLng)];
    const shopPos = registeredShopPos(order);
    const rider =
      order.riderLat != null && order.riderLng != null
        ? [Number(order.riderLat), Number(order.riderLng)]
        : null;
    return { dest, shopPos, rider };
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

  function routeEnds(order, pos) {
    const shop = pos.shopPos || pos.dest;
    if (goingToShop(order)) {
      return { from: pos.rider || pos.dest, to: shop };
    }
    return { from: pos.rider || shop, to: pos.dest };
  }

  function drawRoutes(map, layers, shopPos, dest, rider) {
    const full = curvePoints(shopPos, dest);
    let done = [];
    let rest = full;
    if (rider) {
      const idx = nearestIndex(full, rider);
      done = full.slice(0, Math.max(1, idx + 1));
      rest = full.slice(idx);
      if (rest.length < 2) rest = [rider, dest];
    }
    if (layers.glow) map.removeLayer(layers.glow);
    if (layers.solid) map.removeLayer(layers.solid);
    if (layers.dash) map.removeLayer(layers.dash);
    layers.glow = L.polyline(rest.length ? rest : full, {
      color: GLOW,
      weight: 12,
      opacity: 0.45,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);
    layers.solid = L.polyline(rest.length ? rest : full, {
      color: GREEN,
      weight: 5,
      opacity: 1,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);
    if (done.length > 1) {
      layers.dash = L.polyline(done, {
        color: GREEN,
        weight: 5,
        opacity: 0.55,
        dashArray: '7 10',
        lineCap: 'round',
      }).addTo(map);
    } else {
      layers.dash = null;
    }
  }

  function tipHtml(order) {
    const pos = positions(order);
    const ends = routeEnds(order, pos);
    const from = pos.rider || ends.from;
    const km = haversineKm(from, ends.to);
    const left = km < 0.1 ? Math.max(1, Math.round(km * 1000)) + ' m' : km.toFixed(1) + ' km';
    const eta = (global.TrackUI && TrackUI.etaRange) ? TrackUI.etaRange(km, order) : '';
    const label =
      order.status === 'delivered'
        ? 'Delivered'
        : goingToShop(order)
          ? 'To shop'
          : order.status === 'picked_up' || order.status === 'on_the_way'
            ? 'Picked up'
            : 'Heading out';
    return `<b>${label}</b><br>${left} left${eta ? '<br>ETA ' + eta : ''}`;
  }

  global.routeCurve = curvePoints;
  global.haversineKm = haversineKm;

  function parseOsrm(route) {
    const coords = (route.geometry.coordinates || []).map(function (c) {
      return [c[1], c[0]];
    });
    const steps = [];
    (route.legs || []).forEach(function (leg) {
      (leg.steps || []).forEach(function (st) {
        const m = st.maneuver || {};
        const loc = m.location;
        if (!loc) return;
        steps.push({
          loc: [loc[1], loc[0]],
          type: String(m.type || ''),
          modifier: String(m.modifier || ''),
          name: String(st.name || ''),
          dist: Number(st.distance) || 0,
          exit: Number(m.exit) || 0,
          idx: nearestIndex(coords, [loc[1], loc[0]]),
        });
      });
    });
    return { coords: coords, steps: steps, distance: Number(route.distance) || 0, duration: Number(route.duration) || 0 };
  }

  async function fetchRoad(from, to) {
    if (!from || !to || !Number.isFinite(from[0]) || !Number.isFinite(to[0])) return null;
    const path =
      Number(from[1]).toFixed(6) +
      ',' +
      Number(from[0]).toFixed(6) +
      ';' +
      Number(to[1]).toFixed(6) +
      ',' +
      Number(to[0]).toFixed(6) +
      '?overview=full&geometries=geojson&steps=true';
    const urls = [
      'https://router.project-osrm.org/route/v1/driving/' + path,
      'https://routing.openstreetmap.de/routed-car/route/v1/driving/' + path,
    ];
    for (let i = 0; i < urls.length; i++) {
      const j = await fetchJson(urls[i], 4500);
      const route = j && j.routes && j.routes[0];
      if (route && route.geometry && route.geometry.coordinates && route.geometry.coordinates.length > 1) {
        return parseOsrm(route);
      }
    }
    return null;
  }

  function exitWords(n) {
    const x = Math.round(Number(n) || 0);
    if (x === 1) return '1st exit';
    if (x === 2) return '2nd exit';
    if (x === 3) return '3rd exit';
    if (x > 3) return x + 'th exit';
    return '';
  }

  function turnLabel(step, fallback) {
    if (!step) return fallback || 'Go to shop';
    const t = String(step.type || '');
    const mod = String(step.modifier || '').replace(/_/g, ' ');
    if (t === 'arrive') return 'Arrive';
    if (t === 'depart') return fallback || 'Start';
    if (t === 'roundabout' || t === 'rotary' || t === 'roundabout turn') {
      const ex = exitWords(step.exit);
      return ex ? 'Roundabout, ' + ex : 'Roundabout';
    }
    if (/left/.test(mod)) return /slight/.test(mod) ? 'Keep Left' : /sharp/.test(mod) ? 'Sharp Left' : 'Turn Left';
    if (/right/.test(mod)) return /slight/.test(mod) ? 'Keep Right' : /sharp/.test(mod) ? 'Sharp Right' : 'Turn Right';
    if (/uturn|u-turn/.test(mod) || t === 'uturn') return 'U-turn';
    if (t === 'continue' || /straight/.test(mod)) return 'Go Straight';
    return fallback || 'Continue';
  }

  function fmtMeters(m) {
    const n = Math.max(0, Number(m) || 0);
    if (n < 8) return 'now';
    if (n < 1000) return String(Math.max(5, Math.round(n / 5) * 5)) + ' m';
    const km = n / 1000;
    return (km >= 10 ? km.toFixed(0) : km.toFixed(1)) + ' km';
  }

  function metersAlong(coords, fromIdx, toIdx, from) {
    if (!coords || !coords.length) return 0;
    const a = Math.max(0, Math.min(fromIdx, coords.length - 1));
    const b = Math.max(0, Math.min(toIdx, coords.length - 1));
    let m = 0;
    if (from && coords[a]) m += haversineKm(from, coords[a]) * 1000;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    for (let i = lo; i < hi; i++) m += haversineKm(coords[i], coords[i + 1]) * 1000;
    return m;
  }

  function navChipIcon(text) {
    return L.divIcon({
      className: 'nav-chip-wrap',
      html: '<div class="nav-chip">' + htmlEsc(text) + '</div>',
      iconSize: [140, 32],
      iconAnchor: [70, 36],
    });
  }

  global.mountTrackingMap = function (el, order) {
    if (!el || !order || typeof L === 'undefined') return null;
    const pos = positions(order);
    const center = pos.rider || pos.shopPos || pos.dest;
    const map = L.map(el, {
      zoomControl: false,
      attributionControl: false,
    }).setView(center, 14);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '',
    }).addTo(map);

    let shopMarker = pos.shopPos
      ? L.marker(pos.shopPos, { icon: shopIcon() }).addTo(map)
      : null;
    const destLocked = [pos.dest[0], pos.dest[1]];
    L.marker(destLocked, { icon: destIcon() }).addTo(map);
    let liveMarker = null;
    const live = window.QB_LIVE;
    if (live && live.lat != null) {
      liveMarker = L.marker([live.lat, live.lng], { icon: liveDotIcon(), interactive: false, zIndexOffset: 600 }).addTo(map);
    }
    let riderMarker = null;
    const layers = { glow: null, solid: null, dash: null, chips: [] };
    const ends0 = routeEnds(order, pos);
    drawRoutes(map, layers, ends0.from, ends0.to, pos.rider);
    if (pos.rider && riderOnJob(order)) {
      riderMarker = L.marker(pos.rider, { icon: bikeIcon() }).addTo(map);
      riderMarker.bindTooltip(tipHtml(order), {
        permanent: true,
        direction: 'right',
        offset: [16, -8],
        className: 'km-tip',
        opacity: 1,
      });
    }

    const pad = { paddingTopLeft: [28, 96], paddingBottomRight: [56, 220] };
    const pts = [pos.dest];
    if (pos.shopPos) pts.push(pos.shopPos);
    if (pos.rider) pts.push(pos.rider);
    map.fitBounds(L.latLngBounds(pts).pad(0.18), pad);
    setTimeout(() => map.invalidateSize(), 200);
    setTimeout(() => map.invalidateSize(), 600);

    const nav = {
      on: false,
      road: null,
      toKey: '',
      lastFetch: 0,
      fetching: false,
      hint: '',
      spd: 0,
      lastFix: null,
      prev: null,
      heading: 0,
      headingSet: false,
      compass: null,
      timer: null,
      orientBound: false,
      onOrient: null,
    };
    let lastOrder = order;

    function isRiderView() {
      return typeof document !== 'undefined' && document.documentElement.getAttribute('data-role') === 'rider';
    }

    function navFrom(next, p) {
      if (isRiderView()) {
        const live = window.QB_LIVE;
        if (live && live.lat != null) return [Number(live.lat), Number(live.lng)];
      }
      if (p.rider && Number.isFinite(p.rider[0])) return p.rider;
      const live = window.QB_LIVE;
      if (live && live.lat != null) return [Number(live.lat), Number(live.lng)];
      return null;
    }

    function mePoint(p) {
      const live = window.QB_LIVE;
      if (live && live.lat != null) return [Number(live.lat), Number(live.lng)];
      return navFrom(lastOrder, p);
    }

    function navTo(next, p) {
      return goingToShop(next) ? p.shopPos || p.dest : p.dest;
    }

    function destTitle(next) {
      return goingToShop(next) ? 'Go to shop' : 'Go to customer';
    }

    function headingAlongRoad(from, road) {
      if (!from || !road || !road.coords || road.coords.length < 2) return null;
      const i = nearestIndex(road.coords, from);
      let j = i;
      for (let k = i + 1; k < road.coords.length; k++) {
        j = k;
        if (haversineKm(road.coords[i], road.coords[k]) * 1000 >= 32) break;
      }
      if (j <= i) j = Math.min(road.coords.length - 1, i + 2);
      const a = road.coords[i];
      const b = road.coords[j];
      if (!a || !b || (a[0] === b[0] && a[1] === b[1])) return null;
      return bearingDeg(a, b);
    }

    function liveCourse() {
      const live = window.QB_LIVE;
      if (!live) return null;
      const h = Number(live.heading);
      const spd = Number(live.speed);
      if (!Number.isFinite(h) || h < 0) return null;
      if (Number.isFinite(spd) && spd >= 0 && spd < 0.6) return null;
      return h;
    }

    function applyMapRotate(heading, on) {
      const box = map.getContainer();
      const root = el.closest && el.closest('[data-track-root]');
      if (!on) {
        box.style.transform = '';
        box.style.transformOrigin = '';
        box.style.transition = '';
        if (root) {
          root.classList.remove('is-nav');
          root.style.removeProperty('--nav-rot');
        }
        nav.headingSet = false;
        return;
      }
      if (root) {
        root.classList.add('is-nav');
        root.style.setProperty('--nav-rot', Number(heading).toFixed(1) + 'deg');
      }
      box.style.transformOrigin = '50% 58%';
      box.style.transition = 'transform 0.18s linear';
      box.style.transform = 'rotate(' + (-Number(heading)).toFixed(1) + 'deg) scale(1.38)';
    }

    function updateHeading(from, road, kmh) {
      let target = liveCourse();
      if (target == null) target = headingAlongRoad(from, road);
      if (target == null && nav.compass != null && Number.isFinite(nav.compass)) target = nav.compass;
      if (target == null && nav.lastFix && kmh >= 2.5) {
        const moved = haversineKm([nav.lastFix.lat, nav.lastFix.lng], from) * 1000;
        if (moved >= 3) target = bearingDeg([nav.lastFix.lat, nav.lastFix.lng], from);
      }
      if (target == null) return nav.headingSet ? nav.heading : 0;
      if (!nav.headingSet) {
        nav.heading = target;
        nav.headingSet = true;
      } else {
        nav.heading = lerpHeading(nav.heading, target, 0.22);
      }
      return nav.heading;
    }

    function bindCompass() {
      if (nav.orientBound) return;
      nav.orientBound = true;
      nav.onOrient = function (e) {
        if (!e) return;
        let h = null;
        if (e.webkitCompassHeading != null && !isNaN(e.webkitCompassHeading)) h = Number(e.webkitCompassHeading);
        else if (e.alpha != null && !isNaN(e.alpha)) h = (360 - Number(e.alpha) + 360) % 360;
        if (h != null) nav.compass = h;
      };
      window.addEventListener('deviceorientationabsolute', nav.onOrient, true);
      window.addEventListener('deviceorientation', nav.onOrient, true);
    }

    function unbindCompass() {
      if (!nav.orientBound) return;
      nav.orientBound = false;
      if (nav.onOrient) {
        window.removeEventListener('deviceorientationabsolute', nav.onOrient, true);
        window.removeEventListener('deviceorientation', nav.onOrient, true);
      }
      nav.onOrient = null;
      nav.compass = null;
    }

    function stopHeadingLoop() {
      if (nav.timer) {
        clearInterval(nav.timer);
        nav.timer = null;
      }
      unbindCompass();
    }

    function startHeadingLoop() {
      if (nav.timer) return;
      bindCompass();
      nav.timer = setInterval(function () {
        if (!nav.on) return;
        const next = lastOrder;
        if (!next || next.status === 'delivered' || next.status === 'cancelled') {
          restoreOverview(next);
          return;
        }
        tickFollow(next, false);
      }, 220);
    }

    function clearChips() {
      (layers.chips || []).forEach(function (m) {
        try { map.removeLayer(m); } catch (_) {}
      });
      layers.chips = [];
    }

    function drawNavRoute(from, road) {
      if (!road || !road.coords || road.coords.length < 2) return;
      const idx = nearestIndex(road.coords, from);
      let rest = road.coords.slice(Math.max(0, idx));
      if (rest.length < 2) rest = road.coords.slice(-2);
      if (layers.glow) map.removeLayer(layers.glow);
      if (layers.solid) map.removeLayer(layers.solid);
      if (layers.dash) map.removeLayer(layers.dash);
      layers.dash = null;
      layers.glow = L.polyline(rest, {
        color: GLOW,
        weight: 14,
        opacity: 0.5,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map);
      layers.solid = L.polyline(rest, {
        color: GREEN,
        weight: 6,
        opacity: 1,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map);
    }

    function upcomingSteps(from, road) {
      if (!road || !road.steps) return [];
      const idx = nearestIndex(road.coords, from);
      const out = [];
      for (let i = 0; i < road.steps.length; i++) {
        const s = road.steps[i];
        if (s.type === 'depart') continue;
        if ((s.idx || 0) + 1 < idx) continue;
        out.push(s);
        if (out.length >= 3) break;
      }
      return out;
    }

    function nextTurn(from, road) {
      const coming = upcomingSteps(from, road);
      for (let i = 0; i < coming.length; i++) {
        const s = coming[i];
        const t = String(s.type || '');
        if (t === 'continue') continue;
        return s;
      }
      return coming[0] || null;
    }

    function metersToTurn(from, road, step) {
      if (!from || !road || !road.coords) return 0;
      if (!step) {
        const last = road.coords[road.coords.length - 1];
        return last ? haversineKm(from, last) * 1000 : 0;
      }
      const idx = nearestIndex(road.coords, from);
      const end = Number.isFinite(step.idx) ? step.idx : nearestIndex(road.coords, step.loc);
      return metersAlong(road.coords, idx, end, from);
    }

    function speedKmh(from) {
      const now = Date.now();
      const liveSpd = window.QB_LIVE && Number(window.QB_LIVE.speed);
      if (Number.isFinite(liveSpd) && liveSpd >= 0) {
        const kmh = liveSpd * 3.6;
        if (kmh <= 90) {
          nav.spd = kmh;
          if (!nav.lastFix || haversineKm([nav.lastFix.lat, nav.lastFix.lng], from) * 1000 >= 2) {
            nav.lastFix = { lat: from[0], lng: from[1], t: now, kmh: kmh };
          }
          return kmh;
        }
      }
      let kmh = nav.spd || 0;
      if (nav.lastFix && nav.lastFix.t) {
        const dt = (now - nav.lastFix.t) / 1000;
        const dkm = haversineKm([nav.lastFix.lat, nav.lastFix.lng], from);
        if (dt >= 0.8 && dt < 40 && dkm * 1000 >= 2) {
          const raw = (dkm / dt) * 3600;
          if (raw >= 0 && raw <= 80) kmh = nav.lastFix.kmh ? nav.lastFix.kmh * 0.6 + raw * 0.4 : raw;
          nav.lastFix = { lat: from[0], lng: from[1], t: now, kmh: kmh };
        } else kmh = nav.lastFix.kmh || kmh;
      } else {
        nav.lastFix = { lat: from[0], lng: from[1], t: now, kmh: kmh };
      }
      nav.spd = kmh;
      return kmh;
    }

    function paintHint(next, from, road) {
      const root = el.closest && el.closest('[data-track-root]');
      const box = root && root.querySelector('[data-nav-hint]');
      const turnEl = root && root.querySelector('[data-nav-turn]');
      const inEl = root && root.querySelector('[data-nav-in]');
      const spdEl = root && root.querySelector('[data-nav-spd]');
      const fab = root && root.querySelector('[data-nav-live]');
      if (fab) fab.classList.toggle('on', !!nav.on);
      if (!box) return;
      if (!nav.on) {
        box.classList.add('hidden');
        return;
      }
      box.classList.remove('hidden');
      const step = nextTurn(from, road);
      const title = destTitle(next);
      const label = turnLabel(step, title);
      const meters = metersToTurn(from, road, step);
      const inTxt = !step ? '' : (meters < 8 ? 'Now' : 'in ' + fmtMeters(meters));
      nav.hint = label;
      if (turnEl && turnEl.textContent !== label) turnEl.textContent = label;
      if (inEl && inEl.textContent !== inTxt) inEl.textContent = inTxt;
      const kmh = Math.round(speedKmh(from));
      const spdTxt = kmh >= 2 ? (kmh < 25 ? 'Slow ' + kmh + '-kmph' : kmh + ' km/h') : '';
      if (spdEl && spdEl.textContent !== spdTxt) spdEl.textContent = spdTxt;
    }

    function tickFollow(next, force) {
      if (!nav.on || !next) return;
      const p = positions(next);
      p.dest = destLocked;
      const from = navFrom(next, p);
      const me = mePoint(p) || from;
      if (!me) return;
      paintLive(p);
      if (nav.road) drawNavRoute(me, nav.road);
      const kmh = nav.spd || 0;
      const head = updateHeading(me, nav.road, kmh);
      paintHint(next, me, nav.road);
      applyMapRotate(head, true);
      try {
        if (force) map.setView(me, Math.max(map.getZoom(), 17), { animate: true });
        else map.panTo(me, { animate: false });
      } catch (_) {}
    }

    function offRoute(from, road) {
      if (!from || !road || !road.coords || !road.coords.length) return true;
      const i = nearestIndex(road.coords, from);
      return haversineKm(from, road.coords[i]) * 1000 > 70;
    }

    async function refreshRoad(next, force) {
      const p = positions(next);
      p.dest = destLocked;
      const from = navFrom(next, p);
      const to = navTo(next, p);
      if (!from || !to) return;
      const key = goingToShop(next) + ':' + Number(to[0]).toFixed(5) + ',' + Number(to[1]).toFixed(5);
      const now = Date.now();
      const stale = now - nav.lastFetch > 18000;
      const need = force || nav.toKey !== key || !nav.road || (stale && offRoute(from, nav.road));
      if (need && !nav.fetching) {
        nav.fetching = true;
        nav.toKey = key;
        try {
          const road = await fetchRoad(from, to);
          if (road) {
            nav.road = road;
            nav.lastFetch = Date.now();
          }
        } catch (_) {}
        nav.fetching = false;
      }
      if (nav.road) drawNavRoute(from, nav.road);
      else {
        const ends = routeEnds(next, p);
        drawRoutes(map, layers, ends.from, ends.to, p.rider);
      }
      tickFollow(next, force);
      startHeadingLoop();
    }

    function restoreOverview(next) {
      nav.on = false;
      nav.road = null;
      nav.toKey = '';
      nav.headingSet = false;
      stopHeadingLoop();
      applyMapRotate(0, false);
      clearChips();
      const p = positions(next || lastOrder || order);
      p.dest = destLocked;
      const ends = routeEnds(next || lastOrder || order, p);
      drawRoutes(map, layers, ends.from, ends.to, p.rider);
      paintHint(next || lastOrder || order, navFrom(next || lastOrder || order, p), null);
      const prev = nav.prev;
      nav.prev = null;
      try {
        if (prev && Number.isFinite(prev.lat) && Number.isFinite(prev.lng)) {
          map.setView([prev.lat, prev.lng], prev.zoom || 14, { animate: true });
          return;
        }
      } catch (_) {}
      const pts = [p.dest];
      if (p.shopPos) pts.push(p.shopPos);
      if (p.rider) pts.push(p.rider);
      try {
        map.fitBounds(L.latLngBounds(pts).pad(0.18), pad);
      } catch (_) {}
    }

    function paintLive(p) {
      const live = window.QB_LIVE;
      if (live && live.lat != null) {
        if (!liveMarker) liveMarker = L.marker([live.lat, live.lng], { icon: liveDotIcon(), interactive: false, zIndexOffset: 600 }).addTo(map);
        else liveMarker.setLatLng([live.lat, live.lng]);
      }
      if (p.shopPos) {
        if (!shopMarker) shopMarker = L.marker(p.shopPos, { icon: shopIcon() }).addTo(map);
        else shopMarker.setLatLng(p.shopPos);
      }
    }

    function paintRider(next, p) {
      if (p.rider && riderOnJob(next)) {
        if (!riderMarker) {
          riderMarker = L.marker(p.rider, { icon: bikeIcon() }).addTo(map);
          riderMarker.bindTooltip(tipHtml(next), {
            permanent: true,
            direction: 'right',
            offset: [16, -8],
            className: 'km-tip',
            opacity: 1,
          });
        } else {
          riderMarker.setLatLng(p.rider);
          riderMarker.setTooltipContent(tipHtml(next));
        }
      }
    }

    return {
      map,
      update(next) {
        if (!next) return;
        lastOrder = next;
        const p = positions(next);
        p.dest = destLocked;
        paintLive(p);
        if (nav.on && (next.status === 'delivered' || next.status === 'cancelled')) {
          restoreOverview(next);
          paintRider(next, p);
          return;
        }
        if (nav.on) {
          refreshRoad(next, false);
          paintRider(next, p);
          return;
        }
        const ends = routeEnds(next, p);
        drawRoutes(map, layers, ends.from, ends.to, p.rider);
        paintRider(next, p);
      },
      zoomIn() {
        map.zoomIn();
      },
      zoomOut() {
        map.zoomOut();
      },
      locate(order2) {
        const next = order2 || order;
        const p = positions(next);
        const from = navFrom(next, p);
        const c = from || p.rider || destLocked;
        map.setView(c, Math.max(map.getZoom(), 16));
      },
      followTo(order2) {
        const next = order2 || order;
        const p = positions(next);
        const to = navTo(next, p);
        const from = navFrom(next, p);
        const pts = [];
        if (to && Number.isFinite(to[0])) pts.push(to);
        if (from && Number.isFinite(from[0])) pts.push(from);
        if (!pts.length) return;
        try {
          if (pts.length === 1) map.setView(pts[0], 16);
          else map.fitBounds(L.latLngBounds(pts).pad(0.22), pad);
        } catch (_) {
          map.setView(pts[0], 16);
        }
      },
      startNav(order2) {
        const next = order2 || lastOrder || order;
        lastOrder = next;
        if (nav.on) {
          restoreOverview(next);
          return;
        }
        try {
          const c = map.getCenter();
          nav.prev = { lat: c.lat, lng: c.lng, zoom: map.getZoom() };
        } catch (_) {
          nav.prev = null;
        }
        nav.on = true;
        nav.headingSet = false;
        refreshRoad(next, true);
        startHeadingLoop();
      },
      tickNav() {
        if (nav.on) tickFollow(lastOrder || order, false);
      },
      destroy() {
        nav.on = false;
        stopHeadingLoop();
        applyMapRotate(0, false);
        clearChips();
        try {
          map.remove();
        } catch (_) {}
      },
    };
  };

  function photonLabel(f) {
    const p = (f && f.properties) || {};
    const parts = [p.name, p.street, p.city || p.county || p.town, p.state].filter(Boolean);
    const uniq = [];
    parts.forEach((x) => { if (uniq.indexOf(x) === -1) uniq.push(x); });
    return uniq.join(', ') || 'Pinned location';
  }

  async function fetchJson(url, ms) {
    const ctrl = new AbortController();
    const t = setTimeout(function () { ctrl.abort(); }, ms || 2500);
    try {
      const r = await fetch(url, { signal: ctrl.signal });
      if (!r.ok) return null;
      return await r.json();
    } catch (_) {
      return null;
    } finally {
      clearTimeout(t);
    }
  }

  global.reversePlace = async function (lat, lng) {
    const fallback = lat.toFixed(5) + ', ' + lng.toFixed(5);
    const bd = await fetchJson(
      'https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' + lat + '&longitude=' + lng + '&localityLanguage=en',
      2500,
    );
    if (bd) {
      const parts = [bd.locality, bd.city, bd.principalSubdivision].filter(function (x, i, a) {
        return x && a.indexOf(x) === i;
      });
      if (parts.length) return parts.slice(0, 2).join(', ');
    }
    const j = await fetchJson('https://photon.komoot.io/reverse?lon=' + lng + '&lat=' + lat, 2500);
    const f = j && j.features && j.features[0];
    if (f) return photonLabel(f);
    return fallback;
  };

  global.searchPlaces = async function (q) {
    if (!q || q.length < 2) return [];
    try {
      const r = await fetch('https://photon.komoot.io/api/?limit=6&q=' + encodeURIComponent(q));
      const j = await r.json();
      return (j.features || []).map((f) => ({
        label: photonLabel(f),
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
      }));
    } catch (_) {
      return [];
    }
  };

  global.mountLocationPicker = function (el, opts) {
    if (!el || typeof L === 'undefined') return null;
    const startLat = opts.liveLat != null ? opts.liveLat : (Number(opts.lat) || 8.335);
    const startLng = opts.liveLng != null ? opts.liveLng : (Number(opts.lng) || 80.411);
    const frozen = !!opts.frozen;
    const map = L.map(el, { zoomControl: false, attributionControl: false }).setView([startLat, startLng], 18);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    let follow = !opts.custom && !frozen;
    let userMoved = !!opts.custom;
    let liveMarker = null;
    let accCircle = null;
    const pickMarker = L.marker([startLat, startLng], {
      icon: dropPinIcon(),
      draggable: !frozen,
      zIndexOffset: 1400,
      autoPan: true,
    }).addTo(map);
    if (opts.liveLat != null && opts.liveLng != null) {
      liveMarker = L.marker([opts.liveLat, opts.liveLng], {
        icon: liveDotIcon(),
        zIndexOffset: 800,
        interactive: false,
      }).addTo(map);
    }
    pickMarker.on('dragstart', function () {
      userMoved = true;
      follow = false;
    });
    pickMarker.on('dragend', function () {
      userMoved = true;
      follow = false;
      const ll = pickMarker.getLatLng();
      map.panTo(ll);
    });
    setTimeout(function () { map.invalidateSize(); }, 80);
    setTimeout(function () { map.invalidateSize(); }, 300);
    setTimeout(function () { map.invalidateSize(); }, 800);
    function pinLatLng() {
      const p = pickMarker.getLatLng();
      return { lat: p.lat, lng: p.lng };
    }
    return {
      map,
      getCenter: pinLatLng,
      setView(lat, lng, z) {
        follow = false;
        userMoved = true;
        pickMarker.setLatLng([lat, lng]);
        map.setView([lat, lng], z || 18);
      },
      goLive(lat, lng, z) {
        follow = true;
        userMoved = false;
        pickMarker.setLatLng([lat, lng]);
        map.setView([lat, lng], z || 18);
      },
      setLive(lat, lng, acc) {
        if (lat == null || lng == null) return;
        if (!liveMarker) {
          liveMarker = L.marker([lat, lng], {
            icon: liveDotIcon(),
            zIndexOffset: 800,
            interactive: false,
          }).addTo(map);
        } else {
          liveMarker.setLatLng([lat, lng]);
        }
        const meters = Number(acc);
        if (meters > 0 && meters < 2500) {
          if (!accCircle) {
            accCircle = L.circle([lat, lng], {
              radius: meters,
              color: '#1A73E8',
              weight: 1,
              fillColor: '#1A73E8',
              fillOpacity: 0.14,
              interactive: false,
            }).addTo(map);
          } else {
            accCircle.setLatLng([lat, lng]);
            accCircle.setRadius(meters);
          }
        }
        if (follow && !userMoved && !frozen) {
          pickMarker.setLatLng([lat, lng]);
          map.setView([lat, lng], Math.max(map.getZoom(), 18));
        }
      },
      onMoveEnd(fn) {
        const fire = function () {
          const p = pinLatLng();
          fn(p.lat, p.lng);
        };
        pickMarker.on('dragend', fire);
        map.on('moveend', function () {
          if (follow && !userMoved) fire();
        });
        setTimeout(fire, 200);
      },
      destroy() {
        try { map.remove(); } catch (_) {}
      },
    };
  };

  global.mountRiderOverviewMap = function (el, opts) {
    opts = opts || {};
    if (!el || typeof L === 'undefined') return null;
    const startLat = opts.lat != null ? Number(opts.lat) : 8.335;
    const startLng = opts.lng != null ? Number(opts.lng) : 80.4108;
    const map = L.map(el, { zoomControl: false, attributionControl: false }).setView([startLat, startLng], 14);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '',
    }).addTo(map);
    let liveMarker = null;
    const shopMarks = {};
    const onShop = typeof opts.onShop === 'function' ? opts.onShop : null;

    function setLive(lat, lng) {
      if (lat == null || lng == null) return;
      const la = Number(lat), ln = Number(lng);
      if (!Number.isFinite(la) || !Number.isFinite(ln)) return;
      if (!liveMarker) {
        liveMarker = L.marker([la, ln], { icon: liveDotIcon(), interactive: false, zIndexOffset: 600 }).addTo(map);
      } else liveMarker.setLatLng([la, ln]);
    }

    function setShops(shops, dots) {
      dots = dots || {};
      const keep = {};
      (shops || []).forEach(function (s) {
        if (!s || !s.id || s.lat == null || s.lng == null) return;
        const lat = Number(s.lat), lng = Number(s.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        keep[s.id] = 1;
        const kind = dots[s.id] === 'red' ? 'red' : (dots[s.id] ? 'green' : '');
        const icon = shopOverviewIcon(s.name, kind);
        const z = kind === 'red' ? 480 : (kind === 'green' ? 320 : 200);
        if (shopMarks[s.id]) {
          shopMarks[s.id].setLatLng([lat, lng]);
          shopMarks[s.id].setIcon(icon);
          shopMarks[s.id].setZIndexOffset(z);
        } else {
          const m = L.marker([lat, lng], { icon: icon, zIndexOffset: z }).addTo(map);
          m.on('click', function () {
            if (onShop) onShop(s.id);
          });
          shopMarks[s.id] = m;
        }
      });
      Object.keys(shopMarks).forEach(function (id) {
        if (keep[id]) return;
        try { map.removeLayer(shopMarks[id]); } catch (_) {}
        delete shopMarks[id];
      });
    }

    setLive(opts.lat, opts.lng);
    setShops(opts.shops, opts.hot);
    const pts = [];
    if (opts.lat != null && opts.lng != null) pts.push([Number(opts.lat), Number(opts.lng)]);
    (opts.shops || []).forEach(function (s) {
      if (s && s.lat != null && s.lng != null) pts.push([Number(s.lat), Number(s.lng)]);
    });
    if (pts.length > 1) {
      try { map.fitBounds(L.latLngBounds(pts).pad(0.22), { padding: [28, 96] }); } catch (_) {}
    }
    setTimeout(function () { try { map.invalidateSize(); } catch (_) {} }, 200);
    setTimeout(function () { try { map.invalidateSize(); } catch (_) {} }, 600);

    return {
      map,
      update(next) {
        next = next || {};
        if (next.lat != null && next.lng != null) setLive(next.lat, next.lng);
        if (next.shops) setShops(next.shops, next.hot || {});
      },
      locate() {
        if (liveMarker) {
          const p = liveMarker.getLatLng();
          map.setView(p, Math.max(map.getZoom(), 16));
        }
      },
      destroy() {
        try { map.remove(); } catch (_) {}
      },
    };
  };
})(window);
