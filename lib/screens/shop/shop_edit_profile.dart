import 'package:flutter/material.dart';
import '../../config.dart';
import '../../data/repository.dart';
import '../../models/shop.dart';
import '../../theme.dart';

class ShopEditProfile extends StatefulWidget {
  final Shop shop;
  final String about;
  const ShopEditProfile({super.key, required this.shop, required this.about});

  @override
  State<ShopEditProfile> createState() => _ShopEditProfileState();
}

class _ShopEditProfileState extends State<ShopEditProfile> {
  late final _name = TextEditingController(text: widget.shop.name);
  late final _cat = TextEditingController(text: widget.shop.category);
  late final _hours = TextEditingController(text: widget.shop.hours ?? '08:00 AM – 10:00 PM');
  late final _about = TextEditingController(text: widget.about);
  late String? _image = widget.shop.image;
  bool saving = false;
  String? err;

  static const photos = [
    '/img/shop-bakery.jpg',
    '/img/shop-burger.jpg',
    '/img/shop-pizza.jpg',
    '/img/shop-coffee.jpg',
    '/img/shop-dessert.jpg',
  ];

  String? _url(String? path) {
    if (path == null || path.isEmpty) return null;
    if (path.startsWith('http') || path.startsWith('data:')) return path;
    final base = AppConfig.normalize(AppConfig.baseUrl);
    if (base.isEmpty) return null;
    return '$base$path';
  }

  @override
  void dispose() {
    _name.dispose();
    _cat.dispose();
    _hours.dispose();
    _about.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_name.text.trim().isEmpty) {
      setState(() => err = 'Enter a shop name.');
      return;
    }
    setState(() {
      saving = true;
      err = null;
    });
    await OrderRepository.instance.saveShop(
      id: widget.shop.id,
      name: _name.text.trim(),
      category: _cat.text.trim().isEmpty ? 'Bakery' : _cat.text.trim(),
      hours: _hours.text.trim(),
      about: _about.text.trim(),
      image: _image,
      isOpen: widget.shop.isOpen,
    );
    if (!mounted) return;
    Navigator.pop(context, true);
  }

  @override
  Widget build(BuildContext context) {
    return Theme(
      data: Brand.light(),
      child: Scaffold(
        backgroundColor: Colors.white,
        appBar: AppBar(title: const Text('Edit Profile', style: TextStyle(fontWeight: FontWeight.w800))),
        body: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          children: [
            GestureDetector(
              onTap: () => setState(() => _image = photos[(photos.indexOf(_image ?? '') + 1) % photos.length]),
              child: Container(
                height: 140,
                decoration: BoxDecoration(color: Brand.search, borderRadius: BorderRadius.circular(18)),
                child: const Center(child: Text('Tap to change photo', style: TextStyle(color: Brand.muted, fontWeight: FontWeight.w700))),
              ),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: photos.map((p) {
                final on = _image == p;
                return GestureDetector(
                  onTap: () => setState(() => _image = p),
                  child: Container(
                    width: 56,
                    height: 56,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: on ? Brand.green : const Color(0xFFE5E7EB), width: 2),
                    ),
                    clipBehavior: Clip.antiAlias,
                    child: _url(p) == null
                        ? Container(color: Brand.search)
                        : Image.network(_url(p)!, fit: BoxFit.cover, errorBuilder: (_, __, ___) => Container(color: Brand.search)),
                  ),
                );
              }).toList(),
            ),
            const SizedBox(height: 14),
            TextField(controller: _name, decoration: const InputDecoration(labelText: 'Shop Name', border: OutlineInputBorder())),
            const SizedBox(height: 10),
            TextField(controller: _cat, decoration: const InputDecoration(labelText: 'Category', border: OutlineInputBorder())),
            const SizedBox(height: 10),
            TextField(controller: _hours, decoration: const InputDecoration(labelText: 'Business Hours', border: OutlineInputBorder())),
            const SizedBox(height: 10),
            TextField(controller: _about, maxLines: 4, decoration: const InputDecoration(labelText: 'About Us', border: OutlineInputBorder())),
            if (err != null) ...[const SizedBox(height: 8), Text(err!, style: const TextStyle(color: Color(0xFFB91C1C)))],
            const SizedBox(height: 16),
            SizedBox(
              height: 52,
              child: FilledButton(
                style: FilledButton.styleFrom(backgroundColor: Brand.green),
                onPressed: saving ? null : _save,
                child: Text(saving ? 'Saving…' : 'Save Profile', style: const TextStyle(fontWeight: FontWeight.w800)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
