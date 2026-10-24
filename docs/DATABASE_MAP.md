# Database map

**Do not edit `server/schema.sql`.** Extra admin state lives in existing `app_state` JSON rows.

## Tables (live)

| Table | Used by | Admin use |
| --- | --- | --- |
| `accounts` | All apps | Users / shops / riders directory. Columns: id, name, phone, email, pin, role, address, shop_id, vehicle, rating |
| `shops` | User, Shop | Shop list/detail. `is_open` = catalog open/closed |
| `menu_items` | User, Shop | Menu review |
| `orders` | All | Order list/detail. Financial snapshot in `data` jsonb + `total_amount` |
| `messages` | Chat | Order chat (not support). Admin may read for an order |
| `app_state` | Wallets, ratings, support, flags | Admin config, audit, staff, account meta, notifications |
| `otp_codes` | WhatsApp OTP | Admin does not read codes |

## `app_state` keys

| id | Payload |
| --- | --- |
| `qb_wallet_{role}_{accountId}` | `{ bank, requests[] }` shop/rider withdraw |
| `qb_support_{role}_{accountId}` | Help thread `{ mode, ticket, messages }` |
| `qb_ratings` | `{ shops, riders, items }` star bags |
| `qb_admin_config` | Commission %, coupons, featured shop ids, delivery rules, templates, maintenance |
| `qb_admin_accounts` | `{ [accountId]: { status, reason, history[] } }` active/suspended/restricted |
| `qb_admin_staff` | Extra admins `{ people[] }` password hashes only |
| `qb_admin_audit` | Append-only `{ entries[] }` cap 2000 |
| `qb_admin_notices` | `{ items[], read[] }` |

## Order money (existing)

- `totalAmount` = food subtotal + `deliveryFee`
- Card captured: food → shop wallet, fee → rider wallet
- COD: no wallet credit until/unless paid in-app
- Cancel of captured card sets `paymentStatus=refunded` in order data (record only; Payments.lk refund is not auto-called)

## Rider KYC

Packed in `accounts.address` as `QBDOCS:{...}`. Photos of NIC/licence are empty by design. Admin shows Didit decision flags only.

## Migrations

None. No new tables. No `ALTER`.
