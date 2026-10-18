import 'package:flutter/material.dart';
import '../../config.dart';
import '../../data/place.dart';
import '../../data/repository.dart';
import '../../models/order.dart';
import '../../models/shop.dart';
import '../../theme.dart';
import '../../widgets/tracking_map.dart';
import '../chat_screen.dart';
import 'delivered_screen.dart';

class OrderTrackingScreen extends StatefulWidget {
  final String orderId;
  const OrderTrackingScreen({super.key, required this.orderId});

  @override
  State<OrderTrackingScreen> createState() => _OrderTrackingScreenState();
}

class _OrderTrackingScreenState extends State<OrderTrackingScreen> {
  double? _destLat;
  double? _destLng;

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
            if (o.id == widget.orderId) {
              order = o;
              break;
            }
          }
          order ??= OrderRepository.instance.byId(widget.orderId);
          if (order == null) {
            return const Center(child: Text('Waiting for order…', style: TextStyle(color: Colors.white)));
          }
          if (order.status == OrderStatus.delivered) {
            UserPlace.instance.unfreeze();
            return const DeliveredScreen();
          }
          final current = order;
          _destLat ??= current.deliveryLat;
          _destLng ??= current.deliveryLng;
          final shop = _shop(current.shopId);
          final base = AppConfig.normalize(AppConfig.baseUrl);
          final avatar = base.isEmpty ? null : '$base/img/avatar-rider.jpg';

          return Stack(
            children: [
              Positioned.fill(
                child: ValueListenableBuilder<int>(
                  valueListenable: UserPlace.instance.liveNotifier,
                  builder: (_, __, ___) => TrackingMap(
                    destLat: _destLat ?? current.deliveryLat,
                    destLng: _destLng ?? current.deliveryLng,
                    riderLat: current.riderLat,
                    riderLng: current.riderLng,
                    shopLat: shop?.lat,
                    shopLng: shop?.lng,
                    liveLat: UserPlace.instance.liveLat,
                    liveLng: UserPlace.instance.liveLng,
                    dark: true,
                    toShop: current.status.headingToShop,
                  ),
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
                              current.status == OrderStatus.delivered
                                  ? 'Delivered'
                                  : current.status.headingToShop
                                      ? 'Rider accepted'
                                      : current.status.headingToCustomer
                                          ? 'Picked up'
                                          : 'On Delivery',
                              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Colors.white),
                            ),
                            Text('Order ${current.id.replaceAll('_', '-')}',
                                style: const TextStyle(color: Brand.soft, fontSize: 12)),
                          ],
                        ),
                      ),
                      if (OrderRepository.instance.canChat(current, 'customer'))
                        IconButton.filled(
                          style: IconButton.styleFrom(backgroundColor: Brand.navy2),
                          onPressed: () async {
                            await Navigator.push(
                              context,
                              MaterialPageRoute(builder: (_) => ChatScreen(orderId: current.id, myRole: 'customer')),
                            );
                            if (mounted) setState(() {});
                          },
                          icon: Badge(
                            isLabelVisible: OrderRepository.instance.unreadCount(current.id, 'customer') > 0,
                            smallSize: 10,
                            backgroundColor: Brand.red,
                            child: const Icon(Icons.chat_bubble, color: Colors.white),
                          ),
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
                                Text(
                                  current.riderName == null
                                      ? 'Waiting for a rider'
                                      : current.status.headingToShop
                                          ? 'Heading to the shop'
                                          : current.status.headingToCustomer
                                              ? 'Order picked up · on the way to you'
                                              : 'Delivery Partner',
                                  style: const TextStyle(color: Brand.soft, fontSize: 12),
                                ),
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
                          if (OrderRepository.instance.canChat(current, 'customer')) ...[
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
