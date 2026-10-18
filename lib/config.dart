class AppConfig {
  /// Public site. Cloudflare Pages has no Node OTP API — apps use Supabase.
  static String baseUrl = const String.fromEnvironment(
    'API_URL',
    defaultValue: 'https://quickbite-2ao.pages.dev',
  );

  /// Direct Supabase REST — shops, menus, orders, accounts.
  static String supabaseUrl = const String.fromEnvironment(
    'SUPABASE_URL',
    defaultValue: 'https://ofbirobpstnzlriwscwu.supabase.co',
  );
  static String googleClientId = const String.fromEnvironment(
    'GOOGLE_CLIENT_ID',
    defaultValue: '',
  );

  static String supabaseAnon = const String.fromEnvironment(
    'SUPABASE_ANON',
    defaultValue:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9mYmlyb2Jwc3RuemxyaXdzY3d1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwODQwOTMsImV4cCI6MjEwNzY2MDA5M30.wBvvk2YVGXmrQP5Xmovau7yF1NS407n3NhxSIEXEE74',
  );

  static String normalize(String raw) {
    var v = raw.trim();
    final md = RegExp(r'https?://[^\s\)\]]+').firstMatch(v);
    if (md != null) v = md.group(0)!;
    v = v.replaceAll(RegExp(r'[\s`\[\]\(\)]+'), '');
    if (v.startsWith('http://')) v = 'https://${v.substring(7)}';
    if (v.isNotEmpty && !v.startsWith('http')) v = 'https://$v';
    while (v.endsWith('/')) {
      v = v.substring(0, v.length - 1);
    }
    try {
      final u = Uri.parse(v);
      if (u.host.isNotEmpty) {
        v = '${u.scheme}://${u.host}';
      }
    } catch (_) {}
    return v;
  }

  static bool get isStaticHost {
    final host = Uri.tryParse(baseUrl)?.host ?? '';
    return host.endsWith('.pages.dev') ||
        host.endsWith('.github.io') ||
        host.endsWith('.netlify.app') ||
        host.endsWith('.vercel.app');
  }
}
