import 'package:flutter/material.dart';
import '../../data/repository.dart';
import '../../models/message.dart';
import 'order_tracking_screen.dart';

class CartScreen extends StatefulWidget {
  const CartScreen({super.key});

  @override
  State<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends State<CartScreen> {
  final _addr = TextEditingController(text: 'New Town, Anuradhapura');
  final _note = TextEditingController();
  bool placing = false;

  Future<void> _place() async {
    setState(() => placing = true);
    final order = await OrderRepository.instance.checkout(address: _addr.text, note: _note.text);
    if (!mounted) return;
    setState(() => placing = false);
    if (order == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not place order. Check server URL.')));
      return;
    }
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (_) => OrderTrackingScreen(orderId: order.id)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Cart')),
      body: ValueListenableBuilder<List<CartLine>>(
        valueListenable: OrderRepository.instance.cartNotifier,
        builder: (context, cart, _) {
          if (cart.isEmpty) return const Center(child: Text('Cart is empty'));
          final sub = OrderRepository.instance.cartTotal;
          final fee = sub > 2000 ? 0 : 250;
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              ...cart.map(
                (c) => ListTile(
                  title: Text(c.name),
                  subtitle: Text('Rs. ${c.price.toStringAsFixed(0)}'),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      IconButton(onPressed: () => OrderRepository.instance.changeQty(c.id, -1), icon: const Icon(Icons.remove)),
                      Text('${c.qty}'),
                      IconButton(onPressed: () => OrderRepository.instance.changeQty(c.id, 1), icon: const Icon(Icons.add)),
                    ],
                  ),
                ),
              ),
              const Divider(),
              Text('Subtotal  Rs. ${sub.toStringAsFixed(0)}'),
              Text('Delivery  ${fee == 0 ? 'Free' : 'Rs. $fee'}'),
              Text('Total  Rs. ${(sub + fee).toStringAsFixed(0)}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
              const SizedBox(height: 16),
              TextField(controller: _addr, decoration: const InputDecoration(labelText: 'Deliver to', border: OutlineInputBorder())),
              const SizedBox(height: 8),
              TextField(controller: _note, decoration: const InputDecoration(labelText: 'Note for rider', border: OutlineInputBorder())),
              const SizedBox(height: 16),
              FilledButton(onPressed: placing ? null : _place, child: Text(placing ? 'Placing…' : 'Place order')),
            ],
          );
        },
      ),
    );
  }
}
