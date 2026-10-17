import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../app.dart';
import '../config.dart';
import '../data/repository.dart';
import '../theme.dart';
import '../widgets/pin_map.dart';
import '../widgets/settings_button.dart';

class LoginScreen extends StatefulWidget {
  final UserRole role;
  const LoginScreen({super.key, required this.role});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  late final TextEditingController _phone;
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _shopName = TextEditingController();
  final _pw = TextEditingController();
  final _addr = TextEditingController();
  bool _addrDirty = false;
  double? _shopLat;
  double? _shopLng;
  final List<TextEditingController> _digits = List.generate(4, (_) => TextEditingController());
  final List<FocusNode> _focus = List.generate(4, (_) => FocusNode());
  bool busy = false;
  bool codeStep = false;
  bool register = false;
  bool fromRegister = false;
  String regRole = 'customer';
  String? error;
  String phoneSent = '';

  @override
  void initState() {
    super.initState();
    _phone = TextEditingController();
    if (widget.role == UserRole.shop || widget.role == UserRole.rider) {
      _name.text = '';
      _email.text = '';
    }
    if (widget.role == UserRole.rider) regRole = 'rider';
  }

  @override
  void dispose() {
    _phone.dispose();
    _name.dispose();
    _email.dispose();
    _shopName.dispose();
    _pw.dispose();
    _addr.dispose();
    for (final c in _digits) {
      c.dispose();
    }
    for (final f in _focus) {
      f.dispose();
    }
    super.dispose();
  }

  String get _apiRole {
    if (widget.role == UserRole.shop) return 'shop';
    if (widget.role == UserRole.rider) return 'rider';
    return register ? regRole : 'customer';
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
        actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Close'))],
      ),
    );
  }

  Future<void> _send() async {
    if (register && widget.role == UserRole.customer && (regRole == 'shop' || regRole == 'rider')) {
      _download(regRole);
      return;
    }
    if (register && widget.role == UserRole.rider && regRole == 'shop') {
      _download('shop');
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    AppConfig.baseUrl = AppConfig.normalize(AppConfig.baseUrl);
    try {
      if (widget.role == UserRole.shop && !register) {
        final acc = await OrderRepository.instance.findAccount('shop', _phone.text);
        if (!mounted) return;
        if (acc == null) {
          setState(() {
            busy = false;
            register = true;
            fromRegister = true;
          });
          return;
        }
        final p = acc['phone']?.toString();
        if (p != null && p.isNotEmpty) _phone.text = p;
      }
      if (widget.role == UserRole.rider && !register) {
        final acc = await OrderRepository.instance.findAccount('rider', _phone.text);
        if (!mounted) return;
        if (acc == null) {
          setState(() {
            busy = false;
            register = true;
            fromRegister = true;
          });
          return;
        }
        final p = acc['phone']?.toString();
        if (p != null && p.isNotEmpty) _phone.text = p;
      }
      if ((widget.role == UserRole.rider || widget.role == UserRole.customer) && register) {
        if (widget.role == UserRole.rider && (_name.text.trim().isEmpty || _phone.text.trim().isEmpty)) {
          setState(() {
            busy = false;
            error = 'Enter your name and phone.';
          });
          return;
        }
        OrderRepository.instance.pendingRider = {
          'name': _name.text.trim(),
          'phone': _phone.text.trim(),
          'email': _email.text.trim(),
        };
      }
      if (widget.role == UserRole.shop && register) {
        if (_shopName.text.trim().isEmpty || _name.text.trim().isEmpty || _phone.text.trim().isEmpty) {
          setState(() {
            busy = false;
            error = 'Enter shop name, owner name, and phone.';
          });
          return;
        }
        if (_shopLat == null || _shopLng == null) {
          setState(() {
            busy = false;
            error = 'Pin your shop on the map.';
          });
          return;
        }
        if (_addr.text.trim().isEmpty) {
          setState(() {
            busy = false;
            error = 'Enter the shop address.';
          });
          return;
        }
        OrderRepository.instance.pendingShop = {
          'shopName': _shopName.text.trim(),
          'ownerName': _name.text.trim(),
          'phone': _phone.text.trim(),
          'address': _addr.text.trim(),
          'lat': '$_shopLat',
          'lng': '$_shopLng',
        };
      }
      final data = await OrderRepository.instance.sendOtp(_apiRole, _phone.text);
      if (!mounted) return;
      phoneSent = data?['phone']?.toString() ?? _phone.text;
      setState(() {
        busy = false;
        codeStep = true;
        fromRegister = register;
        register = false;
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
    try {
      final ok = await OrderRepository.instance.verifyOtp(_apiRole, phoneSent, _code);
      if (!mounted) return;
      setState(() => busy = false);
      if (!ok) setState(() => error = 'That code does not match this phone number.');
    } catch (e) {
      if (!mounted) return;
      setState(() {
        busy = false;
        error = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (codeStep) return _otp();
    if (register && widget.role == UserRole.shop) return _shopRegister();
    if (register && widget.role == UserRole.rider) return _riderRegister();
    if (register && widget.role == UserRole.customer) return _register();
    if (widget.role == UserRole.shop) return _shopLogin();
    if (widget.role == UserRole.rider) return _riderLogin();
    return _login();
  }

  Widget _login() {
    final shop = widget.role == UserRole.shop;
    final rider = widget.role == UserRole.rider;
    return Scaffold(
      backgroundColor: const Color(0xFF0B1612),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0B1612),
        foregroundColor: Colors.white,
        actions: const [SettingsButton()],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
        children: [
          Center(
            child: Column(
              children: [
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(color: Brand.green, borderRadius: BorderRadius.circular(18)),
                  child: const Icon(Icons.restaurant, color: Colors.white),
                ),
                const SizedBox(height: 10),
                const Text('QuickBite', style: TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w800)),
                const Text('Good Food, Fast Delivery', style: TextStyle(color: Color(0xFF9FE7B8))),
              ],
            ),
          ),
          const SizedBox(height: 28),
          Text(
            shop ? 'Shop sign in' : rider ? 'Deliver sign in' : 'Welcome Back 👋',
            style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 6),
          const Text('We’ll send a 4-digit code on WhatsApp. One phone number = one role.', style: TextStyle(color: Color(0xFF9CA3AF))),
          const SizedBox(height: 20),
          _field(_phone, 'Email or Phone Number', Icons.mail_outline, keyboard: TextInputType.phone),
          if (error != null) ...[
            const SizedBox(height: 10),
            Text(error!, style: const TextStyle(color: Color(0xFFFCA5A5))),
          ],
          const SizedBox(height: 16),
          SizedBox(
            height: 54,
            child: FilledButton(
              style: FilledButton.styleFrom(backgroundColor: Brand.green, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28))),
              onPressed: busy ? null : _send,
              child: Text(busy ? 'Sending WhatsApp…' : 'Sign In', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: Colors.white)),
            ),
          ),
          const SizedBox(height: 18),
          const Center(child: Text('or', style: TextStyle(color: Color(0xFF6B7280)))),
          const SizedBox(height: 12),
          _ghost('Continue with Google'),
          const SizedBox(height: 8),
          _ghost('Continue with Apple'),
          if (widget.role == UserRole.customer) ...[
            const SizedBox(height: 22),
            Center(
              child: TextButton(
                onPressed: () => setState(() => register = true),
                child: const Text.rich(TextSpan(children: [
                  TextSpan(text: "Don't have an account? ", style: TextStyle(color: Color(0xFF9CA3AF))),
                  TextSpan(text: 'Sign Up', style: TextStyle(color: Brand.green, fontWeight: FontWeight.w800)),
                ])),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _register() {
    Widget tab(String id, String label) {
      final on = regRole == id;
      return Expanded(
        child: GestureDetector(
          onTap: () => setState(() => regRole = id),
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 10),
            decoration: BoxDecoration(
              color: on ? Brand.green : Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: on ? Brand.green : const Color(0xFFE5E7EB)),
            ),
            child: Text(label, textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w800, color: on ? Colors.white : Brand.ink, fontSize: 12)),
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        leading: IconButton(icon: const Icon(Icons.arrow_back), onPressed: () => setState(() => register = false)),
        actions: const [SettingsButton()],
      ),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const Text('Create Account', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          const Text('Join QuickBite and start ordering your favorite food.', style: TextStyle(color: Brand.muted)),
          const SizedBox(height: 16),
          Row(children: [tab('customer', 'Customer'), const SizedBox(width: 8), tab('shop', 'Shop Owner'), const SizedBox(width: 8), tab('rider', 'Rider')]),
          const SizedBox(height: 16),
          TextField(controller: _name, decoration: const InputDecoration(labelText: 'Full Name', border: OutlineInputBorder())),
          const SizedBox(height: 10),
          TextField(controller: _phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(prefixText: '+94  ', labelText: 'Phone Number', border: OutlineInputBorder())),
          const SizedBox(height: 10),
          TextField(controller: _email, decoration: const InputDecoration(labelText: 'Email Address', border: OutlineInputBorder())),
          if (error != null) ...[const SizedBox(height: 10), Text(error!, style: const TextStyle(color: Color(0xFFB91C1C)))],
          const SizedBox(height: 16),
          SizedBox(
            height: 54,
            child: FilledButton(
              style: FilledButton.styleFrom(backgroundColor: Brand.green, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28))),
              onPressed: busy ? null : _send,
              child: Text(
                busy
                    ? 'Sending…'
                    : regRole == 'shop'
                        ? 'Get Shop app'
                        : regRole == 'rider'
                            ? 'Get Rider app'
                            : 'Register',
                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
              ),
            ),
          ),
          TextButton(
            onPressed: () => setState(() => register = false),
            child: const Text('Already have an account? Sign In', style: TextStyle(color: Brand.green, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
  }

  Widget _otp() {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => setState(() {
            codeStep = false;
            register = fromRegister;
            error = null;
          }),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const Text('Enter the 4-digit code', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          Text('WhatsApp sent to $phoneSent', style: const TextStyle(color: Brand.muted)),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: const Color(0xFFECE5DD), borderRadius: BorderRadius.circular(16)),
            child: const Text('Open WhatsApp. We sent the 4-digit code to this number.', style: TextStyle(fontWeight: FontWeight.w600)),
          ),
          const SizedBox(height: 20),
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
                  inputFormatters: [LengthLimitingTextInputFormatter(1), FilteringTextInputFormatter.digitsOnly],
                  decoration: const InputDecoration(border: OutlineInputBorder()),
                  onChanged: (v) {
                    if (v.isNotEmpty && i < 3) _focus[i + 1].requestFocus();
                    if (_code.length == 4) _verify();
                  },
                ),
              );
            }),
          ),
          if (error != null) ...[const SizedBox(height: 12), Text(error!, style: const TextStyle(color: Color(0xFFB91C1C)))],
          const SizedBox(height: 20),
          SizedBox(
            height: 54,
            child: FilledButton(
              style: FilledButton.styleFrom(backgroundColor: Brand.green, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28))),
              onPressed: busy ? null : _verify,
              child: Text(busy ? 'Checking…' : 'Verify & enter', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            ),
          ),
          TextButton(onPressed: busy ? null : _send, child: const Text('Resend on WhatsApp')),
        ],
      ),
    );
  }

  Widget _field(TextEditingController c, String hint, IconData icon, {TextInputType? keyboard}) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(color: const Color(0xFF14241C), borderRadius: BorderRadius.circular(16)),
      child: TextField(
        controller: c,
        keyboardType: keyboard,
        style: const TextStyle(color: Colors.white),
        decoration: InputDecoration(
          prefixIcon: Icon(icon, color: const Color(0xFF9CA3AF)),
          hintText: hint,
          hintStyle: const TextStyle(color: Color(0xFF6B7280)),
          border: InputBorder.none,
          contentPadding: const EdgeInsets.symmetric(vertical: 16),
        ),
      ),
    );
  }

  Widget _shopLogin() {
    return Scaffold(
      backgroundColor: Colors.white,
      body: ListView(
        padding: const EdgeInsets.fromLTRB(22, 48, 22, 32),
        children: [
          Center(
            child: Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(color: Brand.green, borderRadius: BorderRadius.circular(16)),
              child: const Icon(Icons.storefront, color: Colors.white, size: 28),
            ),
          ),
          const SizedBox(height: 12),
          const Text('Welcome Back!', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          const Text('Login to your shop account', style: TextStyle(color: Color(0xFF6B7280))),
          const SizedBox(height: 18),
          _lightField(_phone, 'Email or Phone Number', keyboard: TextInputType.phone),
          if (error != null) ...[
            const SizedBox(height: 10),
            Text(error!, style: const TextStyle(color: Color(0xFFB91C1C))),
          ],
          const SizedBox(height: 16),
          SizedBox(
            height: 54,
            child: FilledButton(
              style: FilledButton.styleFrom(backgroundColor: Brand.green, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28))),
              onPressed: busy ? null : _send,
              child: Text(busy ? 'Checking…' : 'Login', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: Colors.white)),
            ),
          ),
          const SizedBox(height: 16),
          const Center(child: Text('or', style: TextStyle(color: Color(0xFF9CA3AF), fontWeight: FontWeight.w600))),
          const SizedBox(height: 10),
          _lightGhost('Continue with Google'),
          const SizedBox(height: 8),
          _lightGhost('Continue with Apple'),
          const SizedBox(height: 18),
          Center(
            child: TextButton(
              onPressed: () => setState(() {
                register = true;
                error = null;
              }),
              child: const Text.rich(TextSpan(children: [
                TextSpan(text: "Don't have an account? ", style: TextStyle(color: Color(0xFF6B7280))),
                TextSpan(text: 'Sign Up', style: TextStyle(color: Brand.green, fontWeight: FontWeight.w800)),
              ])),
            ),
          ),
        ],
      ),
    );
  }

  Widget _shopRegister() {
    return Scaffold(
      backgroundColor: Colors.white,
      body: ListView(
        padding: const EdgeInsets.fromLTRB(22, 48, 22, 32),
        children: [
          Center(
            child: Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(color: Brand.green, borderRadius: BorderRadius.circular(16)),
              child: const Icon(Icons.storefront, color: Colors.white, size: 28),
            ),
          ),
          const SizedBox(height: 12),
          const Text('Create Your Shop Account', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          const Text('Join QuickBite and start receiving orders', style: TextStyle(color: Color(0xFF6B7280))),
          const SizedBox(height: 16),
          _lightField(_shopName, 'Shop Name'),
          const SizedBox(height: 10),
          _lightField(_name, 'Owner Name'),
          const SizedBox(height: 10),
          const Text('Live location', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: Color(0xFF374151))),
          const SizedBox(height: 6),
          PinMap(onChanged: (lat, lng, label) {
            _shopLat = lat;
            _shopLng = lng;
            if (!_addrDirty && label.isNotEmpty) _addr.text = label;
          }),
          const SizedBox(height: 10),
          _lightField(_addr, 'Address', onChanged: (_) => _addrDirty = true),
          const SizedBox(height: 10),
          _lightField(_phone, 'Phone Number', keyboard: TextInputType.phone),
          if (error != null) ...[
            const SizedBox(height: 10),
            Text(error!, style: const TextStyle(color: Color(0xFFB91C1C))),
          ],
          const SizedBox(height: 16),
          SizedBox(
            height: 54,
            child: FilledButton(
              style: FilledButton.styleFrom(backgroundColor: Brand.green, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28))),
              onPressed: busy ? null : _send,
              child: Text(busy ? 'Sending WhatsApp…' : 'Register', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: Colors.white)),
            ),
          ),
          const SizedBox(height: 14),
          Center(
            child: TextButton(
              onPressed: () => setState(() {
                register = false;
                error = null;
              }),
              child: const Text.rich(TextSpan(children: [
                TextSpan(text: 'Already have an account? ', style: TextStyle(color: Color(0xFF6B7280))),
                TextSpan(text: 'Login', style: TextStyle(color: Brand.green, fontWeight: FontWeight.w800)),
              ])),
            ),
          ),
        ],
      ),
    );
  }

  Widget _riderLogin() {
    return Scaffold(
      backgroundColor: const Color(0xFF07140F),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(22, 48, 22, 32),
        children: [
          Center(
            child: Column(
              children: [
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(color: Brand.green, borderRadius: BorderRadius.circular(28)),
                  child: const Icon(Icons.delivery_dining, color: Colors.white),
                ),
                const SizedBox(height: 8),
                const Text('QuickBite', style: TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w800)),
                const Text('Rider', style: TextStyle(color: Color(0xFF9FE7B8), fontWeight: FontWeight.w700)),
              ],
            ),
          ),
          const SizedBox(height: 28),
          const Text('Welcome Back', style: TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          const Text('Sign in to continue', style: TextStyle(color: Color(0xFF9CA3AF))),
          const SizedBox(height: 18),
          _field(_phone, 'Phone Number', Icons.phone_outlined, keyboard: TextInputType.phone),
          const SizedBox(height: 10),
          _field(_pw, 'Password', Icons.lock_outline),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(onPressed: () {}, child: const Text('Forgot Password?', style: TextStyle(color: Brand.green, fontWeight: FontWeight.w700))),
          ),
          if (error != null) Text(error!, style: const TextStyle(color: Color(0xFFFCA5A5))),
          const SizedBox(height: 8),
          SizedBox(
            height: 54,
            child: FilledButton(
              style: FilledButton.styleFrom(backgroundColor: Brand.green, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28))),
              onPressed: busy ? null : _send,
              child: Text(busy ? 'Checking…' : 'Login', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: Colors.white)),
            ),
          ),
          const SizedBox(height: 16),
          const Center(child: Text('or', style: TextStyle(color: Color(0xFF6B7280), fontWeight: FontWeight.w600))),
          const SizedBox(height: 10),
          _ghost('Continue with Google'),
          const SizedBox(height: 8),
          _ghost('Continue with Apple'),
          const SizedBox(height: 18),
          Center(
            child: TextButton(
              onPressed: () => setState(() {
                register = true;
                error = null;
                regRole = 'rider';
              }),
              child: const Text.rich(TextSpan(children: [
                TextSpan(text: "Don't have an account? ", style: TextStyle(color: Color(0xFF9CA3AF))),
                TextSpan(text: 'Sign Up', style: TextStyle(color: Brand.green, fontWeight: FontWeight.w800)),
              ])),
            ),
          ),
        ],
      ),
    );
  }

  Widget _riderRegister() {
    Widget tab(String id, String label) {
      final on = regRole == id;
      return Expanded(
        child: GestureDetector(
          onTap: () => setState(() => regRole = id),
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 10),
            decoration: BoxDecoration(
              color: on ? Brand.green : Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: on ? Brand.green : const Color(0xFFE5E7EB)),
            ),
            child: Text(label, textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w800, color: on ? Colors.white : Brand.ink, fontSize: 13)),
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: Colors.white,
      body: ListView(
        padding: const EdgeInsets.fromLTRB(22, 48, 22, 32),
        children: [
          Center(
            child: Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(color: Brand.green, borderRadius: BorderRadius.circular(28)),
              child: const Icon(Icons.delivery_dining, color: Colors.white),
            ),
          ),
          const SizedBox(height: 8),
          const Text('QuickBite', textAlign: TextAlign.center, style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
          const Text('Rider', textAlign: TextAlign.center, style: TextStyle(color: Color(0xFF6B7280), fontWeight: FontWeight.w700)),
          const SizedBox(height: 16),
          const Text('Create Account', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          const Text('Join QuickBite and start earning today!', style: TextStyle(color: Color(0xFF6B7280))),
          const SizedBox(height: 12),
          Row(children: [tab('rider', 'Rider'), const SizedBox(width: 8), tab('shop', 'Shop')]),
          const SizedBox(height: 14),
          _lightField(_name, 'Full Name'),
          const SizedBox(height: 10),
          _lightField(_phone, 'Phone Number', keyboard: TextInputType.phone),
          const SizedBox(height: 10),
          _lightField(_email, 'Email Address'),
          const SizedBox(height: 10),
          _lightField(_pw, 'Password'),
          if (error != null) ...[
            const SizedBox(height: 10),
            Text(error!, style: const TextStyle(color: Color(0xFFB91C1C))),
          ],
          const SizedBox(height: 16),
          SizedBox(
            height: 54,
            child: FilledButton(
              style: FilledButton.styleFrom(backgroundColor: Brand.green, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28))),
              onPressed: busy ? null : _send,
              child: Text(
                busy ? 'Sending WhatsApp…' : (regRole == 'shop' ? 'Download Shop App' : 'Register'),
                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: Colors.white),
              ),
            ),
          ),
          const SizedBox(height: 14),
          Center(
            child: TextButton(
              onPressed: () => setState(() {
                register = false;
                error = null;
              }),
              child: const Text.rich(TextSpan(children: [
                TextSpan(text: 'Already have an account? ', style: TextStyle(color: Color(0xFF6B7280))),
                TextSpan(text: 'Login', style: TextStyle(color: Brand.green, fontWeight: FontWeight.w800)),
              ])),
            ),
          ),
        ],
      ),
    );
  }

  Widget _lightField(TextEditingController c, String label, {TextInputType? keyboard, ValueChanged<String>? onChanged}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: Color(0xFF374151))),
        const SizedBox(height: 6),
        TextField(
          controller: c,
          keyboardType: keyboard,
          onChanged: onChanged,
          decoration: InputDecoration(
            hintText: label,
            filled: true,
            fillColor: const Color(0xFFF9FAFB),
            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: Color(0xFFE5E7EB))),
            enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: Color(0xFFE5E7EB))),
          ),
        ),
      ],
    );
  }

  Widget _lightGhost(String label) {
    return SizedBox(
      height: 48,
      child: OutlinedButton(
        style: OutlinedButton.styleFrom(
          foregroundColor: Brand.ink,
          side: const BorderSide(color: Color(0xFFE5E7EB)),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
        ),
        onPressed: busy ? null : _send,
        child: Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
      ),
    );
  }

  Widget _ghost(String label) {
    return SizedBox(
      height: 48,
      child: OutlinedButton(
        style: OutlinedButton.styleFrom(
          foregroundColor: Colors.white,
          side: const BorderSide(color: Color(0xFF1F2E28)),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
        ),
        onPressed: busy ? null : _send,
        child: Text(label),
      ),
    );
  }
}
