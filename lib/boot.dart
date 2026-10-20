import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

import 'app.dart';

void bootApp(UserRole role) {
  WidgetsFlutterBinding.ensureInitialized();
  FlutterError.onError = (details) {
    if (kDebugMode) FlutterError.presentError(details);
  };
  try {
    if (Platform.isAndroid) {
      WebViewPlatform.instance = AndroidWebViewPlatform();
    }
  } catch (_) {}
  runZonedGuarded(() {
    runApp(LiveTrackingApp(defaultRole: role));
  }, (e, s) {});
}
