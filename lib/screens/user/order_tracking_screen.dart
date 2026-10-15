import 'package:flutter/material.dart';
import '../../data/repository.dart';
import '../../models/order.dart';
import '../../widgets/step_tracker.dart';
import '../../widgets/tracking_map.dart';

class OrderTrackingScreen extends StatelessWidget {
  final String orderId;
  const OrderTrackingScreen({super.key, required this.orderId});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Order #$orderId')),
      body: StreamBuilder<Order?>(
        stream: OrderRepository.instance.watchOrder(orderId),
        builder: (context, snapshot) {
          final order = snapshot.data;
          if (order == null) {
            return const Center(child: Text('Order not found'));
          }
          return SingleChildScrollView(
            child: Column(
              children: [
                SizedBox(
                  height: 260,
                  child: TrackingMap(
                    destLat: order.deliveryLat,
                    destLng: order.deliveryLng,
                    riderLat: order.riderLat,
                    riderLng: order.riderLng,
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text('Estimated Arrival', style: TextStyle(color: Colors.grey)),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                            decoration: BoxDecoration(
                              color: order.status.color.withOpacity(0.12),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Text(order.status.label,
                                style: TextStyle(color: order.status.color, fontWeight: FontWeight.bold)),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        order.status == OrderStatus.delivered ? 'Delivered' : '12 - 15 Minutes',
                        style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
                      ),
                      const Divider(height: 30),
                      StepTracker(currentStatus: order.status),
                      const Divider(height: 30),
                      Row(
                        children: [
                          const CircleAvatar(radius: 25, backgroundColor: Colors.blueAccent, child: Icon(Icons.person, color: Colors.white)),
                          const SizedBox(width: 15),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(order.riderId ?? 'Assigning rider...', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                              const Text('Delivery Partner • 4.9 ★', style: TextStyle(color: Colors.grey, fontSize: 12)),
                            ],
                          ),
                          const Spacer(),
                          IconButton(onPressed: () {}, icon: const Icon(Icons.phone, color: Colors.green)),
                          IconButton(onPressed: () {}, icon: const Icon(Icons.chat, color: Colors.blue)),
                        ],
                      ),
                      const SizedBox(height: 16),
                      // Demo role actions
                      const Text('Role Actions (Backend Simulator):', style: TextStyle(color: Colors.grey)),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        children: [
                          ElevatedButton(
                            onPressed: () => OrderRepository.instance.updateStatus(order.id, OrderStatus.preparing),
                            child: const Text('Shop: Preparing'),
                          ),
                          ElevatedButton(
                            onPressed: () => OrderRepository.instance.updateStatus(order.id, OrderStatus.ready),
                            child: const Text('Shop: Ready'),
                          ),
                          ElevatedButton(
                            onPressed: () {
                              OrderRepository.instance.assignRider(order.id, 'RIDER_77');
                              OrderRepository.instance.updateStatus(order.id, OrderStatus.onTheWay);
                            },
                            child: const Text('Rider: Collect'),
                          ),
                          ElevatedButton(
                            onPressed: () => OrderRepository.instance.updateStatus(order.id, OrderStatus.delivered),
                            child: const Text('Rider: Delivered'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
