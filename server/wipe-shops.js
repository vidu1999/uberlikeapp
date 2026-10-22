#!/usr/bin/env node
'use strict';

const db = require('./db');

(async () => {
  if (db.name() !== 'supabase') {
    console.error('Set SUPABASE_URL and SUPABASE_KEY');
    process.exit(1);
  }
  console.log('Wiping Shop rows (shops, menus, shop accounts, orders). Keeping User and Rider.', db.supabaseUrl(), new Date().toISOString());
  const report = await db.wipeShops();
  console.log(JSON.stringify({ ok: true, report }, null, 2));
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
