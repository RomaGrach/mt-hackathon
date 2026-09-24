import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

const root = resolve('.');
const output = resolve(root, 'dist');
if (!output.startsWith(root + sep) || output !== resolve(root, 'dist')) throw new Error('Некорректный каталог сборки');

await rm(output, { recursive: true, force: true });
await mkdir(resolve(output, 'src'), { recursive: true });
for (const file of ['index.html', 'styles.css', 'src/app.js', 'src/game.js', 'src/profile.js', 'src/scenarios.js']) {
  await cp(resolve(root, file), resolve(output, file));
}

const html = await readFile(resolve(output, 'index.html'), 'utf8');
if (!html.includes('/src/app.js') || !html.includes('/styles.css')) throw new Error('Сайт ссылается на отсутствующие ресурсы');
console.log('Собраны только публичные файлы сайта в dist/');
