# SwiftDrop — User + Shop + Rider

A complete Uber-style delivery product: **three apps, one live backend**.

```
User carts & pays COD  →  Shop accepts / cooks / marks ready  →  Rider GPS  →  User map + chat  →  Delivered
```

## Run globally (no Node on your computer)

This repo is a single Node process with **zero npm packages**. Deploy the container or the start command on any free host; you never run Node locally.

**Option A — Render (one click)**

1. Open [Render New Web Service](https://render.com/deploy) and connect `vidu1999/uberlikeapp`.
2. Or click: [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/vidu1999/uberlikeapp)
3. Blueprint file is `render.yaml` (`npm start`, health `/api/health`).
4. Optional: set `SUPABASE_URL` + `SUPABASE_KEY` in the Render dashboard.

**Option B — any Docker host (Fly, Railway, Cloud Run, your VPS)**

```
ghcr.io/vidu1999/uberlikeapp:latest
```

GitHub Actions publishes that image on every push (`Dockerfile` listens on `$PORT`, bind `0.0.0.0`).

**Option C — GitHub Codespaces**

Open the repo in Codespaces (`.devcontainer/devcontainer.json`) → `npm start` → forwarded port is the public URL.

Then open:

| URL | App |
| --- | --- |
| `/` | Hub |
| `/user?demo=1` | Customer (QuickBite, skip OTP) |
| `/shop?demo=1` | Shop dashboard |
| `/rider?demo=1` | Rider map |
| `/user` | Customer with WhatsApp OTP |

## Live studio (optional, local)

```bash
node server/index.js
```

Open `http://localhost:3000`.

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

## Database (Supabase or Firebase)

Shops, menu items, accounts, orders, and WhatsApp OTP users persist locally by default (`server/data.json`). Connect a **free** cloud database with `.env`:

```bash
cp .env.example .env
```

**Supabase (Postgres, recommended)**  
1. Create a free project at [supabase.com](https://supabase.com)  
2. SQL Editor → paste `server/schema.sql` → Run  
   That file **creates tables and inserts demo data**: 11 shops (Kandy Bakers, Burger King, Pizza Hut, Ceylon Tea House, …), 33 menu items, 4 demo accounts, and orders `ORD-1001`–`ORD-1004`.  
3. Settings → API → set `SUPABASE_URL` and `SUPABASE_KEY` (service_role)  
4. Table Editor should show `shops`, `menu_items`, `accounts`, `orders`, `messages`

**Firebase Realtime Database**  
1. Create a project at [Firebase Console](https://console.firebase.google.com)  
2. Realtime Database → Create  
3. Set `FIREBASE_DB_URL` and `FIREBASE_SECRET`

Restart `node server/index.js`. `/api/health` and the `/apps` studio show which database is live.

## Flutter

```bash
flutter pub get
flutter run -t lib/main_user.dart
flutter run -t lib/main_shop.dart
flutter run -t lib/main_rider.dart
```
