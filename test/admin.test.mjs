import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  can, applyWithdrawDecision, normalizeWallet, walletHeld, maskBank, maskPhone,
  metricsFrom, applyOrderCancel, canCancelOrder, applyAccountStatus, accountMeta,
  signSession, verifySession, hashPassword, safeEq, paginate, ordersToCsv,
  parseOrder, normalizeSupport, supportPublicMessages, bootstrapAdmin, envConfigured,
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
