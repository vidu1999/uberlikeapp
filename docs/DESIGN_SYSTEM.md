# QuickBite Admin design system

Visual source: attached Admin Dashboard Overview (dark navy SaaS). Font: Plus Jakarta Sans (same as the three apps).

## Tokens (`server/public/css/admin.css` `:root`)

| Token | Value | Use |
| --- | --- | --- |
| `--ad-bg` | `#070d18` | App background |
| `--ad-sidebar` | `#08111e` | Left nav |
| `--ad-surface` | `#0d1726` | Cards |
| `--ad-surface-2` | `#111e32` | Inputs, nested |
| `--ad-border` | `rgba(148,163,184,.12)` | Hairline |
| `--ad-text` | `#eef2ff` | Primary text |
| `--ad-muted` | `#8b9bb4` | Secondary |
| `--ad-primary` | `#22c55e` | Actions, success, active nav |
| `--ad-primary-ink` | `#052e16` | Text on green buttons |
| `--ad-info` | `#38bdf8` | On the way, map customer |
| `--ad-warning` | `#f59e0b` | Pending, preparing |
| `--ad-danger` | `#f43f5e` | Reject, cancelled |
| `--ad-purple` | `#a78bfa` | Analytics secondary |
| `--ad-radius` | `16px` | Cards |
| `--ad-radius-sm` | `10px` | Controls |
| `--ad-shadow` | `0 12px 40px rgba(0,0,0,.35)` | Modals |
| `--ad-space-1..6` | 4 / 8 / 12 / 16 / 24 / 32 px | Spacing |

Do not introduce light-theme cards. Do not hardcode off-token colors in components.

## Components

- **Sidebar** 240px, logo + “Admin Panel”, green filled active item, footer admin identity.
- **Topbar** search pill, bell, Colombo clock, avatar.
- **Metric card** icon tile + label + value + optional delta (only when a real previous-period value exists).
- **Badge** pill: success / warn / info / danger / muted.
- **Table** compact, avatar + name, sticky header.
- **Button** primary green, ghost, danger.
- **Modal** centered dark card, escape to close.
- **Empty / loading / error** consistent copy, retry where the API failed.

## Status color mapping

| State | Token |
| --- | --- |
| Active, Delivered, Approved, Completed, Online, Resolved | `--ad-primary` |
| Pending, Preparing, New | `--ad-warning` |
| On the way, In progress | `--ad-info` |
| Cancelled, Rejected, Suspended, Offline | `--ad-danger` |
| Restricted | `--ad-purple` |

## Accessibility

- Contrast on green buttons uses `--ad-primary-ink`.
- Keyboard: skip to main, focus rings, dialogs trap focus.
- Do not shrink screenshot micro-type; body 14px, table 13px, min tap 36px.
