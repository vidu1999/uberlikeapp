import 'package:flutter/material.dart';
import 'screens/web_shell.dart';
import 'theme.dart';

enum UserRole { customer, shop, rider }

class LiveTrackingApp extends StatelessWidget {
  final UserRole defaultRole;
  const LiveTrackingApp({super.key, this.defaultRole = UserRole.customer});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: switch (defaultRole) {
        UserRole.customer => 'QuickBite',
        UserRole.shop => 'Shop Dashboard',
        UserRole.rider => 'QuickBite Rider',
      },
      theme: defaultRole == UserRole.customer ? Brand.light() : Brand.dark(),
      home: WebShell(role: defaultRole),
    );
  }
}
