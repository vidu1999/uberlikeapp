# Route inventory

Production host: `https://quickbite-2ao.pages.dev`  
Static root: `server/public`  
Functions: project-root `functions/` (mirrored under `server/public/functions`)

## Public apps (unchanged)

| Path | App |
| --- | --- |
| `/` `index.html` | Hub |
| `/user.html` | Customer |
| `/shop.html` | Shop Partner |
| `/rider.html` | Rider |
| `/apps.html` | APK links |
| `/admin.html` | **New** Admin panel SPA |

Hash routes inside admin (client): `#/dashboard` `#/users` `#/users/:id` `#/shops` `#/shops/:id` `#/riders` `#/riders/:id` `#/orders` `#/orders/:id` `#/withdrawals` `#/support` `#/support/:id` `#/notifications` `#/reports` `#/analytics` `#/settings` `#/unauthorized`

## Pages Functions

| Path | File | Notes |
| --- | --- | --- |
| `/api/admin` | `functions/api/admin.js` | **New** privileged admin API (cookie session) |
| `/api/support` | `functions/api/support.js` | Help chat |
| `/api/pay` | `functions/api/pay.js` | Payments.lk |
| `/api/didit` | `functions/api/didit.js` | Didit (restricted) |
| `/api/verify-session` | `functions/api/verify-session.js` | Rider KYC session |
| `/checkout` | `functions/checkout.js` | Card checkout |
| `/webhooks/payments-lk` | `functions/webhooks/payments-lk.js` | Payment webhook |
| `/webhooks/didit` | `functions/webhooks/didit.js` | Didit webhook |

`_routes.json` already includes `/api/*`.

## Admin API actions (`POST /api/admin`)

`session.login` `session.logout` `session.me`  
`dashboard` `search`  
`accounts.list` `accounts.get` `accounts.patch` `accounts.create`  
`shops.list` `shops.get` `shops.patch` `shops.create` `shops.menu` `shops.menuPatch`  
`riders.list` `riders.get`  
`orders.list` `orders.get` `orders.cancel`  
`withdrawals.list` `withdrawals.decide`  
`support.list` `support.get` `support.reply` `support.patch`  
`notifications.list` `notifications.read`  
`analytics` `export.csv`  
`config.get` `config.set`  
`staff.list` `staff.upsert`  
`audit.list`

All privileged actions require a valid admin cookie. Permissions are checked on the server.
