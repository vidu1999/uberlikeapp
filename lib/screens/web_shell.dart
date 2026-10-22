import 'dart:async';
import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

import '../app.dart';
import '../config.dart';
import '../theme.dart';

class WebShell extends StatefulWidget {
  final UserRole role;
  const WebShell({super.key, required this.role});

  @override
  State<WebShell> createState() => _WebShellState();
}

class _WebShellState extends State<WebShell> {
  WebViewController? _controller;
  bool _loading = true;
  bool _pageOk = false;
  String? _error;
  Timer? _timeout;

  String get _path {
    switch (widget.role) {
      case UserRole.customer:
        return '/user.html';
      case UserRole.shop:
        return '/shop.html';
      case UserRole.rider:
        return '/rider.html';
    }
  }

  String get _startUrl => '${AppConfig.normalize(AppConfig.baseUrl)}$_path';

  Color get _bg {
    switch (widget.role) {
      case UserRole.customer:
        return Colors.white;
      case UserRole.shop:
      case UserRole.rider:
        return Brand.navy;
    }
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      Future<void>.delayed(const Duration(milliseconds: 80), _boot);
    });
  }

  @override
  void dispose() {
    _timeout?.cancel();
    super.dispose();
  }

  Future<void> _boot() async {
    try {
      final p = await SharedPreferences.getInstance();
      final saved = (p.getString('qb_site') ?? '').trim();
      if (saved.isNotEmpty) AppConfig.baseUrl = AppConfig.normalize(saved);
    } catch (_) {}

    try {
      await _attachWebView();
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Could not start QuickBite. Update Android System WebView, then try again.';
        _loading = false;
      });
    }
  }

  Future<void> _attachWebView() async {
    final controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(_bg)
      ..addJavaScriptChannel(
        'QuickBiteNative',
        onMessageReceived: (msg) {
          if (msg.message == 'google') _google();
        },
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (url) {
            if (!mounted) return;
            if (_isAppPage(url)) {
              setState(() {
                _loading = !_pageOk;
                if (!_pageOk) _error = null;
              });
            }
          },
          onPageFinished: (url) {
            _timeout?.cancel();
            if (!mounted) return;
            if (_isAppPage(url) || url.isEmpty) {
              setState(() {
                _pageOk = true;
                _loading = false;
                _error = null;
              });
            }
          },
          onNavigationRequest: (req) {
            if (_openExternal(req.url)) return NavigationDecision.prevent;
            if (_isBlockedGoogleRedirect(req.url)) {
              _google();
              return NavigationDecision.prevent;
            }
            return NavigationDecision.navigate;
          },
        ),
      );

    if (!mounted) return;
    setState(() => _controller = controller);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _tuneAndroid(controller);
      _loadHome();
      _askLocation();
    });
  }

  Future<void> _tuneAndroid(WebViewController controller) async {
    if (controller.platform is! AndroidWebViewController) return;
    final android = controller.platform as AndroidWebViewController;
    try {
      await controller.setUserAgent(
        'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
      );
    } catch (_) {}
    try {
      final cookies = WebViewCookieManager();
      await (cookies.platform as dynamic).setAcceptThirdPartyCookies(android, true);
    } catch (_) {}
    try {
      android.setOnPlatformPermissionRequest((request) {
        request.grant();
      });
    } catch (_) {}
    try {
      await android.setGeolocationPermissionsPromptCallbacks(
        onShowPrompt: (request) async {
          return const GeolocationPermissionsResponse(allow: true, retain: true);
        },
      );
    } catch (_) {}
    try {
      android.setMediaPlaybackRequiresUserGesture(false);
    } catch (_) {}
    try {
      android.setOnShowFileSelector(_pickFiles);
    } catch (_) {}
  }

  Widget _webView() {
    return WebViewWidget(controller: _controller!);
  }

  bool _isAppPage(String url) {
    if (url.isEmpty || url == 'about:blank') return false;
    final host = Uri.tryParse(url)?.host ?? '';
    final mine = Uri.tryParse(AppConfig.normalize(AppConfig.baseUrl))?.host ?? '';
    if (mine.isNotEmpty && host == mine) return true;
    return url.contains('user.html') || url.contains('shop.html') || url.contains('rider.html');
  }

  Future<void> _loadHome() async {
    final c = _controller;
    if (c == null) return;
    _timeout?.cancel();
    _timeout = Timer(const Duration(seconds: 20), () {
      if (!mounted || _pageOk) return;
      setState(() {
        _loading = false;
        _error = 'Could not open QuickBite. Check internet, then tap Retry.\n$_startUrl';
      });
    });
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      await c.loadRequest(Uri.parse(_startUrl));
    } catch (_) {
      _timeout?.cancel();
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Could not open $_startUrl';
      });
    }
  }

  Future<void> _askLocation() async {
    try {
      await Geolocator.requestPermission();
    } catch (_) {}
  }

  Future<List<String>> _pickFiles(FileSelectorParams params) async {
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.image,
        allowMultiple: params.mode == FileSelectorMode.openMultiple,
      );
      if (result == null) return const <String>[];
      return result.paths.whereType<String>().map((p) => Uri.file(p).toString()).toList();
    } catch (_) {
      return const <String>[];
    }
  }

  bool _openExternal(String url) {
    final uri = Uri.tryParse(url);
    if (uri == null) return false;
    final host = uri.host.toLowerCase();
    final path = uri.path.toLowerCase();
    final ext = uri.scheme == 'tel' ||
        uri.scheme == 'mailto' ||
        uri.scheme == 'sms' ||
        uri.scheme == 'geo' ||
        uri.scheme == 'intent' ||
        uri.scheme == 'whatsapp' ||
        path.endsWith('.apk') ||
        host.contains('maps.google') ||
        (host.contains('google.com') && path.contains('/maps')) ||
        host.contains('waze.com');
    if (!ext) return false;
    launchUrl(uri, mode: LaunchMode.externalApplication).then((_) {}, onError: (_) {});
    return true;
  }

  bool _isBlockedGoogleRedirect(String url) {
    final u = Uri.tryParse(url);
    if (u == null) return false;
    final host = u.host.toLowerCase();
    if (host != 'accounts.google.com') return false;
    if (!u.path.contains('oauth')) return false;
    final redir = u.queryParameters['redirect_uri'] ?? '';
    return redir.startsWith('https://quickbite-2ao.pages.dev');
  }

  Future<void> _deliverGoogle(Map<String, String> profile, [String? err]) async {
    final c = _controller;
    if (c == null) return;
    final payload = err != null
        ? '''
          (function(){
            var m = ${jsonEncode(err)};
            if (window._qbGoogleDone) { window._qbGoogleDone(m); return; }
            var el = document.querySelector('[data-err]');
            if (el) el.textContent = m;
          })();
        '''
        : '''
          (function(){
            var p = ${jsonEncode(profile)};
            if (window._qbGoogleDone) { window._qbGoogleDone(null, p); return; }
            if (window.API && API.signInGoogle) {
              API.signInGoogle(p).then(function(){ location.reload(); }).catch(function(){ location.reload(); });
            }
          })();
        ''';
    try {
      await c.runJavaScript(payload);
    } catch (_) {}
  }

  bool _googleBusy = false;

  GoogleSignIn? _googleClient;

  Future<void> _google() async {
    if (_googleBusy) return;
    _googleBusy = true;
    final c = _controller;
    if (c == null) {
      _googleBusy = false;
      return;
    }
    try {
      _googleClient ??= GoogleSignIn(scopes: const ['email', 'profile']);
      final acc = await _googleClient!.signIn();
      if (acc != null && acc.email.isNotEmpty) {
        await _deliverGoogle({
          'email': acc.email,
          'name': acc.displayName ?? acc.email,
          'sub': acc.id,
          'photo': acc.photoUrl ?? '',
        });
        return;
      }
      await _deliverGoogle({}, 'Try Continue with Google again.');
    } catch (_) {
      await _deliverGoogle({}, 'Could not finish Google sign-in. Try Continue with WhatsApp.');
    } finally {
      _googleBusy = false;
    }
  }

  Future<void> _reload() async {
    setState(() {
      _error = null;
      _loading = true;
      _pageOk = false;
    });
    await _loadHome();
  }

  Future<void> _editUrl() async {
    final ctrl = TextEditingController(text: AppConfig.baseUrl);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Connect the 3 apps'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Paste only this, with no spaces:\nhttps://quickbite-2ao.pages.dev',
              style: TextStyle(fontSize: 13),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: ctrl,
              decoration: const InputDecoration(
                labelText: 'Site URL',
                hintText: 'https://quickbite-2ao.pages.dev',
                border: OutlineInputBorder(),
              ),
              keyboardType: TextInputType.url,
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Save')),
        ],
      ),
    );
    if (ok != true) return;
    AppConfig.baseUrl = AppConfig.normalize(ctrl.text);
    try {
      final p = await SharedPreferences.getInstance();
      await p.setString('qb_site', AppConfig.baseUrl);
    } catch (_) {}
    await _reload();
  }

  Future<bool> _onWillPop() async {
    final c = _controller;
    if (c != null && await c.canGoBack()) {
      await c.goBack();
      return false;
    }
    return true;
  }

  @override
  Widget build(BuildContext context) {
    return WillPopScope(
      onWillPop: _onWillPop,
      child: Scaffold(
        backgroundColor: _bg,
        body: Stack(
          children: [
            if (_controller != null) Positioned.fill(child: _webView()),
            if (_loading)
              Positioned.fill(
                child: ColoredBox(
                  color: _bg,
                  child: const Center(child: CircularProgressIndicator(color: Brand.green)),
                ),
              ),
            if (_error != null && !_pageOk)
              Positioned.fill(
                child: ColoredBox(
                  color: _bg,
                  child: Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            _error!,
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: widget.role == UserRole.customer ? Brand.ink : Colors.white,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 16),
                          FilledButton(
                            style: FilledButton.styleFrom(backgroundColor: Brand.green),
                            onPressed: _reload,
                            child: const Text('Retry'),
                          ),
                          TextButton(onPressed: _editUrl, child: const Text('Paste site URL')),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            Positioned(
              top: MediaQuery.of(context).padding.top + 4,
              right: 6,
              child: Opacity(
                opacity: 0.45,
                child: Material(
                  color: Colors.black54,
                  shape: const CircleBorder(),
                  child: InkWell(
                    customBorder: const CircleBorder(),
                    onTap: _editUrl,
                    child: const Padding(
                      padding: EdgeInsets.all(8),
                      child: Icon(Icons.cloud_outlined, color: Colors.white, size: 18),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
