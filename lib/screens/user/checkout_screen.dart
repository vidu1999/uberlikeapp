import 'package:flutter/material.dart';
import '../../data/pay_cards.dart';
import '../../data/place.dart';
import '../../data/repository.dart';
import '../../theme.dart';
import 'location_picker.dart';
import 'order_tracking_screen.dart';

class CheckoutScreen extends StatefulWidget {
  const CheckoutScreen({super.key});

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  late final _addr = TextEditingController(text: UserPlace.instance.label);
  final _cardNum = TextEditingController();
  final _cardName = TextEditingController();
  final _cardExp = TextEditingController();
  final _cardCvc = TextEditingController();
  String ship = 'standard';
  String pay = 'cash';
  String cardId = 'new';
  bool saveCard = true;
  String? cardErr;
  bool placing = false;
  Map<String, dynamic>? _capturedPay;

  int get fee => ship == 'express' ? 360 : 200;

  @override
  void initState() {
    super.initState();
    UserPlace.instance.start();
    UserPlace.instance.notifier.addListener(_syncAddr);
    UserPlace.instance.liveNotifier.addListener(_syncAddr);
  }

  void _syncAddr() {
    if (!mounted) return;
    final p = UserPlace.instance;
    if (p.custom || p.frozen) return;
    if (_addr.text == p.label) return;
    setState(() => _addr.text = p.label);
  }

  @override
  void dispose() {
    UserPlace.instance.notifier.removeListener(_syncAddr);
    UserPlace.instance.liveNotifier.removeListener(_syncAddr);
    _addr.dispose();
    _cardNum.dispose();
    _cardName.dispose();
    _cardExp.dispose();
    _cardCvc.dispose();
    super.dispose();
  }

  Future<bool> _verifyWhatsApp() async {
    final repo = OrderRepository.instance;
    if (repo.isWhatsAppVerified()) return true;
    final phoneCtrl = TextEditingController();
    final codeCtrl = TextEditingController();
    var step = 'phone';
    var err = '';
    var busy = false;
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setModal) {
            return Padding(
              padding: EdgeInsets.only(left: 20, right: 20, top: 20, bottom: 20 + MediaQuery.of(ctx).viewInsets.bottom),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text('Verify WhatsApp to place this order', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
                  const SizedBox(height: 8),
                  const Text('Google and email logins must verify WhatsApp once. After that you can order anytime.', style: TextStyle(color: Color(0xFF6B7280))),
                  const SizedBox(height: 12),
                  if (step == 'phone')
                    TextField(
                      controller: phoneCtrl,
                      keyboardType: TextInputType.phone,
                      decoration: const InputDecoration(labelText: 'WhatsApp number', hintText: '07X XXX XXXX', border: OutlineInputBorder()),
                    )
                  else
                    TextField(
                      controller: codeCtrl,
                      keyboardType: TextInputType.number,
                      maxLength: 4,
                      decoration: InputDecoration(labelText: '4-digit code sent to ${phoneCtrl.text}', border: const OutlineInputBorder()),
                    ),
                  if (err.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(err, style: const TextStyle(color: Color(0xFFB91C1C))),
                  ],
                  const SizedBox(height: 12),
                  FilledButton(
                    style: FilledButton.styleFrom(backgroundColor: Brand.green),
                    onPressed: busy
                        ? null
                        : () async {
                            setModal(() {
                              busy = true;
                              err = '';
                            });
                            try {
                              if (step == 'phone') {
                                final out = await repo.sendOtp('customer', phoneCtrl.text);
                                phoneCtrl.text = out?['phone']?.toString() ?? phoneCtrl.text;
                                setModal(() {
                                  step = 'code';
                                  busy = false;
                                });
                              } else {
                                final okCode = await repo.verifyOtp('customer', phoneCtrl.text, codeCtrl.text);
                                if (!okCode) throw Exception('That code does not match this phone number.');
                                if (ctx.mounted) Navigator.pop(ctx, true);
                              }
                            } catch (e) {
                              setModal(() {
                                busy = false;
                                err = e.toString().replaceFirst('Exception: ', '');
                              });
                            }
                          },
                    child: Text(busy ? 'Please wait…' : (step == 'phone' ? 'Send WhatsApp code' : 'Verify & place order')),
                  ),
                  TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
                ],
              ),
            );
          },
        );
      },
    );
    phoneCtrl.dispose();
    codeCtrl.dispose();
    return ok == true && repo.isWhatsAppVerified();
  }

  List<Widget> _cardFields() {
    final cards = PayCards.cards;
    final useSaved = cardId != 'new' && cards.any((c) => c.id == cardId);
    return [
      if (cards.isNotEmpty) ...[
        ...cards.map(
          (c) => RadioListTile<String>(
            value: c.id,
            groupValue: cardId,
            onChanged: (v) => setState(() { cardId = v!; cardErr = null; }),
            title: Text(c.label, style: const TextStyle(fontWeight: FontWeight.w700)),
            subtitle: Text('Expires ${c.exp}', style: const TextStyle(fontSize: 12)),
            activeColor: Brand.green,
            dense: true,
          ),
        ),
        RadioListTile<String>(
          value: 'new',
          groupValue: cardId,
          onChanged: (v) => setState(() { cardId = v!; cardErr = null; }),
          title: const Text('Add a new card'),
          activeColor: Brand.green,
          dense: true,
        ),
      ],
      if (!useSaved) ...[
        TextField(
          controller: _cardNum,
          keyboardType: TextInputType.number,
          onChanged: (v) {
            final f = PayCards.formatNumber(v);
            if (f != v) _cardNum.value = TextEditingValue(text: f, selection: TextSelection.collapsed(offset: f.length));
            setState(() {});
          },
          decoration: InputDecoration(
            labelText: 'Card number',
            hintText: 'ACCT-000015',
            suffixText: PayCards.brand(_cardNum.text) == 'Card' ? null : PayCards.brand(_cardNum.text),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
          ),
        ),
        const SizedBox(height: 10),
        TextField(
          controller: _cardName,
          textCapitalization: TextCapitalization.words,
          decoration: InputDecoration(
            labelText: 'Name on card',
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
          ),
        ),
        const SizedBox(height: 10),
      ],
      Row(
        children: [
          if (!useSaved)
            Expanded(
              child: TextField(
                controller: _cardExp,
                keyboardType: TextInputType.number,
                onChanged: (v) {
                  final f = PayCards.formatExp(v);
                  if (f != v) _cardExp.value = TextEditingValue(text: f, selection: TextSelection.collapsed(offset: f.length));
                },
                decoration: InputDecoration(
                  labelText: 'Expiry',
                  hintText: 'MM/YY',
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
                ),
              ),
            ),
          if (!useSaved) const SizedBox(width: 10),
          Expanded(
            child: TextField(
              controller: _cardCvc,
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
      if (!useSaved)
        CheckboxListTile(
          value: saveCard,
          onChanged: (v) => setState(() => saveCard = v ?? true),
          title: const Text('Save this card for next orders'),
          controlAffinity: ListTileControlAffinity.leading,
          contentPadding: EdgeInsets.zero,
          activeColor: Brand.green,
        ),
      if (cardErr != null) Text(cardErr!, style: const TextStyle(color: Color(0xFFB91C1C), fontWeight: FontWeight.w600)),
      const Padding(
        padding: EdgeInsets.only(bottom: 8),
        child: Text('Full card number and CVC are never stored.', style: TextStyle(color: Brand.muted, fontSize: 12)),
      ),
    ];
  }

  Future<void> _place() async {
    setState(() => placing = true);
    try {
      String paymentMethod = 'Cash on delivery';
      Map<String, dynamic>? payment = _capturedPay;
      if (pay == 'card') {
        final cards = PayCards.cards;
        SavedCard? saved;
        for (final c in cards) {
          if (c.id == cardId) saved = c;
        }
        final err = PayCards.validate(
          number: _cardNum.text,
          name: _cardName.text,
          exp: _cardExp.text,
          cvc: _cardCvc.text,
          savedBrand: saved?.brand,
        );
        if (err != null) {
          if (mounted) setState(() { placing = false; cardErr = err; });
          return;
        }
        if (saved != null) {
          paymentMethod = saved.label;
        } else {
          if (saveCard) {
            final added = await PayCards.add(number: _cardNum.text, name: _cardName.text, exp: _cardExp.text);
            paymentMethod = added.label;
          } else {
            final d = PayCards.digits(_cardNum.text);
            paymentMethod = '${PayCards.brand(d)} •••• ${d.substring(d.length - 4)}';
          }
        }
        if (payment == null) {
          final d = PayCards.digits(_cardNum.text);
          payment = await PayCards.charge(
            amount: (OrderRepository.instance.cartTotal + fee).toDouble(),
            shopCredit: OrderRepository.instance.cartTotal,
            riderCredit: fee.toDouble(),
            brand: saved?.brand ?? PayCards.brand(_cardNum.text),
            last4: saved?.last4 ?? (d.length >= 4 ? d.substring(d.length - 4) : ''),
            number: _cardNum.text,
          );
        }
        _capturedPay = payment;
        paymentMethod = '${payment['brand']} •••• ${payment['last4']}';
      }
      if (!OrderRepository.instance.isWhatsAppVerified()) {
        final verified = await _verifyWhatsApp();
        if (!verified) {
          if (mounted) setState(() => placing = false);
          return;
        }
      }
      final place = UserPlace.instance;
      final lat = (place.custom || place.frozen) ? place.lat : (place.liveLat ?? place.lat);
      final lng = (place.custom || place.frozen) ? place.lng : (place.liveLng ?? place.lng);
      final order = await OrderRepository.instance.checkout(
        address: _addr.text,
        paymentMethod: paymentMethod,
        deliveryLat: lat,
        deliveryLng: lng,
        deliveryFee: fee.toDouble(),
        payment: payment,
      );
      if (!mounted) return;
      setState(() => placing = false);
      _capturedPay = null;
      if (order == null) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not place order.')));
        return;
      }
      UserPlace.instance.freezeDelivery();
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => OrderTrackingScreen(orderId: order.id)),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => placing = false);
      final msg = e.toString().replaceFirst('Exception: ', '');
      if (msg == 'WHATSAPP_REQUIRED') {
        final verified = await _verifyWhatsApp();
        if (verified) {
          await _place();
        }
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final sub = OrderRepository.instance.cartTotal;
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(title: const Text('Checkout', style: TextStyle(fontWeight: FontWeight.w800))),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text('Delivery Address', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
              onPressed: () async {
                await Navigator.push(context, MaterialPageRoute(builder: (_) => const LocationPickerScreen()));
                if (mounted) setState(() => _addr.text = UserPlace.instance.label);
              },
              child: const Text('Change on map', style: TextStyle(color: Brand.green, fontWeight: FontWeight.w800)),
            ),
          ),
          TextField(
            controller: _addr,
            maxLines: 2,
            decoration: InputDecoration(
              prefixIcon: const Icon(Icons.location_on, color: Brand.green),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(16)),
            ),
          ),
          const SizedBox(height: 18),
          const Text('Delivery Type', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
          RadioListTile<String>(
            value: 'standard',
            groupValue: ship,
            onChanged: (v) => setState(() => ship = v!),
            title: const Text('Standard (30–45 min)'),
            secondary: const Text('Rs. 200', style: TextStyle(fontWeight: FontWeight.w700)),
            activeColor: Brand.green,
          ),
          RadioListTile<String>(
            value: 'express',
            groupValue: ship,
            onChanged: (v) => setState(() => ship = v!),
            title: const Text('Express (15–25 min)'),
            secondary: const Text('Rs. 360', style: TextStyle(fontWeight: FontWeight.w700)),
            activeColor: Brand.green,
          ),
          const SizedBox(height: 8),
          const Text('Payment Method', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
          RadioListTile<String>(
            value: 'cash',
            groupValue: pay,
            onChanged: (v) => setState(() { pay = v!; cardErr = null; _capturedPay = null; }),
            title: const Text('Cash on Delivery'),
            activeColor: Brand.green,
          ),
          RadioListTile<String>(
            value: 'card',
            groupValue: pay,
            onChanged: (v) => setState(() {
              pay = v!;
              cardErr = null;
              _capturedPay = null;
              if (PayCards.cards.isNotEmpty) cardId = PayCards.cards.first.id;
            }),
            title: const Text('Debit / Credit card'),
            activeColor: Brand.green,
          ),
          if (pay == 'card') ..._cardFields(),
          RadioListTile<String>(
            value: 'wallet',
            groupValue: pay,
            onChanged: null,
            title: const Text('Online Wallet (Coming Soon)'),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              const Text('Total', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
              const Spacer(),
              Text('Rs. ${(sub + fee).toStringAsFixed(0)}', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
            ],
          ),
          const SizedBox(height: 16),
          SizedBox(
            height: 54,
            child: FilledButton(
              style: FilledButton.styleFrom(backgroundColor: Brand.green, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28))),
              onPressed: placing ? null : _place,
              child: Text(
                placing ? (pay == 'card' ? 'Paying…' : 'Placing…') : (pay == 'card' ? 'Pay Rs. ${(sub + fee).toStringAsFixed(0)}' : 'Place Order'),
                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
