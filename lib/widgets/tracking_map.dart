import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

class TrackingMap extends StatelessWidget {
  final double destLat;
  final double destLng;
  final double? riderLat;
  final double? riderLng;
  final double? shopLat;
  final double? shopLng;
  final bool dark;
  const TrackingMap({
    super.key,
    required this.destLat,
    required this.destLng,
    this.riderLat,
    this.riderLng,
    this.shopLat,
    this.shopLng,
    this.dark = true,
  });

  static const green = Color(0xFF22C55E);
  static const glow = Color(0xFF86EFAC);

  List<LatLng> _curve(LatLng from, LatLng to) {
    final dlat = to.latitude - from.latitude;
    final dlng = to.longitude - from.longitude;
    final px = -dlng;
    final py = dlat;
    final plen = (px.abs() + py.abs()) == 0 ? 1.0 : (px.abs() + py.abs());
    const bulge = 0.006;
    final cx = (from.latitude + to.latitude) / 2 + (px / plen) * bulge;
    final cy = (from.longitude + to.longitude) / 2 + (py / plen) * bulge;
    final pts = <LatLng>[];
    for (var i = 0; i <= 28; i++) {
      final t = i / 28.0;
      final u = 1 - t;
      pts.add(LatLng(
        u * u * from.latitude + 2 * u * t * cx + t * t * to.latitude,
        u * u * from.longitude + 2 * u * t * cy + t * t * to.longitude,
      ));
    }
    return pts;
  }

  int _nearest(List<LatLng> pts, LatLng p) {
    var best = 0;
    var bestD = double.infinity;
    for (var i = 0; i < pts.length; i++) {
      final dlat = pts[i].latitude - p.latitude;
      final dlng = pts[i].longitude - p.longitude;
      final d = dlat * dlat + dlng * dlng;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  @override
  Widget build(BuildContext context) {
    final dest = LatLng(destLat, destLng);
    final shop = LatLng(shopLat ?? destLat + 0.012, shopLng ?? destLng - 0.01);
    final rider = (riderLat != null && riderLng != null) ? LatLng(riderLat!, riderLng!) : null;
    final full = _curve(shop, dest);
    var rest = full;
    if (rider != null) {
      rest = full.sublist(_nearest(full, rider));
    }
    final center = rider ?? dest;
    return FlutterMap(
      options: MapOptions(initialCenter: center, initialZoom: 14),
      children: [
        TileLayer(
          urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          userAgentPackageName: 'com.uberlike.customer',
          fallbackUrl: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png',
          tileBuilder: dark
              ? (context, widget, tile) {
                  return ColorFiltered(
                    colorFilter: const ColorFilter.matrix(<double>[
                      -0.55, 0, 0, 0, 255,
                      0, -0.45, 0, 0, 230,
                      0, 0, -0.35, 0, 200,
                      0, 0, 0, 1, 0,
                    ]),
                    child: widget,
                  );
                }
              : null,
        ),
        PolylineLayer(
          polylines: [
            if (rest.length > 1) Polyline(points: rest, color: glow, strokeWidth: 12),
            if (rest.length > 1) Polyline(points: rest, color: green, strokeWidth: 5),
          ],
        ),
        MarkerLayer(
          markers: [
            Marker(
              point: shop,
              width: 72,
              height: 58,
              child: Column(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: const Color(0xFFE11D48),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(Icons.store, color: Colors.white, size: 18),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(8)),
                    child: const Text('Shop', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: Colors.black)),
                  ),
                ],
              ),
            ),
            Marker(
              point: dest,
              width: 90,
              height: 58,
              child: Column(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: const BoxDecoration(color: green, shape: BoxShape.circle),
                    child: const Icon(Icons.home, color: Colors.white, size: 18),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(8)),
                    child: const Text('Customer', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: Colors.black)),
                  ),
                ],
              ),
            ),
            if (rider != null)
              Marker(
                point: rider,
                width: 40,
                height: 40,
                child: const Text('🛵', style: TextStyle(fontSize: 28)),
              ),
          ],
        ),
      ],
    );
  }
}
