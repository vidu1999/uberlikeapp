import 'package:flutter/material.dart';
import '../../config.dart';
import '../../data/repository.dart';
import '../../models/message.dart';
import '../../theme.dart';
import 'checkout_screen.dart';

class CartScreen extends StatelessWidget {
  const CartScreen({super.key});

  String? _url(String? path) {
    if (path == null || path.isEmpty) return null;
    final base = AppConfig.normalize(AppConfig.baseUrl);
    if (base.isEmpty) return null;
    if (path.startsWith('http')) return path;
    return '$base$path';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(title: const Text('Cart', style: TextStyle(fontWeight: FontWeight.w800))),
      body: ValueListenableBuilder<List<CartLine>>(
        valueListenable: OrderRepository.instance.cartNotifier,
        builder: (context, cart, _) {
          if (cart.isEmpty) {
            return const Center(child: Text('Your cart is empty.', style: TextStyle(color: Brand.muted)));
          }
          final sub = OrderRepository.instance.cartTotal;
          const fee = 200;
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              ...cart.map((c) {
                final it = Catalog.items.where((i) => i.id == c.id).toList();
                final img = _url(it.isEmpty ? null : it.first.image);
                return Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Row(
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(14),
                        child: img == null
                            ? Container(width: 64, height: 64, color: Brand.search)
                            : Image.network(img, width: 64, height: 64, fit: BoxFit.cover, errorBuilder: (_, __, ___) => Container(width: 64, height: 64, color: Brand.search)),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(c.name, style: const TextStyle(fontWeight: FontWeight.w800)),
                            Text('Rs. ${c.price.toStringAsFixed(0)}', style: const TextStyle(color: Brand.muted)),
                          ],
                        ),
                      ),
                      IconButton(onPressed: () => OrderRepository.instance.changeQty(c.id, -1), icon: const Icon(Icons.remove_circle_outline)),
                      Text('${c.qty}', style: const TextStyle(fontWeight: FontWeight.w800)),
                      IconButton(onPressed: () => OrderRepository.instance.changeQty(c.id, 1), icon: const Icon(Icons.add_circle_outline)),
                    ],
                  ),
                );
              }),
              const Divider(height: 28),
              _tot('Subtotal', 'Rs. ${sub.toStringAsFixed(0)}'),
              _tot('Delivery Fee', 'Rs. $fee'),
              _tot('Total', 'Rs. ${(sub + fee).toStringAsFixed(0)}', bold: true),
              const SizedBox(height: 16),
              SizedBox(
                height: 54,
                child: FilledButton(
                  style: FilledButton.styleFrom(backgroundColor: Brand.green, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28))),
                  onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const CheckoutScreen())),
                  child: const Text('Proceed to Checkout', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _tot(String k, String v, {bool bold = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Text(k, style: TextStyle(fontWeight: bold ? FontWeight.w800 : FontWeight.w500, fontSize: bold ? 18 : 14)),
          const Spacer(),
          Text(v, style: TextStyle(fontWeight: bold ? FontWeight.w800 : FontWeight.w600, fontSize: bold ? 18 : 14)),
        ],
      ),
    );
  }
}
