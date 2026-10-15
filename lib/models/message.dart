class ChatMessage {
  final String id;
  final String from;
  final String role;
  final String text;
  final int ts;
  const ChatMessage({
    required this.id,
    required this.from,
    required this.role,
    required this.text,
    required this.ts,
  });

  factory ChatMessage.fromJson(Map<String, dynamic> j) => ChatMessage(
        id: '${j['id']}',
        from: '${j['from'] ?? ''}',
        role: '${j['role'] ?? ''}',
        text: '${j['text'] ?? ''}',
        ts: (j['ts'] as num?)?.toInt() ?? 0,
      );
}

class CartLine {
  final String id;
  final String shopId;
  final String name;
  final double price;
  int qty;
  CartLine({
    required this.id,
    required this.shopId,
    required this.name,
    required this.price,
    this.qty = 1,
  });

  Map<String, dynamic> toJson() => {'id': id, 'shopId': shopId, 'name': name, 'price': price, 'qty': qty};
}

class SessionUser {
  final String id;
  final String name;
  final String phone;
  final String role;
  final String? address;
  final String? vehicle;
  const SessionUser({
    required this.id,
    required this.name,
    required this.phone,
    required this.role,
    this.address,
    this.vehicle,
  });

  factory SessionUser.fromJson(Map<String, dynamic> j) => SessionUser(
        id: '${j['id']}',
        name: '${j['name']}',
        phone: '${j['phone'] ?? ''}',
        role: '${j['role']}',
        address: j['address']?.toString(),
        vehicle: j['vehicle']?.toString(),
      );
}
