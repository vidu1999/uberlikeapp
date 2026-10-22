import 'package:flutter/material.dart';
import '../../config.dart';
import '../../data/repository.dart';
import '../../models/order.dart';
import '../../theme.dart';

class DeliveredScreen extends StatefulWidget {
  final Order order;
  const DeliveredScreen({super.key, required this.order});

  @override
  State<DeliveredScreen> createState() => _DeliveredScreenState();
}

class _DeliveredScreenState extends State<DeliveredScreen> {
  late int _shop;
  late int _rider;
  late Map<String, int> _items;
  bool _busy = false;
  String? _err;

  Order get order => OrderRepository.instance.byId(widget.order.id) ?? widget.order;
  bool get locked => order.rated;

  List<DeliveryItem> get lines {
    final seen = <String>{};
    final out = <DeliveryItem>[];
    for (final it in order.items) {
      final k = it.rateKey;
      if (k.isEmpty || !seen.add(k)) continue;
      out.add(it);
    }
    return out;
  }

  bool get hasRider =>
      (order.riderId != null && order.riderId!.isNotEmpty) ||
      (order.riderName != null && order.riderName!.isNotEmpty);

  @override
  void initState() {
    super.initState();
    _from(widget.order);
  }

  @override
  void didUpdateWidget(DeliveredScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.order.rated && !oldWidget.order.rated) _from(widget.order);
  }

  void _from(Order o) {
    _shop = o.shopRating;
    _rider = o.riderRating;
    _items = Map<String, int>.from(o.itemRatings);
  }

  Future<void> _submit() async {
    if (locked || _busy) return;
    if (_shop < 1) {
      setState(() => _err = 'Tap stars to rate the shop.');
      return;
    }
    setState(() {
      _busy = true;
      _err = null;
    });
    try {
      await OrderRepository.instance.rateOrder(
        orderId: order.id,
        shopStars: _shop,
        riderStars: hasRider ? _rider : 0,
        itemStars: _items,
      );
      if (!mounted) return;
      setState(() {
        _busy = false;
        _from(OrderRepository.instance.byId(order.id) ?? order);
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _err = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  void _home() => Navigator.popUntil(context, (r) => r.isFirst);

  Widget _stars(int value, ValueChanged<int>? onPick) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(5, (i) {
        final n = i + 1;
        return GestureDetector(
          onTap: onPick == null ? null : () => onPick(n),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 1),
            child: Icon(
              Icons.star_rounded,
              size: 30,
              color: n <= value ? Brand.star : const Color(0xFFE5E7EB),
            ),
          ),
        );
      }),
    );
  }

  Widget _row(String label, String name, int value, ValueChanged<int>? onPick) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: const TextStyle(color: Brand.muted, fontSize: 12, fontWeight: FontWeight.w700)),
                Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
              ],
            ),
          ),
          _stars(value, onPick),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final base = AppConfig.normalize(AppConfig.baseUrl);
    final art = base.isEmpty ? null : '$base/img/delivered-hero.jpg';
    final canPick = !locked && !_busy;
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(24, 24, 24, 16),
          children: [
            const SizedBox(height: 12),
            Center(
              child: Container(
                width: 88,
                height: 88,
                decoration: const BoxDecoration(color: Brand.green, shape: BoxShape.circle),
                child: const Icon(Icons.check, color: Colors.white, size: 48),
              ),
            ),
            const SizedBox(height: 18),
            const Text('Order Delivered!', textAlign: TextAlign.center, style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            const Text('Your food has been delivered successfully.', textAlign: TextAlign.center, style: TextStyle(color: Brand.muted)),
            const SizedBox(height: 16),
            if (art != null)
              ClipRRect(
                borderRadius: BorderRadius.circular(24),
                child: Image.network(art, height: 140, width: double.infinity, fit: BoxFit.cover, errorBuilder: (_, __, ___) => const SizedBox(height: 8)),
              ),
            const SizedBox(height: 18),
            Text(locked ? 'Thanks for rating' : 'Rate your order', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
            _row('Shop', order.shopName.isEmpty ? 'Shop' : order.shopName, _shop, canPick ? (n) => setState(() { _shop = n; _err = null; }) : null),
            ...lines.map((it) => _row(
                  'Item',
                  it.name,
                  _items[it.rateKey] ?? 0,
                  canPick ? (n) => setState(() { _items[it.rateKey] = n; _err = null; }) : null,
                )),
            if (hasRider)
              _row('Rider', order.riderName?.isNotEmpty == true ? order.riderName! : 'Rider', _rider, canPick ? (n) => setState(() { _rider = n; _err = null; }) : null),
            if (_err != null) ...[
              const SizedBox(height: 6),
              Text(_err!, style: const TextStyle(color: Brand.red, fontWeight: FontWeight.w600)),
            ],
            const SizedBox(height: 16),
            if (!locked)
              SizedBox(
                height: 54,
                child: FilledButton(
                  style: FilledButton.styleFrom(backgroundColor: Brand.green, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28))),
                  onPressed: _busy ? null : _submit,
                  child: Text(_busy ? 'Saving…' : 'Submit ratings', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                ),
              ),
            if (!locked) const SizedBox(height: 10),
            SizedBox(
              height: 54,
              child: FilledButton(
                style: FilledButton.styleFrom(backgroundColor: locked ? Brand.green : Brand.ink, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28))),
                onPressed: _home,
                child: const Text('Done', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
              ),
            ),
            TextButton(
              onPressed: _home,
              child: const Text('View Order Details', style: TextStyle(color: Brand.green, fontWeight: FontWeight.w700)),
            ),
          ],
        ),
      ),
    );
  }
}
