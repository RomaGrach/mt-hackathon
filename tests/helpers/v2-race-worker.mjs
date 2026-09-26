import { once } from 'node:events';
import { Store } from '../../backend/storage.js';
import { ShiftService } from '../../backend/shift-service.js';
const [database, profileId, runId, kind, requestId] = process.argv.slice(2);
const now = Date.parse('2026-09-26T10:00:00Z');
const store = new Store(database),
  v2 = new ShiftService(store, { clock: () => now });
console.log('READY');
await once(process.stdin, 'data');
try {
  const result =
    kind === 'ack'
      ? v2.ack(profileId, runId, { requestId })
      : v2.command(profileId, runId, { requestId, revision: 0, command: { type: 'begin' } });
  console.log(JSON.stringify(result));
} catch (error) {
  console.log(JSON.stringify({ error: error.code || error.message }));
  process.exitCode = 1;
} finally {
  store.close();
  process.stdin.destroy();
}
