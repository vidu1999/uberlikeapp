# SwiftDrop — User + Shop + Rider

A complete Uber-style delivery product: **three apps, one live backend**.

```
User carts & pays COD  →  Shop accepts / cooks / marks ready  →  Rider GPS  →  User map + chat  →  Delivered
```

## Live studio

```bash
node server/index.js
```

Open `http://localhost:3000` — three phones side by side, already logged in.

| Role | Phone | PIN |
| --- | --- | --- |
| Customer (Sahan) | 0771234567 | 1234 |
| Shop (Nadeesha) | 0772223333 | 1234 |
| Rider (Kamal) | 0775556666 | 1234 |

Included: search, shop menus, cart, checkout, kitchen board, menu sold-out toggles, rider jobs, live OSM map, in-order chat, cash on delivery, ratings, earnings.

## Android APKs

Different package names — install all three on one phone.

- [user.apk](https://github.com/vidu1999/uberlikeapp/releases/download/swiftdrop-1.0.0/user.apk) `com.uberlike.customer`
- [shop.apk](https://github.com/vidu1999/uberlikeapp/releases/download/swiftdrop-1.0.0/shop.apk) `com.uberlike.shop`
- [rider.apk](https://github.com/vidu1999/uberlikeapp/releases/download/swiftdrop-1.0.0/rider.apk) `com.uberlike.rider`

Release: [swiftdrop-1.0.0](https://github.com/vidu1999/uberlikeapp/releases/tag/swiftdrop-1.0.0)

Paste the studio URL into each APK (cloud icon) so they share orders.

## Flutter

```bash
flutter pub get
flutter run -t lib/main_user.dart
flutter run -t lib/main_shop.dart
flutter run -t lib/main_rider.dart
```
