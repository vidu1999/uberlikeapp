class AppConfig {
  /// Shared Node API (OTP, writes). Paste the live server URL in the APK.
  static String baseUrl = const String.fromEnvironment(
    'API_URL',
    defaultValue: '',
  );

  /// Optional direct Supabase REST. If empty, loaded from `/api/config`.
  static String supabaseUrl = const String.fromEnvironment(
    'SUPABASE_URL',
    defaultValue: '',
  );
  static String supabaseAnon = const String.fromEnvironment(
    'SUPABASE_ANON',
    defaultValue: '',
  );

  static String normalize(String raw) {
    var v = raw.trim();
    if (v.endsWith('/')) v = v.substring(0, v.length - 1);
    return v;
  }
}
