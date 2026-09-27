import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const flags = new Set(process.argv.slice(2));
if ([...flags].some((f) => !['--browser', '--full-browser'].includes(f)))
  throw new Error('Usage: node scripts/preflight-audit.mjs [--browser | --full-browser]');
const jobs = [
  ['Syntax and API JSON', ['scripts/check.mjs']],
  ['Legacy scenario validation', ['scripts/validate-scenarios.mjs']],
  ['Pinned shift content', ['scripts/shift-content.mjs', 'validate']],
  [
    'Design002 content',
    [
      '--input-type=module',
      '-e',
      "import {DESIGN002_CONTENT as c,validateDesign002 as v} from './backend/design002-content.js'; const e=v(c); if(e.length)throw Error(e.join('; '));console.log(c.id+'@'+c.version+': '+Object.keys(c.problems).length+' problems, '+Object.keys(c.tasks).length+' task types');",
    ],
  ],
  [
    'Unit, service and HTTP regression',
    [
      '--test',
      ...readdirSync('tests')
        .filter((x) => x.endsWith('.test.js'))
        .map((x) => 'tests/' + x),
    ],
  ],
  ['Sites build', ['scripts/build-sites.mjs']],
];
if (flags.has('--full-browser'))
  jobs.push([
    'Full browser regression (includes known outdated tests)',
    ['node_modules/@playwright/test/cli.js', 'test'],
  ]);
else if (flags.has('--browser'))
  jobs.push([
    'Current Design002 browser smoke ONLY',
    [
      'node_modules/@playwright/test/cli.js',
      'test',
      'tests/e2e/content-audit.e2e.js',
      '--reporter=list',
    ],
  ]);
console.log(
  'Prerequisite: npm ci. Browser option requires Playwright Chromium or BROWSER_CHANNEL=msedge.'
);
for (const [label, args] of jobs) {
  console.log('\n=== ' + label + ' ===');
  const r = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (r.error || r.status !== 0) {
    console.error(r.error?.message || `${label} failed (${r.status})`);
    process.exit(r.status || 1);
  }
}
console.log(
  '\nAutomated checks selected above passed. This is NOT a jury score or release approval.'
);
console.log(
  'Still verify live URL/SHA, access, badges/notices, team understanding and expert review using docs/JURY-CHECKLIST-2026-09-27.md.'
);
if (!flags.has('--browser') && !flags.has('--full-browser'))
  console.log('Browser testing was not selected.');
