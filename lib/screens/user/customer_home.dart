import 'package:flutter/material.dart';
import '../../app.dart';
import '../../data/repository.dart';
import '../../widgets/role_switcher.dart';
import '../../widgets/settings_button.dart';
import 'search_screen.dart';
import 'my_orders_screen.dart';
import 'shop_menu_screen.dart';
import 'cart_screen.dart';

class CustomerHome extends StatelessWidget {
  final UserRole currentRole;
  final ValueChanged<UserRole> onSwitchRole;
  const CustomerHome({super.key, required this.currentRole, required this.onSwitchRole});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('SwiftDrop'),
        actions: [
          IconButton(
            icon: const Icon(Icons.shopping_bag_outlined),
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const CartScreen())),
          ),
          const SettingsButton(),
          RoleSwitcher(currentRole: currentRole, onSwitchRole: onSwitchRole),
        ],
      ),
      body: Column(
        children: [
          const ConnectionBanner(),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Hello, Sahan 👋', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 4),
                  const Text('What would you like to order today?', style: TextStyle(color: Colors.grey)),
                  const SizedBox(height: 20),
                  _ActionCard(
                    icon: Icons.search,
                    title: 'Search Shops & Items',
                    subtitle: 'Find food, cakes, coffee and more',
                    onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SearchScreen())),
                  ),
                  const SizedBox(height: 12),
                  _ActionCard(
                    icon: Icons.receipt_long,
                    title: 'My Orders',
                    subtitle: 'Track your deliveries live',
                    onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const MyOrdersScreen())),
                  ),
                  const SizedBox(height: 20),
                  const Text('Popular Shops', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  Expanded(
                    child: ListView.builder(
                      itemCount: Catalog.shops.length,
                      itemBuilder: (context, i) {
                        final s = Catalog.shops[i];
                        return Card(
                          child: ListTile(
                            leading: CircleAvatar(child: Text(s.name[0])),
                            title: Text(s.name, style: const TextStyle(fontWeight: FontWeight.bold)),
                            subtitle: Text('${s.category} • ${s.rating} ★'),
                            trailing: s.isOpen
                                ? const Text('Open', style: TextStyle(color: Colors.green))
                                : const Text('Closed', style: TextStyle(color: Colors.red)),
                            onTap: () => Navigator.push(
                              context,
                              MaterialPageRoute(builder: (_) => ShopMenuScreen(shop: s)),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ActionCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  const _ActionCard({required this.icon, required this.title, required this.subtitle, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          boxShadow: const [BoxShadow(color: Colors.black12, blurRadius: 8)],
        ),
        child: Row(
          children: [
            CircleAvatar(backgroundColor: Colors.green.shade50, child: Icon(icon, color: Colors.green)),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: const TextStyle(fontWeight: FontWeight.bold)),
                  Text(subtitle, style: const TextStyle(color: Colors.grey, fontSize: 12)),
                ],
              ),
            ),
            const Icon(Icons.chevron_right),
          ],
        ),
      ),
    );
  }
}
