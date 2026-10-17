import 'package:flutter/material.dart';
import 'app.dart';
import 'data/repository.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await OrderRepository.instance.restore();
  runApp(const LiveTrackingApp(defaultRole: UserRole.customer));
}
