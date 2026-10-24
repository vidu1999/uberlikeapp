# QuickBite

Sri Lanka food delivery. **Three apps, one live cloud.**

```
User orders  →  Shop accepts / Preparing / Food is ready  →  Rider to shop, then customer  →  Delivered
```

Live site: [https://quickbite-2ao.pages.dev](https://quickbite-2ao.pages.dev)

| App | URL | Who |
| --- | --- | --- |
| Customer | [/user.html](https://quickbite-2ao.pages.dev/user.html) | Browse, basket, pay, track |
| Shop Partner | [/shop.html](https://quickbite-2ao.pages.dev/shop.html) | Kitchen, stock, card wallet |
| Rider | [/rider.html](https://quickbite-2ao.pages.dev/rider.html) | Jobs, live map, earnings |

Web and Android load the **same UI**. Maps are **OpenStreetMap** in-app (not Google Maps, not Carto).

## How it runs

- **Cloudflare Pages** project `quickbite-2ao` — static root `server/public`
- **Pages Functions** in `functions/` — card checkout + Didit / Payments.lk webhooks
- **Supabase** — shops, menus, accounts, orders, chat, wallets (`app_state`)
- **Flutter APKs** — WebViews pointed at `https://quickbite-2ao.pages.dev`

Production Pages must track branch **`main`**. Preview hosts are not the live app.

Do not commit `.env`. Keep `.env.example`. Secrets stay in Cloudflare / Supabase, not in the client.

## Sign-in

- **Continue with Google** (web OAuth client on `quickbite-2ao.pages.dev`)
- **Continue with WhatsApp** — free 4-digit OTP on WhatsApp (not SMS), auto-sent
- Email + password still requires a verified WhatsApp before the dashboard
- One WhatsApp number can be User **and** Shop **and** Rider
- Not two accounts in the **same** role
- Email and WhatsApp are unique per role
- Stay signed in until **Log Out** (no auto logout)

## User

- Uber Eats–style home: All first, then grocery / bakery / fast food and other aisles
- Live shops and items only (no demo catalog)
- In-shop search, tile `+` → qty, **View basket · N**
- Place Order uses live GPS; pin is movable
- Pay **card** (Payments.lk) or **cash on delivery** (one open COD at a time; card stays available)
- Track on OSM: **shop** until pickup, then the **rider**
- Call and Chat on the same row
- After delivery, tracking closes; rate **shop**, **item**, and **rider**
- Favourite heart to the right of the shop name

## Shop Partner

- Hub **Open Shop** goes to **Sign In** (never Register first)
- After WhatsApp: no shop → Register; existing shop → dashboard
- Register: live map pin + address (drag the pin). Shop name is the shop, not the Google / owner name
- Stay on the dashboard until Log Out
- Add Item on the right, with search. Save after add/edit
- Order → Order Details → Accept → **Food is ready**
- Until Ready, the customer sees **Preparing** with a live pulse; then **Prepared**
- Stock UI; sold out becomes unavailable; some items unlimited
- **Card wallet**: food totals from card orders. **Withdraw** — first time add Sri Lanka bank details, then amount + Apply
- Delivery fee goes to the rider, not the shop wallet

## Rider

- Opens on the **dashboard**, not Driver verification
- Driver verification (tap to open): NIC + licence + live face via **Didit hosted**. ID photos are not stored in the app
- Vehicle type / plate can be saved
- Must be WhatsApp-verified before **Accept**
- Cannot Accept another job until the current one is **delivered**
- **Start** = in-app navigate to the **shop** (live OSM). After Confirm pickup, navigate to the customer
- Pickup and delivered only when very close (**&lt; 25 m**)
- **Call** immediately left of **Chat** (same row). Chat: Rider ↔ Shop until pickup, then User ↔ Rider. Back from chat returns to live tracking
- Card jobs: 4-digit PIN to the user’s WhatsApp. COD: no PIN
- Footer Map: ongoing shop **red** until delivered; others green. Does not auto-switch into tracking
- Tracking photo is the verified selfie
- Wallet holds delivery fees; same bank withdraw flow as shop

## Payments & wallets

- Card checkout: `POST /checkout` + webhook `POST /webhooks/payments-lk` (verify signature, not the return URL)
- Webhook to paste: `https://quickbite-2ao.pages.dev/webhooks/payments-lk`
- After a successful card pay, food total → shop wallet, delivery fee → rider wallet
- In-app wallets are not a bank. First withdraw collects bank name (all Sri Lanka banks), account name, number, branch. Requests stay **pending** until transferred

## Rider verification (Didit)

- Hosted session (workflow: OCR + LIVENESS + FACE_MATCH, published, no AML)
- Webhook to paste: `https://quickbite-2ao.pages.dev/webhooks/didit`
- Secret API key stays on the server (Cloudflare). Do not put it in the client

## Android APKs (1.1.0)

Install all three on one phone. They share the live site. **Uninstall old APKs first.**

- [user.apk](https://github.com/vidu1999/uberlikeapp/releases/download/swiftdrop-1.1.0/user.apk) `com.uberlike.customer`
- [shop.apk](https://github.com/vidu1999/uberlikeapp/releases/download/swiftdrop-1.1.0/shop.apk) `com.uberlike.shop`
- [rider.apk](https://github.com/vidu1999/uberlikeapp/releases/download/swiftdrop-1.1.0/rider.apk) `com.uberlike.rider`

Release: [swiftdrop-1.1.0](https://github.com/vidu1999/uberlikeapp/releases/tag/swiftdrop-1.1.0)

```bash
flutter pub get
flutter run -t lib/main_user.dart
flutter run -t lib/main_shop.dart
flutter run -t lib/main_rider.dart
```

## Database

Customer, Shop, and Rider read and write **Supabase** tables: `shops`, `menu_items`, `accounts`, `orders`, `messages`, plus `app_state` for wallets.

```bash
cp .env.example .env
```

1. Create a project at [supabase.com](https://supabase.com)
2. SQL Editor → run `server/schema.sql` once (tables only, no demo rows). Do not change this file casually — live apps depend on it
3. Settings → API → Project URL + anon key into `.env` as `SUPABASE_URL`, `SUPABASE_ANON_KEY`
4. Put the same values (and payment / Didit secrets) in **Cloudflare Pages** production environment variables

Optional local Node studio:

```bash
node server/index.js
```

Open `http://localhost:3000`. The public product is still Pages + Supabase, not this process.

## Repo map

| Path | Role |
| --- | --- |
| `server/public/` | User / Shop / Rider web apps + CSS/JS |
| `functions/` | Cloudflare Pages Functions (checkout, Didit, Payments.lk) |
| `lib/` | Flutter shells (`main_user.dart`, `main_shop.dart`, `main_rider.dart`) |
| `.github/workflows/build.yml` | Builds the three APKs |
| `.env.example` | Env template (no secrets) |
