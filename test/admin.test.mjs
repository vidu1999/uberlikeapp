import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  can, applyWithdrawDecision, normalizeWallet, walletHeld, maskBank, maskPhone,
  metricsFrom, applyOrderCancel, canCancelOrder, applyAccountStatus, accountMeta,
  signSession, verifySession, hashPassword, safeEq, paginate, ordersToCsv,
  parseOrder, normalizeSupport, supportPublicMessages, bootstrapAdmin, envConfigured,
  envVal, adminConfigHint, shouldIdleClose, closeAgentSession, rateAgentSession, appendAgentReply, AGENT_IDLE_MS,
  filterSupportQueue, isLiveAgentThread, hadAgentSession, deriveSupportStatus,
} from '../functions/_lib/admin.js';

describe('permissions', () => {
  it('super can finance and support', () => {
    assert.equal(can('super', 'withdrawals'), true);
    assert.equal(can('super', 'support'), true);
    assert.equal(can('super', 'config'), true);
  });
  it('finance cannot patch users', () => {
    assert.equal(can('finance', 'users'), false);
    assert.equal(can('finance', 'withdrawals'), true);
    assert.equal(can('finance', 'usersRead'), true);
  });
  it('support cannot approve withdrawals', () => {
    assert.equal(can('support', 'withdrawals'), false);
    assert.equal(can('support', 'support'), true);
  });
  it('operations cannot open config', () => {
    assert.equal(can('operations', 'shops'), true);
    assert.equal(can('operations', 'config'), false);
  });
});

describe('withdrawals', () => {
  function wallet() {
    return normalizeWallet({
      bank: { bankName: 'Bank of Ceylon', accountName: 'A', accountNo: '1234567890', branch: 'Kandy' },
      requests: [{ id: 'WD-1', amount: 500, ts: 1, status: 'pending' }],
    });
  }
  it('approve marks transferred and does not invent a bank payout', () => {
    const out = applyWithdrawDecision(wallet(), 'WD-1', 'approve', { actor: 'a@x.lk', reason: 'Paid at counter', paymentRef: 'SLIP-1', idempotencyKey: 'k1' });
    assert.equal(out.request.status, 'transferred');
    assert.match(out.request.note, /not confirmed/);
    assert.equal(out.replay, false);
  });
  it('idempotent replay with the same key', () => {
    const first = applyWithdrawDecision(wallet(), 'WD-1', 'approve', { actor: 'a', reason: 'ok', idempotencyKey: 'k1' });
    const second = applyWithdrawDecision(first.wallet, 'WD-1', 'approve', { actor: 'a', reason: 'ok', idempotencyKey: 'k1' });
    assert.equal(second.replay, true);
    assert.equal(second.wallet.requests.filter((r) => r.status === 'transferred').length, 1);
  });
  it('second approve without key throws', () => {
    const first = applyWithdrawDecision(wallet(), 'WD-1', 'approve', { actor: 'a', reason: 'ok' });
    assert.throws(() => applyWithdrawDecision(first.wallet, 'WD-1', 'approve', { actor: 'a', reason: 'again' }));
  });
  it('reject releases the hold', () => {
    const out = applyWithdrawDecision(wallet(), 'WD-1', 'reject', { actor: 'a', reason: 'mismatch' });
    assert.equal(out.request.status, 'rejected');
    assert.equal(walletHeld(out.wallet), 0);
  });
  it('masks bank numbers', () => {
    assert.equal(maskBank('1234567890'), '••••7890');
    assert.equal(maskPhone('0712345678').includes('••••'), true);
  });
});

describe('orders', () => {
  it('refuses to cancel delivered orders', () => {
    const o = { id: 'ORD-1', status: 'delivered', totalAmount: 900, paid: true, paymentStatus: 'captured' };
    assert.equal(canCancelOrder(o).ok, false);
    assert.throws(() => applyOrderCancel(o, 'nope', 'admin'));
  });
  it('cancel of captured card records refund without claiming PSP success', () => {
    const o = { id: 'ORD-2', status: 'preparing', totalAmount: 900, paid: true, paymentStatus: 'captured' };
    const next = applyOrderCancel(o, 'shop closed', 'admin@x');
    assert.equal(next.status, 'cancelled');
    assert.equal(next.paymentStatus, 'refunded');
    assert.match(next.refundNote, /not automatic/);
  });
});

describe('accounts meta', () => {
  it('records suspend history', () => {
    const bag = applyAccountStatus({}, 'ACC_1', 'suspended', 'abuse', 'admin');
    assert.equal(accountMeta(bag, 'ACC_1').status, 'suspended');
    assert.equal(accountMeta(bag, 'ACC_1').history[0].to, 'suspended');
  });
});

describe('metrics', () => {
  it('never uses screenshot sample numbers', () => {
    const m = metricsFrom([], [], [], { from: 0, to: Date.now() }, { commissionPct: 0 });
    assert.equal(m.totals.users, 0);
    assert.equal(m.totals.gmv, 0);
    assert.notEqual(m.totals.users, 12842);
  });
  it('sums real GMV in range', () => {
    const orders = [
      parseOrder({ id: 'A', status: 'delivered', total_amount: 1000, data: { createdAt: Date.now(), totalAmount: 1000, deliveryFee: 200, paid: true, paymentMethod: 'card' } }),
      parseOrder({ id: 'B', status: 'cancelled', total_amount: 500, data: { createdAt: Date.now(), totalAmount: 500 } }),
    ];
    const m = metricsFrom(orders, [], [], { from: Date.now() - 1000, to: Date.now() + 1000 }, { commissionPct: 10 });
    assert.equal(m.totals.gmv, 1000);
    assert.equal(m.totals.commission, 100);
  });
});

describe('session', () => {
  it('signs and verifies', async () => {
    const env = { ADMIN_SESSION_SECRET: 'unit-test-secret-value' };
    const token = await signSession(env, { email: 'admin@quickbite.lk', role: 'super', name: 'Admin' });
    const actor = await verifySession(env, token);
    assert.equal(actor.email, 'admin@quickbite.lk');
    assert.equal(actor.role, 'super');
  });
  it('rejects tampered tokens', async () => {
    const env = { ADMIN_SESSION_SECRET: 'unit-test-secret-value' };
    const token = await signSession(env, { email: 'admin@quickbite.lk', role: 'super', name: 'Admin' });
    const bad = token.slice(0, -2) + 'xx';
    assert.equal(await verifySession(env, bad), null);
  });
  it('env admin requires 8 char password', () => {
    assert.equal(bootstrapAdmin({ ADMIN_EMAIL: 'a@b.c', ADMIN_PASSWORD: 'short' }), null);
    assert.ok(bootstrapAdmin({ ADMIN_EMAIL: 'a@b.c', ADMIN_PASSWORD: 'longenough' }));
    assert.equal(envConfigured({}), false);
  });
  it('trims and unquotes Cloudflare secrets', () => {
    assert.equal(envVal({ ADMIN_EMAIL: ' "Ops@QuickBite.lk" ' }, 'ADMIN_EMAIL'), 'Ops@QuickBite.lk');
    assert.equal(adminConfigHint({ ADMIN_EMAIL: 'ops@x.lk', ADMIN_PASSWORD: '"12345678"' }), 'ok');
    const boot = bootstrapAdmin({ ADMIN_EMAIL: ' Ops@X.lk ', ADMIN_PASSWORD: '"longenough"' });
    assert.equal(boot.email, 'ops@x.lk');
    assert.equal(boot.password, 'longenough');
  });
});

describe('agent session close and rating', () => {
  it('idles closed after 3 minutes with no user reply', () => {
    const t0 = 1_000_000;
    const thread = {
      mode: 'agent',
      escalatedAt: t0,
      messages: [{ role: 'agent', text: 'Hello', ts: t0 + 1000 }],
    };
    assert.equal(shouldIdleClose(thread, t0 + 1000 + 60_000), false);
    assert.equal(shouldIdleClose(thread, t0 + 1000 + AGENT_IDLE_MS + 1), true);
  });
  it('does not idle-close while waiting on the agent after a user message', () => {
    const t0 = 1_000_000;
    const thread = {
      mode: 'agent',
      escalatedAt: t0,
      messages: [
        { role: 'agent', text: 'Hello', ts: t0 },
        { role: 'user', text: 'Still broken', ts: t0 + 10_000 },
      ],
    };
    assert.equal(shouldIdleClose(thread, t0 + 10_000 + AGENT_IDLE_MS + 1), false);
  });
  it('admin close returns to AI and asks for a rating', () => {
    const t = closeAgentSession({ mode: 'agent', messages: [], escalatedAt: 1 }, 'admin', 50);
    assert.equal(t.mode, 'ai');
    assert.equal(t.status, 'closed');
    assert.equal(t.chatGen, 1);
    assert.equal(t.awaitingRating, true);
    assert.equal(t.closeReason, 'admin');
    assert.equal(isLiveAgentThread(t), false);
    const rated = rateAgentSession(t, 4, 60);
    assert.equal(rated.awaitingRating, false);
    assert.equal(rated.rating, 4);
    assert.equal(rated.mode, 'ai');
    assert.equal(rated.status, 'closed');
    assert.equal(rated.sessions[0].rating, 4);
  });
  it('admin queue lists New, Waiting, In Progress, and Closed; AI Help stays off the list', () => {
    const ai = { mode: 'ai', status: 'open', subject: 'Where is my order?' };
    const live = {
      mode: 'agent', status: 'in_progress', subject: 'Card failed',
      messages: [{ role: 'user', text: 'hi', ts: 1 }, { role: 'agent', text: 'hello', ts: 2 }],
    };
    const fresh = { mode: 'agent', status: 'open', subject: 'Need a human' };
    const queued = { mode: 'agent', status: 'waiting', subject: 'In queue', messages: [{ role: 'user', text: 'help', ts: 1 }] };
    const closed = closeAgentSession({ mode: 'agent', status: 'in_progress', messages: [], escalatedAt: 1, subject: 'Old' }, 'admin', 50);
    assert.equal(hadAgentSession(ai), false);
    assert.equal(hadAgentSession(live), true);
    assert.equal(deriveSupportStatus(queued), 'waiting');
    assert.equal(deriveSupportStatus(fresh), 'open');
    const all = filterSupportQueue([ai, fresh, live, queued, closed], 'all');
    assert.equal(all.counts.all, 4);
    assert.equal(all.counts.new, 1);
    assert.equal(all.counts.waiting, 1);
    assert.equal(all.counts.in_progress, 1);
    assert.equal(all.counts.resolved, 1);
    assert.equal(filterSupportQueue([ai, fresh, live, queued, closed], 'new').rows[0].subject, 'Need a human');
    assert.equal(filterSupportQueue([ai, fresh, live, queued, closed], 'waiting').rows[0].subject, 'In queue');
    const done = filterSupportQueue([ai, fresh, live, queued, closed], 'resolved');
    assert.equal(done.rows[0].status, 'closed');
  });
  it('agent reply is tagged with the live chat generation so the user can see it', () => {
    const closed = closeAgentSession({ mode: 'agent', messages: [{ role: 'user', text: 'hi', ts: 1, gen: 0 }], chatGen: 0 }, 'admin', 50);
    const live = appendAgentReply(closed, 'We are looking at your order', 80);
    assert.equal(live.mode, 'agent');
    const last = live.messages[live.messages.length - 1];
    assert.equal(last.role, 'agent');
    assert.equal(last.gen, live.chatGen);
    assert.equal(last.text, 'We are looking at your order');
    assert.equal(live.status, 'in_progress');
  });
});

describe('support privacy', () => {
  it('strips internal notes from public messages', () => {
    const t = normalizeSupport({
      messages: [
        { role: 'user', text: 'hi', ts: 1 },
        { role: 'agent', text: 'secret', ts: 2, internal: true },
      ],
    }, 'qb_support_customer_1');
    const pub = supportPublicMessages(t);
    assert.equal(pub.length, 1);
    assert.equal(pub[0].text, 'hi');
  });
});

describe('csv + paging', () => {
  it('paginates', () => {
    const p = paginate([1, 2, 3, 4, 5], 2, 2);
    assert.deepEqual(p.rows, [3, 4]);
    assert.equal(p.pages, 3);
  });
  it('csv does not include raw phones', () => {
    const csv = ordersToCsv([{ id: 'ORD-1', status: 'delivered', shopName: 'A', customerName: 'Nimal', paymentMethod: 'card', paid: true, totalAmount: 10, deliveryFee: 2 }]);
    assert.match(csv, /ORD-1/);
    assert.doesNotMatch(csv, /071/);
  });
});

describe('password hash', () => {
  it('hashes stably and compares', async () => {
    const a = await hashPassword('secret-pass', 'salt');
    const b = await hashPassword('secret-pass', 'salt');
    assert.equal(a, b);
    assert.equal(safeEq(a, b), true);
    assert.equal(safeEq(a, await hashPassword('other', 'salt')), false);
  });
});
