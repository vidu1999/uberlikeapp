import 'package:flutter/material.dart';
import 'data/repository.dart';
import 'models/message.dart';
import 'screens/login_screen.dart';
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
    final seed = switch (defaultRole) {
      UserRole.customer => const Color(0xFF00C853),
      UserRole.shop => const Color(0xFFFF6D00),
      UserRole.rider => const Color(0xFF2979FF),
    };
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: switch (defaultRole) {
        UserRole.customer => 'SwiftDrop User',
        UserRole.shop => 'SwiftDrop Shop',
        UserRole.rider => 'SwiftDrop Rider',
      },
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: seed),
        useMaterial3: true,
        scaffoldBackgroundColor: const Color(0xFFF5F7FA),
      ),
      home: AuthGate(role: defaultRole),
    );
  }
}

class AuthGate extends StatelessWidget {
  final UserRole role;
  const AuthGate({super.key, required this.role});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<SessionUser?>(
      valueListenable: OrderRepository.instance.userNotifier,
      builder: (context, user, _) {
        if (user == null) return LoginScreen(role: role);
        return MainShell(initialRole: role);
      },
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
