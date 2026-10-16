import 'package:flutter/material.dart';
import '../../data/repository.dart';
import '../../models/order.dart';
import '../../models/shop.dart';
import 'order_tracking_screen.dart';

class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key});

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  String searchQuery = '';
  String selectedCategory = 'All';
  bool placing = false;

  @override
  Widget build(BuildContext context) {
    final categories = <String>{'All', ...Catalog.items.map((e) => e.category)}.toList();
    final filtered = Catalog.items.where((item) {
      final shop = Catalog.shops.firstWhere(
        (s) => s.id == item.shopId,
        orElse: () => Shop(id: item.shopId, name: 'Shop', category: '', rating: 0, isOpen: true),
      );
      final matchesSearch = item.name.toLowerCase().contains(searchQuery.toLowerCase()) ||
          shop.name.toLowerCase().contains(searchQuery.toLowerCase());
      final matchesCategory = selectedCategory == 'All' || item.category == selectedCategory;
      return matchesSearch && matchesCategory && item.isAvailable;
    }).toList();

    return ValueListenableBuilder<int>(
      valueListenable: Catalog.version,
      builder: (context, _, __) => Scaffold(
      appBar: AppBar(title: const Text('Search Shops & Items')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: TextField(
              decoration: InputDecoration(
                hintText: 'Search for cake, burger, or shop...',
                prefixIcon: const Icon(Icons.search),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
              onChanged: (v) => setState(() => searchQuery = v),
            ),
          ),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: categories.map((c) {
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                  child: FilterChip(
                    label: Text(c),
                    selected: selectedCategory == c,
                    onSelected: (_) => setState(() => selectedCategory = c),
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: ListView.builder(
              itemCount: filtered.length,
              itemBuilder: (context, i) {
                final item = filtered[i];
                final shop = Catalog.shops.firstWhere(
                  (s) => s.id == item.shopId,
                  orElse: () => Shop(id: item.shopId, name: 'Shop', category: '', rating: 0, isOpen: true),
                );
                return Card(
                  margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  child: ListTile(
                    title: Text(item.name, style: const TextStyle(fontWeight: FontWeight.bold)),
                    subtitle: Text('${shop.name} • Rs. ${item.price.toStringAsFixed(0)}'),
                    trailing: ElevatedButton(
                      onPressed: placing ? null : () => _placeOrder(item, shop),
                      child: const Text('Order'),
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    ),
    );
  }

  Future<void> _placeOrder(CatalogItem item, Shop shop) async {
    setState(() => placing = true);
    final draft = Order(
      id: 'ORD_${DateTime.now().millisecondsSinceEpoch}',
      userId: 'USER_1',
      shopId: shop.id,
      status: OrderStatus.pending,
      items: [DeliveryItem(name: item.name, qty: 1, price: item.price)],
      totalAmount: item.price,
      deliveryLat: 8.3350,
      deliveryLng: 80.4108,
      timestamp: DateTime.now(),
      shopName: shop.name,
      customerName: 'Vidura',
    );
    final created = await OrderRepository.instance.addOrder(draft);
    if (!mounted) return;
    setState(() => placing = false);
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => OrderTrackingScreen(orderId: created.id)),
    );
  }
}
