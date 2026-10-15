import 'dart:async';
import 'package:flutter/foundation.dart';
import '../models/order.dart';
import '../models/shop.dart';

class OrderRepository {
  OrderRepository._();
  static final OrderRepository instance = OrderRepository._();

  final List<Order> _orders = <Order>[];
  final ValueNotifier<List<Order>> ordersNotifier = ValueNotifier<List<Order>>(<Order>[]);

  // Seed data
  bool _seeded = false;
  void seed() {
    if (_seeded) return;
    _seeded = true;
    _orders.addAll([
      Order(
        id: 'ORD_1001',
        userId: 'USER_1',
        shopId: 'SHOP_1',
        status: OrderStatus.preparing,
        items: [const DeliveryItem(name: 'Chocolate Cake 1kg', qty: 1, price: 2500)],
        totalAmount: 2500,
        deliveryLat: 6.9271,
        deliveryLng: 79.8612,
        riderLat: 6.9300,
        riderLng: 79.8550,
        timestamp: DateTime.now().subtract(const Duration(minutes: 10)),
        shopName: 'Kandy Bakers',
        customerName: 'Sahan Perera',
      ),
      Order(
        id: 'ORD_1002',
        userId: 'USER_2',
        shopId: 'SHOP_2',
        status: OrderStatus.ready,
        items: [const DeliveryItem(name: 'Chicken Burger', qty: 2, price: 1200)],
        totalAmount: 2400,
        deliveryLat: 6.9147,
        deliveryLng: 79.8740,
        riderLat: 6.9200,
        riderLng: 79.8600,
        timestamp: DateTime.now().subtract(const Duration(minutes: 5)),
        shopName: 'Burger King',
        customerName: 'Nimal Silva',
      ),
    ]);
    _emit();
  }

  void _emit() {
    ordersNotifier.value = List<Order>.unmodifiable(_orders);
  }

  List<Order> get orders => List<Order>.unmodifiable(_orders);

  Order? byId(String id) {
    try {
      return _orders.firstWhere((o) => o.id == id);
    } catch (_) {
      return null;
    }
  }

  void addOrder(Order order) {
    _orders.insert(0, order);
    _emit();
  }

  void updateStatus(String id, OrderStatus status) {
    final i = _orders.indexWhere((o) => o.id == id);
    if (i == -1) return;
    _orders[i] = _orders[i].copyWith(status: status);
    _emit();
  }

  void assignRider(String id, String riderId) {
    final i = _orders.indexWhere((o) => o.id == id);
    if (i == -1) return;
    _orders[i] = _orders[i].copyWith(riderId: riderId);
    _emit();
  }

  void updateRiderLocation(String id, double lat, double lng) {
    final i = _orders.indexWhere((o) => o.id == id);
    if (i == -1) return;
    _orders[i] = _orders[i].copyWith(riderLat: lat, riderLng: lng);
    _emit();
  }

  Stream<Order?> watchOrder(String id) async* {
    yield byId(id);
    await for (final _ in ordersNotifier) {
      yield byId(id);
    }
  }

  Stream<List<Order>> watchOrders() async* {
    yield orders;
    await for (final list in ordersNotifier) {
      yield list;
    }
  }
}

// Static catalogs
class Catalog {
  static const shops = <Shop>[
    Shop(id: 'SHOP_1', name: 'Kandy Bakers', category: 'Bakery', rating: 4.8, isOpen: true),
    Shop(id: 'SHOP_2', name: 'Burger King', category: 'Fast Food', rating: 4.5, isOpen: true),
    Shop(id: 'SHOP_3', name: 'Pizza Hut', category: 'Pizza', rating: 4.6, isOpen: true),
    Shop(id: 'SHOP_4', name: 'Coffee Lab', category: 'Beverages', rating: 4.7, isOpen: true),
  ];

  static const items = <CatalogItem>[
    CatalogItem(id: 'I1', shopId: 'SHOP_1', name: 'Chocolate Cake 1kg', category: 'Bakery', price: 2500),
    CatalogItem(id: 'I2', shopId: 'SHOP_1', name: 'Iced Coffee', category: 'Beverages', price: 600),
    CatalogItem(id: 'I3', shopId: 'SHOP_2', name: 'Chicken Burger', category: 'Fast Food', price: 1200),
    CatalogItem(id: 'I4', shopId: 'SHOP_2', name: 'Cheese Fries', category: 'Fast Food', price: 700),
    CatalogItem(id: 'I5', shopId: 'SHOP_3', name: 'Cheese Pizza', category: 'Pizza', price: 2400),
    CatalogItem(id: 'I6', shopId: 'SHOP_4', name: 'Cappuccino', category: 'Beverages', price: 550),
  ];
}
