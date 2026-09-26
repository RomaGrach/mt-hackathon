import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './shift-helper.js';
import { createApp } from '../backend/http.js';
import { adminUsers } from '../backend/admin.js';

const elapsed = () => harness(':memory:', Date.parse('2026-09-26T10:00:00Z'), null, 'elapsed');
test('elapsed clock: durations, finite promise, complete route and exact replay', () => {
  const h = elapsed();
  try {
    h.start();
    h.act('begin');
    assert.equal(h.run.simulationSeconds, 0);
    assert.equal(
      h.run.actions.find((a) => a.actionId === 'inspect-predeparture').durationSeconds,
      60
    );
    h.work('inspect-predeparture', null);
    assert.equal(h.run.simulationSeconds, 60);
    h.work('acknowledge-and-promise');
    const promise = h.run.tasks.find((t) => t.type === 'promise');
    assert.equal(promise.dueSeconds, h.run.simulationSeconds + 300);
    h.act('continue');
    h.act('inspect');
    h.work('clear-aisle', 'b-aisle');
    h.work('verify-and-request');
    h.act('continue');
    h.act('wait');
    h.act('continue');
    h.act('wait');
    h.work('confirm-and-return-p1');
    assert.equal(h.run.tasks.find((t) => t.type === 'promise').status, 'completed');
    h.finish();
    assert.equal(h.run.result.passed, true);
    assert.equal(h.v2.exactReplay(h.profile, h.run.id).verified, true);
  } finally {
    h.store.close();
  }
});

test('elapsed promise expires once, cannot be renewed indefinitely', () => {
  const h = elapsed();
  try {
    h.start();
    h.act('begin');
    h.work('inspect-predeparture', null);
    h.act('continue');
    h.act('inspect');
    h.work('clear-aisle', 'b-aisle');
    h.work('acknowledge-and-promise');
    const due = h.run.tasks.find((t) => t.type === 'promise').dueSeconds;
    while (h.run.simulationSeconds < due) {
      h.act('continue');
      h.act('wait');
    }
    assert.equal(h.run.tasks.find((t) => t.type === 'promise').overdue, true);
    const loyalty = h.run.scales.loyalty;
    h.act('continue');
    h.act('wait');
    assert.equal(h.run.scales.loyalty, loyalty);
    h.act('continue');
    h.act('focus', 'a-seat');
    assert.equal(
      h.run.actions.some((a) => a.actionId === 'acknowledge-and-promise'),
      false
    );
  } finally {
    h.store.close();
  }
});

test('public test admin: anonymous read, pagination, no session secrets and no writes', async (t) => {
  const app = createApp({ database: ':memory:', sweep: false });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise((resolve) => {
      app.server.close(resolve);
      app.server.closeAllConnections();
    });
  });
  const base = 'http://127.0.0.1:' + app.server.address().port;
  const sessions = Array.from({ length: 51 }, () => app.service.createSession());
  const response = await fetch(base + '/api/admin/users');
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.total, 51);
  assert.equal(data.items.length, 50);
  assert.equal(data.nextOffset, 50);
  assert.equal(JSON.stringify(data).includes(sessions[0].token), false);
  assert.equal(adminUsers(app.store, new URLSearchParams('offset=50')).items.length, 1);
  assert.equal((await fetch(base + '/api/admin/access').then((r) => r.json())).testMode, true);
  assert.equal(
    (
      await fetch(base + '/api/admin/users', {
        method: 'POST',
        headers: { 'X-Reis-Client': 'web' },
      })
    ).status,
    405
  );
});

test('screen UI retains every visible task and all offered actions across a full shift', async () => {
  const { renderShift } = await import('../src/shift-view.js');
  const h = elapsed();
  try {
    h.start();
    const verify = () => {
      const html = renderShift(h.run, { embedded: true });
      for (const task of h.run.tasks) assert.ok(html.includes(task.label), task.id);
      h.run.actions.forEach((a, i) =>
        assert.ok(html.includes(`data-shift-action="${i}"`), a.label)
      );
      assert.ok(html.includes('data-game-pane="tasks"'));
      assert.ok(!html.includes('<dialog'));
      assert.ok(!html.includes('data-open-sheet'));
      assert.ok(!html.includes('data-game-tab="help"'));
      assert.ok(!html.includes('Обещания'));
    };
    verify();
    h.act('begin');
    verify();
    h.work('inspect-predeparture', null);
    verify();
    h.work('acknowledge-and-promise');
    verify();
    h.act('continue');
    h.act('inspect');
    verify();
    h.work('clear-aisle', 'b-aisle');
    verify();
    h.work('verify-and-request');
    verify();
    h.act('continue');
    h.act('wait');
    h.act('continue');
    h.act('wait');
    h.work('confirm-and-return-p1');
    verify();
    h.finish();
    verify();
  } finally {
    h.store.close();
  }
});
