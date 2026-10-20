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
  String? _error;

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
    _boot();
  }

  Future<void> _boot() async {
    try {
      final p = await SharedPreferences.getInstance();
      final saved = (p.getString('qb_site') ?? '').trim();
      if (saved.isNotEmpty) AppConfig.baseUrl = AppConfig.normalize(saved);
    } catch (_) {}
    try {
      await Geolocator.requestPermission();
    } catch (_) {}
    try {
      await _buildController();
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'Could not start QuickBite.';
          _loading = false;
        });
      }
    }
  }

  Future<void> _buildController() async {
    final controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(_bg)
      ..setUserAgent(
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 QuickBiteApp/1.0',
      )
      ..addJavaScriptChannel(
        'QuickBiteNative',
        onMessageReceived: (msg) {
          if (msg.message == 'google') _google();
        },
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (_) {
            if (mounted) setState(() => _loading = true);
          },
          onPageFinished: (_) {
            if (mounted) setState(() { _loading = false; _error = null; });
          },
          onWebResourceError: (err) {
            if (err.errorType == WebResourceErrorType.hostLookup ||
                err.errorType == WebResourceErrorType.timeout ||
                err.errorType == WebResourceErrorType.connect) {
              if (mounted) {
                setState(() {
                  _loading = false;
                  _error = 'Could not load the QuickBite site.';
                });
              }
            }
          },
          onNavigationRequest: (req) {
            if (_openExternal(req.url)) return NavigationDecision.prevent;
            return NavigationDecision.navigate;
          },
        ),
      );
    if (controller.platform is AndroidWebViewController) {
      final android = controller.platform as AndroidWebViewController;
      android.setOnPlatformPermissionRequest((request) {
        request.grant();
      });
      await android.setGeolocationPermissionsPromptCallbacks(
        onShowPrompt: (request) async {
          return const GeolocationPermissionsResponse(allow: true, retain: true);
        },
      );
      android.setMediaPlaybackRequiresUserGesture(false);
      android.setOnShowFileSelector(_pickFiles);
    }
    try {
      await controller.loadRequest(Uri.parse(_startUrl));
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = 'Could not open $_startUrl';
          _loading = false;
        });
      }
    }
    if (!mounted) return;
    setState(() => _controller = controller);
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

  Future<void> _google() async {
    final c = _controller;
    if (c == null) return;
    Future<void> done(String? err, Map<String, String>? profile) async {
      final payload = err != null
          ? 'window._qbGoogleDone && window._qbGoogleDone(${jsonEncode(err)})'
          : 'window._qbGoogleDone && window._qbGoogleDone(null, ${jsonEncode(profile)})';
      try {
        await c.runJavaScript(payload);
      } catch (_) {}
    }

    try {
      final google = GoogleSignIn(
        scopes: const ['email', 'profile'],
        clientId: AppConfig.googleClientId.isEmpty ? null : AppConfig.googleClientId,
        serverClientId: AppConfig.googleClientId.isEmpty ? null : AppConfig.googleClientId,
      );
      final acc = await google.signIn();
      if (acc == null) {
        await done('Google sign-in cancelled', null);
        return;
      }
      await done(null, {
        'email': acc.email,
        'name': acc.displayName ?? acc.email,
        'sub': acc.id,
        'photo': acc.photoUrl ?? '',
      });
    } catch (e) {
      await done(e.toString().replaceFirst('Exception: ', ''), null);
    }
  }

  Future<void> _reload() async {
    setState(() {
      _error = null;
      _loading = true;
    });
    try {
      await _controller?.loadRequest(Uri.parse(_startUrl));
    } catch (_) {
      if (mounted) setState(() { _error = 'Could not open $_startUrl'; _loading = false; });
    }
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
            if (_controller != null) Positioned.fill(child: WebViewWidget(controller: _controller!)),
            if (_loading)
              Positioned.fill(
                child: ColoredBox(
                  color: _bg,
                  child: const Center(child: CircularProgressIndicator(color: Brand.green)),
                ),
              ),
            if (_error != null)
              Positioned.fill(
                child: ColoredBox(
                  color: _bg,
                  child: Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(_error!, textAlign: TextAlign.center, style: TextStyle(color: widget.role == UserRole.customer ? Brand.ink : Colors.white, fontWeight: FontWeight.w700)),
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
