import 'package:flutter/material.dart';
import '../config.dart';
import '../data/repository.dart';

class SettingsButton extends StatelessWidget {
  const SettingsButton({super.key});

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: 'Server URL',
      icon: const Icon(Icons.cloud_outlined),
      onPressed: () => showServerDialog(context),
    );
  }
}

Future<void> showServerDialog(BuildContext context) async {
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
            'Paste only this, with no spaces:\nhttps://quickbite-2ao.pages.dev\n\nOn Pages, tap Enter demo (PIN 1234). WhatsApp OTP needs a Node host.',
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
  if (ok == true) {
    AppConfig.baseUrl = AppConfig.normalize(ctrl.text);
    await OrderRepository.instance.refresh();
  }
}

class ConnectionBanner extends StatelessWidget {
  const ConnectionBanner({super.key});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<bool>(
      valueListenable: OrderRepository.instance.connectedNotifier,
      builder: (context, connected, _) {
        if (connected) {
          return const SizedBox.shrink();
        }
        return Material(
          color: Colors.orange.shade100,
          child: InkWell(
            onTap: () => showServerDialog(context),
            child: const Padding(
              padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(
                children: [
                  Icon(Icons.wifi_off, size: 18, color: Colors.orange),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Not linked. Tap to paste the shared server URL.',
                      style: TextStyle(fontSize: 13),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
