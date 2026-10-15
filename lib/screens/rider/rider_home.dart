import 'dart:async';
import 'package:flutter/material.dart';
import '../../app.dart';
import '../../data/repository.dart';
import '../../models/order.dart';
import '../../widgets/role_switcher.dart';
import '../../widgets/settings_button.dart';
import '../../widgets/tracking_map.dart';
import '../chat_screen.dart';

class RiderHome extends StatefulWidget {
  final UserRole currentRole;
  final ValueChanged<UserRole> onSwitchRole;
  const RiderHome({super.key, required this.currentRole, required this.onSwitchRole});

  @override
  State<RiderHome> createState() => _RiderHomeState();
}

class _RiderHomeState extends State<RiderHome> {
  Timer? _timer;

  Future<void> _pickUp(Order o) async {
    await OrderRepository.instance.assignRider(o.id, 'RIDER_77', riderName: 'Kamal Perera');
    await OrderRepository.instance.updateStatus(o.id, OrderStatus.onTheWay);
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
      lat += (destLat - lat) * 0.18;
      lng += (destLng - lng) * 0.18;
      OrderRepository.instance.updateRiderLocation(orderId, lat, lng);
      if ((lat - destLat).abs() < 0.0004 && (lng - destLng).abs() < 0.0004) {
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
        actions: [
          const SettingsButton(),
          RoleSwitcher(currentRole: widget.currentRole, onSwitchRole: widget.onSwitchRole),
        ],
      ),
      body: Column(
        children: [
          const ConnectionBanner(),
          Expanded(
            child: ValueListenableBuilder<List<Order>>(
              valueListenable: OrderRepository.instance.ordersNotifier,
              builder: (context, orders, _) {
                final available =
                    orders.where((o) => o.status == OrderStatus.ready || o.status == OrderStatus.onTheWay).toList();
                if (available.isEmpty) {
                  return const Center(child: Text('No deliveries yet — wait for a shop to mark Ready'));
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
                                Chip(
                                  label: Text(o.status.label),
                                  backgroundColor: o.status.color.withOpacity(0.15),
                                ),
                              ],
                            ),
                            Text('${o.shopName} → ${o.customerName}'),
                            Text('Rs. ${o.totalAmount.toStringAsFixed(0)}'),
                            if (o.status == OrderStatus.onTheWay)
                              SizedBox(
                                height: 160,
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(vertical: 8),
                                  child: TrackingMap(
                                    destLat: o.deliveryLat,
                                    destLng: o.deliveryLng,
                                    riderLat: o.riderLat,
                                    riderLng: o.riderLng,
                                  ),
                                ),
                              ),
                            Wrap(
                              spacing: 8,
                              children: [
                                if (o.status == OrderStatus.ready)
                                  ElevatedButton(
                                    onPressed: () => _pickUp(o),
                                    child: const Text('Pick Up Order'),
                                  ),
                          if (o.status == OrderStatus.onTheWay) ...[
                            ElevatedButton(
                              onPressed: () => Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (_) => ChatScreen(orderId: o.id, myRole: 'rider'),
                                ),
                              ),
                              child: const Text('Chat'),
                            ),
                            ElevatedButton(
                              onPressed: () =>
                                  OrderRepository.instance.updateStatus(o.id, OrderStatus.delivered),
                              child: const Text('Mark Delivered'),
                            ),
                          ],
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
