import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;

class UserPlace {
  UserPlace._();
  static final UserPlace instance = UserPlace._();

  final ValueNotifier<int> notifier = ValueNotifier<int>(0);

  double lat = 8.3350;
  double lng = 80.4108;
  double? liveLat;
  double? liveLng;
  String label = 'Finding your location…';
  bool custom = false;
  StreamSubscription<Position>? _sub;

  void _bump() => notifier.value++;

  void setDelivery(double la, double ln, String lb, {bool asCustom = false}) {
    lat = la;
    lng = ln;
    label = lb;
    if (asCustom) custom = true;
    _bump();
  }

  void setLive(double la, double ln) {
    liveLat = la;
    liveLng = ln;
    if (!custom) {
      lat = la;
      lng = ln;
    }
    _bump();
  }

  Future<void> start() async {
    try {
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) {
        if (label == 'Finding your location…') {
          label = 'Anuradhapura';
          _bump();
        }
        return;
      }
      final pos = await Geolocator.getCurrentPosition(desiredAccuracy: LocationAccuracy.high)
          .timeout(const Duration(seconds: 12));
      setLive(pos.latitude, pos.longitude);
      if (!custom) {
        label = await reverse(pos.latitude, pos.longitude);
        _bump();
      }
      await _sub?.cancel();
      _sub = Geolocator.getPositionStream(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: 8),
      ).listen((p) {
        setLive(p.latitude, p.longitude);
      });
    } catch (_) {
      if (label == 'Finding your location…') {
        label = 'Anuradhapura';
        _bump();
      }
    }
  }

  static Future<String> reverse(double lat, double lng) async {
    try {
      final res = await http
          .get(Uri.parse('https://photon.komoot.io/reverse?lon=$lng&lat=$lat'))
          .timeout(const Duration(seconds: 8));
      if (res.statusCode >= 200 && res.statusCode < 300) {
        final j = jsonDecode(res.body);
        final feats = j is Map ? j['features'] : null;
        if (feats is List && feats.isNotEmpty) {
          return _label(Map<String, dynamic>.from(feats.first as Map));
        }
      }
    } catch (_) {}
    return '${lat.toStringAsFixed(5)}, ${lng.toStringAsFixed(5)}';
  }

  static Future<List<Map<String, dynamic>>> search(String q) async {
    if (q.trim().length < 2) return [];
    try {
      final res = await http
          .get(Uri.parse('https://photon.komoot.io/api/?limit=6&q=${Uri.encodeQueryComponent(q)}'))
          .timeout(const Duration(seconds: 8));
      if (res.statusCode < 200 || res.statusCode >= 300) return [];
      final j = jsonDecode(res.body);
      final feats = j is Map ? j['features'] : null;
      if (feats is! List) return [];
      final out = <Map<String, dynamic>>[];
      for (final raw in feats) {
        final f = Map<String, dynamic>.from(raw as Map);
        final geom = f['geometry'];
        final coords = geom is Map ? geom['coordinates'] : null;
        if (coords is! List || coords.length < 2) continue;
        out.add({
          'label': _label(f),
          'lat': (coords[1] as num).toDouble(),
          'lng': (coords[0] as num).toDouble(),
        });
      }
      return out;
    } catch (_) {
      return [];
    }
  }

  static String _label(Map<String, dynamic> f) {
    final p = f['properties'] is Map ? Map<String, dynamic>.from(f['properties'] as Map) : f;
    final parts = <String>[];
    for (final k in ['name', 'street', 'city', 'county', 'town', 'state']) {
      final v = '${p[k] ?? ''}';
      if (v.isNotEmpty && !parts.contains(v)) parts.add(v);
    }
    return parts.isEmpty ? 'Pinned location' : parts.join(', ');
  }
}
