# Implementation status — QuickBite Admin

Updated after `node --test test/admin.test.mjs` (21 pass).

| Module | % | Notes |
| --- | --- | --- |
| Design system | 100 | Tokens + shared components in `admin.css` |
| Auth / RBAC | 95 | Env super admin + hashed staff; server `can()`; client nav hides screens. MFA not in product |
| Dashboard | 90 | Real KPIs, charts from orders, OSM map of **existing** coords only. No fake deltas |
| Users | 90 | List/search/paging/detail/suspend/restrict/create. Email shown to admins (needed to support). Apps respect suspend/restrict |
| Shops | 90 | List/detail/add/activate/menu availability. “Pending verification” was not a live shop state — closed vs open used instead |
| Riders | 85 | Directory, Didit flags, online inferred from live job coords. Cannot approve NIC photos (not stored) |
| Orders | 90 | Filters, detail, cancel with reason. Delivered money not rewritten |
| Withdrawals | 90 | Approve/reject + idempotency. **Does not pay a bank** |
| Support | 90 | Inbox + reply into `qb_support_*`. Internal notes hidden from customers |
| Notifications | 80 | In-panel only. Push/email/SMS **blocked** (no provider) |
| Analytics / reports | 90 | Colombo TZ, LKR, CSV. Commission is configured estimate |
| Promotions / config | 60 | Stored (coupons, featured ids, fee, maintenance). **Not auto-applied** at checkout; existing orders not repriced |
| Staff / audit | 90 | Staff CRUD + append-only audit in `app_state` |
| Login / 404 / unauthorized / empty / error | 95 | SPA states |

## Blocked (external / product rules)

- Automatic bank payout
- Admin push / email / SMS
- Full database backup from the panel
- NIC / licence photo review (Didit-only)
- Schema migrations (`schema.sql` frozen)

## Remaining manual tasks

1. Merge this branch to `main` (Production).
2. Cloudflare Pages Production env: `ADMIN_EMAIL`, `ADMIN_PASSWORD` (≥8), optional `ADMIN_SESSION_SECRET`.
3. Sign in at https://quickbite-2ao.pages.dev/admin.html
4. Do not put those values in the client or README.

## Files

- `server/public/admin.html` `css/admin.css` `js/admin.js`
- `functions/_lib/admin.js` `functions/api/admin.js` (mirrored under `server/public/functions`)
- `docs/FEATURE_INVENTORY.md` `ROUTE_INVENTORY.md` `DATABASE_MAP.md` `DESIGN_SYSTEM.md` `IMPLEMENTATION_PLAN.md` `TEST_REPORT.md`
