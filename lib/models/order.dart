import 'package:flutter/material.dart';

enum OrderStatus { pending, preparing, ready, onTheWay, delivered, cancelled }

extension OrderStatusX on OrderStatus {
  String get apiName {
    switch (this) {
      case OrderStatus.onTheWay:
        return 'on_the_way';
      default:
        return name;
    }
  }

  String get label {
    switch (this) {
      case OrderStatus.pending:
        return 'Pending';
      case OrderStatus.preparing:
        return 'Preparing';
      case OrderStatus.ready:
        return 'Ready for Pickup';
      case OrderStatus.onTheWay:
        return 'On The Way';
      case OrderStatus.delivered:
        return 'Delivered';
      case OrderStatus.cancelled:
        return 'Cancelled';
    }
  }

  Color get color {
    switch (this) {
      case OrderStatus.pending:
        return Colors.orange;
      case OrderStatus.preparing:
        return Colors.blue;
      case OrderStatus.ready:
        return Colors.purple;
      case OrderStatus.onTheWay:
        return Colors.teal;
      case OrderStatus.delivered:
        return Colors.green;
      case OrderStatus.cancelled:
        return Colors.red;
    }
  }

  int get step {
    switch (this) {
      case OrderStatus.pending:
        return 0;
      case OrderStatus.preparing:
        return 1;
      case OrderStatus.ready:
        return 2;
      case OrderStatus.onTheWay:
        return 3;
      case OrderStatus.delivered:
        return 4;
      case OrderStatus.cancelled:
        return 0;
    }
  }

  static OrderStatus fromApi(String? raw) {
    switch (raw) {
      case 'preparing':
        return OrderStatus.preparing;
      case 'ready':
        return OrderStatus.ready;
      case 'on_the_way':
      case 'onTheWay':
        return OrderStatus.onTheWay;
      case 'delivered':
        return OrderStatus.delivered;
      case 'cancelled':
        return OrderStatus.cancelled;
      default:
        return OrderStatus.pending;
    }
  }
}

class DeliveryItem {
  final String name;
  final int qty;
  final double price;
  const DeliveryItem({required this.name, required this.qty, required this.price});

  double get total => price * qty;

  Map<String, dynamic> toJson() => {'name': name, 'qty': qty, 'price': price};

  factory DeliveryItem.fromJson(Map<String, dynamic> j) => DeliveryItem(
        name: '${j['name']}',
        qty: (j['qty'] as num?)?.toInt() ?? 1,
        price: (j['price'] as num?)?.toDouble() ?? 0,
      );
}

class Order {
  final String id;
  final String userId;
  final String shopId;
  final String? riderId;
  final OrderStatus status;
  final List<DeliveryItem> items;
  final double totalAmount;
  final double deliveryLat;
  final double deliveryLng;
  final double? riderLat;
  final double? riderLng;
  final DateTime timestamp;
  final String shopName;
  final String customerName;
  final String? riderName;
  final String? riderPhone;

  const Order({
    required this.id,
    required this.userId,
    required this.shopId,
    this.riderId,
    this.status = OrderStatus.pending,
    required this.items,
    required this.totalAmount,
    required this.deliveryLat,
    required this.deliveryLng,
    this.riderLat,
    this.riderLng,
    required this.timestamp,
    required this.shopName,
    required this.customerName,
    this.riderName,
    this.riderPhone,
  });

  Order copyWith({
    OrderStatus? status,
    String? riderId,
    double? riderLat,
    double? riderLng,
    String? riderName,
  }) {
    return Order(
      id: id,
      userId: userId,
      shopId: shopId,
      riderId: riderId ?? this.riderId,
      status: status ?? this.status,
      items: items,
      totalAmount: totalAmount,
      deliveryLat: deliveryLat,
      deliveryLng: deliveryLng,
      riderLat: riderLat ?? this.riderLat,
      riderLng: riderLng ?? this.riderLng,
      timestamp: timestamp,
      shopName: shopName,
      customerName: customerName,
      riderName: riderName ?? this.riderName,
      riderPhone: this.riderPhone,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'userId': userId,
        'shopId': shopId,
        'riderId': riderId,
        'status': status.apiName,
        'items': items.map((e) => e.toJson()).toList(),
        'totalAmount': totalAmount,
        'deliveryLat': deliveryLat,
        'deliveryLng': deliveryLng,
        'riderLat': riderLat,
        'riderLng': riderLng,
        'timestamp': timestamp.toIso8601String(),
        'shopName': shopName,
        'customerName': customerName,
        'riderName': riderName,
      };

  factory Order.fromJson(Map<String, dynamic> j) {
    final itemsRaw = (j['items'] as List?) ?? const [];
    return Order(
      id: '${j['id']}',
      userId: '${j['userId'] ?? 'USER_1'}',
      shopId: '${j['shopId']}',
      riderId: j['riderId']?.toString(),
      status: OrderStatusX.fromApi(j['status']?.toString()),
      items: itemsRaw
          .map((e) => DeliveryItem.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList(),
      totalAmount: (j['totalAmount'] as num?)?.toDouble() ?? 0,
      deliveryLat: (j['deliveryLat'] as num?)?.toDouble() ?? 6.9271,
      deliveryLng: (j['deliveryLng'] as num?)?.toDouble() ?? 79.8612,
      riderLat: (j['riderLat'] as num?)?.toDouble(),
      riderLng: (j['riderLng'] as num?)?.toDouble(),
      timestamp: DateTime.tryParse('${j['timestamp'] ?? ''}') ?? DateTime.now(),
      shopName: '${j['shopName'] ?? ''}',
      customerName: '${j['customerName'] ?? ''}',
      riderName: j['riderName']?.toString(),
      riderPhone: j['riderPhone']?.toString(),
    );
  }
}
