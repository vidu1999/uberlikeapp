import 'package:flutter/material.dart';
import '../../data/repository.dart';
import '../../theme.dart';
import 'order_tracking_screen.dart';

class CheckoutScreen extends StatefulWidget {
  const CheckoutScreen({super.key});

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  final _addr = TextEditingController(text: 'No.123, Lake View Road, Anuradhapura');
  String ship = 'standard';
  String pay = 'Cash on delivery';
  bool placing = false;

  int get fee => ship == 'express' ? 360 : 200;

  Future<void> _place() async {
    setState(() => placing = true);
    final order = await OrderRepository.instance.checkout(address: _addr.text, paymentMethod: pay);
    if (!mounted) return;
    setState(() => placing = false);
    if (order == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not place order.')));
      return;
    }
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (_) => OrderTrackingScreen(orderId: order.id)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final sub = OrderRepository.instance.cartTotal;
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(title: const Text('Checkout', style: TextStyle(fontWeight: FontWeight.w800))),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text('Delivery Address', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
          const SizedBox(height: 8),
          TextField(
            controller: _addr,
            maxLines: 2,
            decoration: InputDecoration(
              prefixIcon: const Icon(Icons.location_on, color: Brand.green),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(16)),
            ),
          ),
          const SizedBox(height: 18),
          const Text('Delivery Type', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
          RadioListTile<String>(
            value: 'standard',
            groupValue: ship,
            onChanged: (v) => setState(() => ship = v!),
            title: const Text('Standard (30–45 min)'),
            secondary: const Text('Rs. 200', style: TextStyle(fontWeight: FontWeight.w700)),
            activeColor: Brand.green,
          ),
          RadioListTile<String>(
            value: 'express',
            groupValue: ship,
            onChanged: (v) => setState(() => ship = v!),
            title: const Text('Express (15–25 min)'),
            secondary: const Text('Rs. 360', style: TextStyle(fontWeight: FontWeight.w700)),
            activeColor: Brand.green,
          ),
          const SizedBox(height: 8),
          const Text('Payment Method', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
          RadioListTile<String>(
            value: 'Cash on delivery',
            groupValue: pay,
            onChanged: (v) => setState(() => pay = v!),
            title: const Text('Cash on Delivery'),
            activeColor: Brand.green,
          ),
          RadioListTile<String>(
            value: 'Card on delivery',
            groupValue: pay,
            onChanged: (v) => setState(() => pay = v!),
            title: const Text('Card Payment'),
            activeColor: Brand.green,
          ),
          RadioListTile<String>(
            value: 'wallet',
            groupValue: pay,
            onChanged: null,
            title: const Text('Online Wallet (Coming Soon)'),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              const Text('Total', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
              const Spacer(),
              Text('Rs. ${(sub + fee).toStringAsFixed(0)}', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
            ],
          ),
          const SizedBox(height: 16),
          SizedBox(
            height: 54,
            child: FilledButton(
              style: FilledButton.styleFrom(backgroundColor: Brand.green, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28))),
              onPressed: placing ? null : _place,
              child: Text(placing ? 'Placing…' : 'Place Order', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            ),
          ),
        ],
      ),
    );
  }
}
