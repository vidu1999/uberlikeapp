(function (global) {
  function riderIcon() {
    return L.divIcon({
      className: '',
      html: '<div style="font-size:28px;line-height:28px">🛵</div>',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
  }
  function destIcon() {
    return L.divIcon({
      className: '',
      html: '<div style="font-size:28px;line-height:28px">📍</div>',
      iconSize: [28, 28],
      iconAnchor: [14, 28],
    });
  }
  function shopIcon() {
    return L.divIcon({
      className: '',
      html: '<div style="font-size:26px;line-height:26px">🏪</div>',
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
  }

  global.mountTrackingMap = function (el, order) {
    if (!el || !order || typeof L === 'undefined') return null;
    const dest = [order.deliveryLat, order.deliveryLng];
    const shop = API.shopOf(order.shopId);
    const shopPos = [shop.lat || dest[0], shop.lng || dest[1]];
    const rider = order.riderLat != null ? [order.riderLat, order.riderLng] : null;
    const center = rider || dest;
    const map = L.map(el, { zoomControl: false, attributionControl: false }).setView(center, 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    L.marker(dest, { icon: destIcon() }).addTo(map);
    L.marker(shopPos, { icon: shopIcon() }).addTo(map);
    let riderMarker = null;
    let line = null;
    if (rider) {
      riderMarker = L.marker(rider, { icon: riderIcon() }).addTo(map);
      line = L.polyline([rider, dest], { color: '#2979FF', weight: 4, opacity: 0.85 }).addTo(map);
      map.fitBounds(L.latLngBounds([rider, dest, shopPos]).pad(0.35));
    } else {
      map.fitBounds(L.latLngBounds([dest, shopPos]).pad(0.4));
    }
    setTimeout(() => map.invalidateSize(), 250);
    return {
      update(next) {
        if (!next || next.riderLat == null) return;
        const r = [next.riderLat, next.riderLng];
        const d = [next.deliveryLat, next.deliveryLng];
        if (!riderMarker) riderMarker = L.marker(r, { icon: riderIcon() }).addTo(map);
        else riderMarker.setLatLng(r);
        if (!line) line = L.polyline([r, d], { color: '#2979FF', weight: 4 }).addTo(map);
        else line.setLatLngs([r, d]);
      },
      destroy() {
        try { map.remove(); } catch (_) {}
      },
    };
  };
})(window);
