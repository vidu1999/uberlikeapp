function json(status, body) {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function optionsResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store',
    },
  });
}

const AISLES = ['Fruit', 'Vegetables', 'Beverages', 'Grocery', 'Chilled', 'Meat', 'Frozen', 'Household', 'Bakery', 'Fast food'];

function classify(it) {
  const blob = [it && it.name, it && it.category, it && it.desc, it && it.description].join(' ').toLowerCase();
  const has = (re) => re.test(blob);
  if (has(/frozen|ice cream|icecream|gelato|fish finger|nugget/)) return 'Frozen';
  if (has(/chicken|beef|mutton|pork|lamb|meat|sausage|bacon|ham|fish|tuna|prawn|shrimp|crab|seafood|\beggs?\b/)) return 'Meat';
  if (has(/yoghurt|yogurt|cheese|butter|margarine|curd|chilled|dairy|fresh milk/)) return 'Chilled';
  if (has(/apple|banana|mango|papaya|pineapple|watermelon|grape|orange|lemon|lime|avocado|rambutan|durian|wood apple|fruit|guava|melon|pomegranate|strawberry/)) return 'Fruit';
  if (has(/carrot|cabbage|leek|beans|tomato|onion|potato|pumpkin|brinjal|eggplant|okra|gotukola|vegetable|salad|cucumber|chilli|chili|garlic|ginger|spinach|lettuce|beet/)) return 'Vegetables';
  if (has(/juice|soda|cola|pepsi|coke|sprite|water|tea|coffee|beverage|drink|necto|cordial|\bpet\b|1\.5l|elephant house|fanta|mirinda/)) return 'Beverages';
  if (has(/soap|shampoo|toothpaste|detergent|bleach|harpic|dettol|household|tissue|nappy|diaper|cleaner|lux|lifebuoy|\bvim\b|sunlight/)) return 'Household';
  if (has(/cake|pastry|bread|bun|croissant|bakery|cookie|doughnut|donut/)) return 'Bakery';
  if (has(/burger|pizza|kottu|fried rice|shawarma|submarine|fast food|fries/)) return 'Fast food';
  if (has(/rice|flour|sugar|salt|dhal|\bdal\b|coconut|oil|spice|biscuit|snack|noodle|maggi|pasta|cereal|grocery|maliban|munchee/)) return 'Grocery';
  const c = String((it && it.category) || '');
  if (/beverage|drink|coffee/i.test(c)) return 'Beverages';
  if (/bakery|dessert/i.test(c)) return 'Bakery';
  if (/grocery/i.test(c)) return 'Grocery';
  if (/fast food|pizza|burger/i.test(c)) return 'Fast food';
  if (/ice cream/i.test(c)) return 'Frozen';
  return 'Grocery';
}

function localAisles(items) {
  return (items || []).map(function (it) {
    return { id: it && it.id, aisle: classify(it) };
  }).filter(function (x) { return x.id; });
}

function parseModelAisles(text, fallback) {
  const m = String(text || '').match(/\[[\s\S]*\]/);
  if (!m) return fallback;
  try {
    const arr = JSON.parse(m[0]);
    if (!Array.isArray(arr)) return fallback;
    const allow = {};
    AISLES.forEach(function (a) { allow[a] = 1; });
    const byId = {};
    fallback.forEach(function (x) { byId[x.id] = x.aisle; });
    arr.forEach(function (row) {
      if (!row || !row.id) return;
      const a = String(row.aisle || row.category || '').trim();
      if (allow[a]) byId[row.id] = a;
    });
    return Object.keys(byId).map(function (id) { return { id: id, aisle: byId[id] }; });
  } catch (_) {
    return fallback;
  }
}

async function openRouterAisles(env, items, fallback) {
  const key = (env && (env.OPENROUTER_API_KEY || env.OPEN_ROUTER_API_KEY)) || '';
  if (!key) return null;
  const slim = (items || []).slice(0, 40).map(function (it) {
    return { id: it.id, name: String(it.name || '').slice(0, 80), category: String(it.category || '').slice(0, 40) };
  });
  const prompt = 'Classify each item into exactly one aisle: ' + AISLES.join(', ') +
    '. Return JSON array only, like [{"id":"...","aisle":"Grocery"}]. Items: ' + JSON.stringify(slim);
  const ctrl = new AbortController();
  const t = setTimeout(function () { ctrl.abort(); }, 8000);
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://quickbite-2ao.pages.dev',
        'X-Title': 'QuickBite',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await res.json();
    const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    return parseModelAisles(text, fallback);
  } catch (_) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function onRequest(context) {
  const request = context.request;
  const method = String(request.method || 'GET').toUpperCase();
  if (method === 'OPTIONS') return optionsResponse();
  if (method === 'GET' || method === 'HEAD') {
    return json(200, { ok: true, aisles: AISLES, provider: 'openrouter' });
  }
  if (method !== 'POST') return json(405, { ok: false, error: 'method' });
  let body = {};
  try { body = await request.json(); } catch (_) { body = {}; }
  const items = Array.isArray(body.items) ? body.items.slice(0, 40) : [];
  const local = localAisles(items);
  const ai = await openRouterAisles(context.env || {}, items, local);
  return json(200, { ok: true, aisles: ai || local, source: ai ? 'openrouter' : 'local' });
}
