class Shop {
  final String id;
  final String name;
  final String category;
  final double rating;
  final bool isOpen;
  final double? lat;
  final double? lng;
  const Shop({
    required this.id,
    required this.name,
    required this.category,
    required this.rating,
    required this.isOpen,
    this.lat,
    this.lng,
  });

  factory Shop.fromJson(Map<String, dynamic> j) => Shop(
        id: '${j['id']}',
        name: '${j['name']}',
        category: '${j['category'] ?? ''}',
        rating: (j['rating'] as num?)?.toDouble() ?? 0,
        isOpen: j['isOpen'] != false,
        lat: (j['lat'] as num?)?.toDouble(),
        lng: (j['lng'] as num?)?.toDouble(),
      );
}

class CatalogItem {
  final String id;
  final String shopId;
  final String name;
  final String category;
  final double price;
  final bool isAvailable;
  const CatalogItem({
    required this.id,
    required this.shopId,
    required this.name,
    required this.category,
    required this.price,
    this.isAvailable = true,
  });

  factory CatalogItem.fromJson(Map<String, dynamic> j) => CatalogItem(
        id: '${j['id']}',
        shopId: '${j['shopId']}',
        name: '${j['name']}',
        category: '${j['category'] ?? ''}',
        price: (j['price'] as num?)?.toDouble() ?? 0,
        isAvailable: j['isAvailable'] != false,
      );
}
