import { randomUUID } from 'node:crypto';
import { Store } from '../backend/storage.js';
import { Service } from '../backend/service.js';
import { commandFor } from '../src/shift-view.js';
export function harness(
  database = ':memory:',
  at = Date.parse('2026-09-26T10:00:00Z'),
  shared = null
) {
  let now = at;
  const store = shared?.store || new Store(database),
    service = shared?.service || new Service(store, { clock: () => now });
  const profile = service.createSession().profileId,
    v2 = service.shifts;
  const h = {
    store,
    service,
    v2,
    profile,
    run: null,
    get now() {
      return shared ? shared.now : now;
    },
    set now(value) {
      if (shared) shared.now = value;
      else now = value;
    },
    key: () => randomUUID(),
  };
  h.start = (options = {}) => {
    const out = v2.start(profile, {
      requestId: h.key(),
      scenarioId: 'text-shift-demo',
      mode: 'training',
      timingPolicyId: 'standard',
      ...options,
    });
    if (out.status !== 201) throw Error(JSON.stringify(out));
    h.run = out.body;
    return h.run;
  };
  h.act = (type, id) => {
    const action = h.run.actions.find(
      (a) => a.command === type && (!id || a.actionId === id || a.incidentId === id)
    );
    if (!action) throw Error('No action ' + type + ' ' + id + ' in ' + JSON.stringify(h.run));
    const out = v2.command(profile, h.run.id, {
      requestId: h.key(),
      revision: h.run.revision,
      command: commandFor(action),
    });
    if (out.status !== 200) throw Error(JSON.stringify(out));
    h.run = out.body.run;
    return h.run;
  };
  h.work = (id, incident = 'a-seat') => {
    if (h.run.phase === 'feedback') h.act('continue');
    if (h.run.phase === 'overview' && incident) h.act('focus', incident);
    h.act('choose', id);
    return h.run;
  };
  h.finish = () => {
    if (h.run.phase === 'feedback') h.act('continue');
    h.act('finish');
    return h.run.result;
  };
  h.early = () => {
    h.act('begin');
    h.work('inspect-predeparture', null);
    h.work('acknowledge-and-promise');
    h.act('continue');
    h.act('inspect');
    h.work('clear-aisle', 'b-aisle');
    h.work('verify-and-request');
    h.act('continue');
    h.act('wait');
    h.work('confirm-and-return-p1');
    return h.finish();
  };
  h.latePrefix = () => {
    h.act('begin');
    h.work('inspect-predeparture', null);
    h.work('acknowledge-and-promise');
    h.work('verify-and-request');
    h.act('continue');
    h.act('wait');
    h.act('continue');
    return h.run;
  };
  h.player = () => harness(':memory:', h.now, h);
  h.join = () => {
    const p = v2.motivationView(profile).period;
    const out = v2.entry(profile, p.id, { requestId: h.key(), action: 'join' });
    if (out.status !== 200) throw Error(JSON.stringify(out));
    return p;
  };
  h.ack = () => v2.ack(profile, h.run.id, { requestId: h.key() });
  return h;
}
