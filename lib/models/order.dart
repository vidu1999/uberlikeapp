import 'dart:convert';

import 'package:flutter/material.dart';

enum OrderStatus { pending, preparing, ready, accepted, pickedUp, onTheWay, delivered, cancelled }

extension OrderStatusX on OrderStatus {
  String get apiName {
    switch (this) {
      case OrderStatus.onTheWay:
        return 'on_the_way';
      case OrderStatus.pickedUp:
        return 'picked_up';
      default:
        return name;
    }
  }

  bool get headingToShop => this == OrderStatus.accepted;
  bool get headingToCustomer => this == OrderStatus.pickedUp || this == OrderStatus.onTheWay;
  bool get inRiderJob => headingToShop || headingToCustomer;

  static OrderStatus later(OrderStatus a, OrderStatus b) {
    if (a == OrderStatus.delivered || b == OrderStatus.delivered) return OrderStatus.delivered;
    if (a == OrderStatus.cancelled) return b.step > 0 ? b : a;
    if (b == OrderStatus.cancelled) return a.step > 0 ? a : b;
    return a.step >= b.step ? a : b;
  }

  String get label {
    switch (this) {
      case OrderStatus.pending:
        return 'Waiting for confirm';
      case OrderStatus.preparing:
        return 'Preparing';
      case OrderStatus.ready:
        return 'Ready for Pickup';
      case OrderStatus.accepted:
        return 'Rider accepted';
      case OrderStatus.pickedUp:
      case OrderStatus.onTheWay:
        return 'Picked up';
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
      case OrderStatus.accepted:
        return Colors.blue;
      case OrderStatus.pickedUp:
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
      case OrderStatus.accepted:
        return 3;
      case OrderStatus.pickedUp:
      case OrderStatus.onTheWay:
        return 4;
      case OrderStatus.delivered:
        return 5;
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
      case 'accepted':
        return OrderStatus.accepted;
      case 'picked_up':
      case 'pickedUp':
        return OrderStatus.pickedUp;
      case 'on_the_way':
      case 'onTheWay':
        return OrderStatus.pickedUp;
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
  final String? customerPhone;
  final String? riderName;
  final String? riderPhone;
  final String address;
  final double? shopLat;
  final double? shopLng;
  final String? shopAddress;

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
    this.customerPhone,
    this.riderName,
    this.riderPhone,
    this.address = '',
    this.shopLat,
    this.shopLng,
    this.shopAddress,
  });

  Order copyWith({
    OrderStatus? status,
    String? riderId,
    double? riderLat,
    double? riderLng,
    String? riderName,
    String? riderPhone,
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
      customerPhone: customerPhone,
      riderName: riderName ?? this.riderName,
      riderPhone: riderPhone ?? this.riderPhone,
      address: address,
      shopLat: shopLat,
      shopLng: shopLng,
      shopAddress: shopAddress,
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
        'customerPhone': customerPhone,
        'riderName': riderName,
        'riderPhone': riderPhone,
        'address': address,
        'shopLat': shopLat,
        'shopLng': shopLng,
        'shopAddress': shopAddress,
      };

  factory Order.fromJson(Map<String, dynamic> j) {
    final colStatus = OrderStatusX.fromApi(j['status']?.toString());
    dynamic data = j['data'];
    if (data is String) {
      try {
        data = jsonDecode(data);
      } catch (_) {
        data = null;
      }
    }
    if (data is Map) {
      j = {...j, ...Map<String, dynamic>.from(data)};
    }
    final itemsRaw = (j['items'] as List?) ?? const [];
    return Order(
      id: '${j['id']}',
      userId: '${j['userId'] ?? j['user_id'] ?? ''}',
      shopId: '${j['shopId'] ?? j['shop_id']}',
      riderId: (j['riderId'] ?? j['rider_id'])?.toString(),
      status: OrderStatusX.later(colStatus, OrderStatusX.fromApi(j['status']?.toString())),
      items: itemsRaw
          .map((e) => DeliveryItem.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList(),
      totalAmount: ((j['totalAmount'] ?? j['total_amount']) as num?)?.toDouble() ?? 0,
      deliveryLat: ((j['deliveryLat'] ?? j['delivery_lat']) as num?)?.toDouble() ?? 8.3350,
      deliveryLng: ((j['deliveryLng'] ?? j['delivery_lng']) as num?)?.toDouble() ?? 80.4108,
      riderLat: (j['riderLat'] as num?)?.toDouble(),
      riderLng: (j['riderLng'] as num?)?.toDouble(),
      timestamp: DateTime.tryParse('${j['timestamp'] ?? j['updated_at'] ?? ''}') ?? DateTime.now(),
      shopName: '${j['shopName'] ?? j['shop_name'] ?? ''}',
      customerName: '${j['customerName'] ?? j['customer_name'] ?? ''}',
      customerPhone: (j['customerPhone'] ?? j['customer_phone'])?.toString(),
      riderName: j['riderName']?.toString(),
      riderPhone: j['riderPhone']?.toString(),
      address: '${j['address'] ?? ''}',
      shopLat: j['shopLat'] is num ? (j['shopLat'] as num).toDouble() : double.tryParse('${j['shopLat'] ?? ''}'),
      shopLng: j['shopLng'] is num ? (j['shopLng'] as num).toDouble() : double.tryParse('${j['shopLng'] ?? ''}'),
      shopAddress: j['shopAddress']?.toString(),
    );
  }
}
