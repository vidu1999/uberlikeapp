import 'package:flutter/material.dart';
import '../../data/repository.dart';
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

  @override
  Widget build(BuildContext context) {
    final categories = ['All', 'Bakery', 'Fast Food', 'Pizza', 'Beverages'];
    final filtered = Catalog.items.where((item) {
      final shop = Catalog.shops.firstWhere((s) => s.id == item.shopId);
      final matchesSearch = item.name.toLowerCase().contains(searchQuery.toLowerCase()) ||
          shop.name.toLowerCase().contains(searchQuery.toLowerCase());
      final matchesCategory = selectedCategory == 'All' || item.category == selectedCategory;
      return matchesSearch && matchesCategory && item.isAvailable;
    }).toList();

    return Scaffold(
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
                final shop = Catalog.shops.firstWhere((s) => s.id == item.shopId);
                return Card(
                  margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  child: ListTile(
                    title: Text(item.name, style: const TextStyle(fontWeight: FontWeight.bold)),
                    subtitle: Text('${shop.name} • Rs. ${item.price.toStringAsFixed(0)}'),
                    trailing: ElevatedButton(
                      onPressed: () => _placeOrder(context, item, shop),
                      child: const Text('Order'),
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  void _placeOrder(BuildContext context, CatalogItem item, Shop shop) {
    final order = Order(
      id: 'ORD_${DateTime.now().millisecondsSinceEpoch}',
      userId: 'USER_1',
      shopId: shop.id,
      status: OrderStatus.pending,
      items: [DeliveryItem(name: item.name, qty: 1, price: item.price)],
      totalAmount: item.price,
      deliveryLat: 6.9271,
      deliveryLng: 79.8612,
      timestamp: DateTime.now(),
      shopName: shop.name,
      customerName: 'Sahan Perera',
    );
    OrderRepository.instance.addOrder(order);
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => OrderTrackingScreen(orderId: order.id)),
    );
  }
}
