import 'package:flutter/material.dart';
import '../../config.dart';
import '../../data/place.dart';
import '../../data/repository.dart';
import '../../models/shop.dart';
import '../../theme.dart';
import 'cart_screen.dart';

class ShopMenuScreen extends StatefulWidget {
  final Shop shop;
  const ShopMenuScreen({super.key, required this.shop});

  @override
  State<ShopMenuScreen> createState() => _ShopMenuScreenState();
}

class _ShopMenuScreenState extends State<ShopMenuScreen> {
  String? cat;

  String? _url(String? path) {
    if (path == null || path.isEmpty) return null;
    final base = AppConfig.normalize(AppConfig.baseUrl);
    if (base.isEmpty) return null;
    if (path.startsWith('http')) return path;
    return '$base$path';
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<Set<String>>(
      valueListenable: OrderRepository.instance.favsNotifier,
      builder: (context, favs, __) => ValueListenableBuilder<int>(
      valueListenable: Catalog.version,
      builder: (context, _, __) {
        final items = Catalog.items.where((i) => i.shopId == widget.shop.id).toList();
        final cats = items.map((i) => i.category).toSet().toList();
        cat ??= cats.isEmpty ? null : cats.first;
        final list = items.where((i) => cat == null || i.category == cat).toList();
        final hero = _url(widget.shop.image);
        final liked = favs.contains(widget.shop.id);
        return Scaffold(
          backgroundColor: Colors.white,
          body: Column(
            children: [
              Stack(
                children: [
                  SizedBox(
                    height: 180,
                    width: double.infinity,
                    child: hero == null
                        ? Container(color: Brand.search)
                        : Image.network(hero, fit: BoxFit.cover, errorBuilder: (_, __, ___) => Container(color: Brand.search)),
                  ),
                  Positioned(
                    top: MediaQuery.of(context).padding.top + 8,
                    left: 12,
                    child: CircleAvatar(
                      backgroundColor: Colors.white,
                      child: IconButton(icon: const Icon(Icons.arrow_back), onPressed: () => Navigator.pop(context)),
                    ),
                  ),
                  Positioned(
                    left: 16,
                    bottom: 16,
                    right: 16,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                widget.shop.name,
                                style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w800, shadows: [Shadow(blurRadius: 8, color: Colors.black54)]),
                              ),
                            ),
                            GestureDetector(
                              onTap: () => OrderRepository.instance.toggleFav(widget.shop.id),
                              child: Icon(liked ? Icons.favorite : Icons.favorite_border, size: 24, color: liked ? const Color(0xFFEF4444) : Colors.white),
                            ),
                          ],
                        ),
                        Text(
                          '★ ${widget.shop.rating} · ${UserPlace.kmLabel(UserPlace.instance.lat, UserPlace.instance.lng, widget.shop.lat, widget.shop.lng, widget.shop.km)} km',
                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, shadows: [Shadow(blurRadius: 8, color: Colors.black54)]),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              if (cats.length > 1)
                SizedBox(
                  height: 48,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    children: cats
                        .map(
                          (c) => Padding(
                            padding: const EdgeInsets.only(right: 8),
                            child: ChoiceChip(
                              label: Text(c),
                              selected: cat == c,
                              selectedColor: Brand.green,
                              labelStyle: TextStyle(color: cat == c ? Colors.white : Brand.ink, fontWeight: FontWeight.w700),
                              onSelected: (_) => setState(() => cat = c),
                            ),
                          ),
                        )
                        .toList(),
                  ),
                ),
              Expanded(
                child: ListView.builder(
                  itemCount: list.length,
                  itemBuilder: (context, i) {
                    final it = list[i];
                    final img = _url(it.image);
                    return ListTile(
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      leading: ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: img == null
                            ? Container(width: 64, height: 64, color: Brand.search)
                            : Image.network(img, width: 64, height: 64, fit: BoxFit.cover, errorBuilder: (_, __, ___) => Container(width: 64, height: 64, color: Brand.search)),
                      ),
                      title: Text(it.name, style: const TextStyle(fontWeight: FontWeight.w800)),
                      subtitle: Text('Rs. ${it.price.toStringAsFixed(0)}'),
                      trailing: it.isAvailable
                          ? FilledButton(
                              style: FilledButton.styleFrom(backgroundColor: Brand.green),
                              onPressed: () {
                                OrderRepository.instance.addToCart(it);
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(content: Text('${it.name} added'), duration: const Duration(milliseconds: 700)),
                                );
                              },
                              child: const Text('Add'),
                            )
                          : const Text('Sold out', style: TextStyle(color: Brand.muted)),
                    );
                  },
                ),
              ),
              ValueListenableBuilder(
                valueListenable: OrderRepository.instance.cartNotifier,
                builder: (context, cart, _) {
                  if (cart.isEmpty) return const SizedBox.shrink();
                  final n = cart.fold<int>(0, (s, c) => s + c.qty);
                  return SafeArea(
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: FilledButton(
                        style: FilledButton.styleFrom(backgroundColor: Brand.green, minimumSize: const Size.fromHeight(52)),
                        onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const CartScreen())),
                        child: Text('View cart · $n · Rs. ${OrderRepository.instance.cartTotal.toStringAsFixed(0)}', style: const TextStyle(fontWeight: FontWeight.w800)),
                      ),
                    ),
                  );
                },
              ),
            ],
          ),
        );
      },
    ),
    );
  }
}
