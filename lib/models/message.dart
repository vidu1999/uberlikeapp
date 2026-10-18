class ChatMessage {
  final String id;
  final String from;
  final String role;
  final String text;
  final int ts;
  final String? thread;
  const ChatMessage({
    required this.id,
    required this.from,
    required this.role,
    required this.text,
    required this.ts,
    this.thread,
  });

  factory ChatMessage.fromJson(Map<String, dynamic> j) => ChatMessage(
        id: '${j['id']}',
        from: '${j['from'] ?? j['sender'] ?? ''}',
        role: '${j['role'] ?? ''}',
        text: '${j['text'] ?? j['body'] ?? ''}',
        ts: (j['ts'] as num?)?.toInt() ?? 0,
        thread: j['thread']?.toString(),
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
  final String? shopId;
  final String? shopName;
  const SessionUser({
    required this.id,
    required this.name,
    required this.phone,
    required this.role,
    this.address,
    this.vehicle,
    this.shopId,
    this.shopName,
  });

  factory SessionUser.fromJson(Map<String, dynamic> j) => SessionUser(
        id: '${j['id']}',
        name: '${j['name']}',
        phone: '${j['phone'] ?? ''}',
        role: '${j['role']}',
        address: j['address']?.toString(),
        vehicle: j['vehicle']?.toString(),
        shopId: (j['shopId'] ?? j['shop_id'])?.toString(),
        shopName: (j['shopName'] ?? j['shop_name'])?.toString(),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'phone': phone,
        'role': role,
        'address': address,
        'vehicle': vehicle,
        'shopId': shopId,
        'shop_id': shopId,
        'shopName': shopName,
        'shop_name': shopName,
      };
}
