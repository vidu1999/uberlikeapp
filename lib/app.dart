import 'package:flutter/material.dart';
import 'data/repository.dart';
import 'models/message.dart';
import 'screens/welcome_flow.dart';
import 'screens/user/customer_home.dart';
import 'screens/user/location_allow.dart';
import 'screens/login_screen.dart';
import 'screens/shop/shop_home.dart';
import 'screens/rider/rider_home.dart';
import 'theme.dart';

enum UserRole { customer, shop, rider }

class LiveTrackingApp extends StatelessWidget {
  final UserRole defaultRole;
  const LiveTrackingApp({super.key, this.defaultRole = UserRole.customer});

  @override
  Widget build(BuildContext context) {
    OrderRepository.instance.seed();
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: switch (defaultRole) {
        UserRole.customer => 'User App',
        UserRole.shop => 'Shop Dashboard',
        UserRole.rider => 'Rider App',
      },
      theme: defaultRole == UserRole.customer ? Brand.light() : Brand.dark(),
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
        if (user == null) return WelcomeFlow(role: role);
        final repo = OrderRepository.instance;
        if (role == UserRole.shop && !repo.isShopRegistered) {
          final sid = user.shopId;
          final digits = user.phone.replaceAll(RegExp(r'\D'), '');
          final realWa = RegExp(r'^07\d{8}$').hasMatch(digits);
          if ((sid == null || sid.isEmpty || sid == 'null') && !realWa) {
            repo.promptShopRegister = true;
            return LoginScreen(role: role);
          }
        }
        if (role == UserRole.rider && !repo.isRiderRegistered) {
          return LoginScreen(role: role);
        }
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
        return LocationAllowGate(
          child: CustomerHome(onSwitchRole: _switchRole, currentRole: _role),
        );
      case UserRole.shop:
        return ShopHome(onSwitchRole: _switchRole, currentRole: _role);
      case UserRole.rider:
        return RiderHome(onSwitchRole: _switchRole, currentRole: _role);
    }
  }
}
