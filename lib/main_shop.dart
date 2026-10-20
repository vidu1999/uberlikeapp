import 'package:flutter/material.dart';
import 'app.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const LiveTrackingApp(defaultRole: UserRole.shop));
}
