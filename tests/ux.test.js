import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readPending,
  savePending,
  clearPending,
  PENDING_KEY,
  isUncertain,
} from '../src/recovery.js';
import { ShiftClient, SHIFT_PENDING_KEY } from '../src/shift-client.js';
import { commandFor, renderShift } from '../src/shift-view.js';
import {
  createPreview,
  publicPreview,
  reducePreview,
  expirePreview,
} from '../src/preview-state.js';
import { ApiError, api } from '../src/api.js';
const memory = () => {
  const m = new Map();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  };
};
const tick = (s, type, id, now = 1000) => {
  const a = publicPreview(s, now).actions.find(
    (a) => a.command === type && (!id || a.actionId === id || a.incidentId === id)
  );
  assert.ok(a, `${s.phase}: ${type}/${id}`);
  return reducePreview(s, commandFor(a), now);
};
function overview(options = {}) {
  let s = createPreview(options);
  s = tick(s, 'begin');
  s = tick(s, 'choose', 'inspect-predeparture');
  return tick(s, 'continue');
}
function critical(options = {}) {
  let s = overview(options);
  for (let i = 0; i < 3; i++) {
    s = tick(s, 'focus', 'a-seat');
    if (i === 0) s = tick(s, 'choose', 'promise');
    if (i === 1) s = tick(s, 'choose', 'verify');
    if (i === 2) s = tick(s, 'choose', 'handoff');
    if (i < 2) s = tick(s, 'continue');
  }
  return s;
}

test('pending survives reload exactly; corrupted storage is never transmitted', () => {
  const storage = memory();
  const command = {
    path: '/runs/abc/decision',
    body: { revision: 3, optionId: 'option', requestId: 'request-001' },
  };
  savePending(command, storage);
  assert.deepEqual(readPending(storage), command);
  clearPending(storage);
  assert.equal(readPending(storage), null);
  for (const value of ['broken', '{"path":"/profile","body":{"requestId":"request-001"}}']) {
    storage.setItem(PENDING_KEY, value);
    assert.equal(readPending(storage), null);
  }
});
test('storage failure rejects BEFORE transmission; uncertain errors remain recoverable', () => {
  assert.throws(
    () =>
      savePending(
        {},
        {
          setItem() {
            throw Error('quota');
          },
        }
      ),
    { code: 'STORAGE_UNAVAILABLE' }
  );
  for (const e of [
    { code: 'TIMEOUT' },
    { code: 'NETWORK' },
    { code: 'INVALID_RESPONSE' },
    { status: 503 },
    { status: 429 },
  ])
    assert.equal(isUncertain(e), true);
  assert.equal(isUncertain({ code: 'STALE_REVISION', status: 409 }), false);
});
test('v2 action encoder whitelists fields, not scores, clocks or answer keys', () => {
  assert.deepEqual(
    commandFor({
      command: 'choose',
      incidentId: 'a',
      sceneId: 's',
      actionId: 'x',
      points: 500,
      deadline: 0,
      recommended: true,
    }),
    { type: 'choose', incidentId: 'a', sceneId: 's', actionId: 'x', windowId: null }
  );
  assert.throws(() => commandFor({ command: 'choose', available: false }));
  assert.throws(() => commandFor({ command: 'eval' }));
});
test('v2 lost response: a new client restores exact request then GETs current run', async () => {
  const storage = memory(),
    calls = [];
  let lost = true;
  const transport = async (p, o) => {
    calls.push({ p, o });
    if (o?.method === 'POST') {
      if (lost) {
        lost = false;
        throw new ApiError('lost', 'NETWORK', 0);
      }
      return { run: { schemaVersion: 2, id: 'run-1', revision: 2 } };
    }
    return { schemaVersion: 2, id: 'run-1', revision: 4 };
  };
  const first = new ShiftClient({ storage, transport, makeId: () => 'request-001' });
  first.run = { id: 'run-1', revision: 1 };
  await assert.rejects(first.send({ command: 'continue' }));
  assert.ok(readPending(storage, SHIFT_PENDING_KEY));
  const second = new ShiftClient({ storage, transport });
  const recovered = await second.recover();
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(calls[2].o, undefined);
  assert.equal(recovered.revision, 4);
  assert.equal(readPending(storage, SHIFT_PENDING_KEY), null);
});
test('v2 stale command reconciles without submitting a new revision', async () => {
  const storage = memory(),
    calls = [];
  const client = new ShiftClient({
    storage,
    makeId: () => 'request-002',
    transport: async (p, o) => {
      calls.push({ p, o });
      if (o?.method === 'POST') throw new ApiError('stale', 'STALE_REVISION', 409);
      return { schemaVersion: 2, id: 'r', revision: 9 };
    },
  });
  client.run = { id: 'r', revision: 1 };
  await assert.rejects(client.send({ command: 'continue' }), { code: 'STALE_REVISION' });
  assert.equal(calls.length, 2);
  assert.equal(client.run.revision, 9);
  assert.equal(readPending(storage, SHIFT_PENDING_KEY), null);
});
test('v2 simultaneous click rejected while first command is outstanding', async () => {
  let release;
  const wait = new Promise((resolve) => (release = resolve)),
    storage = memory();
  let posts = 0;
  const client = new ShiftClient({
    storage,
    makeId: () => 'request-003',
    transport: async (p, o) => {
      if (o?.method === 'POST') {
        posts++;
        await wait;
      }
      return { schemaVersion: 2, id: 'r', revision: 2 };
    },
  });
  client.run = { id: 'r', revision: 1 };
  const first = client.send({ command: 'continue' });
  await assert.rejects(client.send({ command: 'continue' }), { code: 'PENDING_COMMAND' });
  release();
  await first;
  assert.equal(posts, 1);
});
test('v2 401 clears receipt and session; unavailable versions are not replaced', async () => {
  const storage = memory();
  const client = new ShiftClient({
    storage,
    makeId: () => 'request-004',
    transport: async () => {
      throw new ApiError('expired', 'UNAUTHORIZED', 401);
    },
  });
  client.run = { id: 'r', revision: 1 };
  await assert.rejects(client.send({ command: 'continue' }));
  assert.equal(client.run, null);
  assert.equal(readPending(storage, SHIFT_PENDING_KEY), null);
  const html = renderShift({ schemaVersion: 3, id: 'old-pinned' });
  assert.match(html, /не заменены/);
  assert.doesNotMatch(html, /data-shift-action/);
});
test('prototype overview has no undiscovered B; switching is not a work step', () => {
  let s = overview();
  const html = renderShift(publicPreview(s));
  assert.doesNotMatch(html, /b-aisle|багаж|return-p1/);
  assert.equal(publicPreview(s).incidents.length, 1);
  s = tick(s, 'focus', 'a-seat');
  const before = s.step;
  s = tick(s, 'overview');
  assert.equal(s.step, before);
  s = tick(s, 'inspect');
  s = tick(s, 'continue');
  assert.equal(publicPreview(s).incidents.length, 2);
  assert.equal(publicPreview(s).observations.length, 2);
});
test('prototype promise is addressed to p1 and persists between scenes', () => {
  let s = overview();
  s = tick(s, 'focus', 'a-seat');
  s = tick(s, 'choose', 'promise');
  s = tick(s, 'continue');
  assert.equal(publicPreview(s).tasks[0].actorId, 'p1');
  assert.match(renderShift(publicPreview(s)), /Вернуться к пассажиру у места 18/);
});
test('prototype pending critical has no choices/deadline; continue opens window atomically', () => {
  let s = critical({ timingPolicyId: 'standard' });
  assert.equal(s.critical.status, 'pending');
  assert.equal(s.critical.deadline, null);
  assert.equal(publicPreview(s).scene, null);
  assert.deepEqual(
    publicPreview(s).actions.map((a) => a.command),
    ['continue']
  );
  s = tick(s, 'continue', null, 9000);
  assert.equal(s.critical.deadline, 29000);
  assert.ok(publicPreview(s).actions.some((a) => a.command === 'choose'));
  assert.ok(!publicPreview(s).actions.some((a) => a.command === 'overview'));
});
test('prototype timeout at exact boundary happens once and survives serialization', () => {
  let s = tick(critical({ timingPolicyId: 'standard' }), 'continue', null, 9000);
  assert.equal(expirePreview(s, 28999), s);
  s = expirePreview(s, 29000);
  assert.equal(s.feedback.timedOut, true);
  assert.equal(s.criticalError, true);
  const n = s.history.length;
  const restored = JSON.parse(JSON.stringify(s));
  assert.equal(expirePreview(restored, 40000).history.length, n);
});
test('prototype training pause preserves remaining time; assessment cannot pause', () => {
  let s = tick(critical({ timingPolicyId: 'standard' }), 'continue', null, 9000);
  s = tick(s, 'pause', null, 12000);
  assert.equal(s.critical.remainingMs, 17000);
  s = tick(s, 'resume', null, 60000);
  assert.equal(s.critical.deadline, 77000);
  const assessment = tick(
    critical({ mode: 'assessment', timingPolicyId: 'standard' }),
    'continue',
    null,
    9000
  );
  assert.ok(!publicPreview(assessment).actions.some((a) => a.command === 'pause'));
  assert.throws(() => reducePreview(assessment, { type: 'pause' }, 10000));
});
test('prototype request, acknowledgement and completion are separate; wrong recipient does not complete task', () => {
  let s = critical();
  assert.equal(s.handoff, 'requested');
  s = tick(s, 'continue');
  s = tick(s, 'choose', 'clear-aisle');
  assert.equal(s.handoff, 'accepted');
  s = tick(s, 'continue');
  s = tick(s, 'wait');
  assert.equal(s.handoff, 'completed');
  s = tick(s, 'continue');
  s = tick(s, 'focus', 'a-seat');
  s = tick(s, 'choose', 'return-p2');
  assert.equal(s.returned, false);
  s = tick(s, 'continue');
  s = tick(s, 'focus', 'a-seat');
  s = tick(s, 'choose', 'return-p1');
  assert.equal(s.returned, true);
});
test('prototype safe action at due step prevents escalation; repeated observation gives no score', () => {
  let s = overview();
  s = tick(s, 'inspect');
  s = tick(s, 'continue');
  s = tick(s, 'focus', 'b-aisle');
  s = tick(s, 'choose', 'clear-aisle');
  s = tick(s, 'continue');
  const safety = s.safety;
  s = tick(s, 'inspect');
  assert.equal(s.critical, null);
  assert.equal(s.safety, safety);
  assert.match(s.feedback.text, /Нормальное наблюдение/);
});
test('assessment rendering suppresses pedagogical hints and escapes supplied content', () => {
  const r = publicPreview(overview());
  r.phase = 'feedback';
  r.mode = 'assessment';
  r.feedback = { text: '<script>unsafe</script>', explanation: 'secret-answer' };
  const html = renderShift(r);
  assert.doesNotMatch(html, /secret-answer|<script>/);
  assert.match(html, /&lt;script&gt;/);
});
test('transport does not automatically retry unkeyed session creation', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw Error('offline');
  };
  try {
    await assert.rejects(api('/session', { method: 'POST', body: { crew: 'msk-1' } }), {
      code: 'NETWORK',
    });
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});

test('v2 fresh action uses its authoritative response without a redundant GET', async () => {
  const calls = [];
  const run = { id: 'run-1', schemaVersion: 2, revision: 1 };
  const client = new ShiftClient({
    storage: memory(),
    makeId: () => 'fresh-key',
    transport: async (path, options) => {
      calls.push({ path, method: options?.method });
      return { run };
    },
  });
  client.run = { id: 'run-1', schemaVersion: 2, revision: 0 };
  assert.deepEqual(await client.send({ command: 'begin' }), run);
  assert.deepEqual(calls, [{ path: '/v2/runs/run-1/commands', method: 'POST' }]);
});

test('v2 internally retried response still reconciles the latest server revision', async () => {
  const calls = [];
  const receipt = { run: { id: 'run-1', schemaVersion: 2, revision: 1 }, __retried: true };
  const latest = { id: 'run-1', schemaVersion: 2, revision: 2 };
  const client = new ShiftClient({
    storage: memory(),
    makeId: () => 'retry-key',
    transport: async (path, options) => {
      calls.push(options?.method || 'GET');
      return options?.method === 'POST' ? receipt : latest;
    },
  });
  client.run = { id: 'run-1', schemaVersion: 2, revision: 0 };
  assert.deepEqual(await client.send({ command: 'begin' }), latest);
  assert.deepEqual(calls, ['POST', 'GET']);
});
