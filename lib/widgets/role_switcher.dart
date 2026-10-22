import 'package:flutter/material.dart';
import '../app.dart';

class RoleSwitcher extends StatelessWidget {
  final UserRole currentRole;
  final ValueChanged<UserRole> onSwitchRole;
  const RoleSwitcher({super.key, required this.currentRole, required this.onSwitchRole});

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<UserRole>(
      icon: const Icon(Icons.swap_horiz),
      tooltip: 'Preview other roles',
      onSelected: onSwitchRole,
      itemBuilder: (_) => UserRole.values
          .map(
            (r) => PopupMenuItem<UserRole>(
              value: r,
              child: Row(
                children: [
                  Icon(
                    r == UserRole.customer
                        ? Icons.person
                        : r == UserRole.shop
                            ? Icons.store
                            : Icons.delivery_dining,
                    color: r == currentRole ? Theme.of(context).colorScheme.primary : null,
                  ),
                  const SizedBox(width: 8),
                  Text(r.name.toUpperCase()),
                ],
              ),
            ),
          )
          .toList(),
    );
  }
}
