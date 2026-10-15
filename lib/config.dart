class AppConfig {
  /// Shared backend. Paste the live server URL (from the web studio) so the
  /// User, Shop, and Rider APKs all talk to the same orders.
  static String baseUrl = const String.fromEnvironment(
    'API_URL',
    defaultValue: '',
  );

  static String normalize(String raw) {
    var v = raw.trim();
    if (v.endsWith('/')) v = v.substring(0, v.length - 1);
    return v;
  }
}
