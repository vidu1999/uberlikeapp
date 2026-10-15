import 'package:flutter/material.dart';
import '../../config.dart';
import '../../data/repository.dart';
import '../../models/order.dart';
import '../../models/shop.dart';
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
      backgroundColor: const Color(0xFFF3F4F6),
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
          final shop = _shop(current.shopId);
          final hasRider = (current.riderName ?? '').isNotEmpty;

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
                ),
              ),
              SafeArea(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                  child: SizedBox(
                    height: 48,
                    child: Stack(
                      alignment: Alignment.center,
                      children: [
                        const Text(
                          'Order Track',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                            letterSpacing: -0.3,
                          ),
                        ),
                        Row(
                          children: [
                            _Fab(
                              icon: Icons.arrow_back_ios_new_rounded,
                              onTap: () => Navigator.pop(context),
                            ),
                            const Spacer(),
                            _Fab(
                              icon: Icons.more_vert,
                              onTap: () {
                                Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                    builder: (_) => ChatScreen(
                                      orderId: current.id,
                                      myRole: 'customer',
                                    ),
                                  ),
                                );
                              },
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              Positioned(
                left: 16,
                right: 16,
                bottom: 24,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                Material(
                  color: Colors.white,
                  elevation: 10,
                  shadowColor: Colors.black26,
                  borderRadius: BorderRadius.circular(28),
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
                    child: Row(
                      children: [
                        Stack(
                          children: [
                            CircleAvatar(
                              radius: 32,
                              backgroundColor: const Color(0xFFEEEAF8),
                              backgroundImage: () {
                                if (!hasRider) return null;
                                final base = AppConfig.normalize(AppConfig.baseUrl);
                                if (base.isEmpty) return null;
                                return NetworkImage('$base/img/courier-avatar.jpg');
                              }(),
                              child: hasRider
                                  ? null
                                  : const Icon(Icons.person, color: Colors.grey),
                            ),
                            if (hasRider)
                              Positioned(
                                top: 2,
                                right: 2,
                                child: Container(
                                  width: 14,
                                  height: 14,
                                  decoration: BoxDecoration(
                                    color: const Color(0xFF22C55E),
                                    shape: BoxShape.circle,
                                    border: Border.all(color: Colors.white, width: 2),
                                  ),
                                ),
                              ),
                          ],
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                current.riderName ??
                                    (current.status == OrderStatus.delivered
                                        ? 'Order delivered'
                                        : 'Assigning courier…'),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: -0.3,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                current.status.label,
                                style: const TextStyle(color: Color(0xFF6B6B6B), fontSize: 13),
                              ),
                              const SizedBox(height: 6),
                              const Row(
                                children: [
                                  Icon(Icons.star_rounded, color: Color(0xFFF5B400), size: 18),
                                  Icon(Icons.star_rounded, color: Color(0xFFF5B400), size: 18),
                                  Icon(Icons.star_rounded, color: Color(0xFFF5B400), size: 18),
                                  Icon(Icons.star_rounded, color: Color(0xFFF5B400), size: 18),
                                  Icon(Icons.star_rounded, color: Color(0xFFF5B400), size: 18),
                                ],
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          onPressed: current.riderPhone == null ? null : () {},
                          icon: const Icon(Icons.phone_outlined, color: Colors.black, size: 26),
                        ),
                      ],
                    ),
                  ),
                ),
                if (current.status == OrderStatus.delivered) ...[
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: () => Navigator.pop(context),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.black,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      child: const Text('Done'),
                    ),
                  ),
                ],
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

class _Fab extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  const _Fab({required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      shape: const CircleBorder(),
      elevation: 4,
      shadowColor: Colors.black26,
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: SizedBox(
          width: 44,
          height: 44,
          child: Icon(icon, size: 18, color: Colors.black),
        ),
      ),
    );
  }
}
