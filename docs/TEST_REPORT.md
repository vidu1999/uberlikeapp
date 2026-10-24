# Admin panel test report

Date: 2026-10-24  
Command: `node --test test/admin.test.mjs`

## Automated (`test/admin.test.mjs`)

| Suite | Cases | Result |
| --- | --- | --- |
| permissions | super / finance / support / operations | pass |
| withdrawals | approve note, idempotent replay, double-approve throw, reject releases hold, mask bank | pass |
| orders | cannot cancel delivered; captured cancel records refund-not-automatic | pass |
| accounts meta | suspend history | pass |
| metrics | zeros not screenshot samples; GMV + commission from real rows | pass |
| session | HMAC sign/verify; tamper reject; env password min 8 | pass |
| support privacy | internal notes stripped from public messages | pass |
| csv + paging | page slice; CSV has no raw phones | pass |
| password hash | stable SHA-256 + salt | pass |

**21 passed, 0 failed.**

## Not automated (manual after Production merge)

- Sign in at `/admin.html` with `ADMIN_EMAIL` / `ADMIN_PASSWORD`
- Direct URL `#/withdrawals` as support role → 403
- Live map only shows shops/jobs that already have coordinates
- Approve withdrawal: shop/rider wallet shows transferred; no bank movement
- Suspended customer cannot open the User dashboard
- Restricted customer cannot Place Order
- Help thread reply appears when the user re-opens Help & Support

## Visual

- Tokens in `css/admin.css` match the navy / emerald reference
- Screenshot comparison in a browser is still required after deploy (no Chromium in this environment)

## Lint / typecheck

No project ESLint or TypeScript config. Node syntax of Functions is ESM; `package.json` stays CommonJS for `server/index.js`.
