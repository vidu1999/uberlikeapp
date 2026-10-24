export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

export function optionsResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store',
    },
  });
}

export function openRouterKey(env) {
  let fromProc = '';
  try {
    if (typeof process !== 'undefined' && process.env) {
      fromProc = process.env.OPENROUTER_API_KEY || '';
    }
  } catch (_) {}
  return String((env && env.OPENROUTER_API_KEY) || fromProc || '')
    .trim()
    .replace(/^["']+|["']+$/g, '');
}

export function openRouterModel(env) {
  let fromProc = '';
  try {
    if (typeof process !== 'undefined' && process.env) {
      fromProc = process.env.OPENROUTER_MODEL || '';
    }
  } catch (_) {}
  return String((env && env.OPENROUTER_MODEL) || fromProc || 'openai/gpt-4o-mini').trim()
    || 'openai/gpt-4o-mini';
}

const ASK_HUMAN = /\b(talk to (a )?(human|agent|person)|real agent|live agent|speak to (someone|a person|an agent)|customer service|operator|representative|human please|connect me|escalate)\b/i;
const NOT_RESOLVED = /\b(not resolved|still not|still broken|still (the )?same|doesn'?t help|does not help|didn'?t work|not working|no help|you already (said|told)|same (question|problem|issue)|i don'?t understand|dont understand|cannot understand|can'?t understand|confused|that'?s not (it|right|helping)|problem (is )?not (fixed|solved))\b/i;

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function similar(a, b) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y || x.length < 8 || y.length < 8) return false;
  if (x === y) return true;
  if (x.length > 10 && y.indexOf(x) >= 0) return true;
  if (y.length > 10 && x.indexOf(y) >= 0) return true;
  const ta = x.split(' ').filter((w) => w.length > 3);
  if (ta.length < 2) return false;
  let hit = 0;
  ta.forEach((w) => { if (y.indexOf(w) >= 0) hit += 1; });
  return hit / ta.length >= 0.72;
}

const CLOSED_CHAT = /agent session closed|agent closed this chat|rated this agent|AI Help is ready|AI Help continues/i;

/** After an agent session closes, only messages after that marker count as the new AI chat. */
export function freshAiHistory(messages) {
  const list = Array.isArray(messages) ? messages : [];
  let start = 0;
  list.forEach((m, i) => {
    const t = String((m && (m.content || m.text)) || '');
    if (CLOSED_CHAT.test(t)) start = i + 1;
  });
  return list.slice(start).filter((m) => {
    if (!m) return false;
    const role = m.role === 'assistant' || m.role === 'agent' || m.role === 'system' ? m.role : 'user';
    if (role === 'system' || role === 'agent') return false;
    const content = String(m.content || m.text || '').trim();
    return !!content;
  }).map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content || m.text || '').trim(),
  }));
}

export function shouldEscalate(messages, latest) {
  const text = String(latest || '');
  if (ASK_HUMAN.test(text)) return { yes: true, reason: 'asked_agent' };
  const users = (messages || []).filter((m) => m && m.role === 'user').map((m) => String(m.content || m.text || ''));
  // One suggestion / first messages of a fresh session stay with AI.
  if (users.length < 3) return { yes: false, reason: '' };
  if (NOT_RESOLVED.test(text)) return { yes: true, reason: 'not_resolved' };
  const prev = users.slice(0, -1);
  const last = users[users.length - 1] || text;
  for (let i = 0; i < prev.length; i++) {
    if (similar(prev[i], last)) return { yes: true, reason: 'repeat' };
  }
  return { yes: false, reason: '' };
}

const SYSTEM = `You are QuickBite Help, the first-line support assistant for a Sri Lanka food delivery app (User, Shop Partner, Rider).
Be short, clear, and kind. Use simple English. Do not invent refunds or secret codes.
Facts:
- Live site https://quickbite-2ao.pages.dev. Maps are OpenStreetMap in-app.
- Sign in: Google or WhatsApp OTP (not SMS). One number can be User, Shop, and Rider — not two accounts in the same role. Stay signed in until Log Out.
- User: live GPS pin, basket, card (Payments.lk) or cash on delivery (one open COD). Track shop until pickup, then the rider. Call left of Chat. After delivery, rate shop, item, rider.
- Shop: Open Shop → Sign In. Preparing pulses until Food is ready. Card wallet withdraw needs Sri Lanka bank details first.
- Rider: dashboard first. Didit for NIC + licence + live face. Start navigates to the shop. Pickup/delivered only when very close. Card jobs send a 4-digit PIN on WhatsApp.
Answer the current question only. Do not offer to connect a real agent unless the user clearly asks to talk to a person. Never put API keys in a reply.`;

export function faqReply(text) {
  const t = norm(text);
  if (/otp|whatsapp|code|sms/.test(t)) return 'We send a 4-digit code on WhatsApp, not SMS. Open that chat, enter the code, then you are in. Stay signed in until Log Out.';
  if (/track|where.*order|rider|map/.test(t)) return 'Open the order and tap Track. You see the shop until pickup, then the rider on OpenStreetMap. Call is left of Chat.';
  if (/pay|card|cod|cash|wallet/.test(t)) return 'Pay by card or cash on delivery. Only one open COD at a time; card stays available. Shop and rider wallets are in-app — first withdraw needs Sri Lanka bank details.';
  if (/cancel|refund/.test(t)) return 'Open the order. If the shop has not accepted yet, you can wait or message them in Chat after a rider is on the job. I can connect a real agent if this is not resolved.';
  return 'I can help with orders, tracking, payments, WhatsApp sign-in, and wallets. Tell me what went wrong.';
}

export async function aiReply(env, history) {
  const key = openRouterKey(env);
  const latest = history.length ? String(history[history.length - 1].content || '') : '';
  if (!key) return { text: faqReply(latest), provider: 'faq' };
  const msgs = [{ role: 'system', content: SYSTEM }].concat(
    history.slice(-12).map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || '').slice(0, 2000),
    }))
  );
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://quickbite-2ao.pages.dev',
      'X-Title': 'QuickBite Support',
    },
    body: JSON.stringify({
      model: openRouterModel(env),
      messages: msgs,
      max_tokens: 420,
      temperature: 0.3,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = String((data && data.error && data.error.message) || data.message || ('OpenRouter ' + res.status));
    throw new Error(err);
  }
  const text = String(
    (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || ''
  ).trim();
  return { text: text || faqReply(latest), provider: 'openrouter' };
}
