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

  function shopIcon() {
    return L.divIcon({
      className: 'pin-shop-wrap',
      html:
        '<div class="pin-lab"><div class="pin-shop-ico"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2"><path d="M4 10V20h16V10"/><path d="M3 10l9-7 9 7"/><path d="M9 20v-6h6v6"/></svg></div><span>Shop</span></div>',
      iconSize: [72, 58],
      iconAnchor: [36, 58],
    });
  }

  function destIcon() {
    return L.divIcon({
      className: 'pin-dest-wrap',
      html:
        '<div class="pin-lab"><div class="pin-home-ico"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2"><path d="M4 10.5 12 4l8 6.5V20h-6v-6H10v6H4z"/></svg></div><span>Customer</span></div>',
      iconSize: [90, 58],
      iconAnchor: [45, 58],
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

  function positions(order) {
    const shop =
      typeof API !== 'undefined' && API.shopOf ? API.shopOf(order.shopId) : {};
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
    const from = pos.rider || pos.shopPos;
    const km = haversineKm(from, pos.dest);
    const left = Math.max(0.2, km).toFixed(1);
    const label =
      order.status === 'delivered'
        ? 'Delivered'
        : order.status === 'on_the_way'
          ? 'On the way'
          : 'Heading out';
    return `<b>${label}</b><br>${left} km left`;
  }

  global.routeCurve = curvePoints;
  global.haversineKm = haversineKm;

  global.mountTrackingMap = function (el, order) {
    if (!el || !order || typeof L === 'undefined') return null;
    const pos = positions(order);
    const center = pos.rider || pos.shopPos;
    const map = L.map(el, {
      zoomControl: false,
      attributionControl: false,
    }).setView(center, 14);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
    }).addTo(map);

    L.marker(pos.shopPos, { icon: shopIcon() }).addTo(map);
    L.marker(pos.dest, { icon: destIcon() }).addTo(map);
    let riderMarker = null;
    const layers = { glow: null, solid: null, dash: null };
    drawRoutes(map, layers, pos.shopPos, pos.dest, pos.rider);
    if (pos.rider) {
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
    const pts = [pos.dest, pos.shopPos];
    if (pos.rider) pts.push(pos.rider);
    map.fitBounds(L.latLngBounds(pts).pad(0.18), pad);
    setTimeout(() => map.invalidateSize(), 200);
    setTimeout(() => map.invalidateSize(), 600);

    return {
      map,
      update(next) {
        if (!next) return;
        const p = positions(next);
        drawRoutes(map, layers, p.shopPos, p.dest, p.rider);
        if (p.rider) {
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
      },
      zoomIn() {
        map.zoomIn();
      },
      zoomOut() {
        map.zoomOut();
      },
      locate(order2) {
        const p = positions(order2 || order);
        const c = p.rider || p.dest;
        map.setView(c, Math.max(map.getZoom(), 14));
      },
      destroy() {
        try {
          map.remove();
        } catch (_) {}
      },
    };
  };
})(window);
