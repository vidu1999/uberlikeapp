import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../data/place.dart';
import '../../theme.dart';
import '../../widgets/live_dot.dart';

class LocationPickerScreen extends StatefulWidget {
  const LocationPickerScreen({super.key});

  @override
  State<LocationPickerScreen> createState() => _LocationPickerScreenState();
}

class _LocationPickerScreenState extends State<LocationPickerScreen> {
  final _map = MapController();
  final _q = TextEditingController();
  String _label = UserPlace.instance.label;
  List<Map<String, dynamic>> _hits = [];
  Timer? _debounce;
  bool _follow = true;
  double? _lastRevLat;
  late LatLng _center = LatLng(
    UserPlace.instance.liveLat ?? UserPlace.instance.lat,
    UserPlace.instance.liveLng ?? UserPlace.instance.lng,
  );

  @override
  void initState() {
    super.initState();
    UserPlace.instance.start();
    UserPlace.instance.liveNotifier.addListener(_onLive);
  }

  @override
  void dispose() {
    UserPlace.instance.liveNotifier.removeListener(_onLive);
    _debounce?.cancel();
    _q.dispose();
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
      final moved = _lastRevLat == null || (live.latitude - _lastRevLat!).abs() > 0.00005;
      if (moved) {
        _lastRevLat = live.latitude;
        _rev(live);
      }
    }
    if (mounted) setState(() {});
  }

  Future<void> _rev(LatLng c) async {
    final label = await UserPlace.reverseGeocode(c.latitude, c.longitude);
    if (mounted) setState(() => _label = label);
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

  void _confirm() {
    UserPlace.instance.setDelivery(_center.latitude, _center.longitude, _label, asCustom: true);
    Navigator.pop(context, true);
  }

  @override
  Widget build(BuildContext context) {
    final p = UserPlace.instance;
    final live = (p.liveLat != null && p.liveLng != null) ? LatLng(p.liveLat!, p.liveLng!) : null;
    final acc = p.accuracyM;
    return Scaffold(
      body: Stack(
        children: [
          FlutterMap(
            mapController: _map,
            options: MapOptions(
              initialCenter: live ?? LatLng(p.lat, p.lng),
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
                userAgentPackageName: 'com.uberlike.customer',
              ),
              MarkerLayer(
                markers: [
                  if (live != null)
                    Marker(
                      point: live,
                      width: 56,
                      height: 56,
                      child: const LiveDot(size: 20),
                    ),
                ],
              ),
            ],
          ),
          const IgnorePointer(
            child: Center(
              child: Padding(
                padding: EdgeInsets.only(bottom: 36),
                child: Text('📍', style: TextStyle(fontSize: 40)),
              ),
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
              child: Column(
                children: [
                  Row(
                    children: [
                      CircleAvatar(
                        backgroundColor: Colors.white,
                        child: IconButton(icon: const Icon(Icons.arrow_back), onPressed: () => Navigator.pop(context)),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Material(
                          elevation: 3,
                          borderRadius: BorderRadius.circular(14),
                          child: TextField(
                            controller: _q,
                            decoration: const InputDecoration(
                              hintText: 'Search area, street, city…',
                              border: InputBorder.none,
                              contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                            ),
                            onChanged: (v) async {
                              final hits = await UserPlace.search(v);
                              if (mounted) setState(() => _hits = hits);
                            },
                          ),
                        ),
                      ),
                    ],
                  ),
                  if (_hits.isNotEmpty)
                    Container(
                      margin: const EdgeInsets.only(top: 8, left: 48),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(12),
                        boxShadow: const [BoxShadow(color: Colors.black12, blurRadius: 10)],
                      ),
                      child: Column(
                        children: _hits
                            .map(
                              (h) => ListTile(
                                dense: true,
                                title: Text('${h['label']}', style: const TextStyle(fontSize: 13)),
                                onTap: () {
                                  final lat = h['lat'] as double;
                                  final lng = h['lng'] as double;
                                  _follow = false;
                                  _map.move(LatLng(lat, lng), 18);
                                  setState(() {
                                    _label = '${h['label']}';
                                    _hits = [];
                                    _q.text = _label;
                                  });
                                },
                              ),
                            )
                            .toList(),
                      ),
                    ),
                ],
              ),
            ),
          ),
          Positioned(
            right: 16,
            bottom: 150,
            child: FloatingActionButton.small(
              backgroundColor: Colors.white,
              onPressed: _goLive,
              child: const Icon(Icons.my_location, color: Color(0xFF1A73E8)),
            ),
          ),
          Align(
            alignment: Alignment.bottomCenter,
            child: Material(
              color: Colors.white,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(18)),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const LiveDot(size: 14),
                        const SizedBox(width: 6),
                        Text(
                          acc == null ? 'Live location' : 'Live location  GPS ±${acc.round().clamp(1, 999)} m',
                          style: const TextStyle(color: Color(0xFF1A73E8), fontWeight: FontWeight.w800, fontSize: 12),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(_label, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      height: 52,
                      child: FilledButton(
                        style: FilledButton.styleFrom(
                          backgroundColor: Brand.green,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
                        ),
                        onPressed: _confirm,
                        child: const Text('Confirm location', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
