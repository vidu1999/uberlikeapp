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
  final ValueNotifier<Set<String>> favsNotifier = ValueNotifier<Set<String>>(<String>{});
  final Map<String, List<ChatMessage>> messages = {};

  Timer? _poll;
  bool _started = false;
  String? token;

  List<Order> get orders => ordersNotifier.value;
  final Map<String, Order> _keptOrders = {};
  final Map<String, int> _chatRead = {};
  SessionUser? get user => userNotifier.value;
  Set<String> get favs => favsNotifier.value;

  String _favKey() {
    final d = (user?.phone ?? '').replaceAll(RegExp(r'\D'), '');
    final k = d.length >= 9 ? d.substring(d.length - 9) : (d.isEmpty ? 'guest' : d);
    return 'qb_favs_$k';
  }

  Future<void> loadFavs() async {
    try {
      final p = await SharedPreferences.getInstance();
      favsNotifier.value = (p.getStringList(_favKey()) ?? const <String>[]).toSet();
    } catch (_) {}
  }

  Future<void> toggleFav(String id) async {
    if (id.isEmpty) return;
    final next = Set<String>.of(favs);
    if (!next.add(id)) next.remove(id);
    favsNotifier.value = next;
    try {
      final p = await SharedPreferences.getInstance();
      await p.setStringList(_favKey(), next.toList());
    } catch (_) {}
  }

  Order? orderById(String id) {
    for (final o in orders) {
      if (o.id == id) return o;
    }
    return null;
  }

  static String _normChatRole(String role) => role == 'user' ? 'customer' : role;

  static String? chatLane(Order? o) {
    if (o == null || o.status == OrderStatus.cancelled) return null;
    if (o.status == OrderStatus.pickedUp || o.status == OrderStatus.onTheWay || o.status == OrderStatus.delivered) {
      return 'customer';
    }
    final hasRider = (o.riderId != null && o.riderId!.isNotEmpty) || (o.riderName != null && o.riderName!.isNotEmpty);
    if (hasRider || o.status == OrderStatus.accepted) return 'shop';
    return null;
  }

  bool canChat(Order? o, String role) {
    final lane = chatLane(o);
    if (lane == null) return false;
    final r = _normChatRole(role);
    if (r == 'rider') return true;
    if (r == 'shop') return lane == 'shop';
    if (r == 'customer') return lane == 'customer';
    return false;
  }

  String messageThread(ChatMessage m, Order? o) {
    if (m.thread == 'shop' || m.thread == 'customer') return m.thread!;
    if (m.id.startsWith('qbS.')) return 'shop';
    if (m.id.startsWith('qbC.')) return 'customer';
    if (m.role == 'shop') return 'shop';
    if (m.role == 'customer' || m.role == 'user') return 'customer';
    if (m.role == 'system') return 'system';
    return chatLane(o) ?? 'shop';
  }

  List<ChatMessage> chatMessages(String orderId, String role) {
    final o = orderById(orderId);
    final r = _normChatRole(role);
    final want = r == 'shop' ? 'shop' : r == 'customer' ? 'customer' : (chatLane(o) ?? 'shop');
    final msgs = messages[orderId] ?? const <ChatMessage>[];
    return msgs.where((m) {
      if (m.role == 'system') return true;
      return messageThread(m, o) == want;
    }).toList();
  }

  String chatPeerName(Order? o, String role) {
    if (o == null) return 'Chat';
    final r = _normChatRole(role);
    if (r == 'shop') return o.riderName ?? 'Rider';
    if (r == 'customer') return o.riderName ?? 'Courier';
    if (chatLane(o) == 'shop') return o.shopName.isNotEmpty ? o.shopName : 'Shop';
    return o.customerName;
  }

  List<String> quickReplies(String role, Order? o) {
    final r = _normChatRole(role);
    final lane = chatLane(o);
    if (r == 'shop') return const ['Food is ready', 'Come to the counter', 'Park in front'];
    if (r == 'rider' && lane == 'shop') {
      return const ["On my way to the shop", "I've arrived at the shop", 'Which entrance?'];
    }
    if (r == 'rider') {
      return const ["I'm on my way", "I've arrived", "I'm downstairs", 'Please come to the gate'];
    }
    return const ['Where are you?', "I'm at the gate", 'Please call me', 'Leave at the door', 'Thank you'];
  }

  int unreadCount(String orderId, String myRole) {
    final r = _normChatRole(myRole);
    final o = orderById(orderId);
    if ((r == 'customer' || r == 'shop') && !canChat(o, r)) return 0;
    final readAt = _chatRead[orderId] ?? 0;
    return chatMessages(orderId, r).where((m) => m.role != r && m.role != 'system' && m.ts > readAt).length;
  }

  void markChatRead(String orderId) {
    _chatRead[orderId] = DateTime.now().millisecondsSinceEpoch;
  }

  void _maybeUnfreeze() {
    final u = user;
    if (u == null || u.role != 'customer') return;
    final active = orders.any((o) =>
        (o.userId == u.id || o.customerPhone == u.phone) &&
        o.status != OrderStatus.delivered &&
        o.status != OrderStatus.cancelled);
    if (!active) UserPlace.instance.unfreeze();
  }

  void seed() => start();

  void start() {
    if (_started) {
      refresh();
      return;
    }
    _started = true;
    loadFavs();
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
  Map<String, String>? pendingRider;
  bool openShopProfile = false;
  static const _shopProfKey = 'qb_shop_profile_';

  Future<void> _rememberShop(String phone, Map<String, String> p) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('$_shopProfKey${_normPhone(phone)}', jsonEncode(p));
    } catch (_) {}
  }

  Future<Map<String, String>?> _recalledShop(String phone) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString('$_shopProfKey${_normPhone(phone)}');
      if (raw == null || raw.isEmpty) return null;
      return Map<String, String>.from((jsonDecode(raw) as Map).map((k, v) => MapEntry('$k', '$v')));
    } catch (_) {
      return null;
    }
  }

  String _normPhone(String raw) {
    var d = raw.replaceAll(RegExp(r'\D'), '');
    if (d.startsWith('94') && d.length == 11) d = '0${d.substring(2)}';
    if (d.length == 9 && d.startsWith('7')) d = '0$d';
    return d;
  }

  static const _demoShops = {
    'SHOP_1', 'SHOP_2', 'SHOP_3', 'SHOP_4', 'SHOP_5',
    'SHOP_6', 'SHOP_7', 'SHOP_8', 'SHOP_9', 'SHOP_10', 'SHOP_11',
  };
  static const _demoAccounts = {'USER_1', 'USER_2', 'SHOP_STAFF', 'RIDER_77'};
  static const _demoPhones = {'0771234567', '0771112222', '0772223333', '0775556666'};

  bool _isPlaceholderName(String? name) {
    final n = (name ?? '').trim().toLowerCase();
    return n.isEmpty || n == 'rider' || n == 'guest' || n == 'user' || n == 'shop owner' || n == 'delivery partner';
  }
  bool _isDemoShop(String? id) => _demoShops.contains(id);
  bool _isDemoPhone(String? phone) => _demoPhones.contains(_normPhone(phone ?? ''));
  bool _isDemoAccountMap(Map<String, dynamic>? a) {
    if (a == null) return false;
    return _demoAccounts.contains('${a['id']}') || _isDemoPhone('${a['phone'] ?? ''}');
  }
  bool _isDemoUser(SessionUser? u) {
    if (u == null) return false;
    return _demoAccounts.contains(u.id) || _isDemoPhone(u.phone);
  }
  bool _sameRole(String? a, String? b) {
    final x = a == 'user' ? 'customer' : a;
    final y = b == 'user' ? 'customer' : b;
    return x == y;
  }
  String _phoneKey(String raw) {
    final d = _normPhone(raw);
    return d.length >= 9 ? d.substring(d.length - 9) : d;
  }
  String _roleTag(String? role) {
    if (role == 'shop') return 'shop';
    if (role == 'rider') return 'rider';
    return 'customer';
  }
  String _accountIdFor(String phone, String role) => 'ACC_${_roleTag(role)}_${_phoneKey(phone)}';
  String _shopIdFor(String phone) => 'SHOP_${_phoneKey(phone)}';
  String shopIdForPhone(String phone) => _shopIdFor(phone);

  SessionUser _withShopId(SessionUser u) {
    var sid = u.shopId;
    if (sid == null || sid.isEmpty || sid == 'null' || _isDemoShop(sid)) {
      if (u.role == 'shop' && u.phone.isNotEmpty) sid = _shopIdFor(u.phone);
    }
    if (sid == u.shopId) return u;
    return SessionUser(
      id: u.id,
      name: u.name,
      phone: u.phone,
      role: u.role,
      address: u.address,
      vehicle: u.vehicle,
      shopId: sid,
      shopName: u.shopName,
    );
  }

  Future<String> _ensureShopRow() async {
    var u = user;
    if (u == null || u.role != 'shop') throw Exception('Not a shop account.');
    u = _withShopId(u);
    if (u.shopId != user?.shopId) {
      userNotifier.value = u;
      await _persist();
    }
    final sid = u.shopId ?? '';
    if (sid.isEmpty) throw Exception('Shop is not linked to this account.');
    try {
      await _sbWrite('accounts?id=eq.${u.id}', 'PATCH', {'shop_id': sid});
    } catch (_) {}
    final rec = await _recalledShop(u.phone);
    final p = pendingShop;
    final pinLat = double.tryParse(p?['lat'] ?? rec?['lat'] ?? '');
    final pinLng = double.tryParse(p?['lng'] ?? rec?['lng'] ?? '');
    final pinAddr = (p?['address'] ?? rec?['address'] ?? '').trim();
    final existing = await _sbGet('shops?id=eq.$sid&select=*');
    if (existing.isEmpty) {
      final name = (p?['shopName'] ?? rec?['shopName'] ?? '').trim();
      if (name.isEmpty) throw Exception('Register your shop first.');
      await _sbUpsert('shops', [
        {
          'id': sid,
          'name': name,
          'category': 'Bakery',
          'rating': 5,
          'reviews': 0,
          'is_open': true,
          'lat': pinLat,
          'lng': pinLng,
          'hours': '08:00 AM – 10:00 PM',
          'address': pinAddr,
          'image': '/img/shop-bakery.jpg',
          'promo': '',
        }
      ]);
    } else if (pinLat != null && pinLng != null) {
      final row = Map<String, dynamic>.from(existing.first as Map);
      row['lat'] = pinLat;
      row['lng'] = pinLng;
      if (pinAddr.isNotEmpty) row['address'] = pinAddr;
      await _sbUpsert('shops', [row]);
    }
    return sid;
  }
  String _roleLabel(String? role) {
    if (role == 'shop') return 'Shop';
    if (role == 'rider') return 'Rider';
    return 'User';
  }
  Never _alreadyThisRole(String role) {
    final label = _roleLabel(role);
    throw Exception(
      'This number already has a $label account. Login instead — you cannot create another $label with the same number. You can still use this number for the other apps.',
    );
  }

  Future<List<Map<String, dynamic>>> _allAccounts() async {
    try {
      final rows = await _sbGet('accounts?select=*');
      return rows
          .map((raw) => Map<String, dynamic>.from(raw as Map))
          .where((m) => !_isDemoAccountMap(m))
          .toList();
    } catch (_) {
      return [];
    }
  }

  Future<Map<String, dynamic>?> _lookupPhone(String phone, String role) async {
    final key = _phoneKey(phone);
    if (key.isEmpty) return null;
    final id = _accountIdFor(phone, role);
    final n = _normPhone(phone);
    final variants = {n, key, '0$key', '94$key'};
    final byId = <String, Map<String, dynamic>>{};
    void add(Map<String, dynamic> m) {
      if (_isDemoAccountMap(m) || '${m['id']}'.isEmpty) return;
      if (_phoneKey('${m['phone'] ?? ''}') != key && '${m['id']}' != id) return;
      if (!_sameRole('${m['role']}', role)) return;
      byId['${m['id']}'] = m;
    }
    try {
      for (final raw in await _sbGet('accounts?id=eq.$id&select=*')) {
        add(Map<String, dynamic>.from(raw as Map));
      }
    } catch (_) {}
    for (final v in variants) {
      if (v.isEmpty) continue;
      try {
        for (final raw in await _sbGet('accounts?phone=eq.$v&select=*')) {
          add(Map<String, dynamic>.from(raw as Map));
        }
      } catch (_) {}
    }
    for (final m in await _allAccounts()) {
      add(m);
    }
    if (byId.isEmpty) return null;
    final keep = byId[id] ?? byId.values.first;
    for (final extra in byId.values) {
      if ('${extra['id']}' == '${keep['id']}') continue;
      try {
        await _sbDelete('accounts?id=eq.${extra['id']}');
      } catch (_) {}
    }
    return keep;
  }

  Future<Map<String, dynamic>?> findAccount(String role, String id) async {
    await _loadSupabaseConfig();
    final phone = _normPhone(id);
    final email = id.contains('@') ? id.trim().toLowerCase() : '';
    try {
      if (email.isNotEmpty) {
        final list = await _allAccounts();
        for (final m in list) {
          if ('${m['email'] ?? ''}'.toLowerCase() != email) continue;
          if (!_sameRole('${m['role']}', role)) continue;
          return m;
        }
      }
      return await _lookupPhone(phone, role);
    } catch (_) {}
    return null;
  }

  Future<void> _enterAccount(String role, String phone) async {
    phone = _normPhone(phone);
    Map<String, dynamic>? user = await _lookupPhone(phone, role);
    if (user == null) {
      try {
        final byId = await _sbGet('accounts?id=eq.${_accountIdFor(phone, role)}&select=*');
        if (byId.isNotEmpty) {
          final acc = Map<String, dynamic>.from(byId.first as Map);
          if (!_isDemoAccountMap(acc) && _sameRole('${acc['role']}', role)) user = acc;
        }
      } catch (_) {}
    }
    var createdShop = false;
    if (user == null && role == 'shop') {
      final p = pendingShop;
      if (p == null || ((p['shopName'] ?? '').isEmpty && (p['ownerName'] ?? '').isEmpty)) {
        throw Exception('Register your shop first.');
      }
      final shopId = _shopIdFor(phone);
      final pinLat = double.tryParse(p['lat'] ?? '');
      final pinLng = double.tryParse(p['lng'] ?? '');
      final pinAddr = (p['address'] ?? '').trim();
      if (pinLat == null || pinLng == null) {
        throw Exception('Pin your shop on the map.');
      }
      if (pinAddr.isEmpty) {
        throw Exception('Enter the shop address.');
      }
      Map<String, dynamic> shop = {
        'id': shopId,
        'name': p['shopName'] ?? 'New Shop',
        'category': 'Bakery',
        'rating': 5,
        'reviews': 0,
        'is_open': true,
        'lat': pinLat,
        'lng': pinLng,
        'km': 0,
        'eta': '20–35 min',
        'fee': 200,
        'hours': '08:00 AM – 10:00 PM',
        'address': pinAddr,
        'image': '/img/shop-bakery.jpg',
        'promo':
            'Freshly baked cakes, pastries and desserts made with love. We use the best ingredients to bring happiness to your table.',
      };
      try {
        final existing = await _sbGet('shops?id=eq.$shopId&select=*');
        if (existing.isNotEmpty) {
          shop = {...Map<String, dynamic>.from(existing.first as Map), ...shop};
        }
        await _sbUpsert('shops', [shop]);
      } catch (_) {}
      Catalog.set([...Catalog.shops, Shop.fromJson(shop)], Catalog.items);
      user = {
        'id': _accountIdFor(phone, 'shop'),
        'name': p['ownerName'] ?? 'Shop Owner',
        'phone': phone,
        'email': p['email'] ?? '',
        'pin': 'otp',
        'role': 'shop',
        'shop_id': shopId,
      };
      try {
        await _sbWrite('accounts', 'POST', [user]);
      } catch (_) {
        final again = await _lookupPhone(phone, 'shop');
        if (again != null) user = again;
      }
      user!['shopName'] = shop['name'];
      await _rememberShop(phone, {
        'shopId': shopId,
        'shopName': '${shop['name']}',
        'ownerName': '${user['name']}',
        'address': '${shop['address']}',
        'lat': '${shop['lat']}',
        'lng': '${shop['lng']}',
      });
      pendingShop = null;
      createdShop = true;
    }
    if (user != null && role == 'rider') {
      final pr = pendingRider;
      final name = (pr?['name'] ?? '').trim();
      if (name.isNotEmpty && !_isPlaceholderName(name)) {
        user['name'] = name;
        if ((pr?['email'] ?? '').isNotEmpty) user['email'] = pr!['email'];
        try {
          await _sbWrite('accounts?id=eq.${user['id']}', 'PATCH', {'name': name, 'email': user['email']});
        } catch (_) {}
      }
      pendingRider = null;
    }
    if (user == null && role == 'rider') {
      final pr = pendingRider;
      final name = (pr?['name'] ?? '').trim();
      if (_isPlaceholderName(name)) throw Exception('Register as a rider first.');
      user = {
        'id': _accountIdFor(phone, 'rider'),
        'name': name,
        'phone': phone,
        'email': pr?['email'] ?? '',
        'role': 'rider',
        'pin': 'otp',
        'address': 'Sri Lanka',
        'vehicle': pr?['vehicle'] ?? 'Honda Dio · BDX 1234',
        'rating': 5,
      };
      pendingRider = null;
      try {
        await _sbWrite('accounts', 'POST', [user]);
      } catch (_) {
        final again = await _lookupPhone(phone, 'rider');
        if (again != null) user = again;
      }
    }
    if (user == null) {
      final pr = pendingRider;
      user = {
        'id': _accountIdFor(phone, role),
        'name': pr?['name'] ?? 'Guest',
        'phone': phone,
        'email': pr?['email'] ?? '',
        'role': role,
        'pin': 'otp',
        'address': 'Sri Lanka',
      };
      pendingRider = null;
      try {
        await _sbWrite('accounts', 'POST', [user]);
      } catch (_) {
        final again = await _lookupPhone(phone, role);
        if (again != null) user = again;
      }
    }
    if (user == null) {
      throw Exception('Could not save this account. Try again.');
    }
    token = 'sb_${user['id']}';
    if (role == 'shop') {
      user['shopId'] = user['shopId'] ?? user['shop_id'];
      if (user['shopId'] == null || '${user['shopId']}'.isEmpty) {
        final rec = await _recalledShop(phone);
        if (rec != null) {
          user['shop_id'] = rec['shopId'];
          user['shopId'] = rec['shopId'];
          user['shopName'] = rec['shopName'];
        }
      }
      if ((user['shopName'] == null || '${user['shopName']}'.isEmpty) && user['shopId'] != null) {
        for (final s in Catalog.shops) {
          if (s.id == user['shopId']) user['shopName'] = s.name;
        }
      }
      openShopProfile = createdShop;
    }
    var session = SessionUser.fromJson(user);
    if (role == 'shop') session = _withShopId(session);
    userNotifier.value = session;
    await loadFavs();
    connectedNotifier.value = true;
    await _persist();
    if (role == 'shop') {
      try {
        await _ensureShopRow();
      } catch (_) {}
    }
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
    if (role == 'shop' || role == 'rider') {
      final existing = await _lookupPhone(phone, role);
      if (existing != null) {
        needsShopRegister = false;
        needsRiderRegister = false;
        verifiedPhone = null;
        pendingShop = null;
        await _clearVerified();
        await _enterAccount(role, phone);
        return true;
      }
      verifiedPhone = phone;
      needsShopRegister = role == 'shop';
      needsRiderRegister = role == 'rider';
      if (role == 'shop' &&
          pendingShop != null &&
          ((pendingShop!['shopName'] ?? '').isNotEmpty || (pendingShop!['ownerName'] ?? '').isNotEmpty)) {
        await _enterAccount('shop', phone);
        needsShopRegister = false;
        verifiedPhone = null;
        await _clearVerified();
        return true;
      }
      await _persistVerified(role, phone);
      return true;
    }
    await _enterAccount(role, phone);
    return true;
  }

  String _googlePhone(String sub) {
    var d = sub.replaceAll(RegExp(r'\D'), '');
    if (d.isEmpty) {
      var n = 0;
      for (final u in sub.codeUnits) {
        n = (n * 31 + u) & 0x7fffffff;
      }
      d = n.toString();
    }
    if (d.length >= 8) {
      d = d.substring(d.length - 8);
    } else {
      d = d.padLeft(8, '0');
    }
    return '99$d';
  }

  Future<void> signInWithGoogle({required String email, required String name, required String sub}) async {
    await _loadSupabaseConfig();
    email = email.trim().toLowerCase();
    name = name.trim();
    if (!email.contains('@')) throw Exception('Google did not share an email for this account.');
    const role = 'customer';
    Map<String, dynamic>? row;
    try {
      for (final raw in await _sbGet('accounts?email=ilike.${Uri.encodeComponent(email)}&role=eq.customer&select=*')) {
        final m = Map<String, dynamic>.from(raw as Map);
        if ('${m['email'] ?? ''}'.toLowerCase() == email && !_isDemoAccountMap(m)) {
          row = m;
          break;
        }
      }
    } catch (_) {}
    if (row == null) {
      final list = await _allAccounts();
      for (final m in list) {
        if ('${m['email'] ?? ''}'.toLowerCase() == email && _sameRole('${m['role']}', role) && !_isDemoAccountMap(m)) {
          row = m;
          break;
        }
      }
    }
    if (row == null && sub.isNotEmpty) {
      row = await _lookupPhone(_googlePhone(sub), role);
    }
    if (row == null) {
      final phone = _googlePhone(sub.isNotEmpty ? sub : email);
      row = {
        'id': _accountIdFor(phone, role),
        'name': name.isEmpty ? email.split('@').first : name,
        'phone': phone,
        'email': email,
        'pin': 'google',
        'role': role,
        'address': 'Sri Lanka',
      };
      try {
        await _sbWrite('accounts', 'POST', [row]);
      } catch (_) {
        row = await _lookupPhone(phone, role) ?? row;
      }
    }
    token = 'sb_${row['id']}';
    userNotifier.value = SessionUser.fromJson(row);
    await loadFavs();
    connectedNotifier.value = true;
    await _persist();
    await refresh();
  }

  bool needsShopRegister = false;
  bool needsRiderRegister = false;
  String? verifiedPhone;

  Future<void> completeShopRegister() async {
    final phone = verifiedPhone;
    if (phone == null || phone.isEmpty) throw Exception('Verify WhatsApp first.');
    final p = pendingShop;
    if (p == null || ((p['shopName'] ?? '').trim().isEmpty && (p['ownerName'] ?? '').trim().isEmpty)) {
      throw Exception('Register your shop first.');
    }
    await _enterAccount('shop', phone);
    needsShopRegister = false;
    verifiedPhone = null;
    await _clearVerified();
  }

  Future<void> completeRiderRegister() async {
    final phone = verifiedPhone;
    if (phone == null || phone.isEmpty) throw Exception('Verify WhatsApp first.');
    final p = pendingRider;
    if (_isPlaceholderName(p?['name'])) throw Exception('Register as a rider first.');
    await _enterAccount('rider', phone);
    needsRiderRegister = false;
    verifiedPhone = null;
    await _clearVerified();
  }

  bool get isShopRegistered {
    final u = user;
    if (u == null || u.role != 'shop') return false;
    final sid = (u.shopId != null && u.shopId!.isNotEmpty && u.shopId != 'null') ? u.shopId! : (u.phone.isNotEmpty ? _shopIdFor(u.phone) : '');
    if (sid.isEmpty) return false;
    for (final s in Catalog.shops) {
      if (s.id == sid && s.name.trim().isNotEmpty) return true;
    }
    if ((u.shopName ?? '').trim().isNotEmpty) return true;
    return false;
  }

  bool get isRiderRegistered {
    final u = user;
    if (u == null || u.role != 'rider') return false;
    return !_isPlaceholderName(u.name);
  }

  Future<void> parkForRegister(String role) async {
    final phone = user?.phone ?? verifiedPhone ?? '';
    userNotifier.value = null;
    token = null;
    if (phone.isNotEmpty) {
      verifiedPhone = phone;
      needsShopRegister = role == 'shop';
      needsRiderRegister = role == 'rider';
      await _persistVerified(role, phone);
    }
    await _persist();
  }

  Future<bool> login(String role, {String? phone, String pin = '1234'}) async {
    await _loadSupabaseConfig();
    if (phone != null && phone.isNotEmpty) {
      final taken = await _lookupPhone(phone, role);
      if (taken != null) {
        token = 'sb_${taken['id']}';
        userNotifier.value = SessionUser.fromJson(taken);
        connectedNotifier.value = true;
        await _persist();
        await refresh();
        return true;
      }
    }
    if (AppConfig.supabaseUrl.isNotEmpty && AppConfig.supabaseAnon.isNotEmpty) {
      try {
        var q = 'accounts?select=*&role=eq.$role';
        if (phone != null && phone.isNotEmpty) q += '&phone=eq.${_normPhone(phone)}';
        final rows = await _sbGet(q);
        Map<String, dynamic>? picked;
        for (final raw in rows) {
          final m = Map<String, dynamic>.from(raw as Map);
          if (_isDemoAccountMap(m)) continue;
          if ('${m['pin']}' == pin) {
            picked = m;
            break;
          }
          picked ??= m;
        }
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
    pendingRider = null;
    needsShopRegister = false;
    needsRiderRegister = false;
    verifiedPhone = null;
    _clearVerified();
    _persist();
  }

  static const _sessionKey = 'qb_session';
  static const _verifiedKey = 'qb_verified';

  Future<void> _persistVerified(String role, String phone) async {
    try {
      final p = await SharedPreferences.getInstance();
      await p.setString(_verifiedKey, jsonEncode({'role': role, 'phone': phone}));
    } catch (_) {}
  }

  Future<void> _clearVerified() async {
    verifiedPhone = null;
    needsShopRegister = false;
    needsRiderRegister = false;
    try {
      final p = await SharedPreferences.getInstance();
      await p.remove(_verifiedKey);
    } catch (_) {}
  }

  Future<void> restore() async {
    try {
      final p = await SharedPreferences.getInstance();
      final vraw = p.getString(_verifiedKey);
      if (vraw != null && vraw.isNotEmpty) {
        final v = jsonDecode(vraw) as Map<String, dynamic>;
        final role = '${v['role'] ?? ''}';
        final phone = '${v['phone'] ?? ''}';
        if (phone.isNotEmpty) {
          verifiedPhone = phone;
          needsShopRegister = role == 'shop';
          needsRiderRegister = role == 'rider';
        }
      }
      final raw = p.getString(_sessionKey);
      if (raw == null || raw.isEmpty) return;
      final m = jsonDecode(raw) as Map<String, dynamic>;
      final u = SessionUser.fromJson(m);
      if (_isDemoUser(u)) {
        await p.remove(_sessionKey);
        return;
      }
      token = m['token']?.toString();
      userNotifier.value = u.role == 'shop' ? _withShopId(u) : u;
      if (userNotifier.value != null) await _clearVerified();
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

  Future<void> _sbUpsert(String table, Object rows) => _sbWrite('$table?on_conflict=id', 'POST', rows);

  Future<void> _sbDelete(String path) async {
    final uri = _sb(path);
    if (uri == null) return;
    await http.delete(uri, headers: {
      'apikey': AppConfig.supabaseAnon,
      'Authorization': 'Bearer ${AppConfig.supabaseAnon}',
      'Prefer': 'return=minimal',
    }).timeout(const Duration(seconds: 8));
  }

  bool _wipedDemo = false;
  Future<void> _wipeDemo() async {
    if (_wipedDemo) return;
    _wipedDemo = true;
    const shopsIn =
        '"SHOP_1","SHOP_2","SHOP_3","SHOP_4","SHOP_5","SHOP_6","SHOP_7","SHOP_8","SHOP_9","SHOP_10","SHOP_11"';
    const paths = [
      'messages?order_id=in.("ORD-1001","ORD-1002","ORD-1003","ORD-1004","ORD-NONE")',
      'orders?id=in.("ORD-1001","ORD-1002","ORD-1003","ORD-1004","ORD-NONE")',
      'orders?shop_id=in.($shopsIn)',
      'orders?user_id=in.("USER_1","USER_2")',
      'menu_items?shop_id=in.($shopsIn)',
      'shops?id=in.($shopsIn)',
      'accounts?id=in.("USER_1","USER_2","SHOP_STAFF","RIDER_77")',
      'accounts?phone=in.("0771234567","0771112222","0772223333","0775556666")',
    ];
    for (final p in paths) {
      try {
        await _sbDelete(p);
      } catch (_) {}
    }
  }

  List<Shop> _scopeShops(Iterable<Shop> shops) {
    var list = shops.where((s) => !_isDemoShop(s.id)).toList();
    final u = user;
    if (u != null && u.role == 'shop') {
      final sid = (u.shopId != null && u.shopId!.isNotEmpty) ? u.shopId! : _shopIdFor(u.phone);
      list = list.where((s) => s.id == sid).toList();
    }
    return list;
  }

  List<CatalogItem> _scopeItems(Iterable<CatalogItem> items) {
    var list = items.where((i) => !_isDemoShop(i.shopId)).toList();
    final u = user;
    if (u != null && u.role == 'shop') {
      final sid = (u.shopId != null && u.shopId!.isNotEmpty) ? u.shopId! : _shopIdFor(u.phone);
      list = list.where((i) => i.shopId == sid).toList();
    }
    return list;
  }

  List<Order> _mergeKept(List<Order> list) {
    if (_keptOrders.isEmpty) return list;
    final merged = list.map((o) {
      final k = _keptOrders[o.id];
      if (k == null) {
        _keptOrders[o.id] = o;
        return o;
      }
      final status = OrderStatusX.later(o.status, k.status);
      final next = status == o.status ? o : o.copyWith(status: status);
      _keptOrders[o.id] = next;
      return next;
    }).toList();
    final ids = merged.map((o) => o.id).toSet();
    final extra = _keptOrders.values.where((o) => !ids.contains(o.id) && !_isDemoOrder(o)).toList();
    if (extra.isEmpty) return merged;
    return [...extra, ...merged];
  }

  List<Order> _retainStatus(List<Order> incoming) {
    final prev = {for (final o in orders) o.id: o};
    return incoming.map((o) {
      final p = prev[o.id];
      if (p == null) return o;
      final status = OrderStatusX.later(o.status, p.status);
      return status == o.status ? o : o.copyWith(status: status);
    }).toList();
  }

  List<Order> _scopeOrders(Iterable<Order> list) {
    var next = list.where((o) => !_isDemoOrder(o)).toList();
    final u = user;
    if (u == null) return <Order>[];
    if (u.role == 'customer' || u.role == 'user') {
      final phone = _normPhone(u.phone);
      final key = _phoneKey(phone);
      next = next.where((o) {
        if (o.userId == u.id) return true;
        final p = _normPhone(o.customerPhone ?? '');
        return p.isNotEmpty && (p == phone || _phoneKey(p) == key);
      }).toList();
      return _mergeKept(next);
    }
    if (u.role == 'shop') {
      final sid = u.shopId ?? '';
      return next.where((o) => o.shopId == sid).toList();
    }
    if (u.role == 'rider') {
      return next.where((o) {
        if (o.riderId == u.id || o.riderPhone == u.phone) return true;
        if (o.status == OrderStatus.ready && (o.riderId == null || o.riderId!.isEmpty)) return true;
        return false;
      }).toList();
    }
    return next;
  }

  Map<String, dynamic> _orderRow(Order o) => {
        'id': o.id,
        'user_id': o.userId,
        'shop_id': o.shopId,
        'shop_name': o.shopName,
        'customer_name': o.customerName,
        'customer_phone': o.customerPhone,
        'address': o.address,
        'status': o.status.apiName,
        'total_amount': o.totalAmount,
        'data': o.toJson(),
        'updated_at': DateTime.now().toIso8601String(),
      };

  Future<bool> _refreshFromSupabase() async {
    try {
      await _wipeDemo();
      if (user?.role == 'shop') {
        try {
          await _ensureShopRow();
        } catch (_) {}
      }
      final shopRows = await _sbGet('shops?select=*&order=id.asc');
      final itemRows = await _sbGet('menu_items?select=*&order=id.asc');
      final orderRows = await _sbGet('orders?select=*');
      final msgRows = await _sbGet('messages?select=*');
      final shops = _scopeShops(shopRows.map((e) => Shop.fromJson(Map<String, dynamic>.from(e as Map))));
      final items = _scopeItems(itemRows.map((e) => CatalogItem.fromJson(Map<String, dynamic>.from(e as Map))));
      Catalog.set(shops, items);
      ordersNotifier.value = _retainStatus(
        _scopeOrders(
          orderRows.map((e) => Order.fromJson(Map<String, dynamic>.from(e as Map))),
        ),
      );
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
            thread: m['thread']?.toString(),
          ),
        );
      }
      connectedNotifier.value = true;
      _maybeUnfreeze();
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
        ordersNotifier.value = _retainStatus(
          _scopeOrders(
            rawOrders.map((e) => Order.fromJson(Map<String, dynamic>.from(e as Map))),
          ),
        );
        final rawShops = (data['shops'] as List?) ?? const [];
        final rawItems = (data['items'] as List?) ?? const [];
        Catalog.set(
          _scopeShops(rawShops.map((e) => Shop.fromJson(Map<String, dynamic>.from(e as Map)))),
          _scopeItems(rawItems.map((e) => CatalogItem.fromJson(Map<String, dynamic>.from(e as Map)))),
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
        _maybeUnfreeze();
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
      'userId': u?.id ?? '',
      'customerName': u?.name ?? 'Guest',
      'customerPhone': u?.phone ?? '',
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
          final created = Order.fromJson(Map<String, dynamic>.from(jsonDecode(res.body) as Map));
          await _pushOrder(created);
          cartNotifier.value = [];
          _keepOrder(created);
          await refresh();
          _keepOrder(created);
          return created;
        }
      } catch (_) {}
    }
    final shop = Catalog.shops.where((s) => s.id == cart.first.shopId).toList();
    final created = Order(
      id: 'ORD-${DateTime.now().millisecondsSinceEpoch}',
      userId: u?.id ?? '',
      shopId: cart.first.shopId,
      status: OrderStatus.pending,
      items: cart.map((e) => DeliveryItem(name: e.name, qty: e.qty, price: e.price)).toList(),
      totalAmount: cartTotal + 200,
      deliveryLat: dlat,
      deliveryLng: dlng,
      timestamp: DateTime.now(),
      shopName: shop.isNotEmpty ? shop.first.name : 'Shop',
      customerName: u?.name ?? 'Guest',
      customerPhone: u?.phone,
      address: address,
      shopLat: shop.isNotEmpty ? shop.first.lat : null,
      shopLng: shop.isNotEmpty ? shop.first.lng : null,
      shopAddress: shop.isNotEmpty ? shop.first.address : null,
    );
    await _pushOrder(created);
    cartNotifier.value = [];
    _keepOrder(created);
    await refresh();
    _keepOrder(created);
    return created;
  }

  void _keepOrder(Order created) {
    final prev = _keptOrders[created.id];
    final keep = prev == null ? created : created.copyWith(status: OrderStatusX.later(prev.status, created.status));
    _keptOrders[created.id] = keep;
    if (orders.any((o) => o.id == created.id)) return;
    ordersNotifier.value = [keep, ...orders];
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

  bool _isDemoOrder(Order o) {
    if (RegExp(r'^ORD-100[1-4]$').hasMatch(o.id) || o.id == 'ORD-NONE') return true;
    if (_isDemoShop(o.shopId) || _demoAccounts.contains(o.userId) || _isDemoPhone(o.customerPhone)) return true;
    return false;
  }

  Future<void> assignRider(String id, {String? riderId, String? riderName, String? riderPhone}) async {
    final u = user;
    if (u != null && u.role == 'rider' && !isRiderRegistered) {
      throw Exception('Register as a rider first, then accept orders.');
    }
    await _patch(id, {
      'riderId': riderId ?? u?.id,
      'riderName': riderName ?? u?.name,
      'riderPhone': riderPhone ?? u?.phone,
    });
  }

  Future<void> updateRiderLocation(String id, double lat, double lng) async {
    await _patch(id, {'riderLat': lat, 'riderLng': lng});
  }

  Future<void> sendMessage(String orderId, String text, String role, String from) async {
    final body = text.trim();
    if (body.isEmpty) return;
    final r = _normChatRole(role);
    final o = orderById(orderId);
    if (r != 'system' && !canChat(o, r)) {
      throw Exception(
        r == 'customer'
            ? 'Chat opens after the rider picks up your order.'
            : r == 'shop'
                ? 'Chat with the rider is open until pickup.'
                : 'Chat is not available for this order.',
      );
    }
    final lane = r == 'system' ? null : chatLane(o);
    final prefix = lane == 'shop' ? 'qbS.' : lane == 'customer' ? 'qbC.' : 'm';
    final msg = ChatMessage(
      id: '$prefix${DateTime.now().millisecondsSinceEpoch}',
      from: from,
      role: r,
      text: body,
      ts: DateTime.now().millisecondsSinceEpoch,
      thread: lane,
    );
    (messages[orderId] ??= <ChatMessage>[]).add(msg);
    ordersNotifier.value = List<Order>.of(orders);
    final uri = _uri('/api/orders/$orderId/messages');
    if (uri != null) {
      try {
        await http
            .post(
              uri,
              headers: {'Content-Type': 'application/json'},
              body: jsonEncode({'from': from, 'role': r, 'text': body, 'thread': lane}),
            )
            .timeout(const Duration(seconds: 8));
      } catch (_) {}
    }
    try {
      await _sbWrite('messages', 'POST', [
        {
          'id': msg.id,
          'order_id': orderId,
          'sender': from,
          'role': r,
          'body': body,
          'ts': msg.ts,
        }
      ]);
    } catch (_) {}
    await refresh();
    final list = messages[orderId] ?? <ChatMessage>[];
    if (!list.any((m) => m.id == msg.id || (m.text == msg.text && m.role == msg.role))) {
      (messages[orderId] ??= <ChatMessage>[]).add(msg);
      ordersNotifier.value = List<Order>.of(orders);
    }
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
    var sid = id;
    if (sid.isEmpty || sid == 'null') sid = await _ensureShopRow();
    Shop? prev;
    for (final s in Catalog.shops) {
      if (s.id == sid) prev = s;
    }
    await _sbUpsert('shops', [
      {
        'id': sid,
        'name': name,
        'category': category,
        'rating': prev?.rating ?? 5,
        'reviews': prev?.reviews ?? 0,
        'is_open': isOpen,
        'lat': prev?.lat,
        'lng': prev?.lng,
        'hours': hours,
        'address': prev?.address ?? '',
        'image': image ?? prev?.image ?? '/img/shop-bakery.jpg',
        'promo': about,
      }
    ]);
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
    if (user == null || user!.role != 'shop') {
      throw Exception('Register as a shop owner first, then add items.');
    }
    if (name.trim().isEmpty) throw Exception('Enter an item name.');
    var sid = shopId ?? '';
    if (sid.isEmpty || sid == 'SHOP_1' || sid == 'null') {
      sid = user?.shopId ?? '';
    }
    try {
      sid = await _ensureShopRow();
    } catch (_) {
      throw Exception('Register your shop first, then add items.');
    }
    if (sid.isEmpty || !isShopRegistered) {
      throw Exception('Register your shop first, then add items.');
    }
    final itemId = (id != null && id.isNotEmpty) ? id : 'ITM_${DateTime.now().millisecondsSinceEpoch}';
    await _sbUpsert('menu_items', [
      {
        'id': itemId,
        'shop_id': sid,
        'name': name.trim(),
        'category': category,
        'price': price,
        'is_available': available,
        'description': desc,
        'image': (image != null && image.isNotEmpty) ? image : '/img/shop-bakery.jpg',
      }
    ]);
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
      await _sbUpsert('orders', [_orderRow(o)]);
    } catch (_) {
      try {
        await _sbWrite('orders', 'POST', [_orderRow(o)]);
      } catch (_) {}
    }
  }

  final Map<String, Future<void>> _patchTail = {};
  final Map<String, Map<String, dynamic>> _locPend = {};
  final Map<String, Timer> _locTimer = {};

  bool _locOnly(Map<String, dynamic> body) {
    if (body.isEmpty) return false;
    return body.keys.every((k) => k == 'riderLat' || k == 'riderLng');
  }

  void _applyPatchLocal(String id, Map<String, dynamic> body) {
    final list = List<Order>.of(orders);
    final i = list.indexWhere((o) => o.id == id);
    if (i < 0) return;
    final cur = list[i];
    var next = cur.copyWith(
      status: body['status'] != null ? OrderStatusX.fromApi(body['status']?.toString()) : cur.status,
      riderId: body['riderId']?.toString() ?? cur.riderId,
      riderName: body['riderName']?.toString() ?? cur.riderName,
      riderPhone: body['riderPhone']?.toString() ?? cur.riderPhone,
      riderLat: (body['riderLat'] as num?)?.toDouble() ?? cur.riderLat,
      riderLng: (body['riderLng'] as num?)?.toDouble() ?? cur.riderLng,
    );
    next = next.copyWith(status: OrderStatusX.later(cur.status, next.status));
    if (cur.status == OrderStatus.delivered) {
      next = next.copyWith(status: OrderStatus.delivered);
    }
    list[i] = next;
    _keptOrders[id] = next;
    ordersNotifier.value = list;
  }

  Future<void> _enqueuePatch(String id, Future<void> Function() task) async {
    final prev = _patchTail[id] ?? Future.value();
    final next = prev.then((_) => task(), onError: (_) => task());
    _patchTail[id] = next;
    await next;
  }

  Future<void> _writePatch(String id, Map<String, dynamic> body) async {
    _applyPatchLocal(id, body);
    final current = byId(id);
    if (current != null && _locOnly(body) && current.status == OrderStatus.delivered) return;
    final uri = _uri('/api/orders/$id');
    if (uri != null) {
      try {
        await http
            .patch(uri, headers: {'Content-Type': 'application/json'}, body: jsonEncode(body))
            .timeout(const Duration(seconds: 8));
      } catch (_) {}
    }
    if (current != null) {
      try {
        await _sbWrite('orders?id=eq.$id', 'PATCH', _orderRow(current));
      } catch (_) {}
    }
    if (!_locOnly(body)) {
      final want = current?.status;
      await refresh();
      final after = byId(id);
      if (want != null && after != null && OrderStatusX.later(after.status, want) != after.status) {
        _applyPatchLocal(id, {'status': want.apiName});
      }
    }
  }

  Future<void> _patch(String id, Map<String, dynamic> body) async {
    if (_locOnly(body)) {
      _applyPatchLocal(id, body);
      final cur = byId(id);
      if (cur != null && cur.status == OrderStatus.delivered) return;
      _locPend[id] = {...?_locPend[id], ...body};
      _locTimer[id] ??= Timer(const Duration(milliseconds: 1200), () {
        _locTimer.remove(id);
        final extra = _locPend.remove(id);
        if (extra != null) {
          _enqueuePatch(id, () => _writePatch(id, extra));
        }
      });
      return;
    }
    _locTimer.remove(id)?.cancel();
    final pending = _locPend.remove(id);
    final merged = pending == null ? body : {...pending, ...body};
    await _enqueuePatch(id, () => _writePatch(id, merged));
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
