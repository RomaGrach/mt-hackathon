import './build-site.mjs';
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const files = [
  'index.html',
  'preview.html',
  'styles.css',
  'src/app.js',
  'src/admin-view.js',
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
const source = (await readFile(resolve('worker/sites-game.js'), 'utf8'))
  .replace('__STATIC_ASSETS__', JSON.stringify(assets))
  .replace('__OPENAPI__', JSON.stringify(await readFile(resolve('docs/openapi.json'), 'utf8')));
await mkdir(resolve('dist', 'server'), { recursive: true });
await mkdir(resolve('dist', '.openai'), { recursive: true });
await build({
  stdin: {
    contents: source,
    resolveDir: resolve('worker'),
    sourcefile: 'sites-game.js',
    loader: 'js',
  },
  bundle: true,
  minify: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  external: ['node:*', 'cloudflare:node'],
  plugins: [
    {
      name: 'sqljs-worker-location',
      setup(build) {
        build.onLoad({ filter: /sql-asm\.js$/ }, async ({ path }) => {
          const original = await readFile(path, 'utf8');
          const nodeDetection =
            'ca=globalThis.process?.versions?.node&&"renderer"!=globalThis.process?.type';
          if (!original.includes('self.location.href') || !original.includes(nodeDetection)) {
            throw new Error('SQL.js environment detection changed; review the Worker adapter');
          }
          return {
            contents: original
              .replaceAll('self.location.href', '(self.location?.href ?? "")')
              .replace(nodeDetection, 'ca=false'),
            loader: 'js',
          };
        });
      },
    },
  ],
  outfile: resolve('dist', 'server', 'index.js'),
});
await writeFile(
  resolve('dist', '.openai', 'hosting.json'),
  await readFile(resolve('.openai', 'hosting.json'))
);
console.log('Sites Worker built with server-authoritative game and D1 persistence.');
