import 'dart:async';
import 'package:flutter/material.dart';
import '../../app.dart';
import '../../data/repository.dart';
import '../../models/order.dart';
import '../../widgets/role_switcher.dart';

class RiderHome extends StatefulWidget {
  final UserRole currentRole;
  final ValueChanged<UserRole> onSwitchRole;
  const RiderHome({super.key, required this.currentRole, required this.onSwitchRole});

  @override
  State<RiderHome> createState() => _RiderHomeState();
}

class _RiderHomeState extends State<RiderHome> {
  Timer? _timer;
  String? _activeOrderId;

  void _pickUp(Order o) {
    OrderRepository.instance.assignRider(o.id, 'RIDER_77');
    OrderRepository.instance.updateStatus(o.id, OrderStatus.onTheWay);
    _activeOrderId = o.id;
    _startLocationStream(o.id);
  }

  void _startLocationStream(String orderId) {
    _timer?.cancel();
    final order = OrderRepository.instance.byId(orderId);
    if (order == null) return;
    double lat = order.riderLat ?? 6.9300;
    double lng = order.riderLng ?? 79.8550;
    final destLat = order.deliveryLat;
    final destLng = order.deliveryLng;
    _timer = Timer.periodic(const Duration(seconds: 2), (t) {
      lat += (destLat - lat) * 0.15;
      lng += (destLng - lng) * 0.15;
      OrderRepository.instance.updateRiderLocation(orderId, lat, lng);
      if ((lat - destLat).abs() < 0.0005 && (lng - destLng).abs() < 0.0005) {
        t.cancel();
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Rider Dashboard'),
        actions: [RoleSwitcher(currentRole: widget.currentRole, onSwitchRole: widget.onSwitchRole)],
      ),
      body: ValueListenableBuilder<List<Order>>(
        valueListenable: OrderRepository.instance.ordersNotifier,
        builder: (context, orders, _) {
          final available = orders.where((o) => o.status == OrderStatus.ready || o.status == OrderStatus.onTheWay).toList();
          if (available.isEmpty) {
            return const Center(child: Text('No deliveries available'));
          }
          return ListView.builder(
            itemCount: available.length,
            itemBuilder: (context, i) {
              final o = available[i];
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
                          Text(o.id, style: const TextStyle(fontWeight: FontWeight.bold)),
                          Chip(label: Text(o.status.label), backgroundColor: o.status.color.withOpacity(0.15)),
                        ],
                      ),
                      Text('${o.shopName} → ${o.customerName}'),
                      Text('Rs. ${o.totalAmount.toStringAsFixed(0)}'),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        children: [
                          if (o.status == OrderStatus.ready)
                            ElevatedButton(
                              onPressed: () => _pickUp(o),
                              child: const Text('Pick Up Order'),
                            ),
                          if (o.status == OrderStatus.onTheWay)
                            ElevatedButton(
                              onPressed: () => OrderRepository.instance.updateStatus(o.id, OrderStatus.delivered),
                              child: const Text('Mark Delivered'),
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
    );
  }
}
