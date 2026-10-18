import 'package:flutter/material.dart';
import '../data/repository.dart';
import '../models/message.dart';
import '../theme.dart';

class ChatScreen extends StatefulWidget {
  final String orderId;
  final String myRole;
  const ChatScreen({super.key, required this.orderId, required this.myRole});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _ctrl = TextEditingController();
  final _focus = FocusNode();

  static List<String> _quick(String role) {
    if (role == 'rider') {
      return const ["I'm on my way", "I've arrived", 'Order picked up', "I'm downstairs", 'Please come to the gate'];
    }
    return const ['Where are you?', "I'm at the gate", 'Please call me', 'Leave at the door', 'Thank you'];
  }

  @override
  void initState() {
    super.initState();
    OrderRepository.instance.markChatRead(widget.orderId);
    OrderRepository.instance.ordersNotifier.addListener(_tick);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _focus.requestFocus();
    });
  }

  @override
  void dispose() {
    OrderRepository.instance.ordersNotifier.removeListener(_tick);
    OrderRepository.instance.markChatRead(widget.orderId);
    _ctrl.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _tick() {
    if (mounted) setState(() {});
  }

  Future<void> _send([String? preset]) async {
    final text = (preset ?? _ctrl.text).trim();
    if (text.isEmpty) return;
    _ctrl.clear();
    final u = OrderRepository.instance.user;
    await OrderRepository.instance.sendMessage(widget.orderId, text, widget.myRole, u?.name ?? 'Me');
    OrderRepository.instance.markChatRead(widget.orderId);
    if (mounted) _focus.requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final msgs = OrderRepository.instance.messages[widget.orderId] ?? const <ChatMessage>[];
    final title = widget.myRole == 'rider' ? 'Customer' : 'Courier';
    final quick = _quick(widget.myRole);
    final inset = MediaQuery.viewInsetsOf(context).bottom;
    return Scaffold(
      backgroundColor: dark ? Brand.navy : Colors.white,
      resizeToAvoidBottomInset: true,
      appBar: AppBar(title: Text(title, style: const TextStyle(fontWeight: FontWeight.w800))),
      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
              reverse: true,
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.manual,
              itemCount: msgs.length,
              itemBuilder: (context, i) {
                final m = msgs[msgs.length - 1 - i];
                final me = m.role == widget.myRole;
                final sys = m.role == 'system';
                return Align(
                  alignment: sys
                      ? Alignment.center
                      : me
                          ? Alignment.centerRight
                          : Alignment.centerLeft,
                  child: Container(
                    margin: const EdgeInsets.symmetric(vertical: 4),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: sys
                          ? const Color(0xFFE6F9EE)
                          : me
                              ? (dark ? Brand.green : Colors.black)
                              : (dark ? Brand.navy3 : const Color(0xFFF3F3F3)),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Text(
                      m.text,
                      style: TextStyle(
                        color: sys
                            ? const Color(0xFF057A3F)
                            : me
                                ? (dark ? const Color(0xFF041A0C) : Colors.white)
                                : (dark ? Colors.white : Colors.black87),
                        fontSize: 14,
                        height: 1.35,
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
          SizedBox(
            height: 44,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
              children: quick
                  .map(
                    (t) => Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ActionChip(
                        label: Text(t, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12)),
                        onPressed: () => _send(t),
                        backgroundColor: dark ? Brand.navy2 : Colors.white,
                        side: BorderSide(color: dark ? const Color(0xFF1F2937) : const Color(0xFFE5E7EB)),
                      ),
                    ),
                  )
                  .toList(),
            ),
          ),
          Material(
            color: dark ? Brand.navy : Colors.white,
            child: Padding(
              padding: EdgeInsets.fromLTRB(8, 6, 8, 8 + (inset > 0 ? 0 : MediaQuery.paddingOf(context).bottom)),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _ctrl,
                      focusNode: _focus,
                      keyboardType: TextInputType.text,
                      textInputAction: TextInputAction.send,
                      textCapitalization: TextCapitalization.sentences,
                      autocorrect: true,
                      enableSuggestions: true,
                      style: const TextStyle(fontSize: 16),
                      decoration: InputDecoration(
                        hintText: widget.myRole == 'rider' ? 'Message the customer…' : 'Message…',
                        filled: true,
                        fillColor: dark ? Brand.navy2 : const Color(0xFFF3F4F6),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide.none),
                      ),
                      onSubmitted: (_) => _send(),
                    ),
                  ),
                  const SizedBox(width: 6),
                  IconButton.filled(
                    style: IconButton.styleFrom(backgroundColor: Brand.green),
                    onPressed: () => _send(),
                    icon: const Icon(Icons.send, color: Colors.white),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
