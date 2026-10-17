import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;

class UserPlace {
  UserPlace._();
  static final UserPlace instance = UserPlace._();

  final notifier = ValueNotifier<int>(0);
  final liveNotifier = ValueNotifier<int>(0);

  double lat = 8.3350;
  double lng = 80.4108;
  String label = 'Finding your location…';
  bool custom = false;
  double? liveLat;
  double? liveLng;
  double? accuracyM;
  bool denied = false;
  bool deniedForever = false;
  String? error;
  StreamSubscription<Position>? _sub;
  bool _starting = false;

  bool get hasLive => liveLat != null;

  static double km(double lat1, double lng1, double lat2, double lng2) {
    const r = 6371.0;
    final dLat = (lat2 - lat1) * math.pi / 180;
    final dLng = (lng2 - lng1) * math.pi / 180;
    final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(lat1 * math.pi / 180) * math.cos(lat2 * math.pi / 180) * math.sin(dLng / 2) * math.sin(dLng / 2);
    final c = 2 * math.asin(math.sqrt(a.clamp(0, 1)));
    return r * c;
  }

  static String kmLabel(double lat1, double lng1, double? lat2, double? lng2, [double? fallback]) {
    if (lat2 == null || lng2 == null) {
      final f = fallback ?? 2.5;
      return f < 10 ? f.toStringAsFixed(1) : f.toStringAsFixed(0);
    }
    final k = km(lat1, lng1, lat2, lng2);
    if (k < 0.1) return '0.1';
    return k < 10 ? k.toStringAsFixed(1) : k.toStringAsFixed(0);
  }

  static const _settings = LocationSettings(
    accuracy: LocationAccuracy.bestForNavigation,
    distanceFilter: 0,
  );

  Future<void> start() async {
    if (_sub != null || _starting) return;
    _starting = true;
    error = null;
    denied = false;
    deniedForever = false;
    final service = await Geolocator.isLocationServiceEnabled();
    if (!service) {
      _starting = false;
      error = 'Turn on Location / GPS, then tap Allow location.';
      liveNotifier.value++;
      return;
    }
    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) {
      perm = await Geolocator.requestPermission();
    }
    if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) {
      _starting = false;
      denied = true;
      deniedForever = perm == LocationPermission.deniedForever;
      error = 'Location permission is required.';
      liveNotifier.value++;
      return;
    }
    _sub = Geolocator.getPositionStream(locationSettings: _settings).listen((pos) {
      _apply(pos, reverse: false);
    });
    try {
      final pos = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.bestForNavigation,
        timeLimit: const Duration(seconds: 20),
      );
      await _apply(pos, reverse: true);
    } catch (_) {
      error = 'Waiting for GPS. Move outdoors for ~1 m accuracy.';
      liveNotifier.value++;
    }
    _starting = false;
  }

  Future<void> _apply(Position pos, {required bool reverse}) async {
    final acc = pos.accuracy;
    if (accuracyM != null && accuracyM! <= 12 && acc > 40) return;
    liveLat = pos.latitude;
    liveLng = pos.longitude;
    accuracyM = acc;
    liveNotifier.value++;
    if (!custom) {
      lat = pos.latitude;
      lng = pos.longitude;
      if (reverse || label == 'Finding your location…') {
        label = await reverseGeocode(lat, lng);
        notifier.value++;
      }
    }
  }

  void setDelivery(double la, double ln, String lb, {bool asCustom = true}) {
    lat = la;
    lng = ln;
    label = lb;
    custom = asCustom;
    notifier.value++;
  }

  static Future<String> reverseGeocode(double la, double ln) async {
    try {
      final r = await http.get(
        Uri.parse('https://photon.komoot.io/reverse?lon=$ln&lat=$la'),
      );
      final j = jsonDecode(r.body) as Map<String, dynamic>;
      final feats = j['features'] as List?;
      if (feats == null || feats.isEmpty) return '${la.toStringAsFixed(5)}, ${ln.toStringAsFixed(5)}';
      final p = (feats.first as Map)['properties'] as Map? ?? {};
      return [
        p['name'],
        p['street'],
        p['city'] ?? p['locality'] ?? p['district'],
        p['state'],
      ].where((e) => e != null && e.toString().isNotEmpty).map((e) => e.toString()).take(3).join(', ');
    } catch (_) {
      return '${la.toStringAsFixed(5)}, ${ln.toStringAsFixed(5)}';
    }
  }

  static Future<List<Map<String, dynamic>>> search(String q) async {
    if (q.trim().length < 2) return [];
    try {
      final r = await http.get(
        Uri.parse('https://photon.komoot.io/api/?limit=6&q=${Uri.encodeQueryComponent(q)}'),
      );
      final j = jsonDecode(r.body) as Map<String, dynamic>;
      final feats = j['features'] as List? ?? [];
      return feats.map((f) {
        final m = f as Map;
        final c = (m['geometry'] as Map)['coordinates'] as List;
        final p = m['properties'] as Map? ?? {};
        final label = [
          p['name'],
          p['street'],
          p['city'] ?? p['locality'],
          p['state'],
        ].where((e) => e != null && e.toString().isNotEmpty).map((e) => e.toString()).take(3).join(', ');
        return {'label': label, 'lat': (c[1] as num).toDouble(), 'lng': (c[0] as num).toDouble()};
      }).toList();
    } catch (_) {
      return [];
    }
  }

  void dispose() {
    _sub?.cancel();
  }
}
