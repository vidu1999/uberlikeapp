import 'package:flutter/material.dart';
import '../../config.dart';
import '../../data/place.dart';
import '../../data/repository.dart';
import '../../models/shop.dart';
import '../../theme.dart';
import 'shop_menu_screen.dart';

class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key});

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  String query = '';
  String category = 'All';
  final _focus = FocusNode();

  static const cats = ['All', 'Burgers', 'Pizza', 'Bakery', 'Beverages', 'Favourites'];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _focus.requestFocus();
    });
  }

  @override
  void dispose() {
    _focus.dispose();
    super.dispose();
  }

  String? _url(String? path) {
    if (path == null || path.isEmpty) return null;
    final base = AppConfig.normalize(AppConfig.baseUrl);
    if (base.isEmpty) return null;
    if (path.startsWith('http')) return path;
    return '$base$path';
  }

  bool _shopCat(Shop s) {
    if (category == 'Favourites') return OrderRepository.instance.favs.contains(s.id);
    if (category == 'All') return true;
    final c = s.category;
    if (c == category) return true;
    if (category == 'Burgers' && (c == 'Fast Food' || c.toLowerCase().contains('burger'))) return true;
    if (category == 'Beverages' && (c == 'Coffee' || c.toLowerCase().contains('drink') || c.toLowerCase().contains('tea'))) {
      return true;
    }
    return false;
  }

  bool _itemCat(CatalogItem it) {
    if (category == 'Favourites') return OrderRepository.instance.favs.contains(it.shopId);
    if (category == 'All') return true;
    final ic = it.category.toLowerCase();
    if (it.category == category) return true;
    if (category == 'Burgers' && (ic.contains('burger') || ic.contains('fast food'))) return true;
    if (category == 'Pizza' && ic.contains('pizza')) return true;
    if (category == 'Bakery' && (ic.contains('cake') || ic.contains('pastry') || ic.contains('bread') || ic.contains('bakery'))) {
      return true;
    }
    if (category == 'Beverages' && (ic.contains('drink') || ic.contains('coffee') || ic.contains('tea') || ic.contains('juice') || ic.contains('beverage'))) {
      return true;
    }
    final shop = Catalog.shops.where((s) => s.id == it.shopId);
    return shop.isNotEmpty && _shopCat(shop.first);
  }

  bool _shopQuery(Shop s, String q) {
    if (q.isEmpty) return true;
    if (s.name.toLowerCase().contains(q) || s.category.toLowerCase().contains(q) || (s.address ?? '').toLowerCase().contains(q)) {
      return true;
    }
    return Catalog.items.any((it) => it.shopId == s.id && (it.name.toLowerCase().contains(q) || it.category.toLowerCase().contains(q)));
  }

  List<Shop> _shops() {
    final q = query.trim().toLowerCase();
    var list = Catalog.shops.where((s) => _shopCat(s) && _shopQuery(s, q)).toList();
    final p = UserPlace.instance;
    list.sort((a, b) {
      final da = UserPlace.km(p.lat, p.lng, a.lat ?? p.lat, a.lng ?? p.lng);
      final db = UserPlace.km(p.lat, p.lng, b.lat ?? p.lat, b.lng ?? p.lng);
      return da.compareTo(db);
    });
    return list;
  }

  List<CatalogItem> _items() {
    final q = query.trim().toLowerCase();
    return Catalog.items.where((it) {
      if (!it.isAvailable) return false;
      if (!_itemCat(it)) return false;
      if (q.isEmpty) return category != 'All';
      Shop? shop;
      for (final s in Catalog.shops) {
        if (s.id == it.shopId) shop = s;
      }
      final blob = '${it.name} ${it.category} ${it.desc} ${shop?.name ?? ''}'.toLowerCase();
      return blob.contains(q);
    }).toList();
  }

  Widget _photo(String? path) {
    final url = _url(path);
    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: url == null
          ? Container(width: 72, height: 72, color: Brand.search, child: const Icon(Icons.store, color: Brand.soft))
          : Image.network(
              url,
              width: 72,
              height: 72,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => Container(width: 72, height: 72, color: Brand.search),
            ),
    );
  }

  Widget _shopCard(Shop s) {
    final liked = OrderRepository.instance.favs.contains(s.id);
    final km = UserPlace.kmLabel(UserPlace.instance.lat, UserPlace.instance.lng, s.lat, s.lng, s.km);
    final rev = s.reviews >= 100 ? '${s.reviews}+' : '${s.reviews}';
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        boxShadow: const [BoxShadow(color: Color(0x0F111827), blurRadius: 16, offset: Offset(0, 6))],
      ),
      child: InkWell(
        onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ShopMenuScreen(shop: s))),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 4, 10),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _photo(s.image ?? '/img/shop-bakery.jpg'),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(child: Text(s.name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15))),
                        GestureDetector(
                          onTap: () => OrderRepository.instance.toggleFav(s.id).then((_) {
                            if (mounted) setState(() {});
                          }),
                          child: Icon(liked ? Icons.favorite : Icons.favorite_border, size: 22, color: liked ? const Color(0xFFEF4444) : const Color(0xFFF9A8A8)),
                        ),
                      ],
                    ),
                    Text(s.category.isEmpty ? 'Shop' : s.category, style: const TextStyle(color: Brand.muted, fontSize: 12)),
                    Row(children: [
                      const Icon(Icons.star_rounded, color: Brand.star, size: 16),
                      Text(' ${s.rating.toStringAsFixed(1)} ', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12)),
                      Text('($rev) · $km km', style: const TextStyle(color: Brand.soft, fontSize: 12)),
                    ]),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _itemCard(CatalogItem it) {
    Shop? shop;
    for (final s in Catalog.shops) {
      if (s.id == it.shopId) shop = s;
    }
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        boxShadow: const [BoxShadow(color: Color(0x0F111827), blurRadius: 16, offset: Offset(0, 6))],
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
        leading: _photo(it.image ?? shop?.image ?? '/img/shop-bakery.jpg'),
        title: Text(it.name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(shop?.name ?? 'Shop', style: const TextStyle(color: Brand.muted, fontSize: 12)),
            Text('Rs. ${it.price.toStringAsFixed(0)}', style: const TextStyle(color: Brand.green, fontWeight: FontWeight.w800, fontSize: 13)),
          ],
        ),
        trailing: FilledButton(
          style: FilledButton.styleFrom(backgroundColor: Brand.green, minimumSize: const Size(64, 36)),
          onPressed: () {
            OrderRepository.instance.addToCart(it);
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${it.name} added')));
          },
          child: const Text('Add', style: TextStyle(fontWeight: FontWeight.w800)),
        ),
        onTap: shop == null ? null : () => Navigator.push(context, MaterialPageRoute(builder: (_) => ShopMenuScreen(shop: shop!))),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<Set<String>>(
      valueListenable: OrderRepository.instance.favsNotifier,
      builder: (_, __, ___) => ValueListenableBuilder<int>(
        valueListenable: Catalog.version,
        builder: (_, __, ___) {
          final shops = _shops();
          final items = _items();
          final q = query.trim();
          final shopHead = q.isNotEmpty
              ? 'Shops'
              : (category == 'Favourites'
                  ? 'Favourite Shops'
                  : (category == 'All' ? 'Popular Near You' : category));
          return Scaffold(
            backgroundColor: const Color(0xFFF7F8FA),
            body: SafeArea(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(8, 8, 16, 0),
                    child: Row(
                      children: [
                        IconButton.filled(
                          style: IconButton.styleFrom(backgroundColor: Brand.search, foregroundColor: Brand.ink),
                          onPressed: () => Navigator.pop(context),
                          icon: const Icon(Icons.arrow_back),
                        ),
                        const SizedBox(width: 8),
                        const Text('Search Shops & Items', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                    child: TextField(
                      focusNode: _focus,
                      onChanged: (v) => setState(() => query = v),
                      decoration: InputDecoration(
                        hintText: 'Search for food, shops or items...',
                        prefixIcon: const Icon(Icons.search),
                        filled: true,
                        fillColor: Colors.white,
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
                      ),
                    ),
                  ),
                  SizedBox(
                    height: 52,
                    child: ListView(
                      scrollDirection: Axis.horizontal,
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                      children: cats.map((c) {
                        final on = category == c;
                        return Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: GestureDetector(
                            onTap: () => setState(() => category = c),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                              decoration: BoxDecoration(
                                color: on ? Brand.green : Brand.search,
                                borderRadius: BorderRadius.circular(20),
                              ),
                              child: Text(c, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: on ? Colors.white : Brand.muted)),
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                  ),
                  Expanded(
                    child: ListView(
                      padding: const EdgeInsets.only(bottom: 24),
                      children: [
                        if (items.isNotEmpty) ...[
                          const Padding(
                            padding: EdgeInsets.fromLTRB(16, 16, 16, 0),
                            child: Text('Items', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                          ),
                          ...items.take(40).map(_itemCard),
                        ],
                        if (shops.isNotEmpty) ...[
                          Padding(
                            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                            child: Text(shopHead, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                          ),
                          ...shops.map(_shopCard),
                        ] else if (items.isEmpty)
                          Padding(
                            padding: const EdgeInsets.all(24),
                            child: Text(
                              category == 'Favourites'
                                  ? 'No favourite shops yet. Tap the heart next to a shop name.'
                                  : (q.isNotEmpty ? 'No shops or items match that search.' : 'No shops nearby yet.'),
                              style: const TextStyle(color: Brand.muted),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
