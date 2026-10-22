import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_sign_in/google_sign_in.dart';
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

  bool _isFakePhone(String? p) {
    final n = (p ?? '').replaceAll(RegExp(r'\D'), '');
    if (RegExp(r'^07\d{8}$').hasMatch(n)) return false;
    return n.isEmpty || n.startsWith('99') || n.startsWith('98');
  }

  @override
  void initState() {
    super.initState();
    final repo = OrderRepository.instance;
    final vp = repo.verifiedPhone ?? '';
    _phone = TextEditingController(text: _isFakePhone(vp) ? '' : vp);
    if (widget.role == UserRole.shop || widget.role == UserRole.rider) {
      _name.text = '';
      _email.text = '';
    }
    if (widget.role == UserRole.rider) regRole = 'rider';
    if (widget.role == UserRole.shop && repo.promptShopRegister) {
      register = true;
      fromRegister = true;
      repo.promptShopRegister = false;
      final p = repo.pendingShop;
      if (p != null) {
        if ((p['ownerName'] ?? '').isNotEmpty) _name.text = p['ownerName']!;
        if ((p['email'] ?? '').isNotEmpty) _email.text = p['email']!;
        if ((p['shopName'] ?? '').isNotEmpty) _shopName.text = p['shopName']!;
      }
    }
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
      if (widget.role == UserRole.rider && register && OrderRepository.instance.needsRiderRegister) {
        if (_name.text.trim().isEmpty || _phone.text.trim().isEmpty) {
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
          if (_pw.text.trim().length >= 4) 'password': _pw.text.trim(),
        };
        await OrderRepository.instance.completeRiderRegister();
        if (!mounted) return;
        setState(() => busy = false);
        return;
      }
      if (widget.role == UserRole.shop && register && OrderRepository.instance.needsShopRegister) {
        if (_shopName.text.trim().isEmpty || _name.text.trim().isEmpty) {
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
          'email': _email.text.trim(),
          'address': _addr.text.trim(),
          'lat': '$_shopLat',
          'lng': '$_shopLng',
        };
        final vp = OrderRepository.instance.verifiedPhone ?? '';
        if (_email.text.trim().isEmpty && !_isFakePhone(vp) && !_isFakePhone(_phone.text)) {
          await OrderRepository.instance.completeShopRegister();
          if (!mounted) return;
          setState(() => busy = false);
          return;
        }
      }
      if (widget.role == UserRole.rider && !register) {
        final id = _phone.text.trim();
        final pw = _pw.text;
        if (id.contains('@') || pw.trim().isNotEmpty) {
          if (id.contains('@')) {
            final acc = await OrderRepository.instance.findAccount('rider', id);
            if (!mounted) return;
            if (acc == null) {
              setState(() {
                busy = false;
                register = true;
                fromRegister = true;
                _email.text = id;
                error = 'This email is not registered. Create a rider account, then sign in with email and password.';
              });
              return;
            }
          }
          if (pw.trim().isEmpty) {
            setState(() {
              busy = false;
              error = 'This email is registered. Enter your password to sign in.';
            });
            return;
          }
          await OrderRepository.instance.signInPassword(id, pw, role: 'rider');
          if (!mounted) return;
          if (!OrderRepository.instance.isRiderRegistered) {
            await OrderRepository.instance.parkForRegister('rider');
            if (!mounted) return;
            setState(() {
              busy = false;
              register = true;
              fromRegister = true;
              error = 'Register as a rider to continue.';
            });
            return;
          }
          setState(() => busy = false);
          return;
        }
        final acc = await OrderRepository.instance.findAccount('rider', id);
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
          if (_pw.text.trim().length >= 4) 'password': _pw.text.trim(),
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
        if (_isFakePhone(_phone.text)) {
          setState(() {
            busy = false;
            error = 'Enter a valid WhatsApp number (07X XXX XXXX).';
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
        final taken = await OrderRepository.instance.findAccount('shop', _phone.text.trim());
        if (!mounted) return;
        if (taken != null) {
          final te = '${taken['email'] ?? ''}'.trim().toLowerCase();
          final pe = _email.text.trim().toLowerCase();
          final tp = '${taken['phone'] ?? ''}';
          final fake = _isFakePhone(tp);
          if (!fake && (pe.isEmpty || te.isEmpty || te != pe)) {
            setState(() {
              busy = false;
              error = 'This number already has a Shop account. Login instead — you cannot create another Shop with the same number.';
            });
            return;
          }
        }
        OrderRepository.instance.pendingShop = {
          'shopName': _shopName.text.trim(),
          'ownerName': _name.text.trim(),
          'phone': _phone.text.trim(),
          'email': _email.text.trim(),
          'address': _addr.text.trim(),
          'lat': '$_shopLat',
          'lng': '$_shopLng',
        };
      }
      if (widget.role == UserRole.shop && !register) {
        final id = _phone.text.trim();
        final pw = _pw.text;
        if (id.contains('@') || pw.trim().isNotEmpty) {
          await OrderRepository.instance.signInPassword(id, pw, role: 'shop');
          if (!mounted) return;
          if (!OrderRepository.instance.isShopRegistered) {
            await OrderRepository.instance.parkForRegister('shop');
            if (!mounted) return;
            setState(() {
              busy = false;
              register = true;
              fromRegister = true;
              error = 'Register your shop to continue.';
            });
            return;
          }
          setState(() => busy = false);
          return;
        }
      }
      if (widget.role == UserRole.customer && !register) {
        final id = _phone.text.trim();
        if (id.contains('@')) {
          final acc = await OrderRepository.instance.findAccount('customer', id);
          if (!mounted) return;
          if (acc == null) {
            setState(() {
              busy = false;
              register = true;
              fromRegister = true;
              _email.text = id;
              error = 'This email is not registered. Create an account, then sign in with email and password.';
            });
            return;
          }
          if (_pw.text.trim().isEmpty) {
            setState(() {
              busy = false;
              error = 'This email is registered. Enter your password to sign in.';
            });
            return;
          }
          await OrderRepository.instance.signInPassword(id, _pw.text);
          if (!mounted) return;
          setState(() => busy = false);
          return;
        }
      }
      if (widget.role == UserRole.customer && register && regRole == 'customer') {
        final email = _email.text.trim();
        if (email.contains('@') && _pw.text.trim().length >= 4) {
          await OrderRepository.instance.signUpPassword(
            name: _name.text.trim(),
            email: email,
            password: _pw.text.trim(),
          );
          if (!mounted) return;
          setState(() {
            busy = false;
            register = false;
            _phone.text = email;
            error = 'Account created. Sign in with your email and password.';
          });
          return;
        }
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
      final msg = e.toString().replaceFirst('Exception: ', '');
      final noCreds = msg.contains('not registered') || msg.contains('not User credentials') || msg.contains('not Shop credentials');
      setState(() {
        busy = false;
        error = msg;
        if (noCreds) {
          register = true;
          fromRegister = true;
          if (widget.role == UserRole.customer && _phone.text.contains('@')) {
            _email.text = _phone.text.trim();
          }
        }
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
      if (!ok) {
        setState(() {
          busy = false;
          error = 'That code does not match this phone number.';
        });
        return;
      }
      if (OrderRepository.instance.needsShopRegister || OrderRepository.instance.needsRiderRegister) {
        final p = OrderRepository.instance.verifiedPhone;
        if (p != null && p.isNotEmpty && !_isFakePhone(p)) _phone.text = p;
        setState(() {
          busy = false;
          codeStep = false;
          register = true;
          fromRegister = true;
        });
        return;
      }
      setState(() => busy = false);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        busy = false;
        error = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  Future<void> _googleSignIn() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final google = GoogleSignIn(scopes: const ['email', 'profile']);
      final acc = await google.signInSilently() ?? await google.signIn();
      if (!mounted) return;
      if (acc == null) {
        setState(() {
          busy = false;
          error = 'Google window closed. Tap Continue with Google again.';
        });
        return;
      }
      await OrderRepository.instance.signInWithGoogle(
        email: acc.email,
        name: acc.displayName ?? acc.email,
        sub: acc.id,
        photo: acc.photoUrl,
        role: _apiRole,
      );
      if (!mounted) return;
      if (widget.role == UserRole.shop && !OrderRepository.instance.isShopRegistered) {
        final u = OrderRepository.instance.user;
        final sid = u?.shopId;
        final phone = u?.phone ?? '';
        final realWa = RegExp(r'^07\d{8}$').hasMatch(phone.replaceAll(RegExp(r'\D'), ''));
        if ((sid == null || sid.isEmpty || sid == 'null') && !realWa) {
          OrderRepository.instance.pendingShop = {
            ...?OrderRepository.instance.pendingShop,
            'ownerName': acc.displayName ?? acc.email,
            'email': acc.email,
            if ((acc.photoUrl ?? '').isNotEmpty) 'photo': acc.photoUrl!,
          };
          await OrderRepository.instance.parkForRegister('shop');
        }
      }
      if (widget.role == UserRole.rider && !OrderRepository.instance.isRiderRegistered) {
        OrderRepository.instance.pendingRider = {
          ...?OrderRepository.instance.pendingRider,
          'name': acc.displayName ?? acc.email,
          'email': acc.email,
        };
        await OrderRepository.instance.parkForRegister('rider');
      }
      if (!mounted) return;
      setState(() {
        busy = false;
        if (widget.role == UserRole.shop && OrderRepository.instance.promptShopRegister) {
          register = true;
          fromRegister = true;
          _name.text = acc.displayName ?? _name.text;
          _email.text = acc.email;
          if (_isFakePhone(_phone.text)) _phone.text = '';
        }
        if (widget.role == UserRole.rider && OrderRepository.instance.needsRiderRegister) {
          register = true;
          fromRegister = true;
          _name.text = acc.displayName ?? _name.text;
          _email.text = acc.email;
          if (_isFakePhone(_phone.text)) _phone.text = '';
        }
      });
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
          Text(
            shop || rider
                ? 'We’ll send a 4-digit code on WhatsApp. Same number can be User, Shop, and Rider — not two accounts in the same role.'
                : 'Google, WhatsApp, or email & password to enter. WhatsApp is required once before you place an order — skip if this account already verified.',
            style: const TextStyle(color: Color(0xFF9CA3AF)),
          ),
          const SizedBox(height: 20),
          _field(_phone, shop || rider ? 'Phone Number' : 'Email or Phone Number', Icons.mail_outline, keyboard: shop || rider ? TextInputType.phone : TextInputType.emailAddress),
          if (!shop && !rider) _field(_pw, 'Password', Icons.lock_outline, obscure: true),
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
              child: Text(busy ? 'Signing in…' : 'Sign In', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: Colors.white)),
            ),
          ),
          const SizedBox(height: 18),
          const Center(child: Text('or', style: TextStyle(color: Color(0xFF6B7280)))),
          const SizedBox(height: 12),
          _ghost('Continue with Google', onPressed: _googleSignIn),
          const SizedBox(height: 8),
          _ghost('Continue with WhatsApp', onPressed: _openWhatsAppLogin, icon: _waMark()),
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
          const SizedBox(height: 10),
          TextField(controller: _pw, obscureText: true, decoration: const InputDecoration(labelText: 'Password', border: OutlineInputBorder())),
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

  Widget _field(TextEditingController c, String hint, IconData icon, {TextInputType? keyboard, bool obscure = false}) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(color: const Color(0xFF14241C), borderRadius: BorderRadius.circular(16)),
      child: TextField(
        controller: c,
        keyboardType: keyboard,
        obscureText: obscure,
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
      backgroundColor: const Color(0xFF07140F),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(22, 48, 22, 32),
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(color: Brand.green, borderRadius: BorderRadius.circular(16)),
              child: const Icon(Icons.storefront, color: Colors.white, size: 28),
            ),
          ),
          const SizedBox(height: 18),
          const Text('Welcome Back!', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, letterSpacing: -0.7, color: Colors.white)),
          const SizedBox(height: 8),
          const Text('Login to your shop account', style: TextStyle(color: Color(0xFF9CA3AF), fontSize: 14)),
          const SizedBox(height: 18),
          _field(_phone, 'Email or Phone Number', Icons.person_outline, keyboard: TextInputType.emailAddress),
          _field(_pw, 'Password', Icons.lock_outline, obscure: true),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
              onPressed: () => setState(() => error = 'Use Continue with WhatsApp or Google to get back in.'),
              child: const Text('Forgot Password?', style: TextStyle(color: Brand.green, fontWeight: FontWeight.w700, fontSize: 13)),
            ),
          ),
          if (error != null) ...[
            const SizedBox(height: 4),
            Text(error!, style: const TextStyle(color: Color(0xFFFCA5A5))),
          ],
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
          _ghost('Continue with Google', onPressed: _googleSignIn),
          const SizedBox(height: 8),
          _ghost('Continue with WhatsApp', onPressed: _openWhatsAppLogin, icon: _waMark()),
          const SizedBox(height: 18),
          Center(
            child: TextButton(
              onPressed: () => setState(() {
                register = true;
                error = null;
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

  Widget _shopRegister() {
    return Scaffold(
      backgroundColor: Colors.white,
      body: ListView(
        padding: const EdgeInsets.fromLTRB(22, 48, 22, 32),
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(color: Brand.green, borderRadius: BorderRadius.circular(16)),
              child: const Icon(Icons.storefront, color: Colors.white, size: 28),
            ),
          ),
          const SizedBox(height: 18),
          const Text('Create Your Shop Account', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, letterSpacing: -0.7, color: Color(0xFF111827))),
          const SizedBox(height: 8),
          const Text('Join QuickBite and start receiving orders', style: TextStyle(color: Color(0xFF6B7280), fontSize: 14)),
          const SizedBox(height: 16),
          _lightField(_shopName, 'Shop Name', hint: 'e.g. your shop name'),
          const SizedBox(height: 10),
          _lightField(_name, 'Owner Name', hint: 'e.g. Nimal Perera'),
          const SizedBox(height: 10),
          const Text('Live location', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: Color(0xFF374151))),
          const SizedBox(height: 6),
          PinMap(onChanged: (lat, lng, label) {
            _shopLat = lat;
            _shopLng = lng;
            if (!_addrDirty && label.isNotEmpty) _addr.text = label;
          }),
          const SizedBox(height: 10),
          _lightField(_addr, 'Address', hint: 'Street, city', onChanged: (_) => _addrDirty = true),
          const SizedBox(height: 10),
          _lightField(_phone, 'Phone Number', hint: '+94 7X XXX XXXX', keyboard: TextInputType.phone),
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
          _field(_pw, 'Password', Icons.lock_outline, obscure: true),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
              onPressed: () => setState(() => error = 'Use Continue with WhatsApp or Google to get back in.'),
              child: const Text('Forgot Password?', style: TextStyle(color: Brand.green, fontWeight: FontWeight.w700)),
            ),
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
          _ghost('Continue with Google', onPressed: _googleSignIn),
          const SizedBox(height: 8),
          _ghost('Continue with WhatsApp', onPressed: _openWhatsAppLogin, icon: _waMark()),
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
          _lightField(_pw, 'Password', obscure: true),
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

  Widget _lightField(TextEditingController c, String label, {TextInputType? keyboard, ValueChanged<String>? onChanged, String? hint, bool obscure = false}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: Color(0xFF111827))),
        const SizedBox(height: 8),
        TextField(
          controller: c,
          keyboardType: keyboard,
          obscureText: obscure,
          onChanged: onChanged,
          decoration: InputDecoration(
            hintText: hint ?? label,
            hintStyle: const TextStyle(color: Color(0xFF9CA3AF)),
            filled: true,
            fillColor: const Color(0xFFF3F4F6),
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
            enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
            focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: const BorderSide(color: Color(0xFFBBF7D0), width: 2)),
          ),
        ),
      ],
    );
  }

  Widget _waMark() {
    return Container(
      width: 22,
      height: 22,
      decoration: const BoxDecoration(color: Color(0xFF25D366), shape: BoxShape.circle),
      child: const Icon(Icons.chat, size: 13, color: Colors.white),
    );
  }

  Widget _sheetChild(Widget child, {required VoidCallback? onPressed, bool light = false}) {
    return SizedBox(
      height: 48,
      child: OutlinedButton(
        style: OutlinedButton.styleFrom(
          foregroundColor: light ? Brand.ink : Colors.white,
          side: BorderSide(color: light ? const Color(0xFFE5E7EB) : const Color(0xFF1F2E28)),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
        ),
        onPressed: busy ? null : onPressed,
        child: child,
      ),
    );
  }

  Widget _lightGhost(String label, {VoidCallback? onPressed, Widget? icon}) {
    final child = icon == null
        ? Text(label, style: const TextStyle(fontWeight: FontWeight.w700))
        : Row(mainAxisAlignment: MainAxisAlignment.center, children: [icon, const SizedBox(width: 10), Text(label, style: const TextStyle(fontWeight: FontWeight.w700))]);
    return _sheetChild(child, onPressed: onPressed ?? _send, light: true);
  }

  Widget _ghost(String label, {VoidCallback? onPressed, Widget? icon}) {
    final child = icon == null
        ? Text(label, style: const TextStyle(fontWeight: FontWeight.w700))
        : Row(mainAxisAlignment: MainAxisAlignment.center, children: [icon, const SizedBox(width: 10), Text(label, style: const TextStyle(fontWeight: FontWeight.w700))]);
    return _sheetChild(child, onPressed: onPressed ?? _send);
  }

  Future<void> _openWhatsAppLogin() async {
    final phoneCtrl = TextEditingController();
    final digits = List.generate(4, (_) => TextEditingController());
    final focus = List.generate(4, (_) => FocusNode());
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(22))),
      builder: (ctx) {
        var step = 'phone';
        var err = '';
        var sending = false;
        var sent = '';
        return Padding(
          padding: EdgeInsets.only(left: 18, right: 18, top: 20, bottom: 18 + MediaQuery.of(ctx).viewInsets.bottom),
          child: StatefulBuilder(
            builder: (ctx, setS) {
              Future<void> send() async {
                final raw = phoneCtrl.text.trim();
                if (raw.isEmpty) {
                  setS(() => err = 'Enter your WhatsApp number');
                  return;
                }
                setS(() {
                  sending = true;
                  err = '';
                });
                try {
                  final data = await OrderRepository.instance.sendOtp(_apiRole, raw);
                  sent = data?['phone']?.toString() ?? raw;
                  phoneSent = sent;
                  setS(() {
                    sending = false;
                    step = 'code';
                  });
                } catch (e) {
                  setS(() {
                    sending = false;
                    err = e.toString().replaceFirst('Exception: ', '');
                  });
                }
              }

              Future<void> verify() async {
                final code = digits.map((c) => c.text).join();
                if (code.length != 4) {
                  setS(() => err = 'Enter the 4-digit code');
                  return;
                }
                setS(() {
                  sending = true;
                  err = '';
                });
                try {
                  final ok = await OrderRepository.instance.verifyOtp(_apiRole, sent, code);
                  if (!ctx.mounted) return;
                  if (!ok) {
                    setS(() {
                      sending = false;
                      err = 'That code does not match this phone number.';
                    });
                    return;
                  }
                  Navigator.pop(ctx);
                  if (!mounted) return;
                  if (OrderRepository.instance.needsShopRegister || OrderRepository.instance.needsRiderRegister) {
                    final p = OrderRepository.instance.verifiedPhone;
                    if (p != null && p.isNotEmpty) _phone.text = p;
                    setState(() {
                      register = true;
                      fromRegister = true;
                      error = null;
                    });
                  }
                } catch (e) {
                  setS(() {
                    sending = false;
                    err = e.toString().replaceFirst('Exception: ', '');
                  });
                }
              }

              return Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text('Continue with WhatsApp', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 6),
                  Text(
                    step == 'code'
                        ? 'Code sent to $sent'
                        : 'Enter your WhatsApp number. We send a 4-digit code to that chat, then you are in.',
                    style: const TextStyle(color: Color(0xFF6B7280), height: 1.4),
                  ),
                  const SizedBox(height: 14),
                  if (step == 'phone') ...[
                    TextField(
                      controller: phoneCtrl,
                      keyboardType: TextInputType.phone,
                      decoration: InputDecoration(
                        hintText: '07X XXX XXXX',
                        filled: true,
                        fillColor: const Color(0xFFF9FAFB),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: Color(0xFFE5E7EB))),
                        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: Color(0xFFE5E7EB))),
                      ),
                    ),
                  ] else ...[
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: List.generate(4, (i) {
                        return SizedBox(
                          width: 64,
                          height: 64,
                          child: TextField(
                            controller: digits[i],
                            focusNode: focus[i],
                            textAlign: TextAlign.center,
                            keyboardType: TextInputType.number,
                            style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800),
                            inputFormatters: [LengthLimitingTextInputFormatter(1), FilteringTextInputFormatter.digitsOnly],
                            decoration: const InputDecoration(border: OutlineInputBorder()),
                            onChanged: (v) {
                              if (v.isNotEmpty && i < 3) focus[i + 1].requestFocus();
                              if (digits.every((c) => c.text.isNotEmpty)) verify();
                            },
                          ),
                        );
                      }),
                    ),
                  ],
                  if (err.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(err, style: const TextStyle(color: Color(0xFFB91C1C), fontSize: 13)),
                  ],
                  const SizedBox(height: 12),
                  SizedBox(
                    height: 52,
                    child: FilledButton(
                      style: FilledButton.styleFrom(backgroundColor: Brand.green, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28))),
                      onPressed: sending ? null : (step == 'phone' ? send : verify),
                      child: Text(
                        sending ? (step == 'phone' ? 'Sending…' : 'Checking…') : (step == 'phone' ? 'Send WhatsApp code' : 'Verify & enter'),
                        style: const TextStyle(fontWeight: FontWeight.w800, color: Colors.white),
                      ),
                    ),
                  ),
                  if (step == 'code')
                    TextButton(onPressed: sending ? null : send, child: const Text('Resend on WhatsApp')),
                  TextButton(
                    onPressed: () => Navigator.pop(ctx),
                    child: const Text('Cancel', style: TextStyle(color: Color(0xFF6B7280), fontWeight: FontWeight.w700)),
                  ),
                ],
              );
            },
          ),
        );
      },
    );
    phoneCtrl.dispose();
    for (final c in digits) {
      c.dispose();
    }
    for (final f in focus) {
      f.dispose();
    }
  }
}
