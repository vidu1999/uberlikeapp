import 'package:flutter/material.dart';
import '../../data/repository.dart';
import '../../models/order.dart';
import 'order_tracking_screen.dart';

class MyOrdersScreen extends StatelessWidget {
  const MyOrdersScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('My Orders')),
      body: ValueListenableBuilder<List<Order>>(
        valueListenable: OrderRepository.instance.ordersNotifier,
        builder: (context, orders, _) {
          if (orders.isEmpty) {
            return const Center(child: Text('No orders yet'));
          }
          return ListView.builder(
            itemCount: orders.length,
            itemBuilder: (context, i) {
              final o = orders[i];
              return Card(
                margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                child: ListTile(
                  title: Text(o.shopName, style: const TextStyle(fontWeight: FontWeight.bold)),
                  subtitle: Text(
                    '${o.items.map((e) => e.name).join(', ')} • Rs. ${o.totalAmount.toStringAsFixed(0)} • ${o.paymentMethod}',
                  ),
                  trailing: Chip(
                    label: Text(o.status.label),
                    backgroundColor: o.status.color.withOpacity(0.15),
                  ),
                  onTap: () => Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => OrderTrackingScreen(orderId: o.id)),
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
