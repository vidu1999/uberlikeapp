import 'package:flutter/material.dart';
import '../data/repository.dart';
import '../models/message.dart';

class ChatScreen extends StatefulWidget {
  final String orderId;
  final String myRole;
  const ChatScreen({super.key, required this.orderId, required this.myRole});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _ctrl = TextEditingController();

  Future<void> _send() async {
    final text = _ctrl.text.trim();
    if (text.isEmpty) return;
    _ctrl.clear();
    final u = OrderRepository.instance.user;
    await OrderRepository.instance.sendMessage(widget.orderId, text, widget.myRole, u?.name ?? 'Me');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Chat')),
      body: Column(
        children: [
          Expanded(
            child: ValueListenableBuilder(
              valueListenable: OrderRepository.instance.ordersNotifier,
              builder: (context, _, __) {
                final msgs = OrderRepository.instance.messages[widget.orderId] ?? const <ChatMessage>[];
                return ListView.builder(
                  padding: const EdgeInsets.all(12),
                  itemCount: msgs.length,
                  itemBuilder: (context, i) {
                    final m = msgs[i];
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
                              ? Colors.green.shade50
                              : me
                                  ? Colors.black
                                  : Colors.white,
                          borderRadius: BorderRadius.circular(14),
                          boxShadow: const [BoxShadow(color: Colors.black12, blurRadius: 6)],
                        ),
                        child: Text(
                          m.text,
                          style: TextStyle(color: me && !sys ? Colors.white : Colors.black87, fontSize: 13),
                        ),
                      ),
                    );
                  },
                );
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(8),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _ctrl,
                    decoration: const InputDecoration(hintText: 'Message…', border: OutlineInputBorder()),
                    onSubmitted: (_) => _send(),
                  ),
                ),
                IconButton(onPressed: _send, icon: const Icon(Icons.send)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
