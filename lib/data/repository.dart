import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config.dart';
import 'place.dart';
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

  String? _otpPhone;
  String? _otpRole;
  String? _otpCode;
  String? _otpBody;
  DateTime? _otpExp;
  Map<String, String>? pendingShop;
  bool openShopProfile = false;

  String _normPhone(String raw) {
    var d = raw.replaceAll(RegExp(r'\D'), '');
    if (d.startsWith('94') && d.length == 11) d = '0${d.substring(2)}';
    if (d.length == 9 && d.startsWith('7')) d = '0$d';
    return d;
  }

  Future<Map<String, dynamic>?> findAccount(String role, String id) async {
    await _loadSupabaseConfig();
    final phone = _normPhone(id);
    final email = id.contains('@') ? id.trim().toLowerCase() : '';
    try {
      var q = 'accounts?select=*&role=eq.$role';
      q += email.isNotEmpty ? '&email=eq.$email' : '&phone=eq.$phone';
      final rows = await _sbGet(q);
      if (rows.isNotEmpty) return Map<String, dynamic>.from(rows.first as Map);
    } catch (_) {}
    if (role == 'shop' && phone == '0772223333') {
      return {
        'id': 'SHOP_STAFF',
        'name': 'Shop staff',
        'phone': phone,
        'role': 'shop',
        'shop_id': 'SHOP_1',
      };
    }
    return null;
  }

  Future<void> _enterAccount(String role, String phone) async {
    phone = _normPhone(phone);
    final rows = await _sbGet('accounts?select=*&role=eq.$role&phone=eq.$phone');
    Map<String, dynamic> user;
    if (rows.isNotEmpty) {
      user = Map<String, dynamic>.from(rows.first as Map);
    } else if (role == 'shop' && phone == '0772223333') {
      user = {
        'id': 'SHOP_STAFF',
        'name': 'Shop staff',
        'phone': phone,
        'role': 'shop',
        'shop_id': 'SHOP_1',
      };
      pendingShop = null;
    } else if (role == 'shop') {
      final p = pendingShop;
      if (p == null || ((p['shopName'] ?? '').isEmpty && (p['ownerName'] ?? '').isEmpty)) {
        throw Exception('Register your shop first.');
      }
      final shopId = 'SHOP_${DateTime.now().millisecondsSinceEpoch.toRadixString(36).toUpperCase()}';
      final shop = {
        'id': shopId,
        'name': p['shopName'] ?? 'New Shop',
        'category': 'Bakery',
        'rating': 5,
        'reviews': 0,
        'is_open': true,
        'lat': 8.335,
        'lng': 80.4108,
        'km': 1,
        'eta': '20–35 min',
        'fee': 200,
        'hours': '08:00 AM – 10:00 PM',
        'address': 'Sri Lanka',
        'image': '/img/shop-bakery.jpg',
        'promo':
            'Freshly baked cakes, pastries and desserts made with love. We use the best ingredients to bring happiness to your table.',
      };
      try {
        await _sbWrite('shops', 'POST', [shop]);
      } catch (_) {}
      Catalog.set([...Catalog.shops, Shop.fromJson(shop)], Catalog.items);
      user = {
        'id': 'SHOP_STAFF_${phone.substring(phone.length - 4)}_${DateTime.now().millisecondsSinceEpoch.toRadixString(36)}',
        'name': p['ownerName'] ?? 'Shop Owner',
        'phone': phone,
        'email': p['email'] ?? '',
        'pin': 'otp',
        'role': 'shop',
        'shop_id': shopId,
      };
      try {
        await _sbWrite('accounts', 'POST', [user]);
      } catch (_) {}
      pendingShop = null;
    } else {
      user = {
        'id': '${role.toUpperCase()}_${phone.substring(phone.length - 4)}',
        'name': role == 'rider' ? 'Courier' : 'Guest',
        'phone': phone,
        'role': role,
        'pin': 'otp',
        'address': 'No.123, Lake View Road, Anuradhapura',
      };
      if (role == 'rider') {
        user['vehicle'] = 'Bike';
        user['rating'] = 5;
      }
      try {
        await _sbWrite('accounts', 'POST', [user]);
      } catch (_) {}
    }
    token = 'sb_${user['id']}';
    userNotifier.value = SessionUser.fromJson(user);
    connectedNotifier.value = true;
    if (role == 'shop') openShopProfile = true;
    await _persist();
    await refresh();
  }

  Future<Map<String, dynamic>?> sendOtp(String role, String phone) async {
    await _loadSupabaseConfig();
    phone = _normPhone(phone);
    if (phone.length < 10) throw Exception('Enter a valid mobile number');
    final code = (DateTime.now().microsecondsSinceEpoch % 10000).toString().padLeft(4, '0');
    _otpPhone = phone;
    _otpRole = role;
    _otpCode = code;
    _otpBody = 'Your QuickBite code is $code. Don\'t share this WhatsApp message.';
    _otpExp = DateTime.now().add(const Duration(minutes: 5));
    final token = 'wa_${DateTime.now().millisecondsSinceEpoch}';
    try {
      await _sbWrite('otp_codes', 'POST', [
        {
          'id': token,
          'phone': phone,
          'role': role,
          'code': code,
          'body': _otpBody,
          'expires_at': _otpExp!.toUtc().toIso8601String(),
          'attempts': 0,
        }
      ]);
    } catch (_) {}
    await _sendWhatsApp(phone, _otpBody!);
    return {'ok': true, 'phone': phone, 'smsToken': token, 'channel': 'whatsapp'};
  }

  String _e164(String phone) {
    var d = phone.replaceAll(RegExp(r'\D'), '');
    if (d.startsWith('0') && d.length == 10) d = '94${d.substring(1)}';
    return d;
  }

  Future<void> _sendWhatsApp(String phone, String body) async {
    final to = _e164(phone);
    const id = '710722770031';
    const token = '81a5c51bd44b48a08367d01f3ca546b5a4e7409696654a8b9a';
    const hosts = <String>['7107.api.green-api.com', 'api.green-api.com'];
    String? last;
    for (final host in hosts) {
      try {
        final uri = Uri(
          scheme: 'https',
          host: host,
          path: '/waInstance$id/sendMessage/$token',
        );
        final res = await http
            .post(
              uri,
              headers: {'Content-Type': 'application/json'},
              body: jsonEncode({'chatId': '$to@c.us', 'message': body}),
            )
            .timeout(const Duration(seconds: 20));
        if (res.statusCode >= 200 && res.statusCode < 300) return;
        last = 'WhatsApp send failed (${res.statusCode})';
      } catch (e) {
        last = e.toString();
      }
    }
    throw Exception('Could not send WhatsApp to +$to. ${last ?? ''}');
  }

  Future<String?> readSms(String smsToken) async {
    if (_otpBody != null) return _otpBody;
    try {
      final rows = await _sbGet('otp_codes?id=eq.$smsToken&select=body');
      if (rows.isNotEmpty) {
        return Map<String, dynamic>.from(rows.first as Map)['body']?.toString();
      }
    } catch (_) {}
    return null;
  }

  Future<bool> verifyOtp(String role, String phone, String code) async {
    await _loadSupabaseConfig();
    phone = _normPhone(phone);
    code = code.replaceAll(RegExp(r'\D'), '');
    var match = _otpPhone == phone &&
        _otpCode == code &&
        _otpExp != null &&
        DateTime.now().isBefore(_otpExp!);
    if (!match) {
      try {
        final rows = await _sbGet(
          'otp_codes?phone=eq.$phone&role=eq.$role&code=eq.$code&select=*',
        );
        if (rows.isNotEmpty) {
          final rec = Map<String, dynamic>.from(rows.first as Map);
          final exp = DateTime.tryParse('${rec['expires_at'] ?? ''}');
          if (exp != null && DateTime.now().isBefore(exp.toLocal())) match = true;
        }
      } catch (_) {}
    }
    if (!match) return false;
    await _enterAccount(role, phone);
    return true;
  }

  Future<bool> login(String role, {String? phone, String pin = '1234'}) async {
    await _loadSupabaseConfig();
    if (AppConfig.supabaseUrl.isNotEmpty && AppConfig.supabaseAnon.isNotEmpty) {
      try {
        var q = 'accounts?select=*&role=eq.$role';
        if (phone != null && phone.isNotEmpty) q += '&phone=eq.$phone';
        final rows = await _sbGet(q);
        Map<String, dynamic>? picked;
        for (final raw in rows) {
          final m = Map<String, dynamic>.from(raw as Map);
          if ('${m['pin']}' == pin) {
            picked = m;
            break;
          }
        }
        picked ??= rows.isNotEmpty ? Map<String, dynamic>.from(rows.first as Map) : null;
        if (picked != null) {
          token = 'sb_${picked['id']}';
          userNotifier.value = SessionUser.fromJson(picked);
          connectedNotifier.value = true;
          await _persist();
          await refresh();
          return true;
        }
      } catch (_) {}
    }
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
        await _persist();
        await refresh();
        return true;
      }
    } catch (_) {}
    return false;
  }

  void logout() {
    userNotifier.value = null;
    token = null;
    pendingShop = null;
    _persist();
  }

  static const _sessionKey = 'qb_session';

  Future<void> restore() async {
    try {
      final p = await SharedPreferences.getInstance();
      final raw = p.getString(_sessionKey);
      if (raw == null || raw.isEmpty) return;
      final m = jsonDecode(raw) as Map<String, dynamic>;
      token = m['token']?.toString();
      userNotifier.value = SessionUser.fromJson(m);
    } catch (_) {}
  }

  Future<void> _persist() async {
    try {
      final p = await SharedPreferences.getInstance();
      final u = userNotifier.value;
      if (u == null) {
        await p.remove(_sessionKey);
        return;
      }
      await p.setString(
        _sessionKey,
        jsonEncode({...u.toJson(), 'token': token}),
      );
    } catch (_) {}
  }

  Future<void> _loadSupabaseConfig() async {
    if (AppConfig.supabaseUrl.isNotEmpty && AppConfig.supabaseAnon.isNotEmpty) return;
    final uri = _uri('/api/config');
    if (uri == null) return;
    try {
      final res = await http.get(uri).timeout(const Duration(seconds: 6));
      if (res.statusCode >= 200 && res.statusCode < 300) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        final u = '${data['supabaseUrl'] ?? ''}';
        final k = '${data['supabaseAnon'] ?? ''}';
        if (u.isNotEmpty) AppConfig.supabaseUrl = u;
        if (k.isNotEmpty) AppConfig.supabaseAnon = k;
      }
    } catch (_) {}
  }

  Uri? _sb(String table) {
    final base = AppConfig.normalize(AppConfig.supabaseUrl);
    if (base.isEmpty || AppConfig.supabaseAnon.isEmpty) return null;
    return Uri.parse('$base/rest/v1/$table');
  }

  Future<List<dynamic>> _sbGet(String table) async {
    final uri = _sb(table);
    if (uri == null) return const [];
    final res = await http
        .get(uri, headers: {
          'apikey': AppConfig.supabaseAnon,
          'Authorization': 'Bearer ${AppConfig.supabaseAnon}',
        })
        .timeout(const Duration(seconds: 8));
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception('Supabase $table ${res.statusCode}');
    }
    final data = jsonDecode(res.body);
    return data is List ? data : const [];
  }

  Future<void> _sbWrite(String path, String method, Object body) async {
    final uri = _sb(path);
    if (uri == null) return;
    final headers = {
      'apikey': AppConfig.supabaseAnon,
      'Authorization': 'Bearer ${AppConfig.supabaseAnon}',
      'Content-Type': 'application/json',
      'Prefer': 'return=representation,resolution=merge-duplicates',
    };
    final encoded = jsonEncode(body);
    final res = method == 'PATCH'
        ? await http.patch(uri, headers: headers, body: encoded).timeout(const Duration(seconds: 8))
        : await http.post(uri, headers: headers, body: encoded).timeout(const Duration(seconds: 8));
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception('Supabase $path ${res.statusCode}');
    }
  }

  Map<String, dynamic> _orderRow(Order o) => {
        'id': o.id,
        'user_id': o.userId,
        'shop_id': o.shopId,
        'shop_name': o.shopName,
        'customer_name': o.customerName,
        'status': o.status.apiName,
        'total_amount': o.totalAmount,
        'data': o.toJson(),
        'updated_at': DateTime.now().toIso8601String(),
      };

  Future<bool> _refreshFromSupabase() async {
    try {
      final shopRows = await _sbGet('shops?select=*&order=id.asc');
      final itemRows = await _sbGet('menu_items?select=*&order=id.asc');
      final orderRows = await _sbGet('orders?select=*');
      final msgRows = await _sbGet('messages?select=*');
      Catalog.set(
        shopRows.map((e) => Shop.fromJson(Map<String, dynamic>.from(e as Map))).toList(),
        itemRows.map((e) => CatalogItem.fromJson(Map<String, dynamic>.from(e as Map))).toList(),
      );
      ordersNotifier.value = orderRows
          .map((e) => Order.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList();
      messages.clear();
      for (final raw in msgRows) {
        final m = Map<String, dynamic>.from(raw as Map);
        final oid = '${m['order_id'] ?? ''}';
        if (oid.isEmpty) continue;
        (messages[oid] ??= <ChatMessage>[]).add(
          ChatMessage(
            id: '${m['id']}',
            from: '${m['sender'] ?? m['from'] ?? ''}',
            role: '${m['role'] ?? ''}',
            text: '${m['body'] ?? m['text'] ?? ''}',
            ts: (m['ts'] as num?)?.toInt() ?? 0,
          ),
        );
      }
      connectedNotifier.value = true;
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> refresh() async {
    await _loadSupabaseConfig();
    if (AppConfig.supabaseUrl.isNotEmpty && AppConfig.supabaseAnon.isNotEmpty) {
      final ok = await _refreshFromSupabase();
      if (ok) return;
    }
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
        final rawItems = (data['items'] as List?) ?? const [];
        Catalog.set(
          rawShops.map((e) => Shop.fromJson(Map<String, dynamic>.from(e as Map))).toList(),
          rawItems.map((e) => CatalogItem.fromJson(Map<String, dynamic>.from(e as Map))).toList(),
        );
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
    double? deliveryLat,
    double? deliveryLng,
  }) async {
    final cart = cartNotifier.value;
    if (cart.isEmpty) return null;
    final u = user;
    final dlat = deliveryLat ?? UserPlace.instance.lat;
    final dlng = deliveryLng ?? UserPlace.instance.lng;
    final payload = {
      'shopId': cart.first.shopId,
      'userId': u?.id ?? 'USER_1',
      'customerName': u?.name ?? 'Vidura',
      'customerPhone': u?.phone ?? '0771234567',
      'address': address,
      'note': note,
      'paymentMethod': paymentMethod,
      'deliveryLat': dlat,
      'deliveryLng': dlng,
      'items': cart.map((e) => e.toJson()).toList(),
    };
    final uri = _uri('/api/orders');
    if (uri != null) {
      try {
        final res = await http
            .post(uri, headers: {'Content-Type': 'application/json'}, body: jsonEncode(payload))
            .timeout(const Duration(seconds: 8));
        if (res.statusCode >= 200 && res.statusCode < 300) {
          cartNotifier.value = [];
          final created = Order.fromJson(Map<String, dynamic>.from(jsonDecode(res.body) as Map));
          await _pushOrder(created);
          await refresh();
          return created;
        }
      } catch (_) {}
    }
    final shop = Catalog.shops.where((s) => s.id == cart.first.shopId).toList();
    final created = Order(
      id: 'ORD-${DateTime.now().millisecondsSinceEpoch % 1000000}',
      userId: u?.id ?? 'USER_1',
      shopId: cart.first.shopId,
      status: OrderStatus.pending,
      items: cart.map((e) => DeliveryItem(name: e.name, qty: e.qty, price: e.price)).toList(),
      totalAmount: cartTotal + 200,
      deliveryLat: dlat,
      deliveryLng: dlng,
      timestamp: DateTime.now(),
      shopName: shop.isNotEmpty ? shop.first.name : 'Shop',
      customerName: u?.name ?? 'Vidura',
    );
    await _pushOrder(created);
    cartNotifier.value = [];
    await refresh();
    return created;
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
                'address': user?.address ?? 'New Town, Anuradhapura',
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
    if (uri != null) {
      try {
        await http
            .post(
              uri,
              headers: {'Content-Type': 'application/json'},
              body: jsonEncode({'from': from, 'role': role, 'text': text}),
            )
            .timeout(const Duration(seconds: 8));
      } catch (_) {}
    }
    try {
      await _sbWrite('messages', 'POST', [
        {
          'id': 'm${DateTime.now().millisecondsSinceEpoch}',
          'order_id': orderId,
          'sender': from,
          'role': role,
          'body': text,
          'ts': DateTime.now().millisecondsSinceEpoch,
        }
      ]);
    } catch (_) {}
    await refresh();
  }

  Future<void> saveShop({
    required String id,
    required String name,
    String category = 'Bakery',
    String hours = '08:00 AM – 10:00 PM',
    String about = '',
    String? image,
    bool isOpen = true,
  }) async {
    try {
      await _sbWrite('shops?id=eq.$id', 'PATCH', {
        'name': name,
        'category': category,
        'hours': hours,
        'promo': about,
        'image': image ?? '/img/shop-bakery.jpg',
        'is_open': isOpen,
      });
    } catch (_) {}
    await refresh();
  }

  Future<void> saveItem({
    String? id,
    required String name,
    required double price,
    String category = 'Food',
    String desc = '',
    String? image,
    bool available = true,
    String? shopId,
  }) async {
    final itemId = (id != null && id.isNotEmpty) ? id : 'ITM_${DateTime.now().millisecondsSinceEpoch}';
    final sid = shopId ?? 'SHOP_1';
    try {
      await _sbWrite('menu_items', 'POST', [
        {
          'id': itemId,
          'shop_id': sid,
          'name': name,
          'category': category,
          'price': price,
          'is_available': available,
          'description': desc,
          'image': image ?? '',
        }
      ]);
    } catch (_) {}
    await refresh();
  }

  Future<void> toggleItem(String id, bool available) async {
    final uri = _uri('/api/items/$id');
    if (uri != null) {
      try {
        await http
            .patch(uri, headers: {'Content-Type': 'application/json'}, body: jsonEncode({'isAvailable': available}))
            .timeout(const Duration(seconds: 8));
      } catch (_) {}
    }
    try {
      await _sbWrite('menu_items?id=eq.$id', 'PATCH', {'is_available': available});
    } catch (_) {}
    await refresh();
  }

  Future<void> _pushOrder(Order o) async {
    try {
      await _sbWrite('orders', 'POST', [_orderRow(o)]);
    } catch (_) {}
  }

  Future<void> _patch(String id, Map<String, dynamic> body) async {
    final uri = _uri('/api/orders/$id');
    if (uri != null) {
      try {
        await http
            .patch(uri, headers: {'Content-Type': 'application/json'}, body: jsonEncode(body))
            .timeout(const Duration(seconds: 8));
      } catch (_) {}
    }
    final current = byId(id);
    if (current != null) {
      final next = current.copyWith(
        status: body['status'] != null ? OrderStatusX.fromApi(body['status']?.toString()) : null,
        riderId: body['riderId']?.toString(),
        riderName: body['riderName']?.toString(),
        riderLat: (body['riderLat'] as num?)?.toDouble(),
        riderLng: (body['riderLng'] as num?)?.toDouble(),
      );
      try {
        await _sbWrite('orders?id=eq.$id', 'PATCH', _orderRow(next));
      } catch (_) {}
    }
    await refresh();
  }
}

class Catalog {
  static List<Shop> shops = <Shop>[];
  static List<CatalogItem> items = <CatalogItem>[];
  static final ValueNotifier<int> version = ValueNotifier<int>(0);

  static void set(List<Shop> nextShops, List<CatalogItem> nextItems) {
    shops = nextShops;
    items = nextItems;
    version.value++;
  }
}
