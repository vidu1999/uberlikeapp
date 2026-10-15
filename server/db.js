'use strict';

const fs = require('fs');
const path = require('path');

function loadDotEnv() {
  const file = path.join(__dirname, '..', '.env');
  try {
    const raw = fs.readFileSync(file, 'utf8');
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i < 1) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (k && process.env[k] == null) process.env[k] = v;
    }
  } catch (_) {}
}

loadDotEnv();

function supabaseUrl() {
  return String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
}
function supabaseKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || '';
}
function firebaseUrl() {
  return String(process.env.FIREBASE_DB_URL || process.env.FIREBASE_DATABASE_URL || '').replace(/\/$/, '');
}
function firebaseAuth() {
  const s = process.env.FIREBASE_SECRET || process.env.FIREBASE_DATABASE_SECRET || process.env.FIREBASE_AUTH || '';
  return s ? '?auth=' + encodeURIComponent(s) : '';
}

function name() {
  if (supabaseUrl() && supabaseKey()) return 'supabase';
  if (firebaseUrl()) return 'firebase';
  return 'local';
}

async function timedFetch(url, opts, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms || 8000);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function supabaseLoad() {
  const res = await timedFetch(
    supabaseUrl() + '/rest/v1/app_state?id=eq.main&select=payload',
    {
      headers: {
        apikey: supabaseKey(),
        Authorization: 'Bearer ' + supabaseKey(),
      },
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error('Supabase load ' + res.status + ' ' + text.slice(0, 180));
  }
  const rows = await res.json();
  if (!Array.isArray(rows) || !rows[0]) return null;
  return rows[0].payload || null;
}

async function supabaseSave(payload) {
  const res = await timedFetch(
    supabaseUrl() + '/rest/v1/app_state',
    {
      method: 'POST',
      headers: {
        apikey: supabaseKey(),
        Authorization: 'Bearer ' + supabaseKey(),
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        id: 'main',
        payload,
        updated_at: new Date().toISOString(),
      }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error('Supabase save ' + res.status + ' ' + text.slice(0, 180));
  }
}

async function firebaseLoad() {
  const res = await timedFetch(firebaseUrl() + '/app_state.json' + firebaseAuth());
  if (!res.ok) {
    const text = await res.text();
    throw new Error('Firebase load ' + res.status + ' ' + text.slice(0, 180));
  }
  return await res.json();
}

async function firebaseSave(payload) {
  const res = await timedFetch(firebaseUrl() + '/app_state.json' + firebaseAuth(), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error('Firebase save ' + res.status + ' ' + text.slice(0, 180));
  }
}

async function load() {
  const kind = name();
  if (kind === 'supabase') return supabaseLoad();
  if (kind === 'firebase') return firebaseLoad();
  return null;
}

async function save(payload) {
  const kind = name();
  if (kind === 'supabase') return supabaseSave(payload);
  if (kind === 'firebase') return firebaseSave(payload);
}

function info() {
  const kind = name();
  return {
    db: kind,
    supabase: Boolean(supabaseUrl() && supabaseKey()),
    firebase: Boolean(firebaseUrl()),
  };
}

module.exports = { name, load, save, info };
