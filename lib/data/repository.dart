import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../config.dart';
import '../models/order.dart';
import '../models/shop.dart';

class OrderRepository {
  OrderRepository._();
  static final OrderRepository instance = OrderRepository._();

  final ValueNotifier<List<Order>> ordersNotifier = ValueNotifier<List<Order>>(<Order>[]);
  final ValueNotifier<bool> connectedNotifier = ValueNotifier<bool>(false);
  final List<Order> _local = <Order>[];
  Timer? _poll;
  bool _started = false;

  List<Order> get orders => ordersNotifier.value;

  void seed() => start();

  void start() {
    if (_started) {
      refresh();
      return;
    }
    _started = true;
    _poll = Timer.periodic(const Duration(seconds: 2), (_) => refresh());
    refresh();
  }

  Uri? _uri(String path) {
    final base = AppConfig.normalize(AppConfig.baseUrl);
    if (base.isEmpty) return null;
    return Uri.parse('$base$path');
  }

  Future<void> refresh() async {
    final uri = _uri('/api/orders');
    if (uri == null) {
      connectedNotifier.value = false;
      if (ordersNotifier.value.isEmpty && _local.isNotEmpty) {
        ordersNotifier.value = List<Order>.unmodifiable(_local);
      }
      return;
    }
    try {
      final res = await http.get(uri).timeout(const Duration(seconds: 6));
      if (res.statusCode >= 200 && res.statusCode < 300) {
        final raw = jsonDecode(res.body);
        final list = <Order>[];
        if (raw is List) {
          for (final e in raw) {
            list.add(Order.fromJson(Map<String, dynamic>.from(e as Map)));
          }
        }
        ordersNotifier.value = List<Order>.unmodifiable(list);
        connectedNotifier.value = true;
        await _refreshCatalog();
        return;
      }
    } catch (_) {
      // fall through
    }
    connectedNotifier.value = false;
  }

  Future<void> _refreshCatalog() async {
    final shopsUri = _uri('/api/shops');
    final itemsUri = _uri('/api/items');
    if (shopsUri == null || itemsUri == null) return;
    try {
      final s = await http.get(shopsUri).timeout(const Duration(seconds: 6));
      final i = await http.get(itemsUri).timeout(const Duration(seconds: 6));
      if (s.statusCode == 200) {
        final raw = jsonDecode(s.body) as List;
        Catalog.shops = raw.map((e) => Shop.fromJson(Map<String, dynamic>.from(e as Map))).toList();
      }
      if (i.statusCode == 200) {
        final raw = jsonDecode(i.body) as List;
        Catalog.items = raw.map((e) => CatalogItem.fromJson(Map<String, dynamic>.from(e as Map))).toList();
      }
    } catch (_) {}
  }

  Order? byId(String id) {
    try {
      return orders.firstWhere((o) => o.id == id);
    } catch (_) {
      try {
        return _local.firstWhere((o) => o.id == id);
      } catch (_) {
        return null;
      }
    }
  }

  Future<Order> addOrder(Order order) async {
    final uri = _uri('/api/orders');
    if (uri != null && connectedNotifier.value) {
      try {
        final res = await http
            .post(
              uri,
              headers: {'Content-Type': 'application/json'},
              body: jsonEncode({
                'userId': order.userId,
                'shopId': order.shopId,
                'items': order.items.map((e) => e.toJson()).toList(),
                'deliveryLat': order.deliveryLat,
                'deliveryLng': order.deliveryLng,
                'customerName': order.customerName,
              }),
            )
            .timeout(const Duration(seconds: 8));
        if (res.statusCode >= 200 && res.statusCode < 300) {
          final created = Order.fromJson(Map<String, dynamic>.from(jsonDecode(res.body) as Map));
          await refresh();
          return created;
        }
      } catch (_) {}
    }
    _local.insert(0, order);
    ordersNotifier.value = List<Order>.unmodifiable(_local);
    return order;
  }

  Future<void> updateStatus(String id, OrderStatus status) async {
    await _patch(id, {'status': status.apiName});
  }

  Future<void> assignRider(String id, String riderId, {String riderName = 'Kamal Perera'}) async {
    await _patch(id, {'riderId': riderId, 'riderName': riderName});
  }

  Future<void> updateRiderLocation(String id, double lat, double lng) async {
    await _patch(id, {'riderLat': lat, 'riderLng': lng});
  }

  Future<void> _patch(String id, Map<String, dynamic> body) async {
    final uri = _uri('/api/orders/$id');
    if (uri != null) {
      try {
        await http
            .patch(uri, headers: {'Content-Type': 'application/json'}, body: jsonEncode(body))
            .timeout(const Duration(seconds: 8));
        await refresh();
        return;
      } catch (_) {}
    }
    final i = _local.indexWhere((o) => o.id == id);
    if (i != -1) {
      _local[i] = _local[i].copyWith(
        status: body['status'] != null ? OrderStatusX.fromApi('${body['status']}') : null,
        riderId: body['riderId'] as String?,
        riderLat: (body['riderLat'] as num?)?.toDouble(),
        riderLng: (body['riderLng'] as num?)?.toDouble(),
        riderName: body['riderName'] as String?,
      );
      ordersNotifier.value = List<Order>.unmodifiable(_local);
    } else {
      final list = [...orders];
      final j = list.indexWhere((o) => o.id == id);
      if (j != -1) {
        list[j] = list[j].copyWith(
          status: body['status'] != null ? OrderStatusX.fromApi('${body['status']}') : null,
          riderId: body['riderId'] as String?,
          riderLat: (body['riderLat'] as num?)?.toDouble(),
          riderLng: (body['riderLng'] as num?)?.toDouble(),
          riderName: body['riderName'] as String?,
        );
        ordersNotifier.value = List<Order>.unmodifiable(list);
      }
    }
  }

}

class Catalog {
  static List<Shop> shops = List<Shop>.from(_defaultShops);
  static List<CatalogItem> items = List<CatalogItem>.from(_defaultItems);
}

const _defaultShops = <Shop>[
  Shop(id: 'SHOP_1', name: 'Kandy Bakers', category: 'Bakery', rating: 4.8, isOpen: true),
  Shop(id: 'SHOP_2', name: 'Burger House', category: 'Fast Food', rating: 4.5, isOpen: true),
  Shop(id: 'SHOP_3', name: 'Pizza Town', category: 'Pizza', rating: 4.6, isOpen: true),
  Shop(id: 'SHOP_4', name: 'Coffee Lab', category: 'Beverages', rating: 4.7, isOpen: true),
  Shop(id: 'SHOP_5', name: 'Rice & Curry', category: 'Sri Lankan', rating: 4.9, isOpen: true),
];

const _defaultItems = <CatalogItem>[
  CatalogItem(id: 'I1', shopId: 'SHOP_1', name: 'Chocolate Cake 1kg', category: 'Bakery', price: 2500),
  CatalogItem(id: 'I2', shopId: 'SHOP_1', name: 'Butter Cake Slice', category: 'Bakery', price: 350),
  CatalogItem(id: 'I3', shopId: 'SHOP_2', name: 'Chicken Burger', category: 'Fast Food', price: 1200),
  CatalogItem(id: 'I4', shopId: 'SHOP_2', name: 'Cheese Fries', category: 'Fast Food', price: 700),
  CatalogItem(id: 'I5', shopId: 'SHOP_3', name: 'Cheese Pizza', category: 'Pizza', price: 2400),
  CatalogItem(id: 'I6', shopId: 'SHOP_4', name: 'Iced Coffee', category: 'Beverages', price: 600),
  CatalogItem(id: 'I7', shopId: 'SHOP_5', name: 'Chicken Rice & Curry', category: 'Sri Lankan', price: 850),
  CatalogItem(id: 'I8', shopId: 'SHOP_5', name: 'Kottu Roti', category: 'Sri Lankan', price: 950),
];
