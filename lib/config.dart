class AppConfig {
  /// Shared Node API (OTP). Paste the live server URL in the APK if you need WhatsApp OTP.
  static String baseUrl = const String.fromEnvironment(
    'API_URL',
    defaultValue: '',
  );

  /// Direct Supabase REST — shops, menus, orders, accounts.
  static String supabaseUrl = const String.fromEnvironment(
    'SUPABASE_URL',
    defaultValue: 'https://ofbirobpstnzlriwscwu.supabase.co',
  );
  static String supabaseAnon = const String.fromEnvironment(
    'SUPABASE_ANON',
    defaultValue:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9mYmlyb2Jwc3RuemxyaXdzY3d1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwODQwOTMsImV4cCI6MjEwNzY2MDA5M30.wBvvk2YVGXmrQP5Xmovau7yF1NS407n3NhxSIEXEE74',
  );

  static String normalize(String raw) {
    var v = raw.trim();
    if (v.endsWith('/')) v = v.substring(0, v.length - 1);
    return v;
  }
}
