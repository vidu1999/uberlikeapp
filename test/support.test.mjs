import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { freshAiHistory, isAgentHandoffText, shouldEscalate } from '../functions/_lib/support.js';

describe('fresh AI chat after agent close', () => {
  it('drops messages before the closed-session marker', () => {
    const history = freshAiHistory([
      { role: 'user', content: 'Where is my order?' },
      { role: 'assistant', content: 'Open Track on the order.' },
      { role: 'user', content: 'Talk to a real agent' },
      { role: 'system', content: 'The agent closed this chat. Rate this agent session. AI Help continues after you rate.' },
      { role: 'system', content: 'Thanks. You rated this agent 5 stars. AI Help is ready.' },
      { role: 'user', content: 'Where is my order?' },
    ]);
    assert.deepEqual(history, [{ role: 'user', content: 'Where is my order?' }]);
  });

  it('does not escalate a new chat just because the old session had the same question', () => {
    const sliced = freshAiHistory([
      { role: 'user', content: 'Where is my order?' },
      { role: 'assistant', content: 'Open Track on the order.' },
      { role: 'system', content: 'The agent session closed after 3 minutes with no reply. Rate this agent, then AI Help continues.' },
      { role: 'user', content: 'Where is my order?' },
    ]);
    const gate = shouldEscalate(sliced, 'Where is my order?');
    assert.equal(gate.yes, false);
  });

  it('still escalates when the new chat asks for a real agent', () => {
    const sliced = freshAiHistory([
      { role: 'system', content: 'Thanks. You rated this agent 4 stars. AI Help is ready.' },
      { role: 'user', content: 'Talk to a real agent' },
    ]);
    const gate = shouldEscalate(sliced, 'Talk to a real agent');
    assert.equal(gate.yes, true);
    assert.equal(gate.reason, 'asked_agent');
  });

  it('does not connect an agent after one suggestion', () => {
    const gate = shouldEscalate(
      [{ role: 'user', content: 'Where is my order?' }],
      'Where is my order?'
    );
    assert.equal(gate.yes, false);
  });

  it('does not connect after Payment or wallet in a fresh session', () => {
    const gate = shouldEscalate(
      [{ role: 'user', content: 'Payment or wallet' }],
      'Payment or wallet'
    );
    assert.equal(gate.yes, false);
  });

  it('treats connecting-to-agent copy as a real handoff', () => {
    assert.equal(isAgentHandoffText('Connecting you to a real QuickBite agent now. Keep this chat open and type the details — they will see this thread.'), true);
    assert.equal(isAgentHandoffText('I can connect a real agent if this is not resolved.'), false);
  });
});
