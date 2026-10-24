# Implementation plan

Incremental. Do not rewrite User/Shop/Rider.

1. **Audit** — this folder (`FEATURE_INVENTORY`, `ROUTE_INVENTORY`, `DATABASE_MAP`).
2. **Design system** — `docs/DESIGN_SYSTEM.md` + `server/public/css/admin.css` tokens.
3. **Server admin API** — `functions/_lib/admin.js` + `functions/api/admin.js` (cookie session, permissions, Supabase).
4. **Admin SPA** — `server/public/admin.html` + `js/admin.js` matching the screenshot.
5. **Safe client hooks** — `api.js` `normalizeWallet` keeps rejected; login respects suspend; restricted cannot place/accept.
6. **Tests** — `test/admin.test.mjs` (permissions, withdraw idempotency, masking, session, cancel rules).
7. **Docs** — `TEST_REPORT.md`, `IMPLEMENTATION_STATUS.md`, `.env.example` (no secrets).

## Auth

- Bootstrap super admin: `ADMIN_EMAIL` + `ADMIN_PASSWORD` (Cloudflare Production env).
- Session HMAC cookie `qb_admin` (HttpOnly, SameSite=Lax, 12h). Secret: `ADMIN_SESSION_SECRET` or derived.
- Extra staff in `qb_admin_staff` with SHA-256 salted hashes.

## Finance safety

- Approve withdrawal → `requests[].status = transferred` + timestamp + optional payment reference.
- UI and API copy: **in-app wallet marked transferred; bank payout is manual and not confirmed**.
- Reject → `rejected` (client hold excludes it).
- Idempotency key on decide; duplicate approve does not double-pay.
- Delivered order totals are not silently rewritten.

## Visual

Screenshot is the visual source of truth: dark navy, emerald actions, compact tables, left sidebar, top search.
