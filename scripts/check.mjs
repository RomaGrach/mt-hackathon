import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(dir + '/' + e.name) : [dir + '/' + e.name]
  );
}
const targets = [
  'server.mjs',
  'playwright.config.js',
  ...['backend', 'src', 'scripts', 'tests'].flatMap(files),
].filter((p) => /\.[cm]?js$/.test(p));
for (const file of targets) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(file, r.stderr);
    process.exit(1);
  }
}
const spec = JSON.parse(readFileSync('docs/openapi.json', 'utf8'));
if (spec.openapi !== '3.1.0' || !spec.paths['/api/runs'])
  throw new Error('Invalid API specification');
console.log('Syntax checked: ' + targets.length + ' modules; API JSON parsed.');
