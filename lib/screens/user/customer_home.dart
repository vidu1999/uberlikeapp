import 'package:flutter/material.dart';
import '../../app.dart';
import '../../config.dart';
import '../../data/repository.dart';
import '../../models/shop.dart';
import '../../data/place.dart';
import '../../theme.dart';
import '../../widgets/settings_button.dart';
import 'cart_screen.dart';
import 'location_picker.dart';
import 'my_orders_screen.dart';
import 'search_screen.dart';
import 'shop_menu_screen.dart';

class CustomerHome extends StatefulWidget {
  final UserRole currentRole;
  final ValueChanged<UserRole> onSwitchRole;
  const CustomerHome({super.key, required this.currentRole, required this.onSwitchRole});

  @override
  State<CustomerHome> createState() => _CustomerHomeState();
}

class _CustomerHomeState extends State<CustomerHome> {
  int tab = 0;
  String category = 'All';

  @override
  void initState() {
    super.initState();
    UserPlace.instance.start();
  }

  String get _hello {
    final h = DateTime.now().hour;
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
  }

  String get _name {
    final u = OrderRepository.instance.user;
    final n = (u?.name ?? '').trim();
    if (n.isEmpty || n.toLowerCase() == 'guest' || n.toLowerCase() == 'user') {
      final email = (u?.email ?? '');
      if (email.contains('@')) return email.split('@').first;
      return 'there';
    }
    return n.split(' ').first;
  }

  String? _url(String? path) {
    if (path == null || path.isEmpty) return null;
    final base = AppConfig.normalize(AppConfig.baseUrl);
    if (base.isEmpty) return null;
    if (path.startsWith('http')) return path;
    return '$base$path';
  }

  String? _userPhotoUrl() {
    final p = OrderRepository.instance.user?.photo;
    if (p != null && p.startsWith('http')) return p;
    return _url('/img/avatar-user.jpg');
  }

  List<Shop> get _shops {
    var list = Catalog.shops;
    if (category == 'Burgers') {
      list = list.where((s) => s.category == 'Fast Food').toList();
    } else if (category != 'All') {
      list = list.where((s) => s.category == category || (category == 'Beverages' && s.category == 'Coffee')).toList();
    }
    final p = UserPlace.instance;
    final next = list.toList()
      ..sort((a, b) {
        final da = UserPlace.km(p.lat, p.lng, a.lat ?? p.lat, a.lng ?? p.lng);
        final db = UserPlace.km(p.lat, p.lng, b.lat ?? p.lat, b.lng ?? p.lng);
        return da.compareTo(db);
      });
    return next;
  }

  String _km(Shop s) => UserPlace.kmLabel(UserPlace.instance.lat, UserPlace.instance.lng, s.lat, s.lng, s.km);

  Widget _photo(String? path, {double w = 72, double h = 72, double r = 16}) {
    final url = _url(path);
    return ClipRRect(
      borderRadius: BorderRadius.circular(r),
      child: url == null
          ? Container(width: w, height: h, color: Brand.search, child: const Icon(Icons.store, color: Brand.soft))
          : Image.network(
              url,
              width: w,
              height: h,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => Container(width: w, height: h, color: Brand.search),
            ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<Set<String>>(
      valueListenable: OrderRepository.instance.favsNotifier,
      builder: (context, _, __) => ValueListenableBuilder<int>(
        valueListenable: Catalog.version,
        builder: (context, _, __) => ValueListenableBuilder<int>(
          valueListenable: UserPlace.instance.liveNotifier,
          builder: (context, _, __) => _buildHome(context),
        ),
      ),
    );
  }

  Widget _buildHome(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: IndexedStack(
        index: tab,
        children: [
          _home(),
          const MyOrdersScreen(),
          const CartScreen(),
          _profile(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        height: 64,
        selectedIndex: tab,
        indicatorColor: Brand.green.withOpacity(0.12),
        onDestinationSelected: (i) => setState(() => tab = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home, color: Brand.green), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.receipt_long_outlined), selectedIcon: Icon(Icons.receipt_long, color: Brand.green), label: 'Orders'),
          NavigationDestination(icon: Icon(Icons.shopping_bag_outlined), selectedIcon: Icon(Icons.shopping_bag, color: Brand.green), label: 'Cart'),
          NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person, color: Brand.green), label: 'Profile'),
        ],
      ),
    );
  }

  Widget _home() {
    const cats = [
      ('All', 'All', null),
      ('Burgers', 'Burgers', '/img/shop-burger.jpg'),
      ('Pizza', 'Pizza', '/img/shop-pizza.jpg'),
      ('Bakery', 'Bakery', '/img/shop-bakery.jpg'),
      ('Beverages', 'Beverages', '/img/shop-coffee.jpg'),
    ];
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.only(bottom: 24),
        children: [
          const ConnectionBanner(),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: Row(
              children: [
                const Icon(Icons.location_on_outlined, size: 18),
                const SizedBox(width: 4),
                ValueListenableBuilder<int>(
                  valueListenable: UserPlace.instance.notifier,
                  builder: (_, __, ___) {
                    final label = UserPlace.instance.label.split(',').first;
                    return GestureDetector(
                      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const LocationPickerScreen())),
                      child: Row(
                        children: [
                          Text(label, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                          const Icon(Icons.expand_more, size: 18),
                        ],
                      ),
                    );
                  },
                ),
                const Spacer(),
                CircleAvatar(
                  radius: 18,
                  backgroundColor: Brand.search,
                  child: IconButton(
                    padding: EdgeInsets.zero,
                    icon: const Icon(Icons.notifications_none, color: Brand.ink, size: 20),
                    onPressed: () => setState(() => tab = 1),
                  ),
                ),
                const SizedBox(width: 8),
                GestureDetector(
                  onTap: () => setState(() => tab = 3),
                  child: CircleAvatar(
                    radius: 18,
                    backgroundColor: Brand.search,
                    backgroundImage: () {
                      final u = _userPhotoUrl();
                      return u == null ? null : NetworkImage(u);
                    }(),
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('$_hello,', style: const TextStyle(color: Brand.soft, fontWeight: FontWeight.w600)),
                Text('$_name 👋', style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800, letterSpacing: -0.6)),
                const SizedBox(height: 4),
                const Text('Hungry? Let\'s get you something delicious!', style: TextStyle(color: Brand.soft)),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: GestureDetector(
              onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SearchScreen())),
              child: AbsorbPointer(
                child: TextField(
                  decoration: InputDecoration(
                    hintText: 'Search for food, shops or items...',
                    prefixIcon: const Icon(Icons.search),
                    filled: true,
                    fillColor: Brand.search,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
                  ),
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(22),
              child: SizedBox(
                height: 168,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    Container(color: const Color(0xFF14120E)),
                    Align(
                      alignment: Alignment.centerRight,
                      child: _photo('/img/shop-burger.jpg', w: 220, h: 200, r: 0),
                    ),
                    const Padding(
                      padding: EdgeInsets.fromLTRB(18, 20, 140, 18),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Delicious Food', style: TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800)),
                          Text('Fast Delivery', style: TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800)),
                          SizedBox(height: 8),
                          Text('Your favorite restaurants, now closer than ever!', style: TextStyle(color: Color(0xFFC9C9C9), fontSize: 12)),
                        ],
                      ),
                    ),
                    Positioned(
                      left: 18,
                      bottom: 16,
                      child: CircleAvatar(
                        radius: 18,
                        backgroundColor: Brand.green,
                        child: const Icon(Icons.play_arrow, color: Colors.white),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          SizedBox(
            height: 96,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              children: cats.map((c) {
                final on = category == c.$1;
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                  child: GestureDetector(
                    onTap: () => setState(() => category = c.$1),
                    child: Column(
                      children: [
                        Container(
                          width: 58,
                          height: 58,
                          decoration: BoxDecoration(
                            color: on ? Brand.green : Brand.search,
                            borderRadius: BorderRadius.circular(18),
                          ),
                          clipBehavior: Clip.antiAlias,
                          child: c.$3 == null
                              ? Icon(Icons.grid_view_rounded, color: on ? Colors.white : Brand.ink)
                              : _photo(c.$3, w: 58, h: 58, r: 18),
                        ),
                        const SizedBox(height: 6),
                        Text(c.$2, style: TextStyle(fontSize: 11, fontWeight: on ? FontWeight.w700 : FontWeight.w600, color: on ? Brand.ink : Brand.muted)),
                      ],
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: Row(
              children: [
                const Text('Popular Shops', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                const Spacer(),
                GestureDetector(
                  onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SearchScreen())),
                  child: const Text('See All ›', style: TextStyle(color: Brand.green, fontWeight: FontWeight.w700)),
                ),
              ],
            ),
          ),
          if (_shops.isEmpty)
            const Padding(
              padding: EdgeInsets.all(24),
              child: Text('Loading shops from the database…', style: TextStyle(color: Brand.muted)),
            ),
          ..._shops.map((s) {
            final liked = OrderRepository.instance.favs.contains(s.id);
            final km = _km(s);
            final rev = s.reviews >= 100 ? '${s.reviews}+' : '${s.reviews == 0 ? '120+' : s.reviews}';
            return InkWell(
              onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ShopMenuScreen(shop: s))),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 4, 8),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _photo(s.image ?? '/img/shop-bakery.jpg'),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(s.name, style: const TextStyle(fontWeight: FontWeight.w800)),
                          Text(s.category.isEmpty ? 'Shop' : s.category, style: const TextStyle(color: Brand.muted, fontSize: 12)),
                          Row(children: [
                            const Icon(Icons.star_rounded, color: Brand.star, size: 16),
                            Text(' ${s.rating.toStringAsFixed(1)} ', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12)),
                            Text('($rev) · $km km', style: const TextStyle(color: Brand.soft, fontSize: 12)),
                          ]),
                        ],
                      ),
                    ),
                    IconButton(
                      icon: Icon(liked ? Icons.favorite : Icons.favorite_border, color: liked ? const Color(0xFFEF4444) : const Color(0xFFF9A8A8)),
                      onPressed: () => OrderRepository.instance.toggleFav(s.id).then((_) {
                        if (mounted) setState(() {});
                      }),
                    ),
                  ],
                ),
              ),
            );
          }),
        ],
      ),
    );
  }

  Widget _profile() {
    final u = OrderRepository.instance.user;
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const ConnectionBanner(),
          CircleAvatar(
            radius: 36,
            backgroundImage: () {
              final url = _userPhotoUrl();
              return url == null ? null : NetworkImage(url);
            }(),
          ),
          const SizedBox(height: 12),
          Text((u?.name ?? '').trim().isEmpty ? 'User' : u!.name, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
          Text(
            (u?.email ?? '').trim().isNotEmpty ? u!.email! : (u?.phone ?? ''),
            style: const TextStyle(color: Brand.muted),
          ),
          const SizedBox(height: 8),
          Text((u?.address ?? '').trim().isEmpty ? '' : u!.address!),
          Align(
            alignment: Alignment.centerLeft,
            child: FilledButton.tonal(
              style: FilledButton.styleFrom(backgroundColor: Brand.green, foregroundColor: Colors.white),
              onPressed: () {},
              child: const Text('Edit Profile'),
            ),
          ),
          const SizedBox(height: 16),
          ListTile(leading: const Icon(Icons.receipt_long_outlined), title: const Text('My Orders'), onTap: () => setState(() => tab = 1)),
          const ListTile(leading: Icon(Icons.location_on_outlined), title: Text('Addresses')),
          const ListTile(leading: Icon(Icons.credit_card_outlined), title: Text('Payment Methods')),
          const ListTile(leading: Icon(Icons.notifications_outlined), title: Text('Notifications')),
          const ListTile(leading: Icon(Icons.help_outline), title: Text('Help & Support')),
          ListTile(leading: const Icon(Icons.settings_outlined), title: const Text('Settings'), trailing: const SettingsButton()),
          const SizedBox(height: 12),
          OutlinedButton(
            onPressed: () => OrderRepository.instance.logout(),
            child: const Text('Sign out'),
          ),
        ],
      ),
    );
  }
}
