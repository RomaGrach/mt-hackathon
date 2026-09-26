import './build-site.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const files = [
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
];
const assets = Object.fromEntries(
  await Promise.all(
    files.map(async (file) => [
      file === 'index.html' ? '/' : '/' + file,
      await readFile(resolve('dist', file), 'utf8'),
    ])
  )
);
const proxy = await readFile(resolve('worker/sites-proxy.js'), 'utf8');
await mkdir(resolve('dist', 'server'), { recursive: true });
await mkdir(resolve('dist', '.openai'), { recursive: true });
await writeFile(
  resolve('dist', 'server', 'index.js'),
  proxy.replace('__STATIC_ASSETS__', JSON.stringify(assets))
);
await writeFile(
  resolve('dist', '.openai', 'hosting.json'),
  await readFile(resolve('.openai', 'hosting.json'))
);
console.log('Sites Worker built: frontend and same-origin API proxy.');
