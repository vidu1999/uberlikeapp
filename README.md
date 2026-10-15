# SwiftDrop — 3 linked delivery apps

Uber-style **User**, **Shop**, and **Rider** apps that share one live backend.

```
User searches & orders  →  Shop accepts / prepares / marks ready  →  Rider picks up (live GPS)  →  User map tracks the bike  →  Delivered
```

## Try it now (web studio)

Run the shared server:

```bash
node server/index.js
```

Open the studio at `http://localhost:3000`. You will see all three apps side by side. They update each other over Server-Sent Events — no Firebase key required.

## Three Android APKs

GitHub Actions builds three **different** APKs (they can be installed on the same phone together):

| APK | Application ID | Entry |
| --- | --- | --- |
| `user.apk` | `com.uberlike.customer` | `lib/main_user.dart` |
| `shop.apk` | `com.uberlike.shop` | `lib/main_shop.dart` |
| `rider.apk` | `com.uberlike.rider` | `lib/main_rider.dart` |

Download them from the **Actions → Build APKs → swiftdrop-apks** artifact.

On first launch tap the **cloud icon** and paste the studio server URL so every APK talks to the same orders.

Release APKs allow cleartext HTTP so a laptop LAN address such as `http://192.168.1.8:3000` works on a real device.

## Flutter (local)

```bash
flutter pub get
flutter run -t lib/main_user.dart
flutter run -t lib/main_shop.dart
flutter run -t lib/main_rider.dart
```

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/state` | shops + items + orders |
| POST | `/api/orders` | customer places order |
| PATCH | `/api/orders/:id` | shop/rider status + GPS |
| GET | `/api/stream` | live SSE |
| POST | `/api/reset` | clear demo orders |
