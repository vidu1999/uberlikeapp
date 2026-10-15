(function (global) {
  const PURPLE = '#6B4DFF';
  const PURPLE_GLOW = '#C4B6FF';

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

  function courierIcon() {
    return L.divIcon({
      className: 'pin-courier-wrap',
      html:
        '<div class="pin-courier"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 6l6 6-6 6"/><path d="M13 6l6 6-6 6"/></svg></div>',
      iconSize: [52, 52],
      iconAnchor: [26, 26],
    });
  }

  function destIcon() {
    return L.divIcon({
      className: 'pin-dest-wrap',
      html: '<div class="pin-dest"><i></i></div>',
      iconSize: [40, 40],
      iconAnchor: [20, 20],
    });
  }

  function positions(order) {
    const shop =
      typeof API !== 'undefined' && API.shopOf
        ? API.shopOf(order.shopId)
        : {};
    const dest = [Number(order.deliveryLat), Number(order.deliveryLng)];
    const shopPos = [
      Number(shop.lat != null ? shop.lat : dest[0] + 0.012),
      Number(shop.lng != null ? shop.lng : dest[1] - 0.01),
    ];
    const rider =
      order.riderLat != null && order.riderLng != null
        ? [Number(order.riderLat), Number(order.riderLng)]
        : null;
    return { dest, shopPos, rider };
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
      color: PURPLE_GLOW,
      weight: 10,
      opacity: 0.55,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);
    layers.solid = L.polyline(rest.length ? rest : full, {
      color: PURPLE,
      weight: 5,
      opacity: 1,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);
    if (done.length > 1) {
      layers.dash = L.polyline(done, {
        color: PURPLE,
        weight: 5,
        opacity: 0.85,
        dashArray: '7 10',
        lineCap: 'round',
      }).addTo(map);
    } else {
      layers.dash = null;
    }
  }

  global.routeCurve = curvePoints;

  global.mountTrackingMap = function (el, order) {
    if (!el || !order || typeof L === 'undefined') return null;
    const pos = positions(order);
    const center = pos.rider || pos.dest;
    const map = L.map(el, {
      zoomControl: false,
      attributionControl: false,
    }).setView(center, 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    L.marker(pos.dest, { icon: destIcon() }).addTo(map);
    let riderMarker = null;
    const layers = { glow: null, solid: null, dash: null };
    drawRoutes(map, layers, pos.shopPos, pos.dest, pos.rider);
    if (pos.rider) {
      riderMarker = L.marker(pos.rider, { icon: courierIcon() }).addTo(map);
    }

    const pad = { paddingTopLeft: [28, 88], paddingBottomRight: [28, 150] };
    const pts = [pos.dest, pos.shopPos];
    if (pos.rider) pts.push(pos.rider);
    map.fitBounds(L.latLngBounds(pts).pad(0.18), pad);
    setTimeout(() => map.invalidateSize(), 200);
    setTimeout(() => map.invalidateSize(), 600);

    return {
      update(next) {
        if (!next) return;
        const p = positions(next);
        drawRoutes(map, layers, p.shopPos, p.dest, p.rider);
        if (p.rider) {
          if (!riderMarker) riderMarker = L.marker(p.rider, { icon: courierIcon() }).addTo(map);
          else riderMarker.setLatLng(p.rider);
        }
      },
      destroy() {
        try {
          map.remove();
        } catch (_) {}
      },
    };
  };
})(window);
