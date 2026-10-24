import { aiReply, freshAiHistory, json, openRouterKey, optionsResponse, shouldEscalate } from '../_lib/support.js';

export async function onRequest(context) {
  const request = context.request;
  const env = context.env || {};
  const method = String(request.method || 'GET').toUpperCase();
  if (method === 'OPTIONS') return optionsResponse();
  if (method === 'GET' || method === 'HEAD') {
    return json(200, { ok: true, configured: !!openRouterKey(env) });
  }
  if (method !== 'POST') return json(405, { ok: false, message: 'POST a support message.' });
  let body = {};
  try { body = await request.json(); } catch (_) { body = {}; }
  const mode = String(body.mode || 'ai') === 'agent' ? 'agent' : 'ai';
  const incoming = Array.isArray(body.messages) ? body.messages : [];
  const latest = String(body.text || (incoming[incoming.length - 1] && (incoming[incoming.length - 1].content || incoming[incoming.length - 1].text)) || '').trim();
  if (!latest) return json(400, { ok: false, message: 'Type a message.' });

  const history = freshAiHistory(incoming);
  if (!history.length || history[history.length - 1].content !== latest) {
    history.push({ role: 'user', content: latest });
  }

  if (mode === 'agent') {
    return json(200, {
      ok: true,
      escalate: true,
      queued: true,
      reason: 'agent',
      reply: '',
    });
  }

  const gate = shouldEscalate(history, latest);
  if (gate.yes) {
    return json(200, {
      ok: true,
      escalate: true,
      queued: false,
      reason: gate.reason,
      reply: gate.reason === 'asked_agent'
        ? 'Connecting you to a real QuickBite agent now. Keep this chat open and type the details — they will see this thread.'
        : 'This still is not resolved, so I am connecting you to a real QuickBite agent. Stay here — they will pick up this chat.',
    });
  }

  try {
    const out = await aiReply(env, history);
    const maybe = shouldEscalate(history.concat([{ role: 'assistant', content: out.text }]), latest);
    const handoff = /connect(ing)? you to a real|real QuickBite agent|live agent/i.test(out.text);
    return json(200, {
      ok: true,
      escalate: !!(handoff || maybe.yes),
      reason: handoff ? 'ai_handoff' : maybe.reason,
      reply: out.text,
      provider: out.provider,
    });
  } catch (e) {
    return json(200, {
      ok: true,
      escalate: true,
      reason: 'ai_error',
      reply: 'I could not finish that just now, so I am connecting you to a real QuickBite agent. Keep typing here.',
      error: (e && e.message) || 'support',
    });
  }
}

export const onRequestGet = onRequest;
export const onRequestPost = onRequest;
export const onRequestOptions = onRequest;
