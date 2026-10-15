import 'package:flutter/material.dart';
import 'data/repository.dart';
import 'screens/user/customer_home.dart';
import 'screens/shop/shop_home.dart';
import 'screens/rider/rider_home.dart';

enum UserRole { customer, shop, rider }

class LiveTrackingApp extends StatelessWidget {
  final UserRole defaultRole;
  const LiveTrackingApp({super.key, this.defaultRole = UserRole.customer});

  @override
  Widget build(BuildContext context) {
    OrderRepository.instance.seed();
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Live Tracking Delivery',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.blue),
        useMaterial3: true,
        scaffoldBackgroundColor: const Color(0xFFF5F7FA),
      ),
      home: MainShell(initialRole: defaultRole),
    );
  }
}

class MainShell extends StatefulWidget {
  final UserRole initialRole;
  const MainShell({super.key, required this.initialRole});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  late UserRole _role = widget.initialRole;

  void _switchRole(UserRole r) => setState(() => _role = r);

  @override
  Widget build(BuildContext context) {
    switch (_role) {
      case UserRole.customer:
        return CustomerHome(onSwitchRole: _switchRole, currentRole: _role);
      case UserRole.shop:
        return ShopHome(onSwitchRole: _switchRole, currentRole: _role);
      case UserRole.rider:
        return RiderHome(onSwitchRole: _switchRole, currentRole: _role);
    }
  }
}
