import 'package:flutter/material.dart';
import '../../config.dart';
import '../../data/repository.dart';
import '../../models/order.dart';
import '../../theme.dart';
import '../../widgets/tracking_map.dart';
import '../chat_screen.dart';

class ShopOrderDetails extends StatelessWidget {
  final String orderId;
  const ShopOrderDetails({super.key, required this.orderId});

  String? _url(String path) {
    final base = AppConfig.normalize(AppConfig.baseUrl);
    if (base.isEmpty) return null;
    return '$base$path';
  }

  @override
  Widget build(BuildContext context) {
    return Theme(
      data: Brand.dark(),
      child: Scaffold(
        backgroundColor: Brand.navy,
        body: ValueListenableBuilder<List<Order>>(
          valueListenable: OrderRepository.instance.ordersNotifier,
          builder: (context, orders, _) {
            Order? o;
            for (final x in orders) {
              if (x.id == orderId) o = x;
            }
            if (o == null) {
              return const Center(child: Text('Order not found'));
            }
            final order = o;
            final items = order.items.map((e) => '${e.name} x${e.qty}').join(', ');
            final hero = _url('/img/shop-pizza.jpg');
            const steps = ['Order Placed', 'Preparing', 'Ready', 'Rider accepted', 'Picked up', 'Delivered'];
            final idx = order.status == OrderStatus.cancelled ? 0 : order.status.step;
            return ListView(
              padding: const EdgeInsets.only(bottom: 28),
              children: [
                SafeArea(
                  bottom: false,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(8, 4, 16, 8),
                    child: Row(
                      children: [
                        IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.arrow_back)),
                        const Text('Order Details', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                      ],
                    ),
                  ),
                ),
                Container(
                  margin: const EdgeInsets.symmetric(horizontal: 16),
                  decoration: BoxDecoration(color: Brand.navy2, borderRadius: BorderRadius.circular(20)),
                  clipBehavior: Clip.antiAlias,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SizedBox(
                        height: 160,
                        width: double.infinity,
                        child: hero == null
                            ? Container(color: Brand.navy3)
                            : Image.network(hero, fit: BoxFit.cover, errorBuilder: (_, __, ___) => Container(color: Brand.navy3)),
                      ),
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('#${order.id.replaceAll('_', '-')}', style: const TextStyle(color: Brand.green, fontWeight: FontWeight.w800)),
                            const SizedBox(height: 4),
                            Text(items.isEmpty ? 'Order' : items, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                            const SizedBox(height: 6),
                            Text('Rs. ${order.totalAmount.toStringAsFixed(0)}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                            const SizedBox(height: 6),
                            Text(
                              order.cardCaptured
                                  ? '${order.paymentMethod} · paid — do not collect cash'
                                  : order.paymentMethod,
                              style: const TextStyle(color: Brand.soft, fontSize: 13, fontWeight: FontWeight.w600),
                            ),
                            if (order.cardCaptured)
                              Text(
                                'Shop wallet +Rs. ${order.shopShare.toStringAsFixed(0)} · Rider +Rs. ${order.riderShare.toStringAsFixed(0)}',
                                style: const TextStyle(color: Brand.green, fontSize: 13, fontWeight: FontWeight.w700),
                              ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 22),
                  child: Column(
                    children: [
                      for (var i = 0; i < steps.length; i++)
                        _step(steps[i], i < idx, i == idx, i < steps.length - 1, i == 0 ? TimeOfDay.fromDateTime(order.timestamp).format(context) : null),
                    ],
                  ),
                ),
                Container(
                  margin: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: Brand.navy2, borderRadius: BorderRadius.circular(16)),
                  child: Row(
                    children: [
                      CircleAvatar(backgroundImage: _url('/img/avatar-user.jpg') != null ? NetworkImage(_url('/img/avatar-user.jpg')!) : null, child: const Icon(Icons.person)),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(order.customerName, style: const TextStyle(fontWeight: FontWeight.w800)),
                            Text(order.customerPhone ?? 'Customer', style: const TextStyle(color: Brand.soft, fontSize: 12)),
                          ],
                        ),
                      ),
                      if (order.customerPhone != null && order.customerPhone!.isNotEmpty)
                        FilledButton(
                          style: FilledButton.styleFrom(backgroundColor: Brand.green),
                          onPressed: () {},
                          child: const Text('Call'),
                        ),
                    ],
                  ),
                ),
                if (order.riderName != null && order.riderName!.isNotEmpty)
                  Container(
                    margin: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(color: Brand.navy2, borderRadius: BorderRadius.circular(16)),
                    child: Row(
                      children: [
                        CircleAvatar(backgroundImage: _url('/img/avatar-rider.jpg') != null ? NetworkImage(_url('/img/avatar-rider.jpg')!) : null, child: const Icon(Icons.delivery_dining)),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(order.riderName!, style: const TextStyle(fontWeight: FontWeight.w800)),
                              Text(
                                order.status.headingToShop
                                    ? 'Delivery partner · heading to shop'
                                    : order.status.headingToCustomer
                                        ? 'Delivery partner · order picked up'
                                        : 'Delivery partner',
                                style: const TextStyle(color: Brand.soft, fontSize: 12),
                              ),
                            ],
                          ),
                        ),
                        if (OrderRepository.instance.canChat(order, 'shop'))
                          IconButton.filled(
                            style: IconButton.styleFrom(backgroundColor: const Color(0xFF123D28)),
                            onPressed: () => Navigator.push(
                              context,
                              MaterialPageRoute(builder: (_) => ChatScreen(orderId: order.id, myRole: 'shop')),
                            ),
                            icon: Badge(
                              isLabelVisible: OrderRepository.instance.unreadCount(order.id, 'shop') > 0,
                              smallSize: 10,
                              backgroundColor: Brand.red,
                              child: const Icon(Icons.chat_bubble, color: Brand.green),
                            ),
                          ),
                      ],
                    ),
                  )
                else
                  const Padding(
                    padding: EdgeInsets.fromLTRB(16, 0, 16, 12),
                    child: Text('Waiting for a rider to accept.', style: TextStyle(color: Brand.soft)),
                  ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Wrap(
                    spacing: 8,
                    children: [
                      if (order.status == OrderStatus.pending) ...[
                        FilledButton(
                          style: FilledButton.styleFrom(backgroundColor: Brand.green),
                          onPressed: () => OrderRepository.instance.updateStatus(order.id, OrderStatus.preparing),
                          child: const Text('Accept'),
                        ),
                        OutlinedButton(
                          onPressed: () => OrderRepository.instance.updateStatus(order.id, OrderStatus.cancelled),
                          child: const Text('Reject'),
                        ),
                      ],
                      if (order.status == OrderStatus.preparing)
                        FilledButton(
                          style: FilledButton.styleFrom(backgroundColor: Brand.green),
                          onPressed: () => OrderRepository.instance.updateStatus(order.id, OrderStatus.ready),
                          child: const Text('Food is ready'),
                        ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                  child: SizedBox(
                    height: 52,
                    width: double.infinity,
                    child: FilledButton(
                      style: FilledButton.styleFrom(backgroundColor: Brand.green, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28))),
                      onPressed: () => Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => Scaffold(
                            backgroundColor: Brand.navy,
                            appBar: AppBar(
                              title: const Text('View Location'),
                              actions: [
                                if (OrderRepository.instance.canChat(order, 'shop'))
                                  IconButton(
                                    onPressed: () => Navigator.push(
                                      context,
                                      MaterialPageRoute(builder: (_) => ChatScreen(orderId: order.id, myRole: 'shop')),
                                    ),
                                    icon: Badge(
                                      isLabelVisible: OrderRepository.instance.unreadCount(order.id, 'shop') > 0,
                                      smallSize: 10,
                                      backgroundColor: Brand.red,
                                      child: const Icon(Icons.chat_bubble),
                                    ),
                                  ),
                              ],
                            ),
                            body: TrackingMap(
                              destLat: order.deliveryLat,
                              destLng: order.deliveryLng,
                              riderLat: order.riderLat,
                              riderLng: order.riderLng,
                              shopLat: order.shopLat,
                              shopLng: order.shopLng,
                              dark: true,
                              toShop: order.status.headingToShop,
                            ),
                          ),
                        ),
                      ),
                      child: const Text('View Location', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                    ),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _step(String label, bool done, bool on, bool line, String? time) {
    final color = (done || on) ? Brand.green : const Color(0xFF374151);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Column(
          children: [
            Container(
              width: 16,
              height: 16,
              decoration: BoxDecoration(shape: BoxShape.circle, color: (done || on) ? Brand.green : Colors.transparent, border: Border.all(color: color, width: 3)),
            ),
            if (line) Container(width: 2, height: 28, color: done ? Brand.green : const Color(0xFF1F2937)),
          ],
        ),
        const SizedBox(width: 12),
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: const TextStyle(fontWeight: FontWeight.w800)),
              if (time != null) Text(time, style: const TextStyle(color: Brand.soft, fontSize: 12)),
            ],
          ),
        ),
      ],
    );
  }
}
