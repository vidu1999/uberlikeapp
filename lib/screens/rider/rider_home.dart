import 'dart:async';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';

import '../../app.dart';
import '../../config.dart';
import '../../data/place.dart';
import '../../data/repository.dart';
import '../../models/order.dart';
import '../../models/shop.dart';
import '../../theme.dart';
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
  int tab = 0;
  String page = '';
  String filter = 'new';
  String? orderId;
  bool online = true;
  double? lat;
  double? lng;
  StreamSubscription<Position>? _gps;

  @override
  void initState() {
    super.initState();
    _watchGps();
    WidgetsBinding.instance.addPostFrameCallback((_) => _requireRegistered());
  }

  Future<void> _requireRegistered() async {
    await OrderRepository.instance.refresh();
    if (!mounted) return;
    if (!OrderRepository.instance.isRiderRegistered) {
      await OrderRepository.instance.parkForRegister('rider');
    }
  }

  @override
  void dispose() {
    _gps?.cancel();
    super.dispose();
  }

  Future<void> _watchGps() async {
    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) {
      perm = await Geolocator.requestPermission();
    }
    if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) return;
    try {
      final pos = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.bestForNavigation,
        timeLimit: const Duration(seconds: 20),
      );
      if (!mounted) return;
      setState(() {
        lat = pos.latitude;
        lng = pos.longitude;
      });
      _pushLoc(pos.latitude, pos.longitude);
    } catch (_) {}
    _gps = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(accuracy: LocationAccuracy.bestForNavigation, distanceFilter: 1),
    ).listen((pos) {
      if (!mounted) return;
      setState(() {
        lat = pos.latitude;
        lng = pos.longitude;
      });
      _pushLoc(pos.latitude, pos.longitude);
    });
  }

  void _pushLoc(double la, double ln) {
    final live = OrderRepository.instance.orders.where((o) => _mine(o) && o.status.inRiderJob);
    for (final o in live) {
      OrderRepository.instance.updateRiderLocation(o.id, la, ln);
    }
  }

  bool _mine(Order o) {
    final u = OrderRepository.instance.user;
    if (u == null) return false;
    return o.riderId == u.id || (u.phone.isNotEmpty && o.riderPhone == u.phone);
  }

  List<Order> _available(List<Order> orders) =>
      orders.where((o) => o.status == OrderStatus.ready && (o.riderId == null || o.riderId!.isEmpty)).toList();

  List<Order> _ongoing(List<Order> orders) =>
      orders.where((o) => _mine(o) && (o.status == OrderStatus.ready || o.status.inRiderJob)).toList();

  Shop? _shopOf(Order o) {
    for (final s in Catalog.shops) {
      if (s.id == o.shopId) return s;
    }
    return null;
  }

  static const closeM = 200.0;

  double _metersTo(double? aLat, double? aLng, double bLat, double bLng) {
    if (aLat == null || aLng == null) return double.infinity;
    return UserPlace.km(aLat, aLng, bLat, bLng) * 1000;
  }

  bool _closeToShop(Order o) {
    final s = _shopOf(o);
    if (s?.lat == null || s?.lng == null) return lat != null;
    return _metersTo(lat ?? o.riderLat, lng ?? o.riderLng, s!.lat!, s.lng!) <= closeM;
  }

  bool _closeToCust(Order o) {
    return _metersTo(lat ?? o.riderLat, lng ?? o.riderLng, o.deliveryLat, o.deliveryLng) <= closeM;
  }

  void _needCloser(String where, Order o) {
    final s = _shopOf(o);
    final m = where == 'shop'
        ? _metersTo(lat ?? o.riderLat, lng ?? o.riderLng, s?.lat ?? o.deliveryLat, s?.lng ?? o.deliveryLng)
        : _metersTo(lat ?? o.riderLat, lng ?? o.riderLng, o.deliveryLat, o.deliveryLng);
    final msg = m.isFinite ? 'Get closer to the $where (${m.round()} m left)' : 'Wait for live GPS, then get close to the $where';
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  List<Order> _done(List<Order> orders) =>
      orders.where((o) => _mine(o) && o.status == OrderStatus.delivered).toList();

  double _earn(Order o) => o.totalAmount > 0 ? o.totalAmount : 150;

  double _km(Order o) {
    Shop? shop;
    for (final s in Catalog.shops) {
      if (s.id == o.shopId) shop = s;
    }
    final fromLat = lat ?? o.riderLat ?? shop?.lat ?? o.deliveryLat;
    final fromLng = lng ?? o.riderLng ?? shop?.lng ?? o.deliveryLng;
    if (o.status.headingToShop && shop?.lat != null && shop?.lng != null) {
      return UserPlace.km(fromLat, fromLng, shop!.lat!, shop.lng!);
    }
    return UserPlace.km(fromLat, fromLng, o.deliveryLat, o.deliveryLng);
  }

  String? _url(String path) {
    final base = AppConfig.normalize(AppConfig.baseUrl);
    if (base.isEmpty) return null;
    if (path.startsWith('http')) return path;
    return '$base$path';
  }

  String _thumbPath(Order o) {
    if (o.items.isNotEmpty) {
      for (final it in Catalog.items) {
        if (it.name == o.items.first.name && it.image != null && it.image!.isNotEmpty) return it.image!;
      }
    }
    for (final s in Catalog.shops) {
      if (s.id == o.shopId && s.image != null && s.image!.isNotEmpty) return s.image!;
    }
    return '/img/shop-bakery.jpg';
  }

  ImageProvider? _img(String path) {
    final u = _url(path);
    if (u == null) return null;
    return NetworkImage(u);
  }

  Widget _thumb(Order o, double size) {
    final img = _img(_thumbPath(o));
    if (img == null) return Container(width: size, height: size, color: Brand.navy3);
    return Image(
      image: img,
      width: size,
      height: size,
      fit: BoxFit.cover,
      errorBuilder: (_, __, ___) => Container(width: size, height: size, color: Brand.navy3),
    );
  }

  String _greet() {
    final h = DateTime.now().hour;
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
  }

  String get _first {
    final n = OrderRepository.instance.user?.name ?? 'Rider';
    return n.split(RegExp(r'\s+')).first;
  }

  Order? _current(List<Order> orders) {
    if (orderId == null) return null;
    for (final o in orders) {
      if (o.id == orderId) return o;
    }
    return null;
  }

  Future<void> _accept(Order o) async {
    if (!OrderRepository.instance.isRiderRegistered) {
      await OrderRepository.instance.parkForRegister('rider');
      return;
    }
    await OrderRepository.instance.assignRider(o.id);
    await OrderRepository.instance.updateStatus(o.id, OrderStatus.accepted);
    if (lat != null && lng != null) {
      await OrderRepository.instance.updateRiderLocation(o.id, lat!, lng!);
    }
    try {
      await OrderRepository.instance.sendMessage(
        o.id,
        '${OrderRepository.instance.user?.name ?? 'Rider'} accepted your order and is heading to the shop.',
        'system',
        'QuickBite',
      );
    } catch (_) {}
    if (!mounted) return;
    setState(() {
      orderId = o.id;
      page = 'live';
    });
  }

  Future<void> _navigate(Order o) async {
    await OrderRepository.instance.assignRider(o.id);
    if (!o.status.inRiderJob) {
      await OrderRepository.instance.updateStatus(o.id, OrderStatus.accepted);
    }
    if (lat != null && lng != null) {
      await OrderRepository.instance.updateRiderLocation(o.id, lat!, lng!);
    }
    if (!mounted) return;
    setState(() {
      orderId = o.id;
      page = 'live';
    });
  }

  Future<void> _pickup(Order o) async {
    if (!_closeToShop(o)) {
      _needCloser('shop', o);
      return;
    }
    await OrderRepository.instance.updateStatus(o.id, OrderStatus.pickedUp);
    if (lat != null && lng != null) {
      await OrderRepository.instance.updateRiderLocation(o.id, lat!, lng!);
    }
    try {
      await OrderRepository.instance.sendMessage(
        o.id,
        'Order picked up. ${OrderRepository.instance.user?.name ?? 'Rider'} is on the way to you.',
        'system',
        'QuickBite',
      );
    } catch (_) {}
    if (!mounted) return;
    setState(() {
      orderId = o.id;
      page = 'live';
    });
  }

  Future<void> _deliver(Order o) async {
    if (!o.status.headingToCustomer) return;
    if (!_closeToCust(o)) {
      _needCloser('customer', o);
      return;
    }
    await OrderRepository.instance.updateStatus(o.id, OrderStatus.delivered);
    if (!mounted) return;
    setState(() {
      orderId = o.id;
      page = 'delivered';
    });
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
            Widget body;
            if (page == 'details') {
              body = _details(_current(orders));
            } else if (page == 'live') {
              final o = _current(orders);
              if (o != null && o.status == OrderStatus.delivered) {
                body = _delivered(o);
              } else {
                body = _live(o);
              }
            } else if (page == 'delivered') {
              body = _delivered(_current(orders));
            } else if (page == 'wallet') {
              body = _wallet(_done(orders));
            } else if (page == 'docs') {
              body = _docs();
            } else if (page == 'vehicle') {
              body = _vehicle();
            } else if (page == 'help') {
              body = _help();
            } else if (tab == 1) {
              body = _orders(orders);
            } else if (tab == 2) {
              final live = _ongoing(orders).where((o) => o.status.inRiderJob);
              if (live.isNotEmpty) {
                body = _live(live.first);
              } else {
                body = _mapIdle(orders);
              }
            } else if (tab == 3) {
              body = _earn(_done(orders));
            } else if (tab == 4) {
              body = _profile(orders);
            } else {
              body = _home(orders);
            }
            final hideNav = page == 'details' || page == 'live' || page == 'delivered' || page == 'docs' || page == 'vehicle' || page == 'help';
            return Column(
              children: [
                Expanded(child: body),
                if (!hideNav)
                  NavigationBar(
                    height: 64,
                    backgroundColor: Brand.navy,
                    indicatorColor: Brand.green.withOpacity(0.18),
                    selectedIndex: tab,
                    onDestinationSelected: (i) => setState(() {
                      tab = i;
                      page = '';
                    }),
                    destinations: const [
                      NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home, color: Brand.green), label: 'Home'),
                      NavigationDestination(icon: Icon(Icons.shopping_bag_outlined), selectedIcon: Icon(Icons.shopping_bag, color: Brand.green), label: 'Orders'),
                      NavigationDestination(icon: Icon(Icons.map_outlined), selectedIcon: Icon(Icons.map, color: Brand.green), label: 'Map'),
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

  Widget _home(List<Order> orders) {
    final jobs = _available(orders);
    final today = _done(orders);
    final pay = today.fold<double>(0, (n, o) => n + _earn(o));
    final going = _ongoing(orders);
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(0, 8, 0, 16),
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('${_greet()},', style: const TextStyle(color: Brand.soft, fontSize: 13, fontWeight: FontWeight.w600)),
                      Text(_first, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
                    ],
                  ),
                ),
                GestureDetector(
                  onTap: () => setState(() => online = !online),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: online ? const Color(0xFF123D28) : Brand.navy3,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(online ? '●  Online' : '○  Offline', style: TextStyle(color: online ? Brand.green : Brand.soft, fontWeight: FontWeight.w800, fontSize: 12)),
                  ),
                ),
                const SizedBox(width: 8),
                CircleAvatar(radius: 22, backgroundImage: _img('/img/avatar-rider.jpg'), backgroundColor: Brand.navy3),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                Expanded(child: _kpi("Today's Earnings", 'Rs. ${pay.round()}', '${today.length} Deliveries')),
                const SizedBox(width: 10),
                Expanded(child: _kpi("Today's Orders", '${today.length + going.length}', 'On Going: ${going.length}')),
              ],
            ),
          ),
          const SizedBox(height: 14),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Row(
              children: [
                _short(Icons.shopping_bag, 'New Orders', () => setState(() { tab = 1; filter = 'new'; page = ''; })),
                _short(Icons.map, 'Map', () => setState(() { tab = 2; page = ''; })),
                _short(Icons.account_balance_wallet, 'Wallet', () => setState(() => page = 'wallet')),
                _short(Icons.person, 'Profile', () => setState(() { tab = 4; page = ''; })),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: Row(
              children: [
                const Expanded(child: Text('Available Orders', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16))),
                TextButton(onPressed: () => setState(() { tab = 1; page = ''; }), child: const Text('See all', style: TextStyle(color: Brand.green, fontWeight: FontWeight.w800))),
              ],
            ),
          ),
          if (!online)
            const Padding(padding: EdgeInsets.symmetric(horizontal: 16), child: Text('Go Online to see nearby orders.', style: TextStyle(color: Brand.soft)))
          else if (jobs.isEmpty)
            const Padding(padding: EdgeInsets.symmetric(horizontal: 16), child: Text('No ready jobs yet. When a shop taps Food is ready, Accept and go to the shop first.', style: TextStyle(color: Brand.soft)))
          else
            ...jobs.map((o) => _jobCard(o, accept: true)),
        ],
      ),
    );
  }

  Widget _kpi(String label, String value, String sub) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: Brand.navy2, borderRadius: BorderRadius.circular(18)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(color: Brand.soft, fontSize: 12, fontWeight: FontWeight.w600)),
          Text(value, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
          Text(sub, style: const TextStyle(color: Brand.green, fontSize: 12, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }

  Widget _short(IconData icon, String label, VoidCallback onTap) {
    return Expanded(
      child: InkWell(
        onTap: onTap,
        child: Column(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(color: Brand.navy2, borderRadius: BorderRadius.circular(16)),
              child: Icon(icon, color: Brand.green),
            ),
            const SizedBox(height: 6),
            Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
          ],
        ),
      ),
    );
  }

  Widget _jobCard(Order o, {required bool accept}) {
    final km = _km(o);
    return GestureDetector(
      onTap: () => setState(() {
        orderId = o.id;
        page = 'details';
      }),
      child: Container(
        margin: const EdgeInsets.fromLTRB(16, 0, 16, 10),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: Brand.navy2, borderRadius: BorderRadius.circular(16)),
        child: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: _thumb(o, 56),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('#${o.id.replaceAll('_', '-')}', style: const TextStyle(fontWeight: FontWeight.w800)),
                  Text(o.shopName, style: const TextStyle(color: Brand.soft, fontSize: 12)),
                  Text('${km.toStringAsFixed(1)} km · Rs. ${_earn(o).round()}', style: const TextStyle(color: Brand.soft, fontSize: 12)),
                ],
              ),
            ),
            if (accept)
              FilledButton(
                style: FilledButton.styleFrom(backgroundColor: Brand.green, minimumSize: const Size(0, 36)),
                onPressed: () => _accept(o),
                child: const Text('Accept'),
              )
            else
              Text(TimeOfDay.fromDateTime(o.timestamp).format(context), style: const TextStyle(color: Brand.soft, fontSize: 12)),
          ],
        ),
      ),
    );
  }

  Widget _orders(List<Order> orders) {
    final list = filter == 'going' ? _ongoing(orders) : filter == 'done' ? _done(orders) : _available(orders);
    return SafeArea(
      child: ListView(
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: Text('Orders', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                _pill('New (${_available(orders).length})', filter == 'new', () => setState(() => filter = 'new')),
                const SizedBox(width: 8),
                _pill('On Going (${_ongoing(orders).length})', filter == 'going', () => setState(() => filter = 'going')),
                const SizedBox(width: 8),
                _pill('Completed', filter == 'done', () => setState(() => filter = 'done')),
              ],
            ),
          ),
          const SizedBox(height: 12),
          if (list.isEmpty)
            const Padding(padding: EdgeInsets.all(16), child: Text('No orders in this tab.', style: TextStyle(color: Brand.soft)))
          else
            ...list.map((o) => _jobCard(o, accept: filter == 'new')),
        ],
      ),
    );
  }

  Widget _pill(String label, bool on, VoidCallback tap) {
    return GestureDetector(
      onTap: tap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(color: on ? Brand.green : Brand.navy2, borderRadius: BorderRadius.circular(20)),
        child: Text(label, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12, color: on ? Colors.white : Brand.soft)),
      ),
    );
  }

  Widget _details(Order? o) {
    if (o == null) {
      return Center(child: TextButton(onPressed: () => setState(() => page = ''), child: const Text('Back')));
    }
    final claimed = _mine(o) || (o.riderId != null && o.riderId!.isNotEmpty);
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          Row(
            children: [
              IconButton.filled(
                style: IconButton.styleFrom(backgroundColor: Brand.navy2),
                onPressed: () => setState(() => page = ''),
                icon: const Icon(Icons.arrow_back, color: Colors.white),
              ),
              const SizedBox(width: 10),
              const Text('Order Details', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
            ],
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: Brand.navy2, borderRadius: BorderRadius.circular(18)),
            child: Row(
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(16),
                  child: _thumb(o, 64),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('#${o.id.replaceAll('_', '-')}', style: const TextStyle(fontWeight: FontWeight.w800)),
                      Text(o.shopName, style: const TextStyle(color: Brand.soft, fontSize: 12)),
                      Text('Rs. ${o.totalAmount.round()} · ${_km(o).toStringAsFixed(1)} km', style: const TextStyle(color: Brand.soft, fontSize: 12)),
                      Text(o.status.label, style: const TextStyle(color: Color(0xFFF5C518), fontWeight: FontWeight.w800, fontSize: 12)),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: Brand.navy2, borderRadius: BorderRadius.circular(18)),
            child: Row(
              children: [
                CircleAvatar(
                  backgroundImage: _img(OrderRepository.chatLane(o) == 'shop' ? '/img/shop-bakery.jpg' : '/img/avatar-user.jpg'),
                  backgroundColor: Brand.navy3,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        OrderRepository.instance.chatPeerName(o, 'rider'),
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
                      Text(
                        OrderRepository.chatLane(o) == 'shop' ? 'Shop · chat until pickup' : (o.customerPhone ?? 'WhatsApp customer'),
                        style: const TextStyle(color: Brand.soft, fontSize: 12),
                      ),
                    ],
                  ),
                ),
                IconButton.filled(style: IconButton.styleFrom(backgroundColor: const Color(0xFF123D28)), onPressed: () {}, icon: const Icon(Icons.call, color: Brand.green)),
                if (OrderRepository.instance.canChat(o, 'rider')) _chatBtn(o),
              ],
            ),
          ),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: Brand.navy2, borderRadius: BorderRadius.circular(18)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Pickup', style: TextStyle(color: Brand.soft, fontSize: 13, fontWeight: FontWeight.w700)),
                const SizedBox(height: 6),
                Text(_shopOf(o)?.name ?? o.shopName, style: const TextStyle(fontWeight: FontWeight.w800)),
                Text(_shopOf(o)?.address ?? 'Shop pin on the map', style: const TextStyle(color: Brand.soft, fontSize: 12)),
                const SizedBox(height: 12),
                const Text('Delivery Address', style: TextStyle(color: Brand.soft, fontSize: 13, fontWeight: FontWeight.w700)),
                const SizedBox(height: 6),
                Text(o.address.isEmpty ? 'Customer pin on the map' : o.address, style: const TextStyle(fontWeight: FontWeight.w800)),
              ],
            ),
          ),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: Brand.navy2, borderRadius: BorderRadius.circular(18)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Order Items', style: TextStyle(color: Brand.soft, fontSize: 13, fontWeight: FontWeight.w700)),
                ...o.items.map((it) => ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(it.name, style: const TextStyle(fontWeight: FontWeight.w800)),
                      subtitle: Text('x${it.qty} · Rs. ${it.price.round()}', style: const TextStyle(color: Brand.soft)),
                    )),
              ],
            ),
          ),
          const SizedBox(height: 16),
          if (!claimed && o.status == OrderStatus.ready)
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: Brand.green, minimumSize: const Size.fromHeight(52)),
              onPressed: () => _accept(o),
              child: const Text('Accept', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            ),
          if (_mine(o) && o.status != OrderStatus.delivered)
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: Brand.green, minimumSize: const Size.fromHeight(52)),
              onPressed: () => _navigate(o),
              child: Text(
                o.status.headingToCustomer ? 'Navigate to customer' : 'Navigate to shop',
                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
              ),
            ),
        ],
      ),
    );
  }

  Widget _live(Order? o) {
    if (o == null) return const Center(child: Text('No active delivery'));
    Shop? shop;
    for (final s in Catalog.shops) {
      if (s.id == o.shopId) shop = s;
    }
    final avatar = _url('/img/avatar-rider.jpg');
    final name = OrderRepository.instance.user?.name ?? o.riderName ?? 'Rider';
    return Stack(
      children: [
        Positioned.fill(
          child: TrackingMap(
            destLat: o.deliveryLat,
            destLng: o.deliveryLng,
            riderLat: o.riderLat ?? lat,
            riderLng: o.riderLng ?? lng,
            shopLat: o.shopLat ?? shop?.lat,
            shopLng: o.shopLng ?? shop?.lng,
            liveLat: lat,
            liveLng: lng,
            dark: true,
            toShop: o.status.headingToShop,
          ),
        ),
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 8, 14, 0),
            child: Row(
              children: [
                IconButton.filled(
                  style: IconButton.styleFrom(backgroundColor: Brand.navy2),
                  onPressed: () => setState(() => page = 'details'),
                  icon: const Icon(Icons.arrow_back, color: Colors.white),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(o.status.headingToShop ? 'To shop' : 'On the way', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Colors.white)),
                      Text('${_km(o).toStringAsFixed(1)} km left', style: const TextStyle(color: Brand.soft, fontSize: 12)),
                    ],
                  ),
                ),
                if (OrderRepository.instance.canChat(o, 'rider')) _chatBtn(o, iconColor: Colors.white, bg: Brand.navy2),
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
                    CircleAvatar(radius: 28, backgroundImage: avatar == null ? null : NetworkImage(avatar), backgroundColor: Brand.navy3),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                          const Text('Delivery Partner', style: TextStyle(color: Brand.soft, fontSize: 12)),
                          const Text('★ 4.9  (120+)', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12)),
                        ],
                      ),
                    ),
                    IconButton.filled(style: IconButton.styleFrom(backgroundColor: const Color(0xFF123D28)), onPressed: () {}, icon: const Icon(Icons.call, color: Brand.green)),
                    if (OrderRepository.instance.canChat(o, 'rider')) ...[
                      const SizedBox(width: 6),
                      _chatBtn(o),
                    ],
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(child: _metric(Icons.schedule, 'ETA', '${(_km(o) * 4).round().clamp(8, 40)} min')),
                    const SizedBox(width: 10),
                    Expanded(child: _metric(Icons.place, 'Distance', '${_km(o).toStringAsFixed(1)} km')),
                  ],
                ),
                const SizedBox(height: 12),
                Text(
                  o.status.headingToShop
                      ? (_closeToShop(o) ? 'You are at the shop — confirm pickup' : 'Get close to the shop to confirm pickup')
                      : (_closeToCust(o) ? 'You are at the customer — confirm delivered' : 'Get close to the customer to confirm delivered'),
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: (o.status.headingToShop ? _closeToShop(o) : _closeToCust(o)) ? Brand.green : Brand.soft,
                    fontWeight: FontWeight.w700,
                    fontSize: 12,
                  ),
                ),
                const SizedBox(height: 10),
                FilledButton(
                  style: FilledButton.styleFrom(backgroundColor: Brand.green, minimumSize: const Size.fromHeight(48)),
                  onPressed: () => o.status.headingToShop ? _pickup(o) : _deliver(o),
                  child: Text(
                    o.status.headingToShop ? 'Confirm pickup' : 'Mark delivered',
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _chatBtn(Order o, {Color iconColor = Brand.green, Color bg = const Color(0xFF123D28)}) {
    final n = OrderRepository.instance.unreadCount(o.id, 'rider');
    return IconButton.filled(
      style: IconButton.styleFrom(backgroundColor: bg),
      onPressed: () async {
        await Navigator.push(context, MaterialPageRoute(builder: (_) => ChatScreen(orderId: o.id, myRole: 'rider')));
        if (mounted) setState(() {});
      },
      icon: Badge(
        isLabelVisible: n > 0,
        smallSize: 10,
        backgroundColor: Brand.red,
        child: Icon(Icons.chat_bubble, color: iconColor),
      ),
    );
  }

  Widget _metric(IconData icon, String label, String value) {
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

  Widget _delivered(Order? o) {
    final pay = o == null ? 0 : _earn(o).round();
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 40, 24, 24),
        child: Column(
          children: [
            Container(
              width: 120,
              height: 120,
              decoration: BoxDecoration(color: const Color(0xFFE8F8EE), borderRadius: BorderRadius.circular(28)),
              child: const Center(child: Text('📦', style: TextStyle(fontSize: 48))),
            ),
            const SizedBox(height: 18),
            const Text('Order Delivered!', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: Colors.white)),
            const SizedBox(height: 8),
            const Text('Great job! You completed the delivery successfully.', textAlign: TextAlign.center, style: TextStyle(color: Brand.soft)),
            const SizedBox(height: 18),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(color: Brand.navy2, borderRadius: BorderRadius.circular(18)),
              child: Column(
                children: [
                  const Text('Earnings', style: TextStyle(color: Brand.soft)),
                  Text('Rs. $pay', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
                ],
              ),
            ),
            const Spacer(),
            TextButton(onPressed: () => setState(() => page = 'details'), child: const Text('View Order Details', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800))),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: Brand.green, minimumSize: const Size.fromHeight(52)),
              onPressed: () => setState(() {
                page = '';
                tab = 0;
              }),
              child: const Text('Back to Home', style: TextStyle(fontWeight: FontWeight.w800)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _earn(List<Order> list) {
    final pay = list.fold<double>(0, (n, o) => n + _earn(o));
    final dist = list.fold<double>(0, (n, o) => n + _km(o));
    final buckets = List<double>.filled(7, 0);
    for (final o in list) {
      buckets[(o.timestamp.weekday + 6) % 7] += _earn(o);
    }
    final max = buckets.fold<double>(1, (a, b) => a > b ? a : b);
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
        children: [
          const Text('Earnings', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          Text('Rs. ${pay.round()}', style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w800)),
          Text('${list.length} Deliveries · Today', style: const TextStyle(color: Brand.soft)),
          const SizedBox(height: 12),
          SizedBox(
            height: 120,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                for (var i = 0; i < 7; i++)
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 3),
                      child: Container(
                        height: (8 + (buckets[i] / max) * 110).clamp(8, 110),
                        decoration: BoxDecoration(
                          color: buckets[i] > 0 ? Brand.green : const Color(0xFF123D28),
                          borderRadius: const BorderRadius.vertical(top: Radius.circular(8)),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          Row(children: days.map((d) => Expanded(child: Text(d, textAlign: TextAlign.center, style: const TextStyle(color: Brand.soft, fontSize: 11, fontWeight: FontWeight.w700)))).toList()),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(child: _kpi('Total Deliveries', '${list.length}', '')),
              const SizedBox(width: 8),
              Expanded(child: _kpi('Total Distance', '${dist.toStringAsFixed(1)} km', '')),
              const SizedBox(width: 8),
              Expanded(child: _kpi('Avg. per Delivery', list.isEmpty ? 'Rs. 0' : 'Rs. ${(pay / list.length).round()}', '')),
            ],
          ),
          const SizedBox(height: 16),
          const Text('Recent Transactions', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
          const SizedBox(height: 8),
          if (list.isEmpty) const Text('Complete a delivery to see earnings.', style: TextStyle(color: Brand.soft)),
          ...list.map((o) => ListTile(
                contentPadding: EdgeInsets.zero,
                leading: CircleAvatar(backgroundImage: _img(_thumbPath(o)), backgroundColor: Brand.navy3),
                title: Text('#${o.id.replaceAll('_', '-')}'),
                subtitle: Text(TimeOfDay.fromDateTime(o.timestamp).format(context), style: const TextStyle(color: Brand.soft)),
                trailing: Text('+ Rs. ${_earn(o).round()}', style: const TextStyle(color: Brand.green, fontWeight: FontWeight.w800)),
              )),
        ],
      ),
    );
  }

  Widget _wallet(List<Order> list) {
    final pay = list.fold<double>(0, (n, o) => n + _earn(o));
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        children: [
          Row(
            children: [
              IconButton.filled(style: IconButton.styleFrom(backgroundColor: Brand.navy2), onPressed: () => setState(() => page = ''), icon: const Icon(Icons.arrow_back, color: Colors.white)),
              const SizedBox(width: 10),
              const Text('Wallet', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
            ],
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(color: Brand.green, borderRadius: BorderRadius.circular(20)),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Available Balance', style: TextStyle(color: Colors.white70)),
                      Text('Rs. ${pay.round()}', style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800)),
                    ],
                  ),
                ),
                FilledButton(
                  style: FilledButton.styleFrom(backgroundColor: Colors.white, foregroundColor: Brand.green),
                  onPressed: () {},
                  child: const Text('Withdraw', style: TextStyle(fontWeight: FontWeight.w800)),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          const Text('Transaction', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
          ...list.map((o) => ListTile(
                contentPadding: EdgeInsets.zero,
                leading: CircleAvatar(backgroundImage: _img(_thumbPath(o)), backgroundColor: Brand.navy3),
                title: Text('Order #${o.id.replaceAll('_', '-')}'),
                trailing: Text('+ Rs. ${_earn(o).round()}', style: const TextStyle(color: Brand.green, fontWeight: FontWeight.w800)),
              )),
        ],
      ),
    );
  }

  Widget _profile(List<Order> orders) {
    final u = OrderRepository.instance.user;
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
        children: [
          CircleAvatar(radius: 44, backgroundImage: _img('/img/avatar-rider.jpg'), backgroundColor: Brand.navy3),
          const SizedBox(height: 8),
          Text(u?.name ?? 'Rider', textAlign: TextAlign.center, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
          const Text('Delivery Partner', textAlign: TextAlign.center, style: TextStyle(color: Brand.soft)),
          const Text('★ 4.9 (120+)', textAlign: TextAlign.center, style: TextStyle(color: Brand.star, fontWeight: FontWeight.w800)),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(child: _kpi('Completed', '${_done(orders).length}', '')),
              const SizedBox(width: 8),
              Expanded(child: _kpi('On Going', '${_ongoing(orders).length}', '')),
              const SizedBox(width: 8),
              Expanded(child: _kpi('Cancelled', '0', '')),
            ],
          ),
          const SizedBox(height: 12),
          _menu('My Documents', () => setState(() => page = 'docs')),
          _menu('Vehicle Information', () => setState(() => page = 'vehicle')),
          _menu('Bank Account', () => setState(() => page = 'wallet')),
          _menu('Settings', () {}),
          _menu('Help & Support', () => setState(() => page = 'help')),
          const SizedBox(height: 8),
          const SettingsButton(),
          const SizedBox(height: 12),
          OutlinedButton(
            onPressed: () => OrderRepository.instance.logout(),
            child: const Text('Log Out', style: TextStyle(color: Color(0xFFFCA5A5), fontWeight: FontWeight.w800)),
          ),
        ],
      ),
    );
  }

  Widget _menu(String label, VoidCallback onTap) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        onTap: onTap,
        tileColor: Brand.navy2,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        title: Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
        trailing: const Icon(Icons.chevron_right, color: Brand.soft),
      ),
    );
  }

  Widget _docs() {
    const rows = ['NIC / ID Card', 'Driving License', 'Vehicle Registration', 'Profile Photo'];
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(children: [
            IconButton.filled(style: IconButton.styleFrom(backgroundColor: Brand.navy2), onPressed: () => setState(() => page = ''), icon: const Icon(Icons.arrow_back, color: Colors.white)),
            const SizedBox(width: 10),
            const Text('My Documents', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
          ]),
          const SizedBox(height: 12),
          ...rows.map((r) => Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(color: Brand.navy2, borderRadius: BorderRadius.circular(14)),
                child: Row(children: [Expanded(child: Text(r, style: const TextStyle(fontWeight: FontWeight.w700))), const Text('Verified  ✓', style: TextStyle(color: Brand.green, fontWeight: FontWeight.w800))]),
              )),
        ],
      ),
    );
  }

  Widget _vehicle() {
    final v = OrderRepository.instance.user?.vehicle ?? 'Honda Dio · BDX 1234';
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(children: [
            IconButton.filled(style: IconButton.styleFrom(backgroundColor: Brand.navy2), onPressed: () => setState(() => page = ''), icon: const Icon(Icons.arrow_back, color: Colors.white)),
            const SizedBox(width: 10),
            const Text('Vehicle Information', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
          ]),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: Brand.navy2, borderRadius: BorderRadius.circular(18)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(v, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                const Divider(color: Color(0xFF1F2937)),
                _kv('License Plate', 'BDX 1234'),
                _kv('Vehicle Type', 'Motorcycle'),
                _kv('Insurance', 'Valid (2026)'),
                _kv('RC Book', 'Verified'),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _kv(String k, String v) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(children: [Expanded(child: Text(k, style: const TextStyle(color: Brand.soft))), Text(v, style: const TextStyle(fontWeight: FontWeight.w800))]),
    );
  }

  Widget _help() {
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(children: [
            IconButton.filled(style: IconButton.styleFrom(backgroundColor: Brand.navy2), onPressed: () => setState(() => page = ''), icon: const Icon(Icons.arrow_back, color: Colors.white)),
            const SizedBox(width: 10),
            const Text('Help & Support', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
          ]),
          const SizedBox(height: 12),
          _menu('FAQs', () {}),
          _menu('Contact Support', () {}),
          _menu('Live Chat', () {}),
          _menu('Report an Issue', () {}),
          Container(
            margin: const EdgeInsets.only(top: 8),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: const Color(0xFF123D28), borderRadius: BorderRadius.circular(18)),
            child: const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('QuickBite Rider Support Team', style: TextStyle(fontWeight: FontWeight.w800)),
                SizedBox(height: 4),
                Text('We are here to help you!', style: TextStyle(color: Color(0xFF9FE7B8))),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _mapIdle(List<Order> orders) {
    return Stack(
      children: [
        Positioned.fill(
          child: TrackingMap(
            destLat: lat ?? 8.335,
            destLng: lng ?? 80.4108,
            liveLat: lat,
            liveLng: lng,
            dark: true,
          ),
        ),
        Positioned(
          left: 16,
          right: 16,
          bottom: 16,
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: Brand.navy2, borderRadius: BorderRadius.circular(16)),
            child: Text(
              online
                  ? '${_available(orders).length} ready jobs nearby. Accept, go to the shop, confirm pickup, then deliver.'
                  : 'You are offline.',
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
        ),
      ],
    );
  }
}
