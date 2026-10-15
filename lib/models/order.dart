import 'package:flutter/material.dart';

enum OrderStatus { pending, preparing, ready, onTheWay, delivered, cancelled }

extension OrderStatusX on OrderStatus {
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
}

class DeliveryItem {
  final String name;
  final int qty;
  final double price;
  const DeliveryItem({required this.name, required this.qty, required this.price});

  double get total => price * qty;

  Map<String, dynamic> toJson() => {
        'name': name,
        'qty': qty,
        'price': price,
      };

  factory DeliveryItem.fromJson(Map<String, dynamic> j) => DeliveryItem(
        name: j['name'] as String,
        qty: j['qty'] as int,
        price: (j['price'] as num).toDouble(),
      );
}

class Order {
  final String id;
  final String userId;
  final String shopId;
  String? riderId;
  OrderStatus status;
  final List<DeliveryItem> items;
  final double totalAmount;
  final double deliveryLat;
  final double deliveryLng;
  double? riderLat;
  double? riderLng;
  final DateTime timestamp;
  final String shopName;
  final String customerName;

  Order({
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
  });

  Order copyWith({
    OrderStatus? status,
    String? riderId,
    double? riderLat,
    double? riderLng,
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
    );
  }
}
