import 'package:flutter/material.dart';
import '../app.dart';
import '../config.dart';
import '../theme.dart';
import 'login_screen.dart';

class WelcomeFlow extends StatefulWidget {
  final UserRole role;
  const WelcomeFlow({super.key, required this.role});

  @override
  State<WelcomeFlow> createState() => _WelcomeFlowState();
}

class _WelcomeFlowState extends State<WelcomeFlow> {
  int page = 0; // 0 splash, 1–3 onboard, 4 login

  static const _slides = [
    (
      '/img/onboard-1.jpg',
      'Fast & Reliable Delivery',
      'Get your favorite food from the best shops, delivered right to your door.',
    ),
    (
      '/img/onboard-2.jpg',
      'Wide Variety of Restaurants',
      'From local favorites to popular brands, find everything you love.',
    ),
    (
      '/img/onboard-3.jpg',
      'Track Your Order in Real Time',
      'See your order status and live location until it reaches you.',
    ),
  ];

  @override
  void initState() {
    super.initState();
    Future<void>.delayed(const Duration(milliseconds: 1700), () {
      if (!mounted) return;
      setState(() => page = widget.role == UserRole.customer ? 1 : 4);
    });
  }

  String? _img(String path) {
    final base = AppConfig.normalize(AppConfig.baseUrl);
    if (base.isEmpty) return null;
    return '$base$path';
  }

  @override
  Widget build(BuildContext context) {
    if (page >= 4) return LoginScreen(role: widget.role);
    if (page == 0) return _splash();
    return _onboard(page - 1);
  }

  Widget _splash() {
    return Scaffold(
      backgroundColor: const Color(0xFF07140F),
      body: Stack(
        fit: StackFit.expand,
        children: [
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                center: const Alignment(0, -0.2),
                radius: 1.1,
                colors: [const Color(0xFF0F3D24), const Color(0xFF07140F)],
              ),
            ),
          ),
          SafeArea(
            child: Column(
              children: [
                const Spacer(),
                Container(
                  width: 88,
                  height: 88,
                  decoration: BoxDecoration(
                    color: Brand.green,
                    borderRadius: BorderRadius.circular(28),
                  ),
                  child: const Icon(Icons.restaurant, color: Colors.white, size: 44),
                ),
                const SizedBox(height: 18),
                const Text(
                  'QuickBite',
                  style: TextStyle(color: Colors.white, fontSize: 36, fontWeight: FontWeight.w800, letterSpacing: -0.6),
                ),
                const Text('Good Food, Fast Delivery', style: TextStyle(color: Color(0xFF9FE7B8), fontWeight: FontWeight.w600)),
                const Spacer(),
                const Padding(
                  padding: EdgeInsets.fromLTRB(32, 0, 32, 36),
                  child: Text(
                    'Your Favorite Food\nDelivered to Your Door',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w700, height: 1.3),
                  ),
                ),
                Container(
                  width: 120,
                  height: 5,
                  margin: const EdgeInsets.only(bottom: 28),
                  decoration: BoxDecoration(color: Brand.green, borderRadius: BorderRadius.circular(8)),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _onboard(int i) {
    final s = _slides[i];
    final last = i == _slides.length - 1;
    final url = _img(s.$1);
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
          child: Column(
            children: [
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: () => setState(() => page = 4),
                  child: const Text('Skip', style: TextStyle(color: Brand.muted, fontWeight: FontWeight.w700)),
                ),
              ),
              Expanded(
                child: url == null
                    ? const Icon(Icons.delivery_dining, size: 160, color: Brand.green)
                    : Image.network(url, fit: BoxFit.contain, errorBuilder: (_, __, ___) => const Icon(Icons.delivery_dining, size: 160, color: Brand.green)),
              ),
              Text(s.$2, textAlign: TextAlign.center, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800, height: 1.2)),
              const SizedBox(height: 10),
              Text(s.$3, textAlign: TextAlign.center, style: const TextStyle(color: Brand.muted, fontSize: 15, height: 1.4)),
              const SizedBox(height: 22),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(
                  3,
                  (d) => Container(
                    width: d == i ? 22 : 8,
                    height: 8,
                    margin: const EdgeInsets.symmetric(horizontal: 4),
                    decoration: BoxDecoration(
                      color: d == i ? Brand.green : const Color(0xFFD1D5DB),
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 22),
              SizedBox(
                width: double.infinity,
                height: 54,
                child: FilledButton(
                  style: FilledButton.styleFrom(backgroundColor: Brand.green, foregroundColor: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28))),
                  onPressed: () => setState(() => page = last ? 4 : page + 1),
                  child: Text(last ? 'Get Started' : 'Next', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
