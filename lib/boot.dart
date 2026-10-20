import 'package:flutter/material.dart';

import 'app.dart';

void bootApp(UserRole role) {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(LiveTrackingApp(defaultRole: role));
}
