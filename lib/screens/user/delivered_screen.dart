import 'package:flutter/material.dart';
import '../../config.dart';
import '../../theme.dart';

class DeliveredScreen extends StatelessWidget {
  const DeliveredScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final base = AppConfig.normalize(AppConfig.baseUrl);
    final art = base.isEmpty ? null : '$base/img/delivered-hero.jpg';
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              const Spacer(),
              Container(
                width: 88,
                height: 88,
                decoration: const BoxDecoration(color: Brand.green, shape: BoxShape.circle),
                child: const Icon(Icons.check, color: Colors.white, size: 48),
              ),
              const SizedBox(height: 18),
              const Text('Order Delivered!', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800)),
              const SizedBox(height: 8),
              const Text('Your food has been delivered successfully.', style: TextStyle(color: Brand.muted)),
              const SizedBox(height: 24),
              if (art != null)
                ClipRRect(
                  borderRadius: BorderRadius.circular(24),
                  child: Image.network(art, height: 180, width: double.infinity, fit: BoxFit.cover, errorBuilder: (_, __, ___) => const SizedBox(height: 24)),
                ),
              const Spacer(),
              SizedBox(
                width: double.infinity,
                height: 54,
                child: FilledButton(
                  style: FilledButton.styleFrom(backgroundColor: Brand.green, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28))),
                  onPressed: () => Navigator.popUntil(context, (r) => r.isFirst),
                  child: const Text('Done', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                ),
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => Navigator.popUntil(context, (r) => r.isFirst),
                child: const Text('View Order Details', style: TextStyle(color: Brand.green, fontWeight: FontWeight.w700)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
