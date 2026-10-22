import 'package:flutter/material.dart';
import '../../data/pay_cards.dart';
import '../../theme.dart';

class PaymentMethodsScreen extends StatefulWidget {
  const PaymentMethodsScreen({super.key});

  @override
  State<PaymentMethodsScreen> createState() => _PaymentMethodsScreenState();
}

class _PaymentMethodsScreenState extends State<PaymentMethodsScreen> {
  final _number = TextEditingController();
  final _name = TextEditingController();
  final _exp = TextEditingController();
  final _cvc = TextEditingController();
  String? err;
  bool adding = false;
  bool busy = false;

  @override
  void dispose() {
    _number.dispose();
    _name.dispose();
    _exp.dispose();
    _cvc.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      busy = true;
      err = PayCards.validate(number: _number.text, name: _name.text, exp: _exp.text, cvc: _cvc.text);
    });
    if (err != null) {
      setState(() => busy = false);
      return;
    }
    await PayCards.add(number: _number.text, name: _name.text, exp: _exp.text);
    _number.clear();
    _name.clear();
    _exp.clear();
    _cvc.clear();
    if (mounted) {
      setState(() {
        busy = false;
        adding = false;
        err = null;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(title: const Text('Payment Methods', style: TextStyle(fontWeight: FontWeight.w800))),
      body: ValueListenableBuilder<List<SavedCard>>(
        valueListenable: PayCards.notifier,
        builder: (context, cards, _) {
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
            children: [
              const Text('Saved cards', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
              const SizedBox(height: 6),
              const Text(
                'Only the brand, last four digits and expiry are kept on this device. Full card number and CVC are never stored.',
                style: TextStyle(color: Brand.muted, fontSize: 13),
              ),
              const SizedBox(height: 12),
              if (cards.isEmpty && !adding)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 24),
                  child: Text('No cards yet. Add a debit or credit card.', style: TextStyle(color: Brand.muted)),
                ),
              ...cards.map(
                (c) => Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.fromLTRB(14, 12, 4, 12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF7F8FA),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.credit_card, color: Brand.green),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(c.label, style: const TextStyle(fontWeight: FontWeight.w800)),
                            Text('Expires ${c.exp}${c.name.isEmpty ? '' : ' · ${c.name}'}', style: const TextStyle(color: Brand.muted, fontSize: 12)),
                          ],
                        ),
                      ),
                      IconButton(
                        onPressed: () => PayCards.remove(c.id),
                        icon: const Icon(Icons.delete_outline, color: Color(0xFF9CA3AF)),
                      ),
                    ],
                  ),
                ),
              ),
              if (adding) ...[
                const SizedBox(height: 8),
                TextField(
                  controller: _number,
                  keyboardType: TextInputType.number,
                  onChanged: (v) {
                    final f = PayCards.formatNumber(v);
                    if (f != v) {
                      _number.value = TextEditingValue(text: f, selection: TextSelection.collapsed(offset: f.length));
                    }
                    setState(() {});
                  },
                  decoration: InputDecoration(
                    labelText: 'Card number',
                    hintText: 'ACCT-000015',
                    suffixText: PayCards.brand(_number.text) == 'Card' ? null : PayCards.brand(_number.text),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _name,
                  textCapitalization: TextCapitalization.words,
                  decoration: InputDecoration(
                    labelText: 'Name on card',
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _exp,
                        keyboardType: TextInputType.number,
                        onChanged: (v) {
                          final f = PayCards.formatExp(v);
                          if (f != v) {
                            _exp.value = TextEditingValue(text: f, selection: TextSelection.collapsed(offset: f.length));
                          }
                        },
                        decoration: InputDecoration(
                          labelText: 'Expiry',
                          hintText: 'MM/YY',
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: TextField(
                        controller: _cvc,
                        keyboardType: TextInputType.number,
                        obscureText: true,
                        decoration: InputDecoration(
                          labelText: 'CVC',
                          hintText: '123',
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
                        ),
                      ),
                    ),
                  ],
                ),
                if (err != null) ...[
                  const SizedBox(height: 8),
                  Text(err!, style: const TextStyle(color: Color(0xFFB91C1C), fontWeight: FontWeight.w600)),
                ],
                const SizedBox(height: 12),
                FilledButton(
                  style: FilledButton.styleFrom(backgroundColor: Brand.green, minimumSize: const Size.fromHeight(48)),
                  onPressed: busy ? null : _save,
                  child: Text(busy ? 'Saving…' : 'Save card', style: const TextStyle(fontWeight: FontWeight.w800)),
                ),
                TextButton(
                  onPressed: () => setState(() {
                    adding = false;
                    err = null;
                  }),
                  child: const Text('Cancel'),
                ),
              ] else
                FilledButton(
                  style: FilledButton.styleFrom(backgroundColor: Brand.green, minimumSize: const Size.fromHeight(48)),
                  onPressed: () => setState(() => adding = true),
                  child: const Text('Add debit / credit card', style: TextStyle(fontWeight: FontWeight.w800)),
                ),
            ],
          );
        },
      ),
    );
  }
}
