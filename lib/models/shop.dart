class Shop {
  final String id;
  final String name;
  final String category;
  final double rating;
  final bool isOpen;
  const Shop({
    required this.id,
    required this.name,
    required this.category,
    required this.rating,
    required this.isOpen,
  });
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
}
