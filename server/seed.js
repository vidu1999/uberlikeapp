'use strict';

const shops = [];
const items = [];
const accounts = [];

const DEMO_SHOP_IDS = [
  'SHOP_1', 'SHOP_2', 'SHOP_3', 'SHOP_4', 'SHOP_5',
  'SHOP_6', 'SHOP_7', 'SHOP_8', 'SHOP_9', 'SHOP_10', 'SHOP_11',
];
const DEMO_ACCOUNT_IDS = ['USER_1', 'USER_2', 'SHOP_STAFF', 'RIDER_77'];
const DEMO_PHONES = ['0771234567', '0771112222', '0772223333', '0775556666'];
const DEMO_ORDER_IDS = ['ORD-1001', 'ORD-1002', 'ORD-1003', 'ORD-1004', 'ORD-NONE'];

function demoOrders() {
  return [];
}

const APKS = {
  shop: 'https://github.com/vidu1999/uberlikeapp/releases/download/swiftdrop-1.0.0/shop.apk',
  rider: 'https://github.com/vidu1999/uberlikeapp/releases/download/swiftdrop-1.0.0/rider.apk',
  user: 'https://github.com/vidu1999/uberlikeapp/releases/download/swiftdrop-1.0.0/user.apk',
};

function isDemoShop(id) {
  return DEMO_SHOP_IDS.includes(String(id || ''));
}

function isDemoPhone(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  let n = d;
  if (n.startsWith('94') && n.length === 11) n = '0' + n.slice(2);
  if (n.length === 9 && n.startsWith('7')) n = '0' + n;
  return DEMO_PHONES.includes(n);
}

function isDemoAccount(a) {
  if (!a) return false;
  return DEMO_ACCOUNT_IDS.includes(String(a.id || '')) || isDemoPhone(a.phone);
}

function isDemoOrder(o) {
  if (!o) return false;
  const id = String(o.id || '');
  if (DEMO_ORDER_IDS.includes(id) || /^ORD-100[1-4]$/.test(id)) return true;
  if (isDemoShop(o.shopId || o.shop_id)) return true;
  if (DEMO_ACCOUNT_IDS.includes(String(o.userId || o.user_id || ''))) return true;
  if (isDemoPhone(o.customerPhone || o.customer_phone)) return true;
  return false;
}

function stripDemo(snap) {
  const src = snap && typeof snap === 'object' ? snap : {};
  const nextShops = (src.shops || []).filter((s) => !isDemoShop(s.id));
  const nextItems = (src.items || []).filter((i) => !isDemoShop(i.shopId || i.shop_id));
  const nextAccounts = (src.accounts || []).filter((a) => !isDemoAccount(a));
  const nextOrders = (src.orders || []).filter((o) => !isDemoOrder(o));
  const keepIds = new Set(nextOrders.map((o) => o.id));
  let messages = src.messages && typeof src.messages === 'object' ? src.messages : {};
  const nextMessages = {};
  for (const [k, v] of Object.entries(messages)) {
    if (keepIds.has(k) && !DEMO_ORDER_IDS.includes(k)) nextMessages[k] = v;
  }
  return {
    shops: nextShops,
    items: nextItems,
    accounts: nextAccounts,
    orders: nextOrders,
    messages: nextMessages,
    seq: Number(src.seq) || 1000,
  };
}

function fullSnapshot() {
  return { shops: [], items: [], accounts: [], orders: [], messages: {}, seq: 1000 };
}

module.exports = {
  shops,
  items,
  accounts,
  demoOrders,
  APKS,
  fullSnapshot,
  stripDemo,
  isDemoShop,
  isDemoAccount,
  isDemoOrder,
  isDemoPhone,
  DEMO_SHOP_IDS,
  DEMO_ACCOUNT_IDS,
  DEMO_PHONES,
  DEMO_ORDER_IDS,
};
