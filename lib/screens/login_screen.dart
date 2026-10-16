import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
  final List<TextEditingController> _digits =
      List.generate(4, (_) => TextEditingController());
  final List<FocusNode> _focus = List.generate(4, (_) => FocusNode());
  bool busy = false;
  bool codeStep = false;
  String? error;
  String? smsBody;
  String phoneSent = '';

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

  @override
  void dispose() {
    _phone.dispose();
    for (final c in _digits) {
      c.dispose();
    }
    for (final f in _focus) {
      f.dispose();
    }
    super.dispose();
  }

  String get _title {
    if (codeStep) return 'Enter the 4-digit code';
    if (widget.role == UserRole.customer) return 'Enter your mobile number';
    if (widget.role == UserRole.shop) return 'Shop sign in';
    return 'Deliver sign in';
  }

  String get _apiRole {
    if (widget.role == UserRole.customer) return 'customer';
    if (widget.role == UserRole.shop) return 'shop';
    return 'rider';
  }

  String get _code => _digits.map((c) => c.text).join();

  void _download(String app) {
    final url = app == 'shop'
        ? 'https://github.com/vidu1999/uberlikeapp/releases/download/swiftdrop-1.0.0/shop.apk'
        : 'https://github.com/vidu1999/uberlikeapp/releases/download/swiftdrop-1.0.0/rider.apk';
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(app == 'shop' ? 'Shop Owner app' : 'Rider app'),
        content: Text('Download the ${app == 'shop' ? 'Shop' : 'Rider'} APK:\n$url'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Close')),
        ],
      ),
    );
  }

  Future<void> _send() async {
    setState(() {
      busy = true;
      error = null;
      smsBody = null;
    });
    AppConfig.baseUrl = AppConfig.normalize(AppConfig.baseUrl);
    try {
      final data = await OrderRepository.instance.sendOtp(_apiRole, _phone.text);
      if (!mounted) return;
      phoneSent = data?['phone']?.toString() ?? _phone.text;
      setState(() {
        busy = false;
        codeStep = true;
        smsBody = 'Open WhatsApp. We sent the 4-digit code to this number.';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        busy = false;
        error = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  Future<void> _verify() async {
    if (_code.length != 4) {
      setState(() => error = 'Enter the 4-digit WhatsApp code');
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    final ok = await OrderRepository.instance.verifyOtp(_apiRole, phoneSent, _code);
    if (!mounted) return;
    setState(() => busy = false);
    if (!ok) {
      setState(() => error = 'That code does not match this phone number.');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        foregroundColor: Colors.black,
        elevation: 0,
        actions: const [SettingsButton()],
      ),
      body: Stack(
        children: [
          ListView(
            padding: const EdgeInsets.all(24),
            children: [
              const Text.rich(TextSpan(children: [
                TextSpan(text: 'Quick', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 22)),
                TextSpan(text: 'Bite', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 22, color: Color(0xFF00C853))),
              ])),
              const SizedBox(height: 12),
              const Text(
                '1 Phone   2 WhatsApp   3 Code',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12, color: Colors.black54),
              ),
              const SizedBox(height: 20),
              Text(_title, style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800)),
              const SizedBox(height: 8),
              Text(
                codeStep
                    ? 'WhatsApp sent to $phoneSent'
                    : 'We’ll send a 4-digit code on WhatsApp to this number. Then you enter the app.',
                style: const TextStyle(color: Colors.black54),
              ),
              const SizedBox(height: 20),
              if (!codeStep)
                TextField(
                  controller: _phone,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(
                    prefixText: '+94  ',
                    labelText: 'Mobile number',
                    border: OutlineInputBorder(),
                  ),
                )
              else ...[
                ClipRRect(
                  borderRadius: BorderRadius.circular(16),
                  child: Container(
                  color: const Color(0xFFECE5DD),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(12),
                        color: const Color(0xFF075E54),
                        child: const Text('QuickBite  ·  WhatsApp',
                            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(12),
                        child: Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(smsBody ?? 'Sending…'),
                        ),
                      ),
                    ],
                  ),
                ),
                ),
                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: List.generate(4, (i) {
                    return SizedBox(
                      width: 64,
                      height: 72,
                      child: TextField(
                        controller: _digits[i],
                        focusNode: _focus[i],
                        textAlign: TextAlign.center,
                        keyboardType: TextInputType.number,
                        style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800),
                        inputFormatters: [
                          LengthLimitingTextInputFormatter(1),
                          FilteringTextInputFormatter.digitsOnly,
                        ],
                        decoration: const InputDecoration(border: OutlineInputBorder()),
                        onChanged: (v) {
                          if (v.isNotEmpty && i < 3) _focus[i + 1].requestFocus();
                          if (_code.length == 4) _verify();
                        },
                      ),
                    );
                  }),
                ),
              ],
              if (error != null) ...[
                const SizedBox(height: 12),
                Text(error!, style: const TextStyle(color: Color(0xFFB91C1C))),
              ],
              const SizedBox(height: 20),
              FilledButton(
                style: FilledButton.styleFrom(backgroundColor: Colors.black, minimumSize: const Size.fromHeight(48)),
                onPressed: busy ? null : (codeStep ? _verify : _send),
                child: Text(busy
                    ? (codeStep ? 'Checking…' : 'Sending WhatsApp…')
                    : (codeStep ? 'Verify & enter' : 'Continue')),
              ),
              if (codeStep) ...[
                const SizedBox(height: 8),
                TextButton(
                  onPressed: busy
                      ? null
                      : () {
                          setState(() => codeStep = false);
                          _send();
                        },
                  child: const Text('Resend on WhatsApp'),
                ),
                TextButton(
                  onPressed: () => setState(() => codeStep = false),
                  child: const Text('Change number'),
                ),
              ],
              const SizedBox(height: 12),
              const ConnectionBanner(),
              if (widget.role == UserRole.customer && !codeStep) ...[
                const SizedBox(height: 24),
                const Text('Create Account', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: FilledButton(
                        style: FilledButton.styleFrom(backgroundColor: const Color(0xFF00C853)),
                        onPressed: busy ? null : _send,
                        child: const Text('Customer'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => _download('shop'),
                        child: const Text('Shop Owner'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => _download('rider'),
                        child: const Text('Rider'),
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
          if (smsBody != null)
            Positioned(
              top: 8,
              left: 16,
              right: 16,
              child: Material(
                elevation: 8,
                borderRadius: BorderRadius.circular(16),
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('WhatsApp', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Colors.black54)),
                          Text('now', style: TextStyle(fontSize: 11, color: Colors.black54)),
                        ],
                      ),
                      const SizedBox(height: 4),
                      const Text('Good Food', style: TextStyle(fontWeight: FontWeight.w800)),
                      Text(smsBody!),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
