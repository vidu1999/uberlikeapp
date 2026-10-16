import 'dart:async';
import 'dart:convert';

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
  StreamSubscription<Position>? _sub;
  bool _starting = false;

  static const _settings = LocationSettings(
    accuracy: LocationAccuracy.bestForNavigation,
    distanceFilter: 0,
  );

  Future<void> start() async {
    if (_sub != null || _starting) return;
    _starting = true;
    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) {
      perm = await Geolocator.requestPermission();
    }
    if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) {
      _starting = false;
      label = 'Anuradhapura';
      notifier.value++;
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
    } catch (_) {}
  }

  Future<void> _apply(Position pos, {required bool reverse}) async {
    final acc = pos.accuracy;
    if (accuracyM != null && acc > accuracyM! + 5 && acc > 8) return;
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
