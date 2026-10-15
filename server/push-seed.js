#!/usr/bin/env node
'use strict';

const db = require('./db');

(async () => {
  if (db.name() !== 'supabase') {
    console.error('Set SUPABASE_URL and SUPABASE_KEY (or SUPABASE_ANON_KEY)');
    process.exit(1);
  }
  const force = process.argv.includes('--force');
  const result = await db.ensureSeed(force);
  const data = await db.load();
  console.log(
    JSON.stringify(
      {
        ok: true,
        seeded: result.seeded,
        shops: (data && data.shops && data.shops.length) || 0,
        items: (data && data.items && data.items.length) || 0,
        accounts: (data && data.accounts && data.accounts.length) || 0,
        orders: (data && data.orders && data.orders.length) || 0,
      },
      null,
      2,
    ),
  );
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
