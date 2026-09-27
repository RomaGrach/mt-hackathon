import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { harness } from './shift-helper.js';
import { Store } from '../backend/storage.js';
import { Service } from '../backend/service.js';
import { SHIFT_CONTENT } from '../backend/shift-content.js';
import {
  publishShiftContent,
  approveTechnicalReplacement,
  setPublicationEnabled,
} from '../backend/shift-operator.js';
async function race(database, profile, runIds, kind, keys) {
  const children = runIds.map((id, i) =>
    spawn(
      process.execPath,
      ['tests/helpers/v2-race-worker.mjs', database, profile, id, kind, keys[i]],
      { stdio: ['pipe', 'pipe', 'pipe'] }
    )
  );
  const ready = [],
    results = [];
  for (const child of children) {
    let text = '',
      errors = '',
      signal;
    ready.push(new Promise((resolve) => (signal = resolve)));
    child.stdout.on('data', (chunk) => {
      text += chunk;
      if (text.includes('READY')) signal();
    });
    child.stderr.on('data', (chunk) => (errors += chunk));
    results.push(
      new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('exit', (code) => {
          if (code) reject(Error(errors + ' ' + text));
          else resolve(JSON.parse(text.trim().split('\n').at(-1)));
        });
      })
    );
  }
  await Promise.all(ready);
  for (const child of children) child.stdin.end('GO\n');
  return Promise.all(results);
}
function disk(t) {
  const dir = mkdtempSync(join(tmpdir(), 'reis-v2-race-')),
    file = join(dir, 'test.sqlite'),
    h = harness(file);
  t.after(() => {
    h.store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { h, file };
}

test('SQLite: четыре процесса, один command receipt и единственный переход', async (t) => {
  const { h, file } = disk(t);
  h.start();
  const id = h.run.id,
    key = h.key();
  const replies = await race(file, h.profile, [id, id, id, id], 'begin', [key, key, key, key]);
  assert.ok(replies.every((x) => JSON.stringify(x) === JSON.stringify(replies[0])));
  assert.equal(replies[0].status, 200);
  assert.equal(h.v2.get(h.profile, id).revision, 1);
  assert.equal(h.store.get('SELECT COUNT(*) n FROM shift_transitions WHERE run_id=?', id).n, 1);
});

test('SQLite: конкурентные debrief-ack с разными ключами начисляют XP один раз', async (t) => {
  const { h, file } = disk(t);
  h.start();
  h.early();
  const replies = await race(
    file,
    h.profile,
    Array(4).fill(h.run.id),
    'ack',
    Array.from({ length: 4 }, () => h.key())
  );
  assert.equal(
    replies.reduce((n, x) => n + x.body.deltaXP, 0),
    20
  );
  assert.equal(replies.filter((x) => x.body.deltaXP === 20).length, 1);
  assert.equal(h.v2.motivationView(h.profile).lifetimePracticeXP, 20);
  assert.equal(h.store.get('SELECT COUNT(*) n FROM debrief_acks').n, 1);
});

test('SQLite: шесть реально опубликованных семейств, гонка ack не превышает cap 100', async (t) => {
  const { h, file } = disk(t),
    ids = [];
  for (let i = 0; i < 6; i++) {
    const c = structuredClone(SHIFT_CONTENT);
    c.id = 'fixture-shift-' + i;
    c.creditFamilyId = 'fixture-family-' + i;
    publishShiftContent(h.store, c, h.now);
    h.start({ scenarioId: c.id });
    h.early();
    ids.push(h.run.id);
  }
  const replies = await race(
    file,
    h.profile,
    ids,
    'ack',
    ids.map(() => h.key())
  );
  assert.equal(
    replies.reduce((n, x) => n + x.body.deltaXP, 0),
    100
  );
  assert.equal(h.v2.motivationView(h.profile).lifetimePracticeXP, 100);
  assert.equal(h.v2.motivationView(h.profile).practiceLevel, 2);
  assert.equal(h.store.get('SELECT COUNT(*) n FROM practice_credits').n, 5);
  assert.equal(h.store.get('SELECT COUNT(*) n FROM debrief_acks').n, 6);
});

test('SQLite: аддитивная миграция v1 сохраняет активный таймер и историю без вымышленных XP', (t) => {
  const { h, file } = disk(t);
  const old = h.service.start(h.profile, 'medical', false, h.key());
  const before = h.store.get('SELECT state FROM runs WHERE id=?', old.id).state;
  // Re-create the pre-migration schema by retaining the original v1 tables only.
  h.store.db.exec('PRAGMA foreign_keys=OFF');
  const legacy = new Set([
    'profiles',
    'sessions',
    'scenarios',
    'runs',
    'results',
    'events',
    'notices',
    'bonuses',
    'requests',
    'sqlite_sequence',
  ]);
  for (const row of h.store.all("SELECT name FROM sqlite_master WHERE type='table'"))
    if (!legacy.has(row.name)) h.store.db.exec('DROP TABLE ' + row.name);
  h.store.db.exec('PRAGMA user_version=1; PRAGMA foreign_keys=ON');
  const other = new Store(file);
  try {
    const service = new Service(other, { clock: () => h.now });
    assert.equal(other.get('PRAGMA user_version').user_version, 2);
    assert.equal(other.get('SELECT state FROM runs WHERE id=?', old.id).state, before);
    assert.equal(service.getRun(h.profile, old.id).deadline, old.deadline);
    assert.equal(service.shifts.motivationView(h.profile).lifetimePracticeXP, 0);
    assert.equal(other.get('SELECT COUNT(*) n FROM debrief_acks').n, 0);
  } finally {
    other.close();
  }
});

test('оператор: техническая компенсация до разбора сохраняет аудит и повторно использует тот же ordinal', (t) => {
  const h = harness();
  t.after(() => h.store.close());
  h.join();
  h.start({ mode: 'assessment', competitionSlotId: 'shift' });
  h.act('begin');
  h.act('abort');
  const old = h.run.id;
  const first = approveTechnicalReplacement(
    h.store,
    h.profile,
    old,
    'Подтверждённый сбой тестового окружения',
    h.now
  );
  assert.equal(first.ordinal, 1);
  assert.equal(
    approveTechnicalReplacement(
      h.store,
      h.profile,
      old,
      'Подтверждённый сбой тестового окружения',
      h.now
    ).alreadyApproved,
    true
  );
  assert.equal(h.v2.get(h.profile, old).result.technicalIssue, true);
  assert.equal(h.ack().body.deltaXP, 0);
  h.start({ mode: 'assessment', competitionSlotId: 'shift' });
  h.early();
  assert.equal(
    h.store.get('SELECT ordinal FROM competition_attempts WHERE run_id=?', h.run.id).ordinal,
    1
  );
  assert.equal(h.v2.motivationView(h.profile).participation.seasonPoints, 100);
  h.ack();
  assert.throws(
    () =>
      approveTechnicalReplacement(
        h.store,
        h.profile,
        h.run.id,
        'Новая техническая заявка после разбора',
        h.now
      ),
    (e) => e.code === 'DEBRIEF_ALREADY_ACKNOWLEDGED'
  );
  assert.equal(h.store.get('SELECT COUNT(*) n FROM technical_replacements').n, 1);
  setPublicationEnabled(h.store, SHIFT_CONTENT.id, SHIFT_CONTENT.version, false, h.now);
  assert.equal(
    h.v2.catalog().some((c) => c.id === SHIFT_CONTENT.id),
    false
  );
  assert.equal(
    h.v2.catalog().some((c) => c.id === 'design002'),
    true
  );
  assert.equal(h.v2.exactReplay(h.profile, h.run.id).verified, true);
});

test('SQLite: удаление профиля каскадно удаляет v2 receipts/evidence/reviews/metadata', (t) => {
  const h = harness();
  t.after(() => h.store.close());
  h.join();
  h.start({ mode: 'assessment', competitionSlotId: 'shift' });
  h.early();
  h.ack();
  const id = h.run.id;
  h.service.deleteProfile(h.profile);
  for (const table of ['shift_meta', 'shift_events', 'shift_transitions'])
    assert.equal(h.store.get('SELECT COUNT(*) n FROM ' + table + ' WHERE run_id=?', id).n, 0);
  for (const table of [
    'practice_accounts',
    'practice_credits',
    'practice_goals',
    'practice_awards',
    'practice_reviews',
    'motivation_events',
    'competition_attempts',
    'debrief_acks',
    'motivation_entries',
    'motivation_notice_views',
    'requests',
  ])
    assert.equal(
      h.store.get('SELECT COUNT(*) n FROM ' + table + ' WHERE profile_id=?', h.profile).n,
      0
    );
});
