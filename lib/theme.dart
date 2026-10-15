import 'package:flutter/material.dart';

class Brand {
  static const green = Color(0xFF00C853);
  static const ink = Color(0xFF111827);
  static const muted = Color(0xFF6B7280);
  static const soft = Color(0xFF9CA3AF);
  static const search = Color(0xFFF3F4F6);
  static const star = Color(0xFFF5B400);
  static const navy = Color(0xFF0B1220);
  static const navy2 = Color(0xFF121A2B);
  static const navy3 = Color(0xFF1A2438);
  static const teal = Color(0xFF0E8A96);
  static const gold = Color(0xFFE0A21A);
  static const purple = Color(0xFF7A56F5);
  static const blue = Color(0xFF2563EB);
  static const red = Color(0xFFE11D48);

  static ThemeData light() => ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: green, brightness: Brightness.light),
        scaffoldBackgroundColor: Colors.white,
        fontFamily: 'Roboto',
        appBarTheme: const AppBarTheme(
          backgroundColor: Colors.white,
          foregroundColor: ink,
          elevation: 0,
        ),
      );

  static ThemeData dark() => ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        colorScheme: ColorScheme.fromSeed(seedColor: green, brightness: Brightness.dark),
        scaffoldBackgroundColor: navy,
        fontFamily: 'Roboto',
        appBarTheme: const AppBarTheme(
          backgroundColor: navy,
          foregroundColor: Colors.white,
          elevation: 0,
        ),
      );
}
