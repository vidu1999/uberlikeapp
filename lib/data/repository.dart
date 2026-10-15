import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../config.dart';
import '../models/message.dart';
import '../models/order.dart';
import '../models/shop.dart';

class OrderRepository {
  OrderRepository._();
  static final OrderRepository instance = OrderRepository._();

  final ValueNotifier<List<Order>> ordersNotifier = ValueNotifier<List<Order>>(<Order>[]);
  final ValueNotifier<bool> connectedNotifier = ValueNotifier<bool>(false);
  final ValueNotifier<SessionUser?> userNotifier = ValueNotifier<SessionUser?>(null);
  final ValueNotifier<List<CartLine>> cartNotifier = ValueNotifier<List<CartLine>>(<CartLine>[]);
  final Map<String, List<ChatMessage>> messages = {};

  Timer? _poll;
  bool _started = false;
  String? token;

  List<Order> get orders => ordersNotifier.value;
  SessionUser? get user => userNotifier.value;

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

  Future<bool> login(String role, {String? phone, String pin = '1234'}) async {
    final uri = _uri('/api/login');
    if (uri == null) return false;
    try {
      final res = await http
          .post(
            uri,
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'role': role, 'phone': phone, 'pin': pin}),
          )
          .timeout(const Duration(seconds: 8));
      if (res.statusCode >= 200 && res.statusCode < 300) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        token = data['token']?.toString();
        userNotifier.value = SessionUser.fromJson(Map<String, dynamic>.from(data['user'] as Map));
        connectedNotifier.value = true;
        await refresh();
        return true;
      }
    } catch (_) {}
    return false;
  }

  void logout() {
    userNotifier.value = null;
    token = null;
  }

  Future<void> refresh() async {
    final uri = _uri('/api/state');
    if (uri == null) {
      connectedNotifier.value = false;
      return;
    }
    try {
      final res = await http.get(uri).timeout(const Duration(seconds: 6));
      if (res.statusCode >= 200 && res.statusCode < 300) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        final rawOrders = (data['orders'] as List?) ?? const [];
        ordersNotifier.value = rawOrders
            .map((e) => Order.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList();
        final rawShops = (data['shops'] as List?) ?? const [];
        Catalog.shops = rawShops.map((e) => Shop.fromJson(Map<String, dynamic>.from(e as Map))).toList();
        final rawItems = (data['items'] as List?) ?? const [];
        Catalog.items = rawItems.map((e) => CatalogItem.fromJson(Map<String, dynamic>.from(e as Map))).toList();
        messages.clear();
        final rawMsg = data['messages'];
        if (rawMsg is Map) {
          rawMsg.forEach((k, v) {
            if (v is List) {
              messages['$k'] = v
                  .map((e) => ChatMessage.fromJson(Map<String, dynamic>.from(e as Map)))
                  .toList();
            }
          });
        }
        connectedNotifier.value = true;
        return;
      }
    } catch (_) {}
    connectedNotifier.value = false;
  }

  Order? byId(String id) {
    for (final o in orders) {
      if (o.id == id) return o;
    }
    return null;
  }

  void addToCart(CatalogItem item) {
    final cart = [...cartNotifier.value];
    cart.removeWhere((c) => c.shopId != item.shopId);
    final i = cart.indexWhere((c) => c.id == item.id);
    if (i >= 0) {
      cart[i].qty += 1;
    } else {
      cart.add(CartLine(id: item.id, shopId: item.shopId, name: item.name, price: item.price));
    }
    cartNotifier.value = cart;
  }

  void changeQty(String id, int delta) {
    final cart = [...cartNotifier.value];
    final i = cart.indexWhere((c) => c.id == id);
    if (i < 0) return;
    cart[i].qty += delta;
    if (cart[i].qty <= 0) cart.removeAt(i);
    cartNotifier.value = cart;
  }

  double get cartTotal => cartNotifier.value.fold(0, (s, c) => s + c.price * c.qty);

  Future<Order?> checkout({
    required String address,
    String note = '',
    String paymentMethod = 'Cash on delivery',
  }) async {
    final cart = cartNotifier.value;
    if (cart.isEmpty) return null;
    final uri = _uri('/api/orders');
    if (uri == null) return null;
    final u = user;
    try {
      final res = await http
          .post(
            uri,
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'shopId': cart.first.shopId,
              'userId': u?.id ?? 'USER_1',
              'customerName': u?.name ?? 'Sahan Perera',
              'customerPhone': u?.phone ?? '0771234567',
              'address': address,
              'note': note,
              'paymentMethod': paymentMethod,
              'deliveryLat': 6.9271,
              'deliveryLng': 79.8612,
              'items': cart.map((e) => e.toJson()).toList(),
            }),
          )
          .timeout(const Duration(seconds: 8));
      if (res.statusCode >= 200 && res.statusCode < 300) {
        cartNotifier.value = [];
        final created = Order.fromJson(Map<String, dynamic>.from(jsonDecode(res.body) as Map));
        await refresh();
        return created;
      }
    } catch (_) {}
    return null;
  }

  Future<Order> addOrder(Order order) async {
    final uri = _uri('/api/orders');
    if (uri != null) {
      try {
        final res = await http
            .post(
              uri,
              headers: {'Content-Type': 'application/json'},
              body: jsonEncode({
                'shopId': order.shopId,
                'userId': order.userId,
                'customerName': order.customerName,
                'address': user?.address ?? '45 Galle Road, Colombo 03',
                'deliveryLat': order.deliveryLat,
                'deliveryLng': order.deliveryLng,
                'items': order.items.map((e) => e.toJson()).toList(),
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
    return order;
  }

  Future<void> updateStatus(String id, OrderStatus status) async {
    await _patch(id, {'status': status.apiName});
  }

  Future<void> assignRider(String id, String riderId, {String riderName = 'Kamal Perera'}) async {
    await _patch(id, {'riderId': riderId, 'riderName': riderName, 'riderPhone': '0775556666'});
  }

  Future<void> updateRiderLocation(String id, double lat, double lng) async {
    await _patch(id, {'riderLat': lat, 'riderLng': lng});
  }

  Future<void> sendMessage(String orderId, String text, String role, String from) async {
    final uri = _uri('/api/orders/$orderId/messages');
    if (uri == null) return;
    try {
      await http
          .post(
            uri,
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'from': from, 'role': role, 'text': text}),
          )
          .timeout(const Duration(seconds: 8));
      await refresh();
    } catch (_) {}
  }

  Future<void> toggleItem(String id, bool available) async {
    final uri = _uri('/api/items/$id');
    if (uri == null) return;
    try {
      await http
          .patch(uri, headers: {'Content-Type': 'application/json'}, body: jsonEncode({'isAvailable': available}))
          .timeout(const Duration(seconds: 8));
      await refresh();
    } catch (_) {}
  }

  Future<void> _patch(String id, Map<String, dynamic> body) async {
    final uri = _uri('/api/orders/$id');
    if (uri == null) return;
    try {
      await http
          .patch(uri, headers: {'Content-Type': 'application/json'}, body: jsonEncode(body))
          .timeout(const Duration(seconds: 8));
      await refresh();
    } catch (_) {}
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
  CatalogItem(id: 'I5', shopId: 'SHOP_3', name: 'Cheese Pizza', category: 'Pizza', price: 2400),
  CatalogItem(id: 'I13', shopId: 'SHOP_5', name: 'Kottu Roti', category: 'Sri Lankan', price: 950),
];
