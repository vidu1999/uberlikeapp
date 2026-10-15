import 'package:flutter/material.dart';
import '../../app.dart';
import '../../config.dart';
import '../../data/repository.dart';
import '../../models/order.dart';
import '../../theme.dart';
import '../../widgets/role_switcher.dart';
import '../../widgets/settings_button.dart';

class ShopHome extends StatefulWidget {
  final UserRole currentRole;
  final ValueChanged<UserRole> onSwitchRole;
  const ShopHome({super.key, required this.currentRole, required this.onSwitchRole});

  @override
  State<ShopHome> createState() => _ShopHomeState();
}

class _ShopHomeState extends State<ShopHome> {
  int tab = 0;
  String filter = 'all';

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
        body: IndexedStack(
          index: tab,
          children: [
            _dash(),
            _dash(),
            _menu(),
            _profile(),
          ],
        ),
        bottomNavigationBar: NavigationBar(
          height: 64,
          backgroundColor: Brand.navy,
          indicatorColor: Brand.green.withOpacity(0.18),
          selectedIndex: tab,
          onDestinationSelected: (i) => setState(() => tab = i),
          destinations: const [
            NavigationDestination(icon: Icon(Icons.grid_view_outlined), selectedIcon: Icon(Icons.grid_view, color: Brand.green), label: 'Dashboard'),
            NavigationDestination(icon: Icon(Icons.receipt_long_outlined), selectedIcon: Icon(Icons.receipt_long, color: Brand.green), label: 'Orders'),
            NavigationDestination(icon: Icon(Icons.restaurant_menu_outlined), selectedIcon: Icon(Icons.restaurant_menu, color: Brand.green), label: 'Menu'),
            NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person, color: Brand.green), label: 'Profile'),
          ],
        ),
      ),
    );
  }

  Widget _stat(Color bg, IconData icon, String n, String label) {
    return Container(
      padding: const EdgeInsets.fromLTRB(8, 12, 8, 10),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(16)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(8)),
            child: Icon(icon, size: 16, color: Colors.white),
          ),
          const SizedBox(height: 8),
          Text(n, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: Colors.white)),
          Text(label, style: const TextStyle(fontSize: 10, color: Colors.white, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }

  Widget _dash() {
    return ValueListenableBuilder<List<Order>>(
      valueListenable: OrderRepository.instance.ordersNotifier,
      builder: (context, orders, _) {
        final pending = orders.where((o) => o.status == OrderStatus.pending).length;
        final prep = orders.where((o) => o.status == OrderStatus.preparing).length;
        final ready = orders.where((o) => o.status == OrderStatus.ready).length;
        final way = orders.where((o) => o.status == OrderStatus.onTheWay).length;
        final list = orders.where((o) {
          if (filter == 'prep') return o.status == OrderStatus.preparing;
          if (filter == 'ready') return o.status == OrderStatus.ready;
          if (filter == 'way') return o.status == OrderStatus.onTheWay;
          return true;
        }).toList();
        final hero = _url('/img/shop-bakery.jpg');
        return SafeArea(
          child: ListView(
            padding: const EdgeInsets.only(bottom: 16),
            children: [
              const ConnectionBanner(),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                child: Row(
                  children: [
                    Container(
                      width: 42,
                      height: 42,
                      decoration: BoxDecoration(color: Brand.red, borderRadius: BorderRadius.circular(12)),
                      child: const Icon(Icons.store, color: Colors.white),
                    ),
                    const SizedBox(width: 12),
                    const Text('Shop Dashboard', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                  ],
                ),
              ),
              const Padding(
                padding: EdgeInsets.fromLTRB(16, 0, 16, 12),
                child: Row(
                  children: [
                    Text('Kandy Bakers', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                    SizedBox(width: 10),
                    Chip(
                      label: Text('Open', style: TextStyle(color: Brand.green, fontWeight: FontWeight.w700, fontSize: 12)),
                      backgroundColor: Color(0xFF123D28),
                      visualDensity: VisualDensity.compact,
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(20),
                  child: SizedBox(
                    height: 148,
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        if (hero != null) Image.network(hero, fit: BoxFit.cover, errorBuilder: (_, __, ___) => Container(color: Colors.black)),
                        if (hero == null) Container(color: Colors.black),
                        Container(color: Colors.black54),
                        const Padding(
                          padding: EdgeInsets.all(20),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text('Good Food\nHappy Customers', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, height: 1.15)),
                              SizedBox(height: 8),
                              Text('Manage your orders and grow your business', style: TextStyle(fontSize: 12, color: Colors.white70)),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
                child: Row(
                  children: [
                    Expanded(child: _stat(Brand.teal, Icons.assignment, '$pending', 'New Orders')),
                    const SizedBox(width: 8),
                    Expanded(child: _stat(Brand.gold, Icons.restaurant, '$prep', 'Preparing')),
                    const SizedBox(width: 8),
                    Expanded(child: _stat(Brand.purple, Icons.check, '$ready', 'Ready')),
                    const SizedBox(width: 8),
                    Expanded(child: _stat(const Color(0xFF17B36A), Icons.delivery_dining, '$way', 'On Delivery')),
                  ],
                ),
              ),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Row(
                  children: [
                    _tab('all', 'All Orders'),
                    _tab('prep', 'Preparing'),
                    _tab('ready', 'Ready'),
                    _tab('way', 'On Delivery'),
                  ],
                ),
              ),
              if (list.isEmpty)
                const Padding(padding: EdgeInsets.all(24), child: Text('No tickets in this tab.', style: TextStyle(color: Brand.soft))),
              ...list.map(_orderCard),
            ],
          ),
        );
      },
    );
  }

  Widget _tab(String id, String label) {
    final on = filter == id;
    return TextButton(
      onPressed: () => setState(() => filter = id),
      child: Text(label, style: TextStyle(color: on ? Brand.green : Brand.soft, fontWeight: FontWeight.w700)),
    );
  }

  Widget _orderCard(Order o) {
    String badge;
    Color bg;
    switch (o.status) {
      case OrderStatus.pending:
        badge = 'New';
        bg = Brand.teal;
        break;
      case OrderStatus.preparing:
        badge = 'Preparing';
        bg = const Color(0xFFF5C518);
        break;
      case OrderStatus.ready:
        badge = 'Ready';
        bg = Brand.purple;
        break;
      case OrderStatus.onTheWay:
        badge = 'On the Way';
        bg = Brand.blue;
        break;
      default:
        badge = o.status.label;
        bg = Brand.green;
    }
    final items = o.items.map((e) => '${e.name} x${e.qty}').join(', ');
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: Brand.navy2, borderRadius: BorderRadius.circular(16)),
      child: Row(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: Container(width: 58, height: 58, color: Brand.navy3, child: const Icon(Icons.fastfood, color: Colors.white70)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(o.id.replaceAll('_', '-'), style: const TextStyle(fontWeight: FontWeight.w800)),
                Text('${TimeOfDay.fromDateTime(o.timestamp).format(context)} · $items',
                    maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Brand.soft, fontSize: 12)),
                Text('Rs. ${o.totalAmount.toStringAsFixed(0)}', style: const TextStyle(fontWeight: FontWeight.w800)),
                Wrap(
                  spacing: 8,
                  children: [
                    if (o.status == OrderStatus.pending)
                      TextButton(
                        onPressed: () => OrderRepository.instance.updateStatus(o.id, OrderStatus.preparing),
                        child: const Text('Accept'),
                      ),
                    if (o.status == OrderStatus.preparing)
                      TextButton(
                        onPressed: () => OrderRepository.instance.updateStatus(o.id, OrderStatus.ready),
                        child: const Text('Food is ready'),
                      ),
                  ],
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
            child: Text(badge, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: o.status == OrderStatus.preparing ? Colors.black : Colors.white)),
          ),
        ],
      ),
    );
  }

  Widget _menu() {
    return SafeArea(
      child: ListView(
        children: [
          const Padding(
            padding: EdgeInsets.all(16),
            child: Text('Menu', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
          ),
          ...Catalog.items.map((it) => ListTile(
                title: Text(it.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text('Rs. ${it.price.toStringAsFixed(0)}'),
                trailing: Text(it.isAvailable ? 'Available' : 'Sold out', style: TextStyle(color: it.isAvailable ? Brand.green : Colors.red)),
              )),
        ],
      ),
    );
  }

  Widget _profile() {
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(OrderRepository.instance.user?.name ?? 'Shop', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
          Text(OrderRepository.instance.user?.phone ?? '', style: const TextStyle(color: Brand.soft)),
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
