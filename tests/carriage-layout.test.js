import test from 'node:test';
import assert from 'node:assert/strict';
import { CARRIAGE_LAYOUTS, layoutSeats } from '../src/carriage-layouts.js';
import { wagonMap } from '../src/wagon-view.js';
import { DESIGN002_CONTENT as content } from '../backend/design002-content.js';
import {
  createDesignShift,
  reduceDesignShift,
  publicDesignShift,
} from '../backend/design002-engine.js';
const now = 1800000000000;
const options = (serviceClass) => ({
  id: 'carriage-check-' + serviceClass,
  profileId: 'tester',
  mode: 'training',
  timingPolicyId: 'extended',
  variantId: 'orientation',
  serviceClass,
});
test('complete reference layouts have stable, unique addresses including the comfort room gap', () => {
  const counts = { standard: 85, comfort: 68, business: 68, first: 15 };
  for (const [id, layout] of Object.entries(CARRIAGE_LAYOUTS)) {
    const seats = layoutSeats(layout);
    assert.equal(seats.length, counts[id]);
    assert.deepEqual(
      seats,
      Array.from({ length: counts[id] }, (_, i) => i + 1)
    );
    for (let seed = 0; seed < 12; seed++) {
      const state = createDesignShift(content, { ...options(id), id: id + seed }, now);
      assert.deepEqual(state.context.layout, layout);
      assert.equal(state.context.seats, counts[id]);
      assert.ok(state.problems.every((p) => seats.includes(p.seat)));
      assert.ok(state.passengers.every((p) => seats.includes(p.seat)));
    }
  }
  assert.equal(CARRIAGE_LAYOUTS.comfort.rows.filter((row) => row.play).length, 2);
  assert.equal(CARRIAGE_LAYOUTS.comfort.rows[4].left.length, 0);
});
test('map keeps the seat number visible under incident markers and navigation opens the actual incident', () => {
  let state = createDesignShift(content, options('standard'), now);
  state = reduceDesignShift(state, { type: 'begin' }, content, now);
  let run = publicDesignShift(state, content, now);
  const incident = run.incidents.find((i) => i.zone === 'seat');
  assert.ok(incident);
  const html = wagonMap(run);
  assert.match(
    html,
    new RegExp(
      'data-seat-number="' + incident.seat + '"[^>]*data-focus-incident="' + incident.id + '"'
    )
  );
  assert.match(html, new RegExp('class="wagon-seat-number">' + incident.seat + '</span>'));
  assert.equal((html.match(/data-seat-number=/g) || []).length, 85);
  state = reduceDesignShift(state, { type: 'focus', incidentId: incident.id }, content, now);
  run = publicDesignShift(state, content, now);
  assert.match(wagonMap(run), /data-game-tab="scene"/);
  assert.deepEqual(JSON.parse(JSON.stringify(state)).context.layout, state.context.layout);
});
test('previously saved shifts retain their passenger addresses without changing replay input', () => {
  const old = structuredClone(content);
  old.version = '1.0.1';
  delete old.policies.first.layout;
  old.policies.first.rows = 8;
  const state = createDesignShift(old, options('first'), now);
  assert.equal(state.context.seats, 24);
  assert.equal(state.context.layout, undefined);
  const run = publicDesignShift(state, old, now);
  const html = wagonMap(run);
  assert.match(html, /Места сохранённой смены/);
  assert.match(html, /data-seat-number="24"/);
  assert.equal((html.match(/data-seat-number=/g) || []).length, 24);
});
