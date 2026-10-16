import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';

import '../../data/place.dart';
import '../../theme.dart';
import '../../widgets/live_dot.dart';

class LocationAllowGate extends StatefulWidget {
  final Widget child;
  const LocationAllowGate({super.key, required this.child});

  @override
  State<LocationAllowGate> createState() => _LocationAllowGateState();
}

class _LocationAllowGateState extends State<LocationAllowGate> {
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    UserPlace.instance.liveNotifier.addListener(_tick);
    if (UserPlace.instance.hasLive) return;
    WidgetsBinding.instance.addPostFrameCallback((_) => _ask());
  }

  @override
  void dispose() {
    UserPlace.instance.liveNotifier.removeListener(_tick);
    super.dispose();
  }

  void _tick() {
    if (mounted) setState(() {});
  }

  Future<void> _ask() async {
    if (_busy) return;
    setState(() => _busy = true);
    final p = UserPlace.instance;
    if (p.deniedForever) {
      await Geolocator.openAppSettings();
    } else if (p.error != null && p.error!.contains('Turn on Location')) {
      await Geolocator.openLocationSettings();
    }
    await p.start();
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    if (UserPlace.instance.hasLive) return widget.child;
    final err = UserPlace.instance.error;
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(28, 24, 28, 32),
          child: Column(
            children: [
              const Spacer(),
              Container(
                width: 92,
                height: 92,
                decoration: const BoxDecoration(color: Color(0xFFE8F8EE), shape: BoxShape.circle),
                child: const Center(child: LiveDot(size: 22)),
              ),
              const SizedBox(height: 20),
              const Text('Allow location', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, letterSpacing: -0.5)),
              const SizedBox(height: 10),
              const Text(
                'QuickBite needs your live GPS to show you on the map, drop the delivery pin on you, and keep ~1 m accuracy.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Brand.muted, height: 1.45),
              ),
              if (err != null) ...[
                const SizedBox(height: 14),
                Text(err, textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFFB91C1C), fontWeight: FontWeight.w600)),
              ],
              const Spacer(),
              SizedBox(
                width: double.infinity,
                height: 52,
                child: FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: Brand.green,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
                  ),
                  onPressed: _busy ? null : _ask,
                  child: Text(_busy ? 'Getting live GPS…' : 'Allow location', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
