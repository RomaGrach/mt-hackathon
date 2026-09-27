import test from 'node:test';
import assert from 'node:assert/strict';
import { DESIGN002_CONTENT as c } from '../backend/design002-content.js';
import {
  createDesignShift,
  reduceDesignShift,
  publicDesignShift,
} from '../backend/design002-engine.js';
import { designShift } from '../src/design002-view.js';
import { shell } from '../src/ux.js';
const now = 1800000000000;
function started() {
  return reduceDesignShift(
    createDesignShift(
      c,
      {
        id: 'ui-cards',
        profileId: 'test',
        mode: 'training',
        serviceClass: 'standard',
        variantId: 'full',
        timingPolicyId: 'extended',
      },
      now
    ),
    { type: 'begin' },
    c,
    now
  );
}
const project = (s) => publicDesignShift(s, c, now);
test('tasks open as unfinished cards, work groups are explicit, completed work only stays in the journal', () => {
  let s = started();
  const r = project(s);
  const list = designShift(r).split('data-game-pane="map"')[0];
  assert.match(list, /<h2>Проблемы/);
  assert.match(list, /<h2>Задачи/);
  assert.match(list, /data-work-card="t1"/);
  assert.match(list, /data-work-card="inspect"/);
  assert.doesNotMatch(list, /✓|Результат действия/);
  const detail = designShift(r, { workCard: 't1' }).split('data-game-pane="map"')[0];
  assert.match(detail, /Выполнить задачу/);
  assert.equal(s.step, 0);
  s = reduceDesignShift(s, { type: 'task', taskId: 't1' }, c, now);
  assert.match(designShift(project(s)), /Вагон принят/);
  assert.match(designShift(project(s)), />Окей</);
  s = reduceDesignShift(s, { type: 'continue' }, c, now);
  const after = designShift(project(s)).split('data-game-pane="map"')[0];
  assert.doesNotMatch(after, /Принять вагон|Результат действия/);
  assert.ok(s.log.some((e) => e.type === 'task_completed'));
});
test('map previews the selected title; an open card blocks the second opening', () => {
  const r = project(started());
  r.incidents = [
    {
      id: 'visible',
      label: 'Проверяемая проблема',
      text: 'Известное описание',
      seat: 9,
      status: 'open',
    },
  ];
  r.actions.push({
    command: 'focus',
    incidentId: 'visible',
    label: 'Проверяемая проблема',
    available: true,
  });
  const preview = designShift(r, { mapIncident: 'visible' });
  assert.match(preview, /data-map-preview="visible"/);
  assert.match(preview, /aria-label="Проблема на схеме"/);
  assert.match(preview, /Открыть проблему/);
  const locked = designShift(r, { mapIncident: 'visible', workCard: 't1' });
  assert.match(locked, /Сначала завершите открытую карточку/);
  assert.doesNotMatch(locked, /Открыть проблему/);
});
test('menu has no legacy notices; local outcome for pinned runs is acknowledged without an API action', () => {
  assert.doesNotMatch(
    shell('', { boot: { notices: [{ readAt: null }] }, view: 'home' }),
    /Уведомления|notice-count/
  );
  const r = project(started());
  delete r.interactionVersion;
  const html = designShift(r, {
    legacyAcknowledgement: {
      title: 'Сохранённое дело',
      text: 'Результат прежней смены',
      events: [],
    },
  });
  assert.match(html, /data-local-ack/);
  assert.match(html, /Результат прежней смены/);
});
