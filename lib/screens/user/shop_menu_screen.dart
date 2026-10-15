import 'package:flutter/material.dart';
import '../../data/repository.dart';
import '../../models/shop.dart';
import 'cart_screen.dart';

class ShopMenuScreen extends StatelessWidget {
  final Shop shop;
  const ShopMenuScreen({super.key, required this.shop});

  @override
  Widget build(BuildContext context) {
    final items = Catalog.items.where((i) => i.shopId == shop.id).toList();
    return Scaffold(
      appBar: AppBar(title: Text(shop.name)),
      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
              itemCount: items.length,
              itemBuilder: (context, i) {
                final it = items[i];
                return Card(
                  margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  child: ListTile(
                    title: Text(it.name, style: const TextStyle(fontWeight: FontWeight.bold)),
                    subtitle: Text(it.desc.isEmpty ? it.category : it.desc),
                    trailing: it.isAvailable
                        ? ElevatedButton(
                            onPressed: () {
                              OrderRepository.instance.addToCart(it);
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(content: Text('${it.name} added'), duration: const Duration(milliseconds: 800)),
                              );
                            },
                            child: Text('Rs. ${it.price.toStringAsFixed(0)}'),
                          )
                        : const Text('Sold out'),
                  ),
                );
              },
            ),
          ),
          ValueListenableBuilder(
            valueListenable: OrderRepository.instance.cartNotifier,
            builder: (context, cart, _) {
              if (cart.isEmpty) return const SizedBox.shrink();
              final n = cart.fold<int>(0, (s, c) => s + c.qty);
              return SafeArea(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: FilledButton(
                    onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const CartScreen())),
                    child: Text('View cart · $n · Rs. ${OrderRepository.instance.cartTotal.toStringAsFixed(0)}'),
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}
