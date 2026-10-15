import 'dart:async';
import 'package:flutter/material.dart';
import '../../app.dart';
import '../../config.dart';
import '../../data/repository.dart';
import '../../models/order.dart';
import '../../theme.dart';
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
  int tab = 0;

  Future<void> _pickUp(Order o) async {
    await OrderRepository.instance.assignRider(o.id, 'RIDER_77', riderName: 'Kamal Perera');
    await OrderRepository.instance.updateStatus(o.id, OrderStatus.onTheWay);
    _startLocationStream(o.id);
  }

  void _startLocationStream(String orderId) {
    _timer?.cancel();
    final order = OrderRepository.instance.byId(orderId);
    if (order == null) return;
    double lat = order.riderLat ?? order.deliveryLat + 0.012;
    double lng = order.riderLng ?? order.deliveryLng - 0.01;
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
            final active = orders.where((o) => o.status == OrderStatus.onTheWay).toList();
            if (active.isNotEmpty && tab == 0) {
              return _onDelivery(active.first);
            }
            return Column(
              children: [
                Expanded(child: tab == 1 ? _earn(orders) : tab == 2 ? _profile() : _jobs(orders)),
                NavigationBar(
                  height: 64,
                  backgroundColor: Brand.navy,
                  indicatorColor: Brand.green.withOpacity(0.18),
                  selectedIndex: tab,
                  onDestinationSelected: (i) => setState(() => tab = i),
                  destinations: const [
                    NavigationDestination(icon: Icon(Icons.delivery_dining_outlined), selectedIcon: Icon(Icons.delivery_dining, color: Brand.green), label: 'Jobs'),
                    NavigationDestination(icon: Icon(Icons.payments_outlined), selectedIcon: Icon(Icons.payments, color: Brand.green), label: 'Earnings'),
                    NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person, color: Brand.green), label: 'Profile'),
                  ],
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _jobs(List<Order> orders) {
    final jobs = orders.where((o) => o.status == OrderStatus.ready).toList();
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const ConnectionBanner(),
          Row(
            children: [
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('On Delivery', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                    Text('Online', style: TextStyle(color: Brand.soft, fontSize: 12)),
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
          const SizedBox(height: 16),
          if (jobs.isEmpty) const Text('No trips yet. In Shop, accept an order and tap Food is ready.', style: TextStyle(color: Brand.soft)),
          ...jobs.map((o) => Container(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(color: Brand.navy2, borderRadius: BorderRadius.circular(16)),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${o.shopName} → ${o.customerName}', style: const TextStyle(fontWeight: FontWeight.w800)),
                    Text(o.id, style: const TextStyle(color: Brand.soft, fontSize: 12)),
                    Align(
                      alignment: Alignment.centerRight,
                      child: FilledButton(
                        style: FilledButton.styleFrom(backgroundColor: Brand.green),
                        onPressed: () => _pickUp(o),
                        child: const Text('Accept'),
                      ),
                    ),
                  ],
                ),
              )),
        ],
      ),
    );
  }

  Widget _onDelivery(Order o) {
    final avatar = _url('/img/avatar-rider.jpg');
    return Stack(
      children: [
        Positioned.fill(
          child: TrackingMap(
            destLat: o.deliveryLat,
            destLng: o.deliveryLng,
            riderLat: o.riderLat,
            riderLng: o.riderLng,
            shopLat: o.deliveryLat + 0.012,
            shopLng: o.deliveryLng - 0.01,
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
                  onPressed: () => setState(() => tab = 2),
                  icon: const Icon(Icons.menu, color: Colors.white),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text('On Delivery', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Colors.white)),
                      Text('Order ${o.id.replaceAll('_', '-')}', style: const TextStyle(color: Brand.soft, fontSize: 12)),
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
                      backgroundImage: avatar == null ? null : NetworkImage(avatar),
                      backgroundColor: Brand.navy3,
                    ),
                    const SizedBox(width: 12),
                    const Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Kamal Perera', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                          Text('Delivery Partner', style: TextStyle(color: Brand.soft, fontSize: 12)),
                          Text('★ 4.9  (120+)', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12)),
                        ],
                      ),
                    ),
                    const Text('🛵', style: TextStyle(fontSize: 28)),
                  ],
                ),
                const SizedBox(height: 14),
                const Row(
                  children: [
                    Expanded(child: _Metric(icon: Icons.schedule, label: 'ETA', value: '12 – 15 min')),
                    SizedBox(width: 10),
                    Expanded(child: _Metric(icon: Icons.place, label: 'Distance', value: '2.3 km')),
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
                          MaterialPageRoute(builder: (_) => ChatScreen(orderId: o.id, myRole: 'rider')),
                        ),
                        icon: const Icon(Icons.chat_bubble),
                        label: const Text('Chat'),
                      ),
                    ),
                  ],
                ),
                TextButton(
                  onPressed: () => OrderRepository.instance.updateStatus(o.id, OrderStatus.delivered),
                  child: const Text('Mark delivered', style: TextStyle(color: Brand.soft)),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _earn(List<Order> orders) {
    final done = orders.where((o) => o.status == OrderStatus.delivered).toList();
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text('Earnings', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: Brand.green, borderRadius: BorderRadius.circular(16)),
            child: Text('Rs. ${done.length * 150}', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
          ),
          ...done.map((o) => ListTile(title: Text(o.id), trailing: const Text('+ Rs. 150'))),
        ],
      ),
    );
  }

  Widget _profile() {
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(OrderRepository.instance.user?.name ?? 'Kamal Perera', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
          const Text('Delivery Partner', style: TextStyle(color: Brand.soft)),
          const SizedBox(height: 12),
          Row(children: [
            const SettingsButton(),
            RoleSwitcher(currentRole: widget.currentRole, onSwitchRole: widget.onSwitchRole),
          ]),
          const SizedBox(height: 24),
          OutlinedButton(onPressed: () => OrderRepository.instance.logout(), child: const Text('Sign out')),
        ],
      ),
    );
  }
}

class _Metric extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  const _Metric({required this.icon, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: Brand.navy3, borderRadius: BorderRadius.circular(14)),
      child: Row(
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(color: const Color(0xFF123D28), borderRadius: BorderRadius.circular(10)),
            child: Icon(icon, size: 16, color: Brand.green),
          ),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: const TextStyle(color: Brand.soft, fontSize: 11)),
              Text(value, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
            ],
          ),
        ],
      ),
    );
  }
}
