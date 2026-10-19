import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

class SavedCard {
  final String id;
  final String brand;
  final String last4;
  final String exp;
  final String name;

  const SavedCard({
    required this.id,
    required this.brand,
    required this.last4,
    required this.exp,
    required this.name,
  });

  String get label => '$brand •••• $last4';

  Map<String, dynamic> toJson() => {
        'id': id,
        'brand': brand,
        'last4': last4,
        'exp': exp,
        'name': name,
      };

  factory SavedCard.fromJson(Map<String, dynamic> j) => SavedCard(
        id: '${j['id'] ?? ''}',
        brand: '${j['brand'] ?? 'Card'}',
        last4: '${j['last4'] ?? ''}',
        exp: '${j['exp'] ?? ''}',
        name: '${j['name'] ?? ''}',
      );
}

class PayCards {
  PayCards._();

  static final ValueNotifier<List<SavedCard>> notifier = ValueNotifier<List<SavedCard>>(<SavedCard>[]);

  static List<SavedCard> get cards => notifier.value;

  static String _email = '';
  static String _id = '';
  static String _phone = '';

  static void bind({String? email, String? id, String? phone}) {
    _email = (email ?? '').trim().toLowerCase();
    _id = id ?? '';
    _phone = phone ?? '';
  }

  static String _key() {
    if (_email.isNotEmpty) return 'qb_cards_e_$_email';
    if (_id.isNotEmpty) return 'qb_cards_$_id';
    final d = _phone.replaceAll(RegExp(r'\D'), '');
    final k = d.length >= 9 ? d.substring(d.length - 9) : (d.isEmpty ? 'guest' : d);
    return 'qb_cards_$k';
  }

  static String digits(String v) => v.replaceAll(RegExp(r'\D'), '');

  static String brand(String number) {
    final d = digits(number);
    if (d.startsWith('4')) return 'Visa';
    if (RegExp(r'^(5[1-5]|2[2-7])').hasMatch(d)) return 'Mastercard';
    if (RegExp(r'^3[47]').hasMatch(d)) return 'Amex';
    if (RegExp(r'^35').hasMatch(d)) return 'JCB';
    if (RegExp(r'^62').hasMatch(d)) return 'UnionPay';
    if (RegExp(r'^(6011|65)').hasMatch(d)) return 'Discover';
    return 'Card';
  }

  static bool luhnOk(String number) {
    final d = digits(number);
    if (d.length < 13 || d.length > 19) return false;
    var sum = 0;
    var alt = false;
    for (var i = d.length - 1; i >= 0; i--) {
      var n = d.codeUnitAt(i) - 48;
      if (n < 0 || n > 9) return false;
      if (alt) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
      alt = !alt;
    }
    return sum % 10 == 0;
  }

  static String formatNumber(String v) {
    var d = digits(v);
    if (d.length > 19) d = d.substring(0, 19);
    final buf = StringBuffer();
    for (var i = 0; i < d.length; i++) {
      if (i > 0 && i % 4 == 0) buf.write(' ');
      buf.write(d[i]);
    }
    return buf.toString();
  }

  static String formatExp(String v) {
    final d = digits(v);
    final cut = d.substring(0, d.length.clamp(0, 4));
    if (cut.length <= 2) return cut;
    return '${cut.substring(0, 2)}/${cut.substring(2)}';
  }

  static bool expOk(String exp) {
    final m = RegExp(r'^(\d{1,2})\s*/\s*(\d{2})$').firstMatch(exp.trim());
    if (m == null) return false;
    final mo = int.tryParse(m.group(1)!) ?? 0;
    final yr = 2000 + (int.tryParse(m.group(2)!) ?? 0);
    if (mo < 1 || mo > 12) return false;
    final last = DateTime(yr, mo + 1, 0, 23, 59, 59);
    return !last.isBefore(DateTime.now());
  }

  static String? validate({
    required String number,
    required String name,
    required String exp,
    required String cvc,
    String? savedBrand,
  }) {
    final usingSaved = savedBrand != null && savedBrand.isNotEmpty;
    final b = usingSaved ? savedBrand : brand(number);
    final amex = b == 'Amex';
    if (!usingSaved) {
      if (!luhnOk(number)) return 'Enter a valid card number.';
      if (name.trim().length < 2) return 'Enter the name on the card.';
      if (!expOk(exp)) return 'Enter a valid expiry (MM/YY).';
    }
    final cv = digits(cvc);
    if (cv.length != (amex ? 4 : 3)) {
      return amex ? 'Enter the 4-digit CVC.' : 'Enter the 3-digit CVC.';
    }
    return null;
  }

  static Future<void> load({String? email, String? id, String? phone}) async {
    bind(email: email, id: id, phone: phone);
    try {
      final p = await SharedPreferences.getInstance();
      final raw = p.getString(_key()) ?? '[]';
      final list = (jsonDecode(raw) as List)
          .map((e) => SavedCard.fromJson(Map<String, dynamic>.from(e as Map)))
          .where((c) => c.last4.length >= 3)
          .toList();
      notifier.value = list;
    } catch (_) {
      notifier.value = const <SavedCard>[];
    }
  }

  static Future<void> _persist() async {
    try {
      final p = await SharedPreferences.getInstance();
      await p.setString(_key(), jsonEncode(notifier.value.map((c) => c.toJson()).toList()));
    } catch (_) {}
  }

  static Future<SavedCard> add({
    required String number,
    required String name,
    required String exp,
  }) async {
    final d = digits(number);
    final card = SavedCard(
      id: 'c${DateTime.now().millisecondsSinceEpoch}',
      brand: brand(d),
      last4: d.substring(d.length - 4),
      exp: formatExp(exp),
      name: name.trim(),
    );
    final next = [card, ...notifier.value.where((c) => !(c.last4 == card.last4 && c.brand == card.brand))];
    notifier.value = next;
    await _persist();
    return card;
  }

  static Future<void> remove(String id) async {
    notifier.value = notifier.value.where((c) => c.id != id).toList();
    await _persist();
  }

  static Future<Map<String, dynamic>> charge({
    required double amount,
    required double shopCredit,
    required double riderCredit,
    required String brand,
    required String last4,
    String number = '',
  }) async {
    final d = digits(number);
    await Future<void>.delayed(const Duration(milliseconds: 700));
    if (d == '4000000000000002' || d == '4000000000000341') {
      throw Exception('Card declined. Use another card.');
    }
    if (d.length >= 13 && !luhnOk(d)) {
      throw Exception('Card declined.');
    }
    if (amount < 1) throw Exception('Invalid payment amount.');
    final id = 'PAY-${DateTime.now().millisecondsSinceEpoch.toRadixString(36).toUpperCase()}';
    return {
      'ok': true,
      'paymentId': id,
      'status': 'captured',
      'amount': amount.round(),
      'shopCredit': shopCredit.round(),
      'riderCredit': riderCredit.round(),
      'brand': brand,
      'last4': last4,
      'paidAt': DateTime.now().toIso8601String(),
    };
  }

  static bool paidByCard(String? method) {
    final m = (method ?? '').toLowerCase();
    if (m.contains('cash')) return false;
    return m.contains('visa') ||
        m.contains('master') ||
        m.contains('amex') ||
        m.contains('card') ||
        m.contains('••••') ||
        m.contains('unionpay') ||
        m.contains('jcb');
  }
}
