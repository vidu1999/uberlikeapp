import 'package:flutter_test/flutter_test.dart';
import 'package:uberlikeapp/app.dart';

void main() {
  testWidgets('login loads', (tester) async {
    await tester.pumpWidget(const LiveTrackingApp(defaultRole: UserRole.customer));
    await tester.pump();
    expect(find.textContaining('minutes'), findsWidgets);
  });
}
