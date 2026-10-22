class Shop {
  final String id;
  final String name;
  final String category;
  final double rating;
  final bool isOpen;
  final double? lat;
  final double? lng;
  final String? image;
  final double? km;
  final int reviews;
  final String? hours;
  final String? address;
  final String? promo;
  const Shop({
    required this.id,
    required this.name,
    required this.category,
    required this.rating,
    required this.isOpen,
    this.lat,
    this.lng,
    this.image,
    this.km,
    this.reviews = 0,
    this.hours,
    this.address,
    this.promo,
  });

  String get rateLabel => reviews <= 0 ? 'New' : '★ ${rating.toStringAsFixed(1)} ($reviews)';

  factory Shop.fromJson(Map<String, dynamic> j) => Shop(
        id: '${j['id']}',
        name: '${j['name']}',
        category: '${j['category'] ?? ''}',
        rating: (j['rating'] as num?)?.toDouble() ?? 0,
        isOpen: j['isOpen'] != false && j['is_open'] != false,
        lat: j['lat'] is num ? (j['lat'] as num).toDouble() : double.tryParse('${j['lat'] ?? ''}'),
        lng: j['lng'] is num ? (j['lng'] as num).toDouble() : double.tryParse('${j['lng'] ?? ''}'),
        image: j['image']?.toString(),
        km: (j['km'] as num?)?.toDouble(),
        reviews: (j['reviews'] as num?)?.toInt() ?? 0,
        hours: j['hours']?.toString(),
        address: j['address']?.toString(),
        promo: (j['promo'] ?? j['about'])?.toString(),
      );
}

class CatalogItem {
  final String id;
  final String shopId;
  final String name;
  final String category;
  final double price;
  final bool isAvailable;
  final String desc;
  final String? image;
  final double rating;
  final int reviews;
  const CatalogItem({
    required this.id,
    required this.shopId,
    required this.name,
    required this.category,
    required this.price,
    this.isAvailable = true,
    this.desc = '',
    this.image,
    this.rating = 0,
    this.reviews = 0,
  });

  String get rateLabel => reviews <= 0 ? '' : '★ ${rating.toStringAsFixed(1)}';

  factory CatalogItem.fromJson(Map<String, dynamic> j) => CatalogItem(
        id: '${j['id']}',
        shopId: '${j['shopId'] ?? j['shop_id']}',
        name: '${j['name']}',
        category: '${j['category'] ?? ''}',
        price: (j['price'] as num?)?.toDouble() ?? 0,
        isAvailable: j['isAvailable'] != false && j['is_available'] != false,
        desc: '${j['desc'] ?? j['description'] ?? ''}',
        image: j['image']?.toString(),
        rating: (j['rating'] as num?)?.toDouble() ?? 0,
        reviews: (j['reviews'] as num?)?.toInt() ?? 0,
      );
}
