import { readFileSync, writeFileSync } from 'node:fs';
import { Store } from '../backend/storage.js';
import { SHIFT_CONTENT, validateShiftContent, contentHash } from '../backend/shift-content.js';
import {
  publishShiftContent,
  setPublicationEnabled,
  approveTechnicalReplacement,
} from '../backend/shift-operator.js';
const [command, ...args] = process.argv.slice(2);
const usage =
  'Usage: node scripts/shift-content.mjs validate [content.json] | export [output.json] | list <db> | publish <db> [content.json] | disable|enable <db> <scenario> <version> | compensate <db> <profile> <run> <reason>';
let store;
try {
  let result;
  const document = (file) => (file ? JSON.parse(readFileSync(file, 'utf8')) : SHIFT_CONTENT);
  if (command === 'validate') {
    const c = document(args[0]),
      errors = validateShiftContent(c);
    if (errors.length) throw Error(errors.join('; '));
    result = { valid: true, id: c.id, version: c.version, hash: contentHash(c) };
  } else if (command === 'export') {
    if (args[0]) {
      writeFileSync(args[0], JSON.stringify(SHIFT_CONTENT, null, 2) + '\n', 'utf8');
      result = { exported: args[0] };
    } else result = SHIFT_CONTENT;
  } else {
    if (!['list', 'publish', 'disable', 'enable', 'compensate'].includes(command) || !args[0])
      throw Error(usage);
    store = new Store(args[0]);
    if (command === 'list')
      result = store.all(
        'SELECT * FROM shift_publications ORDER BY published_at,scenario_id,content_version'
      );
    if (command === 'publish') result = publishShiftContent(store, document(args[1]), Date.now());
    if (command === 'disable' || command === 'enable')
      result = setPublicationEnabled(store, args[1], args[2], command === 'enable');
    if (command === 'compensate')
      result = approveTechnicalReplacement(store, args[1], args[2], args.slice(3).join(' '));
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error.code || 'OPERATOR_ERROR', error.message);
  process.exitCode = 1;
} finally {
  store?.close();
}
