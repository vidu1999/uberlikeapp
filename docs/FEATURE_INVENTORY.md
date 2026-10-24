# QuickBite feature inventory

Source of truth: live User / Shop / Rider apps, `server/schema.sql` (do not edit), Cloudflare Pages Functions, and the admin UI reference screenshot.

Status key: **implemented** · **partial** · **missing** · **blocked**

This file is updated as work lands. See `docs/IMPLEMENTATION_STATUS.md` for completion percentages.

## Existing product (must preserve)

| Feature | Status | Notes |
| --- | --- | --- |
| Customer app `user.html` | implemented | OSM, basket, COD + card, track, chat, ratings, Help & Support |
| Shop app `shop.html` | implemented | Sign in first, kitchen, stock, card wallet withdraw |
| Rider app `rider.html` | implemented | Dashboard first, Didit KYC, OSM navigate, <25 m pickup/deliver |
| Google + WhatsApp OTP auth | implemented | One number, three roles; not two accounts in the same role |
| Payments.lk card checkout | implemented | Server `/checkout` + webhook; secrets not in client |
| In-app wallets (shop food, rider fee) | implemented | `app_state` `qb_wallet_{role}_{id}`; pending until transferred |
| Support AI → agent queue | implemented | `/api/support`; OpenRouter key server-only; thread in `app_state` |
| Didit rider verification | implemented | Hosted; NIC/licence photos not stored |
| APK WebViews | implemented | `quickbite-2ao.pages.dev` |
| Admin panel | implemented | `/admin.html` + `/api/admin` — see IMPLEMENTATION_STATUS |

## Admin panel (reference screenshot)

| Module | Required | Status |
| --- | --- | --- |
| Dark navy design system | Match screenshot tokens | implemented |
| Login / session / sign-out | Env admin + optional staff | implemented |
| Role permissions (super / finance / support / operations) | Server-enforced | implemented |
| Dashboard metrics, charts, recent orders/withdrawals, quick actions | Real counts only | implemented |
| Live OSM map | Real shop / rider / customer coords only | implemented |
| Users directory + detail + suspend/restrict | Meta in `app_state` (no schema change) | implemented |
| Shops directory + detail + add/edit + open/close | `shops` + menu_items | implemented |
| Riders directory + verification flags | Didit fields from `accounts.address` QBDOCS | implemented |
| Orders directory + detail + cancel with reason | Cannot rewrite delivered money | implemented |
| Withdrawals approve/reject | Idempotent; does **not** claim bank paid | implemented |
| Questions & Support inbox + reply | `qb_support_*` threads | implemented |
| Notifications inbox | Derived events + read state | implemented |
| Analytics & reports + CSV | Real orders; Colombo TZ; LKR | implemented |
| Promotions / coupons / featured / commission config | Stored in `qb_admin_config` | partial — stored; checkout does not auto-apply coupons/zones |
| Staff, audit log, settings | `qb_admin_staff`, `qb_admin_audit` | implemented |
| 404 / unauthorized / error / loading / empty | SPA states | implemented |
| Push/email/SMS fan-out | No admin mailer/FCM | blocked — marked unavailable in UI |
| Automatic bank payout | No payout API | blocked — approve = in-app transferred only |
| Full DB backup button | Would dump PII | blocked — use Supabase dashboard |
| NIC/licence photo review | Product forbids storing them | blocked — Didit-only |

## Data rules

- Never show the screenshot’s sample numbers (12,842 users, etc.) as live data.
- Never invent riders on the map.
- Never claim a withdrawal is paid at a bank because an admin clicked Approve.
- Secrets stay in Cloudflare env, never in `admin.html` / `admin.js`.
