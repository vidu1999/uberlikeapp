import 'package:flutter/material.dart';
import '../../config.dart';
import '../../data/repository.dart';
import '../../models/order.dart';
import '../../models/shop.dart';
import '../../theme.dart';
import '../../widgets/tracking_map.dart';
import '../chat_screen.dart';

class OrderTrackingScreen extends StatelessWidget {
  final String orderId;
  const OrderTrackingScreen({super.key, required this.orderId});

  Shop? _shop(String id) {
    for (final s in Catalog.shops) {
      if (s.id == id) return s;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Brand.navy,
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
            return const Center(child: Text('Waiting for order…', style: TextStyle(color: Colors.white)));
          }
          final current = order;
          final shop = _shop(current.shopId);
          final base = AppConfig.normalize(AppConfig.baseUrl);
          final avatar = base.isEmpty ? null : '$base/img/avatar-rider.jpg';

          return Stack(
            children: [
              Positioned.fill(
                child: TrackingMap(
                  destLat: current.deliveryLat,
                  destLng: current.deliveryLng,
                  riderLat: current.riderLat,
                  riderLng: current.riderLng,
                  shopLat: shop?.lat,
                  shopLng: shop?.lng,
                  dark: true,
                ),
              ),
              SafeArea(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(14, 8, 14, 0),
                  child: Row(
                    children: [
                      IconButton.filled(
                        style: IconButton.styleFrom(backgroundColor: Brand.navy2),
                        onPressed: () => Navigator.pop(context),
                        icon: const Icon(Icons.menu, color: Colors.white),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              current.status == OrderStatus.delivered ? 'Delivered' : 'On Delivery',
                              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Colors.white),
                            ),
                            Text('Order ${current.id.replaceAll('_', '-')}',
                                style: const TextStyle(color: Brand.soft, fontSize: 12)),
                          ],
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(color: const Color(0xFF123D28), borderRadius: BorderRadius.circular(20)),
                        child: const Text('●  Online', style: TextStyle(color: Brand.green, fontWeight: FontWeight.w700, fontSize: 12)),
                      ),
                    ],
                  ),
                ),
              ),
              Positioned(
                left: 12,
                right: 12,
                bottom: 12,
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(color: Brand.navy2, borderRadius: BorderRadius.circular(24)),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Row(
                        children: [
                          CircleAvatar(
                            radius: 28,
                            backgroundColor: Brand.navy3,
                            backgroundImage: avatar == null ? null : NetworkImage(avatar),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(current.riderName ?? 'Assigning courier…',
                                    style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: Colors.white)),
                                const Text('Delivery Partner', style: TextStyle(color: Brand.soft, fontSize: 12)),
                                const Text('★ 4.9  (120+)', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12, color: Colors.white)),
                              ],
                            ),
                          ),
                          const Text('🛵', style: TextStyle(fontSize: 28)),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: FilledButton.icon(
                              style: FilledButton.styleFrom(backgroundColor: Brand.green, padding: const EdgeInsets.symmetric(vertical: 14)),
                              onPressed: () {},
                              icon: const Icon(Icons.call),
                              label: const Text('Call'),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: FilledButton.icon(
                              style: FilledButton.styleFrom(backgroundColor: Brand.blue, padding: const EdgeInsets.symmetric(vertical: 14)),
                              onPressed: () => Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (_) => ChatScreen(orderId: current.id, myRole: 'customer'),
                                ),
                              ),
                              icon: const Icon(Icons.chat_bubble),
                              label: const Text('Chat'),
                            ),
                          ),
                        ],
                      ),
                      if (current.status == OrderStatus.delivered)
                        TextButton(
                          onPressed: () => Navigator.pop(context),
                          child: const Text('Done', style: TextStyle(color: Brand.soft)),
                        ),
                    ],
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
