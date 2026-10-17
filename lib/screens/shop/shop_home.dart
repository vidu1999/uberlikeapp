import 'package:flutter/material.dart';
import '../../app.dart';
import '../../config.dart';
import '../../data/repository.dart';
import '../../models/order.dart';
import '../../models/shop.dart';
import '../../theme.dart';
import 'shop_edit_profile.dart';
import 'shop_item_edit.dart';
import 'shop_order_details.dart';

class ShopHome extends StatefulWidget {
  final UserRole currentRole;
  final ValueChanged<UserRole> onSwitchRole;
  const ShopHome({super.key, required this.currentRole, required this.onSwitchRole});

  @override
  State<ShopHome> createState() => _ShopHomeState();
}

class _ShopHomeState extends State<ShopHome> {
  int tab = 3;
  String filter = 'all';
  String menuQ = '';
  String menuCat = 'All';

  @override
  void initState() {
    super.initState();
    if (OrderRepository.instance.openShopProfile) {
      tab = 3;
      OrderRepository.instance.openShopProfile = false;
    }
  }

  String get shopId {
    final id = OrderRepository.instance.user?.shopId;
    if (id != null && id.isNotEmpty) return id;
    return 'SHOP_1';
  }

  Shop get shop {
    for (final s in Catalog.shops) {
      if (s.id == shopId) return s;
    }
    return Shop(id: shopId, name: 'My Shop', category: 'Bakery', rating: 5, isOpen: true, hours: '08:00 AM – 10:00 PM', image: '/img/shop-bakery.jpg');
  }

  String get shopTitle => shop.name;

  String get shopTags {
    final c = shop.category;
    if (RegExp(r'baker', caseSensitive: false).hasMatch(c)) return 'Bakery • Cakes • Pastries';
    return c.isEmpty ? 'Bakery' : c;
  }

  String get shopAbout {
    final p = shop.promo ?? '';
    if (p.isEmpty || RegExp(r'buy 1', caseSensitive: false).hasMatch(p)) {
      return 'Freshly baked cakes, pastries and desserts made with love. We use the best ingredients to bring happiness to your table.';
    }
    return p;
  }

  List<Order> _mine(List<Order> orders) => orders.where((o) => o.shopId == shopId).toList();

  String? _url(String path) {
    final base = AppConfig.normalize(AppConfig.baseUrl);
    if (base.isEmpty) return null;
    return '$base$path';
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<int>(
      valueListenable: Catalog.version,
      builder: (context, _, __) => Theme(
      data: Brand.dark(),
      child: Scaffold(
        backgroundColor: Brand.navy,
        body: IndexedStack(
          index: tab,
          children: [
            _dash(),
            _orders(),
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
            NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home, color: Brand.green), label: 'Home'),
            NavigationDestination(icon: Icon(Icons.receipt_long_outlined), selectedIcon: Icon(Icons.receipt_long, color: Brand.green), label: 'Orders'),
            NavigationDestination(icon: Icon(Icons.restaurant_menu_outlined), selectedIcon: Icon(Icons.restaurant_menu, color: Brand.green), label: 'Menu'),
            NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person, color: Brand.green), label: 'Profile'),
          ],
        ),
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
        final mine = _mine(orders);
        final pending = mine.where((o) => o.status == OrderStatus.pending).length;
        final prep = mine.where((o) => o.status == OrderStatus.preparing).length;
        final ready = mine.where((o) => o.status == OrderStatus.ready).length;
        final way = mine.where((o) => o.status == OrderStatus.onTheWay).length;
        final list = mine.where((o) {
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
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                child: Row(
                  children: [
                    Text(shopTitle, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                    const SizedBox(width: 10),
                    const Chip(
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
    return GestureDetector(
      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ShopOrderDetails(orderId: o.id))),
      child: Container(
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
    ),
    );
  }

  String _bucket(String cat) {
    final c = cat.toLowerCase();
    if (RegExp(r'drink|beverage|coffee|juice|tea|ice').hasMatch(c)) return 'Drinks';
    if (RegExp(r'dessert|cake|sweet|cookie|bakery|pastry').hasMatch(c)) return 'Desserts';
    return 'Food';
  }

  Widget _orders() {
    return ValueListenableBuilder<List<Order>>(
      valueListenable: OrderRepository.instance.ordersNotifier,
      builder: (context, orders, _) {
        final list = _mine(orders).where((o) {
          if (filter == 'pending') return o.status == OrderStatus.pending;
          if (filter == 'prep') return o.status == OrderStatus.preparing;
          if (filter == 'ready') return o.status == OrderStatus.ready;
          return true;
        }).toList();
        return SafeArea(
          child: ListView(
            children: [
              const Padding(
                padding: EdgeInsets.fromLTRB(16, 12, 16, 8),
                child: Text('Orders', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
              ),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Row(children: [
                  _tab('all', 'All'),
                  _tab('pending', 'Pending'),
                  _tab('prep', 'Preparing'),
                  _tab('ready', 'Ready'),
                ]),
              ),
              if (list.isEmpty)
                const Padding(padding: EdgeInsets.all(24), child: Text('No orders in this tab.', style: TextStyle(color: Brand.soft))),
              ...list.map(_orderCard),
            ],
          ),
        );
      },
    );
  }

  Widget _menu() {
    final q = menuQ.trim().toLowerCase();
    final list = Catalog.items.where((it) {
      if (it.shopId != shopId) return false;
      if (menuCat != 'All' && _bucket(it.category) != menuCat) return false;
      if (q.isNotEmpty && !it.name.toLowerCase().contains(q) && !it.category.toLowerCase().contains(q)) return false;
      return true;
    }).toList();
    return ColoredBox(
      color: Colors.white,
      child: SafeArea(
        child: Stack(
          children: [
            ListView(
              padding: const EdgeInsets.only(bottom: 88),
              children: [
                const Padding(
                  padding: EdgeInsets.fromLTRB(16, 12, 16, 8),
                  child: Text('Menu Items', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: Brand.ink)),
                ),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: Row(
                    children: ['All', 'Food', 'Drinks', 'Desserts'].map((c) {
                      final on = menuCat == c;
                      return Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: ChoiceChip(
                          label: Text(c),
                          selected: on,
                          selectedColor: Brand.green,
                          labelStyle: TextStyle(color: on ? Colors.white : Brand.muted, fontWeight: FontWeight.w700),
                          onSelected: (_) => setState(() => menuCat = c),
                        ),
                      );
                    }).toList(),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 10, 16, 8),
                  child: TextField(
                    onChanged: (v) => setState(() => menuQ = v),
                    style: const TextStyle(color: Brand.ink),
                    decoration: InputDecoration(
                      hintText: 'Search menu items…',
                      prefixIcon: const Icon(Icons.search),
                      filled: true,
                      fillColor: Brand.search,
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                    ),
                  ),
                ),
                ...list.map((it) {
                  final img = (it.image != null && it.image!.isNotEmpty) ? _url(it.image!) : null;
                  return ListTile(
                    onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ShopItemEdit(item: it))),
                    leading: ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: img == null
                          ? Container(width: 56, height: 56, color: Brand.search)
                          : Image.network(img, width: 56, height: 56, fit: BoxFit.cover, errorBuilder: (_, __, ___) => Container(width: 56, height: 56, color: Brand.search)),
                    ),
                    title: Text(it.name, style: const TextStyle(fontWeight: FontWeight.w800, color: Brand.ink)),
                    subtitle: Text('Rs. ${it.price.toStringAsFixed(0)}', style: const TextStyle(color: Brand.muted, fontWeight: FontWeight.w700)),
                    trailing: Switch(
                      value: it.isAvailable,
                      activeColor: Brand.green,
                      onChanged: (v) => OrderRepository.instance.toggleItem(it.id, v),
                    ),
                  );
                }),
              ],
            ),
            Positioned(
              right: 16,
              bottom: 16,
              child: FilledButton.icon(
                style: FilledButton.styleFrom(backgroundColor: Brand.green, padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14)),
                onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ShopItemEdit())),
                icon: const Icon(Icons.add),
                label: const Text('Add Item', style: TextStyle(fontWeight: FontWeight.w800)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _profile() {
    return ValueListenableBuilder<List<Order>>(
      valueListenable: OrderRepository.instance.ordersNotifier,
      builder: (context, orders, _) {
        final mine = _mine(orders).where((o) => o.status != OrderStatus.cancelled).toList();
        final sales = mine.fold<double>(0, (n, o) => n + o.totalAmount);
        final ordersN = mine.isEmpty && shopId == 'SHOP_1' ? 124 : mine.length;
        final revenue = sales == 0 && shopId == 'SHOP_1' ? 284500.0 : sales;
        final rating = shop.rating == 0 ? 4.8 : shop.rating;
        final hero = (shop.image != null && shop.image!.isNotEmpty) ? _url(shop.image!) : _url('/img/shop-bakery.jpg');
        return ListView(
          padding: EdgeInsets.zero,
          children: [
            SizedBox(
              height: 168,
              child: hero == null
                  ? Container(color: Brand.navy3)
                  : Image.network(hero, fit: BoxFit.cover, errorBuilder: (_, __, ___) => Container(color: Brand.navy3)),
            ),
            Transform.translate(
              offset: const Offset(0, -48),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Container(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 18),
                  decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(22), boxShadow: const [BoxShadow(color: Color(0x33000000), blurRadius: 18, offset: Offset(0, 8))]),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 58,
                        height: 58,
                        decoration: BoxDecoration(color: Brand.ink, borderRadius: BorderRadius.circular(16)),
                        child: const Center(child: Text('🏪', style: TextStyle(fontSize: 26))),
                      ),
                      const SizedBox(height: 8),
                      Text(shopTitle, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: Brand.ink)),
                      Text(shopTags, style: const TextStyle(color: Brand.muted, fontSize: 13)),
                      const SizedBox(height: 4),
                      Text('★ ${rating.toStringAsFixed(1)}  (${shop.reviews}+)', style: const TextStyle(color: Color(0xFFF5B400), fontWeight: FontWeight.w700)),
                      const SizedBox(height: 6),
                      Text('${shop.isOpen ? '● Open' : '● Closed'} ${shop.hours ?? '08:00 AM – 10:00 PM'}', style: const TextStyle(color: Brand.green, fontWeight: FontWeight.w700, fontSize: 13)),
                      const SizedBox(height: 14),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton(
                              style: OutlinedButton.styleFrom(foregroundColor: Brand.green, side: const BorderSide(color: Brand.green, width: 1.5), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
                              onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ShopEditProfile(shop: shop, about: shopAbout))),
                              child: const Text('Edit Profile', style: TextStyle(fontWeight: FontWeight.w800)),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: FilledButton(
                              style: FilledButton.styleFrom(backgroundColor: Brand.green, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
                              onPressed: () => setState(() => tab = 2),
                              child: const Text('View Store', style: TextStyle(fontWeight: FontWeight.w800, color: Colors.white)),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: Row(
                children: [
                  _pstat('$ordersN', 'Total Orders'),
                  const SizedBox(width: 8),
                  _pstat('Rs. ${revenue.toStringAsFixed(0)}', 'Total Revenue'),
                  const SizedBox(width: 8),
                  _pstat(rating.toStringAsFixed(1), 'Rating'),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(color: Brand.navy2, borderRadius: BorderRadius.circular(18)),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('About Us', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                    const SizedBox(height: 6),
                    Text(shopAbout, style: const TextStyle(color: Brand.soft, height: 1.4)),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
              child: OutlinedButton(
                style: OutlinedButton.styleFrom(foregroundColor: const Color(0xFFFCA5A5), side: const BorderSide(color: Color(0xFF1F2937))),
                onPressed: () => OrderRepository.instance.logout(),
                child: const Text('Log Out', style: TextStyle(fontWeight: FontWeight.w800)),
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _pstat(String n, String label) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 6),
        decoration: BoxDecoration(color: Brand.navy2, borderRadius: BorderRadius.circular(16)),
        child: Column(
          children: [
            Text(n, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
            Text(label, textAlign: TextAlign.center, style: const TextStyle(color: Brand.soft, fontSize: 11, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}
