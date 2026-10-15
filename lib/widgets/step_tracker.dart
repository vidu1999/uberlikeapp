import 'package:flutter/material.dart';
import '../models/order.dart';

class StepTracker extends StatelessWidget {
  final OrderStatus currentStatus;
  const StepTracker({super.key, required this.currentStatus});

  @override
  Widget build(BuildContext context) {
    final steps = <String>[
      'Order Placed',
      'Preparing',
      'Ready for Pickup',
      'Out for Delivery',
      'Delivered',
    ];
    final idx = currentStatus.step.clamp(0, steps.length - 1);
    return Column(
      children: List.generate(steps.length, (i) {
        final done = i <= idx;
        final active = i == idx;
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Column(
              children: [
                Container(
                  width: 24,
                  height: 24,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: done ? Colors.blue : Colors.grey.shade300,
                  ),
                  child: done
                      ? const Icon(Icons.check, size: 14, color: Colors.white)
                      : null,
                ),
                if (i < steps.length - 1)
                  Container(width: 2, height: 30, color: done ? Colors.blue : Colors.grey.shade300),
              ],
            ),
            const SizedBox(width: 12),
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(
                steps[i],
                style: TextStyle(
                  fontWeight: active ? FontWeight.bold : FontWeight.normal,
                  color: done ? Colors.black : Colors.grey,
                ),
              ),
            ),
          ],
        );
      }),
    );
  }
}
