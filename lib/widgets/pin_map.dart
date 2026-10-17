import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../data/place.dart';
import '../theme.dart';
import 'live_dot.dart';

class PinMap extends StatefulWidget {
  final void Function(double lat, double lng, String label) onChanged;
  const PinMap({super.key, required this.onChanged});

  @override
  State<PinMap> createState() => _PinMapState();
}

class _PinMapState extends State<PinMap> {
  final _map = MapController();
  bool _follow = true;
  Timer? _debounce;
  late LatLng _center = LatLng(
    UserPlace.instance.liveLat ?? UserPlace.instance.lat,
    UserPlace.instance.liveLng ?? UserPlace.instance.lng,
  );

  @override
  void initState() {
    super.initState();
    UserPlace.instance.start();
    UserPlace.instance.liveNotifier.addListener(_onLive);
    widget.onChanged(_center.latitude, _center.longitude, UserPlace.instance.label);
  }

  @override
  void dispose() {
    UserPlace.instance.liveNotifier.removeListener(_onLive);
    _debounce?.cancel();
    super.dispose();
  }

  void _onLive() {
    final p = UserPlace.instance;
    if (p.liveLat == null || p.liveLng == null) return;
    final live = LatLng(p.liveLat!, p.liveLng!);
    if (_follow) {
      _center = live;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        try {
          _map.move(live, 18);
        } catch (_) {}
      });
      _rev(live);
    }
    if (mounted) setState(() {});
  }

  Future<void> _rev(LatLng c) async {
    final label = await UserPlace.reverseGeocode(c.latitude, c.longitude);
    widget.onChanged(c.latitude, c.longitude, label);
  }

  void _goLive() {
    UserPlace.instance.start();
    final p = UserPlace.instance;
    if (p.liveLat == null) return;
    _follow = true;
    final live = LatLng(p.liveLat!, p.liveLng!);
    _center = live;
    try {
      _map.move(live, 18);
    } catch (_) {}
    _rev(live);
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final p = UserPlace.instance;
    final live = (p.liveLat != null && p.liveLng != null) ? LatLng(p.liveLat!, p.liveLng!) : null;
    final acc = p.accuracyM;
    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: SizedBox(
        height: 200,
        child: Stack(
          children: [
            FlutterMap(
              mapController: _map,
              options: MapOptions(
                initialCenter: live ?? _center,
                initialZoom: 18,
                onPositionChanged: (cam, hasGesture) {
                  _center = cam.center;
                  if (!hasGesture) return;
                  _follow = false;
                  _debounce?.cancel();
                  _debounce = Timer(const Duration(milliseconds: 350), () => _rev(cam.center));
                },
              ),
              children: [
                TileLayer(
                  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  userAgentPackageName: 'com.uberlike.shop',
                ),
                if (live != null && acc != null && acc > 0)
                  CircleLayer(
                    circles: [
                      CircleMarker(
                        point: live,
                        radius: acc.clamp(1, 800).toDouble(),
                        useRadiusInMeter: true,
                        color: const Color(0x221A73E8),
                        borderColor: const Color(0xFF1A73E8),
                        borderStrokeWidth: 1,
                      ),
                    ],
                  ),
                MarkerLayer(
                  markers: [
                    if (live != null)
                      Marker(point: live, width: 56, height: 56, child: const LiveDot(size: 18)),
                  ],
                ),
              ],
            ),
            const IgnorePointer(
              child: Center(
                child: Padding(
                  padding: EdgeInsets.only(bottom: 22),
                  child: Icon(Icons.location_on, size: 44, color: Brand.green, shadows: [
                    Shadow(color: Color(0x66000000), blurRadius: 8, offset: Offset(0, 3)),
                  ]),
                ),
              ),
            ),
            Positioned(
              right: 8,
              bottom: 8,
              child: Material(
                color: Colors.white,
                shape: const CircleBorder(),
                child: IconButton(
                  tooltip: 'Live location',
                  onPressed: _goLive,
                  icon: const Icon(Icons.my_location, color: Color(0xFF1A73E8)),
                ),
              ),
            ),
            Positioned(
              left: 8,
              top: 8,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
                child: Text(
                  acc == null ? 'Live location · drag the pin' : 'GPS ±${acc.round().clamp(1, 999)} m · drag pin',
                  style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF1A73E8)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
