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
  const TrackingMap({
    super.key,
    required this.destLat,
    required this.destLng,
    this.riderLat,
    this.riderLng,
    this.shopLat,
    this.shopLng,
  });

  static const purple = Color(0xFF6B4DFF);
  static const glow = Color(0xFFC4B6FF);

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
    final rider = (riderLat != null && riderLng != null)
        ? LatLng(riderLat!, riderLng!)
        : null;
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
          urlTemplate: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
          subdomains: const ['a', 'b', 'c', 'd'],
          userAgentPackageName: 'com.uberlike.customer',
        ),
        PolylineLayer(
          polylines: [
            if (rest.length > 1)
              Polyline(points: rest, color: glow, strokeWidth: 10),
            if (rest.length > 1)
              Polyline(points: rest, color: purple, strokeWidth: 5),
          ],
        ),
        MarkerLayer(
          markers: [
            Marker(
              point: dest,
              width: 40,
              height: 40,
              child: Container(
                decoration: const BoxDecoration(
                  color: Color(0xFFC8F5DC),
                  shape: BoxShape.circle,
                ),
                child: Center(
                  child: Container(
                    width: 14,
                    height: 14,
                    decoration: const BoxDecoration(
                      color: Colors.white,
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
              ),
            ),
            if (rider != null)
              Marker(
                point: rider,
                width: 52,
                height: 52,
                child: Container(
                  decoration: BoxDecoration(
                    color: purple,
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white, width: 4),
                    boxShadow: const [
                      BoxShadow(
                        color: Color(0x556B4DFF),
                        blurRadius: 10,
                        offset: Offset(0, 4),
                      ),
                    ],
                  ),
                  child: const Icon(Icons.fast_forward, color: Colors.white, size: 22),
                ),
              ),
          ],
        ),
      ],
    );
  }
}
