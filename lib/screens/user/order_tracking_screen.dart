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
            return DeliveredScreen(key: ValueKey(order.id), order: order);
          }
          final current = order;
          _destLat ??= current.deliveryLat;
          _destLng ??= current.deliveryLng;
          final shop = _shop(current.shopId);
          final base = AppConfig.normalize(AppConfig.baseUrl);
          final hasRider = current.status.inRiderJob &&
              ((current.riderName != null && current.riderName!.isNotEmpty) ||
                  (current.riderId != null && current.riderId!.isNotEmpty));
          String? photoPath;
          if (hasRider) {
            photoPath = '/img/avatar-rider.jpg';
          } else {
            photoPath = shop?.image ?? '/img/shop-bakery.jpg';
          }
          final avatar = base.isEmpty
              ? null
              : (photoPath.startsWith('http') ? photoPath : '$base$photoPath');
          final title = current.status == OrderStatus.delivered
              ? 'Delivered'
              : hasRider
                  ? (current.status.headingToShop
                      ? 'Rider accepted'
                      : current.status.headingToCustomer
                          ? 'Picked up'
                          : current.status.label)
                  : current.status.label;
          final shopBits = <String>[
            if ((shop?.category ?? '').isNotEmpty) shop!.category,
            if ((shop?.address ?? '').isNotEmpty) shop!.address!,
          ];
          final subtitle = hasRider
              ? (current.status.headingToShop
                  ? 'Heading to the shop'
                  : current.status.headingToCustomer
                      ? 'Order picked up · on the way to you'
                      : 'Delivery Partner')
              : (shopBits.isEmpty ? 'Waiting for confirm' : shopBits.join(' · '));
          final whoName = hasRider ? (current.riderName ?? 'Rider') : (shop?.name ?? current.shopName);

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
                    shopLat: current.shopLat ?? shop?.lat,
                    shopLng: current.shopLng ?? shop?.lng,
                    liveLat: UserPlace.instance.liveLat,
                    liveLng: UserPlace.instance.liveLng,
                    dark: true,
                    toShop: current.status.headingToShop,
                    showCourier: hasRider,
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
                              title,
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
                                Text(whoName,
                                    style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: Colors.white)),
                                Text(
                                  subtitle,
                                  style: const TextStyle(color: Brand.soft, fontSize: 12),
                                ),
                                if (!hasRider && shop != null && shop.rating > 0 && shop.reviews > 0)
                                  Text(
                                    '★ ${shop.rating.toStringAsFixed(1)}  (${shop.reviews})',
                                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12, color: Colors.white),
                                  ),
                              ],
                            ),
                          ),
                          hasRider
                              ? const Text('🛵', style: TextStyle(fontSize: 28))
                              : Container(
                                  width: 40,
                                  height: 40,
                                  decoration: BoxDecoration(color: const Color(0xFFE11D48), borderRadius: BorderRadius.circular(12)),
                                  child: const Icon(Icons.store, color: Colors.white, size: 20),
                                ),
                        ],
                      ),
                      if (hasRider) ...[
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
                      ],
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
