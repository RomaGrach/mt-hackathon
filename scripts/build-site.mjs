import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const output = resolve('dist');
await rm(output, { recursive: true, force: true });
await mkdir(resolve(output, 'src'), { recursive: true });
for (const file of [
  'index.html',
  'preview.html',
  'styles.css',
  'src/app.js',
  'src/api.js',
  'src/views.js',
  'src/ui.js',
  'src/ux.js',
  'src/recovery.js',
  'src/shift-view.js',
  'src/shift-client.js',
  'src/preview-state.js',
  'src/preview-app.js',
  'src/motivation-view.js',
])
  await cp(resolve(file), resolve(output, file));
await writeFile(
  resolve(output, 'README.md'),
  '# Frontend bundle\n\nRequires the matching Node.js backend at /api on the same origin. This is NOT a standalone static game. Use node server.mjs or docker compose up --build for the full application.\n'
);
console.log(
  'Frontend built in dist/. Serve /api using the matching backend, never as a standalone static demo.'
);
