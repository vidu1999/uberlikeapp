import 'package:flutter/material.dart';
import '../app.dart';
import '../config.dart';
import '../data/repository.dart';
import '../widgets/settings_button.dart';

class LoginScreen extends StatefulWidget {
  final UserRole role;
  const LoginScreen({super.key, required this.role});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  late final TextEditingController _phone;
  final _pin = TextEditingController(text: '1234');
  bool busy = false;
  String? error;

  @override
  void initState() {
    super.initState();
    final phone = widget.role == UserRole.customer
        ? '0771234567'
        : widget.role == UserRole.shop
            ? '0772223333'
            : '0775556666';
    _phone = TextEditingController(text: phone);
  }

  String get _title {
    if (widget.role == UserRole.customer) return 'Food in minutes.';
    if (widget.role == UserRole.shop) return 'Kitchen board';
    return 'Ride. Earn. Deliver.';
  }

  String get _apiRole {
    if (widget.role == UserRole.customer) return 'customer';
    if (widget.role == UserRole.shop) return 'shop';
    return 'rider';
  }

  Future<void> _login() async {
    setState(() {
      busy = true;
      error = null;
    });
    if (AppConfig.baseUrl.isEmpty) {
      setState(() {
        busy = false;
        error = 'Paste the SwiftDrop server URL (cloud icon) first.';
      });
      return;
    }
    final ok = await OrderRepository.instance.login(_apiRole, phone: _phone.text, pin: _pin.text);
    if (!mounted) return;
    setState(() => busy = false);
    if (!ok) {
      setState(() => error = 'Login failed. Demo PIN is 1234. Is the server URL correct?');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0B0F14),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        foregroundColor: Colors.white,
        actions: const [SettingsButton()],
      ),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const CircleAvatar(
            radius: 28,
            backgroundColor: Color(0xFF00C853),
            child: Text('S', style: TextStyle(fontWeight: FontWeight.bold, color: Colors.black)),
          ),
          const SizedBox(height: 16),
          Text(_title, style: const TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          const Text('Colombo live tracking · PIN 1234', style: TextStyle(color: Colors.white54)),
          const SizedBox(height: 24),
          TextField(
            controller: _phone,
            style: const TextStyle(color: Colors.white),
            decoration: const InputDecoration(
              labelText: 'Phone',
              labelStyle: TextStyle(color: Colors.white70),
              enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Colors.white24)),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _pin,
            obscureText: true,
            style: const TextStyle(color: Colors.white),
            decoration: const InputDecoration(
              labelText: 'PIN',
              labelStyle: TextStyle(color: Colors.white70),
              enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Colors.white24)),
            ),
          ),
          if (error != null) ...[
            const SizedBox(height: 12),
            Text(error!, style: const TextStyle(color: Colors.orangeAccent)),
          ],
          const SizedBox(height: 20),
          FilledButton(onPressed: busy ? null : _login, child: Text(busy ? 'Connecting…' : 'Continue')),
          const SizedBox(height: 12),
          const ConnectionBanner(),
        ],
      ),
    );
  }
}
