(function (global) {
  function riderIcon() {
    return L.divIcon({
      className: '',
      html: '<div style="font-size:28px; line-height:28px">🛵</div>',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
  }
  function destIcon() {
    return L.divIcon({
      className: '',
      html: '<div style="font-size:28px; line-height:28px">📍</div>',
      iconSize: [28, 28],
      iconAnchor: [14, 28],
    });
  }

  global.mountTrackingMap = function (el, order) {
    if (!el || !order) return null;
    const dest = [order.deliveryLat, order.deliveryLng];
    const rider = order.riderLat != null ? [order.riderLat, order.riderLng] : null;
    const center = rider || dest;
    const map = L.map(el, { zoomControl: false, attributionControl: false }).setView(center, 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    L.marker(dest, { icon: destIcon() }).addTo(map);
    let riderMarker = null;
    let line = null;
    if (rider) {
      riderMarker = L.marker(rider, { icon: riderIcon() }).addTo(map);
      line = L.polyline([rider, dest], { color: '#2979FF', weight: 4, opacity: 0.8 }).addTo(map);
      map.fitBounds(L.latLngBounds([rider, dest]).pad(0.3));
    }
    setTimeout(() => map.invalidateSize(), 200);
    return {
      update(next) {
        if (!next) return;
        const d = [next.deliveryLat, next.deliveryLng];
        if (next.riderLat != null) {
          const r = [next.riderLat, next.riderLng];
          if (!riderMarker) riderMarker = L.marker(r, { icon: riderIcon() }).addTo(map);
          else riderMarker.setLatLng(r);
          if (!line) line = L.polyline([r, d], { color: '#2979FF', weight: 4 }).addTo(map);
          else line.setLatLngs([r, d]);
        }
      },
      destroy() {
        map.remove();
      },
    };
  };
})(window);
