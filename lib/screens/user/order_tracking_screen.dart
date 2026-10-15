import 'package:flutter/material.dart';
import '../../data/repository.dart';
import '../../models/order.dart';
import '../../widgets/step_tracker.dart';
import '../../widgets/tracking_map.dart';
import '../chat_screen.dart';

class OrderTrackingScreen extends StatelessWidget {
  final String orderId;
  const OrderTrackingScreen({super.key, required this.orderId});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Order #$orderId')),
      body: ValueListenableBuilder<List<Order>>(
        valueListenable: OrderRepository.instance.ordersNotifier,
        builder: (context, orders, _) {
          Order? order;
          for (final o in orders) {
            if (o.id == orderId) {
              order = o;
              break;
            }
          }
          order ??= OrderRepository.instance.byId(orderId);
          if (order == null) {
            return const Center(child: Text('Waiting for order…'));
          }
          final current = order;
          return Column(
            children: [
              SizedBox(
                height: 260,
                child: TrackingMap(
                  destLat: current.deliveryLat,
                  destLng: current.deliveryLng,
                  riderLat: current.riderLat,
                  riderLng: current.riderLng,
                ),
              ),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.all(20),
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Estimated Arrival', style: TextStyle(color: Colors.grey)),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                          decoration: BoxDecoration(
                            color: current.status.color.withOpacity(0.12),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Text(
                            current.status.label,
                            style: TextStyle(color: current.status.color, fontWeight: FontWeight.bold),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      current.status == OrderStatus.delivered ? 'Delivered' : '12 – 15 minutes',
                      style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
                    ),
                    const Divider(height: 30),
                    StepTracker(currentStatus: current.status),
                    const Divider(height: 30),
                    Row(
                      children: [
                        const CircleAvatar(
                          radius: 25,
                          backgroundColor: Colors.blueAccent,
                          child: Icon(Icons.person, color: Colors.white),
                        ),
                        const SizedBox(width: 15),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              current.riderName ?? current.riderId ?? 'Assigning rider…',
                              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                            ),
                            const Text('Delivery Partner • 4.9 ★',
                                style: TextStyle(color: Colors.grey, fontSize: 12)),
                          ],
                        ),
                        const Spacer(),
                        IconButton(
                          onPressed: current.riderPhone == null
                              ? null
                              : () {},
                          icon: const Icon(Icons.phone, color: Colors.green),
                        ),
                        IconButton(
                          onPressed: () => Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => ChatScreen(orderId: current.id, myRole: 'customer'),
                            ),
                          ),
                          icon: const Icon(Icons.chat, color: Colors.blue),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
