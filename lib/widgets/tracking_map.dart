import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

class TrackingMap extends StatelessWidget {
  final double destLat;
  final double destLng;
  final double? riderLat;
  final double? riderLng;
  const TrackingMap({
    super.key,
    required this.destLat,
    required this.destLng,
    this.riderLat,
    this.riderLng,
  });

  @override
  Widget build(BuildContext context) {
    final center = LatLng(
      riderLat ?? destLat,
      riderLng ?? destLng,
    );
    return FlutterMap(
      options: MapOptions(
        initialCenter: center,
        initialZoom: 14,
      ),
      children: [
        TileLayer(
          urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          userAgentPackageName: 'com.example.uberlikeapp',
        ),
        MarkerLayer(
          markers: [
            Marker(
              point: LatLng(destLat, destLng),
              width: 40,
              height: 40,
              child: const Icon(Icons.location_on, color: Colors.red, size: 40),
            ),
            if (riderLat != null && riderLng != null)
              Marker(
                point: LatLng(riderLat!, riderLng!),
                width: 40,
                height: 40,
                child: const Icon(Icons.delivery_dining, color: Colors.blue, size: 40),
              ),
          ],
        ),
        if (riderLat != null && riderLng != null)
          PolylineLayer(
            polylines: [
              Polyline(
                points: [LatLng(riderLat!, riderLng!), LatLng(destLat, destLng)],
                color: Colors.blue,
                strokeWidth: 4,
              ),
            ],
          ),
      ],
    );
  }
}
