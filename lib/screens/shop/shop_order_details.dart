import 'package:flutter/material.dart';
import '../../config.dart';
import '../../data/repository.dart';
import '../../models/order.dart';
import '../../theme.dart';
import '../../widgets/tracking_map.dart';

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
            final items = o.items.map((e) => '${e.name} x${e.qty}').join(', ');
            final hero = _url('/img/shop-pizza.jpg');
            const steps = ['Order Placed', 'Preparing', 'Ready', 'On the Way', 'Delivered'];
            final idx = o.status == OrderStatus.cancelled ? 0 : o.status.step;
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
                            Text('#${o.id.replaceAll('_', '-')}', style: const TextStyle(color: Brand.green, fontWeight: FontWeight.w800)),
                            const SizedBox(height: 4),
                            Text(items.isEmpty ? 'Order' : items, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                            const SizedBox(height: 6),
                            Text('Rs. ${o.totalAmount.toStringAsFixed(0)}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
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
                        _step(steps[i], i < idx, i == idx, i < steps.length - 1, i == 0 ? TimeOfDay.fromDateTime(o.timestamp).format(context) : null),
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
                            Text(o.customerName, style: const TextStyle(fontWeight: FontWeight.w800)),
                            Text(o.customerPhone ?? 'Customer', style: const TextStyle(color: Brand.soft, fontSize: 12)),
                          ],
                        ),
                      ),
                      if (o.customerPhone != null && o.customerPhone!.isNotEmpty)
                        FilledButton(
                          style: FilledButton.styleFrom(backgroundColor: Brand.green),
                          onPressed: () {},
                          child: const Text('Call'),
                        ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Wrap(
                    spacing: 8,
                    children: [
                      if (o.status == OrderStatus.pending) ...[
                        FilledButton(
                          style: FilledButton.styleFrom(backgroundColor: Brand.green),
                          onPressed: () => OrderRepository.instance.updateStatus(o!.id, OrderStatus.preparing),
                          child: const Text('Accept'),
                        ),
                        OutlinedButton(
                          onPressed: () => OrderRepository.instance.updateStatus(o!.id, OrderStatus.cancelled),
                          child: const Text('Reject'),
                        ),
                      ],
                      if (o.status == OrderStatus.preparing)
                        FilledButton(
                          style: FilledButton.styleFrom(backgroundColor: Brand.green),
                          onPressed: () => OrderRepository.instance.updateStatus(o!.id, OrderStatus.ready),
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
                            appBar: AppBar(title: const Text('View Location')),
                            body: TrackingMap(
                              destLat: o!.deliveryLat,
                              destLng: o.deliveryLng,
                              riderLat: o.riderLat,
                              riderLng: o.riderLng,
                              dark: true,
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
