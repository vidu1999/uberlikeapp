import 'package:flutter/material.dart';
import '../../config.dart';
import '../../data/repository.dart';
import '../../models/shop.dart';
import '../../theme.dart';

class ShopItemEdit extends StatefulWidget {
  final CatalogItem? item;
  const ShopItemEdit({super.key, this.item});

  @override
  State<ShopItemEdit> createState() => _ShopItemEditState();
}

class _ShopItemEditState extends State<ShopItemEdit> {
  static const photos = [
    '/img/shop-burger.jpg',
    '/img/shop-pizza.jpg',
    '/img/shop-bakery.jpg',
    '/img/cake-chocolate.jpg',
    '/img/cake-vanilla.jpg',
    '/img/iced-coffee.jpg',
    '/img/kottu.jpg',
    '/img/cookies.jpg',
  ];

  late final _name = TextEditingController(text: widget.item?.name ?? '');
  late final _price = TextEditingController(text: widget.item == null ? '' : widget.item!.price.toStringAsFixed(0));
  late final _desc = TextEditingController(text: widget.item?.desc ?? '');
  late String _cat = widget.item?.category ?? 'Food';
  late String? _image = widget.item?.image;
  bool saving = false;
  String? err;

  String? _url(String? path) {
    if (path == null || path.isEmpty) return null;
    if (path.startsWith('http') || path.startsWith('data:')) return path;
    final base = AppConfig.normalize(AppConfig.baseUrl);
    if (base.isEmpty) return null;
    return '$base$path';
  }

  Future<void> _save() async {
    if (_name.text.trim().isEmpty) {
      setState(() => err = 'Enter an item name.');
      return;
    }
    setState(() {
      saving = true;
      err = null;
    });
    await OrderRepository.instance.saveItem(
      id: widget.item?.id,
      name: _name.text.trim(),
      price: double.tryParse(_price.text) ?? 0,
      category: _cat,
      desc: _desc.text.trim(),
      image: _image,
      shopId: widget.item?.shopId ?? OrderRepository.instance.user?.shopId ?? 'SHOP_1',
    );
    if (!mounted) return;
    Navigator.pop(context, true);
  }

  @override
  void dispose() {
    _name.dispose();
    _price.dispose();
    _desc.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final img = _url(_image);
    return Theme(
      data: Brand.light(),
      child: Scaffold(
        backgroundColor: Colors.white,
        appBar: AppBar(
          title: Text(widget.item == null ? 'Add Menu Item' : 'Edit Item', style: const TextStyle(fontWeight: FontWeight.w800)),
        ),
        body: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
          children: [
            Center(
              child: GestureDetector(
                onTap: () {},
                child: Container(
                  width: 120,
                  height: 120,
                  decoration: BoxDecoration(
                    color: Brand.search,
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: const Color(0xFFD1D5DB), style: BorderStyle.solid),
                    image: img != null ? DecorationImage(image: NetworkImage(img), fit: BoxFit.cover) : null,
                  ),
                  child: img == null
                      ? const Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.add_a_photo_outlined, color: Brand.soft),
                            SizedBox(height: 6),
                            Text('Tap to add image', textAlign: TextAlign.center, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Brand.soft)),
                          ],
                        )
                      : null,
                ),
              ),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: photos.map((p) {
                final on = _image == p;
                final u = _url(p);
                return GestureDetector(
                  onTap: () => setState(() => _image = p),
                  child: Container(
                    width: 64,
                    height: 64,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: on ? Brand.green : Colors.transparent, width: 2),
                      image: u != null ? DecorationImage(image: NetworkImage(u), fit: BoxFit.cover) : null,
                    ),
                  ),
                );
              }).toList(),
            ),
            const SizedBox(height: 16),
            const Text('Item Name', style: TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 6),
            TextField(controller: _name, decoration: InputDecoration(hintText: 'e.g. Chocolate Cake', border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)))),
            const SizedBox(height: 12),
            const Text('Price (Rs.)', style: TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 6),
            TextField(controller: _price, keyboardType: TextInputType.number, decoration: InputDecoration(hintText: '2500', border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)))),
            const SizedBox(height: 12),
            const Text('Category', style: TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 6),
            DropdownButtonFormField<String>(
              value: ['Food', 'Drinks', 'Desserts', 'Bakery', 'Pizza', 'Fast Food', 'Beverages'].contains(_cat) ? _cat : 'Food',
              items: const ['Food', 'Drinks', 'Desserts', 'Bakery', 'Pizza', 'Fast Food', 'Beverages']
                  .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                  .toList(),
              onChanged: (v) => setState(() => _cat = v ?? 'Food'),
              decoration: InputDecoration(border: OutlineInputBorder(borderRadius: BorderRadius.circular(14))),
            ),
            const SizedBox(height: 12),
            const Text('Description', style: TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 6),
            TextField(
              controller: _desc,
              maxLines: 3,
              decoration: InputDecoration(hintText: 'e.g. Rich chocolate cake with cream', border: OutlineInputBorder(borderRadius: BorderRadius.circular(14))),
            ),
            if (err != null) ...[
              const SizedBox(height: 10),
              Text(err!, style: const TextStyle(color: Color(0xFFB91C1C), fontWeight: FontWeight.w600)),
            ],
            const SizedBox(height: 18),
            SizedBox(
              height: 52,
              child: FilledButton(
                style: FilledButton.styleFrom(backgroundColor: Brand.green, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28))),
                onPressed: saving ? null : _save,
                child: Text(saving ? 'Saving…' : 'Save Item', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
