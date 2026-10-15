import 'package:flutter/material.dart';
import '../../app.dart';
import '../../data/repository.dart';
import '../../models/order.dart';
import '../../widgets/role_switcher.dart';
import '../../widgets/settings_button.dart';

class ShopHome extends StatelessWidget {
  final UserRole currentRole;
  final ValueChanged<UserRole> onSwitchRole;
  const ShopHome({super.key, required this.currentRole, required this.onSwitchRole});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Shop Dashboard'),
        actions: [
          const SettingsButton(),
          RoleSwitcher(currentRole: currentRole, onSwitchRole: onSwitchRole),
        ],
      ),
      body: Column(
        children: [
          const ConnectionBanner(),
          Expanded(
            child: ValueListenableBuilder<List<Order>>(
              valueListenable: OrderRepository.instance.ordersNotifier,
              builder: (context, orders, _) {
                if (orders.isEmpty) {
                  return const Center(child: Text('No orders yet — waiting for customers'));
                }
                return ListView.builder(
                  itemCount: orders.length,
                  itemBuilder: (context, i) {
                    final o = orders[i];
                    return Card(
                      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text('${o.shopName}  ${o.id}',
                                    style: const TextStyle(fontWeight: FontWeight.bold)),
                                Chip(
                                  label: Text(o.status.label),
                                  backgroundColor: o.status.color.withOpacity(0.15),
                                ),
                              ],
                            ),
                            Text('${o.customerName} • ${o.items.map((e) => '${e.name} x${e.qty}').join(', ')}'),
                            Text('Rs. ${o.totalAmount.toStringAsFixed(0)}',
                                style: const TextStyle(fontWeight: FontWeight.bold)),
                            const SizedBox(height: 8),
                            Wrap(
                              spacing: 8,
                              children: [
                                if (o.status == OrderStatus.pending)
                                  ElevatedButton(
                                    onPressed: () =>
                                        OrderRepository.instance.updateStatus(o.id, OrderStatus.preparing),
                                    child: const Text('Accept & Prepare'),
                                  ),
                                if (o.status == OrderStatus.preparing)
                                  ElevatedButton(
                                    onPressed: () =>
                                        OrderRepository.instance.updateStatus(o.id, OrderStatus.ready),
                                    child: const Text('Mark Ready'),
                                  ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
