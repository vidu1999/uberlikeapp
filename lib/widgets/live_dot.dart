import 'package:flutter/material.dart';

class LiveDot extends StatefulWidget {
  final double size;
  const LiveDot({super.key, this.size = 22});

  @override
  State<LiveDot> createState() => _LiveDotState();
}

class _LiveDotState extends State<LiveDot> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1800))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.size;
    return SizedBox(
      width: s * 2.6,
      height: s * 2.6,
      child: AnimatedBuilder(
        animation: _c,
        builder: (_, __) {
          final t = _c.value;
          return Stack(
            alignment: Alignment.center,
            children: [
              _ring(t),
              _ring((t + 0.45) % 1),
              Container(
                width: s * 0.72,
                height: s * 0.72,
                decoration: BoxDecoration(
                  color: const Color(0xFF1A73E8),
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white, width: 3),
                  boxShadow: const [BoxShadow(color: Color(0x661A73E8), blurRadius: 6)],
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _ring(double t) {
    final s = widget.size * (1 + t * 2.4);
    return Container(
      width: s,
      height: s,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: Color.fromRGBO(26, 115, 232, (0.45 * (1 - t)).clamp(0, 1)),
      ),
    );
  }
}
