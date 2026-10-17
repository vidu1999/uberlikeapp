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
| `/user` | Customer with WhatsApp OTP |
| `/shop` | Shop partner (register + WhatsApp OTP) |
| `/rider` | Rider (register + WhatsApp OTP) |

## Live studio (optional, local)

```bash
node server/index.js
```

Open `http://localhost:3000`.

Sign in with your own mobile number. WhatsApp sends a 4-digit code. The same number can be User, Shop, and Rider, but you cannot create two accounts in the same role. After OTP, that account is saved in Supabase — no demo catalog.

Included: search, shop menus, cart, checkout, kitchen board, menu sold-out toggles, rider jobs, live OSM map, in-order chat, cash on delivery, ratings, earnings.

## Android APKs

Different package names — install all three on one phone.

- [user.apk](https://github.com/vidu1999/uberlikeapp/releases/download/swiftdrop-1.0.0/user.apk) `com.uberlike.customer`
- [shop.apk](https://github.com/vidu1999/uberlikeapp/releases/download/swiftdrop-1.0.0/shop.apk) `com.uberlike.shop`
- [rider.apk](https://github.com/vidu1999/uberlikeapp/releases/download/swiftdrop-1.0.0/rider.apk) `com.uberlike.rider`

Release: [swiftdrop-1.0.0](https://github.com/vidu1999/uberlikeapp/releases/tag/swiftdrop-1.0.0)

Paste the studio URL into each APK (cloud icon) so they share orders.

## Database — all apps fetch from Supabase

Customer, Shop, and Rider (web + APK) **read shops, menus, accounts, orders, and chat from Supabase tables** (`shops`, `menu_items`, `accounts`, `orders`, `messages`). Writes (new order, status, sold-out, chat) are saved back to those tables.

```bash
cp .env.example .env
```

1. Create a free project at [supabase.com](https://supabase.com)
2. SQL Editor → paste `server/schema.sql` → Run  
   Creates tables **and demo rows**: 11 shops, 33 dishes, 4 accounts, orders `ORD-1001`–`ORD-1004`.
3. Settings → API → copy **Project URL** + **anon key** into `.env`:

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_KEY=eyJ...anon or service_role
SUPABASE_ANON_KEY=eyJ...anon
```

4. Optional: `node server/push-seed.js` to upsert demo rows without re-running SQL.
5. Restart the server. `/api/health` must show `"db":"supabase"` and `"cloud":true`. `/api/config` exposes the URL so the three apps query `/rest/v1/shops` directly.

Also add `SUPABASE_URL` and `SUPABASE_KEY` as GitHub Actions secrets (and on Render) so deploys keep using the same database.

**Firebase Realtime Database** (fallback)  
Set `FIREBASE_DB_URL` and `FIREBASE_SECRET` instead.

## Flutter

```bash
flutter pub get
flutter run -t lib/main_user.dart
flutter run -t lib/main_shop.dart
flutter run -t lib/main_rider.dart
```
