import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { createApp } from '../../backend/http.js';
let app, origin;
test.beforeAll(async () => {
  app = createApp({ database: ':memory:', sweep: false, rateLimit: 10000, sessionLimit: 1000 });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  origin = 'http://127.0.0.1:' + app.server.address().port;
});
test.afterAll(async () => {
  if (app) await new Promise((r) => app.server.close(r));
});
test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
});
test.afterEach(async ({ page }) => expect(page.errors).toEqual([]));
const idle = (page) => expect(page.locator('#app')).toHaveAttribute('aria-busy', 'false');
const click = (page, name) => page.getByRole('button', { name, exact: true }).click();
async function enterOverview(page) {
  await page.goto(origin + '/preview.html');
  await click(page, 'Начать приёмку');
  await click(page, 'Проверить сведения по приёмке');
  await click(page, 'Продолжить');
}
async function shot(page, name, info) {
  if (!process.env.UX_CAPTURE) return;
  mkdirSync('docs/design/screenshots/refinement', { recursive: true });
  await page.screenshot({
    path: 'docs/design/screenshots/refinement/' + name + '-' + info.project.name + '.png',
    fullPage: true,
  });
}
test('Focus: home has one start action, optional catalogue and one menu', async ({
  page,
}, info) => {
  await page.goto(origin);
  await idle(page);
  await page.locator('#join-form button').click();
  await idle(page);
  await expect(page.locator('#shift-start-form > button:visible')).toHaveCount(1);
  await expect(page.locator('[data-action=brief]:visible')).toHaveCount(0);
  await expect(page.locator('.nav-item:visible')).toHaveCount(0);
  await shot(page, 'home', info);
  await page.locator('[data-disclosure=catalog] > summary').click();
  await expect(page.locator('.scenario-card:visible')).toHaveCount(5);
  await page.locator('.site-menu > summary').click();
  await expect(page.locator('.nav-item:visible')).toHaveCount(4);
});
test('Focus: two work controls, whole-card navigation, all choices remain visible', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enterOverview(page);
  await expect(page.locator('[data-shift-action]:visible')).toHaveCount(2);
  await expect(
    page.getByRole('button', { name: 'Завершить смену', exact: true })
  ).not.toBeVisible();
  await expect(page.locator('main > details')).toHaveCount(1);
  await shot(page, 'overview', info);
  await click(page, 'Подойти к местам 18–19');
  await expect(page.locator('.option:visible')).toHaveCount(2);
  await shot(page, 'decision', info);
  const style = await page
    .locator('.option-copy strong')
    .first()
    .evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  expect(style).toBeGreaterThanOrEqual(20);
  await click(page, 'Уточнить обращение и пообещать вернуться');
  await click(page, 'Продолжить');
  await expect(page.locator('.known-tasks')).toContainText('места 18');
  await click(page, 'Осмотреть салон');
  await click(page, 'Продолжить');
  await expect(page.locator('[data-shift-action]:visible')).toHaveCount(3);
  await shot(page, 'two-incidents', info);
  await page.locator('[data-disclosure=tools] > summary').click();
  await expect(page.getByRole('button', { name: 'Завершить смену', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Начать заново', exact: true })).toBeVisible();
});
test('Focus: 320px and enlarged text retain all core choices and large targets', async ({
  page,
}) => {
  await enterOverview(page);
  await click(page, 'Подойти к местам 18–19');
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    for (const size of ['112.5%', '225%']) {
      await page.evaluate((s) => (document.documentElement.style.fontSize = s), size);
      const layout = await page.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      expect(layout.scroll).toBeLessThanOrEqual(layout.width + 1);
      for (const control of await page.locator('[data-shift-action]:visible').all()) {
        const r = await control.boundingBox();
        expect(r.height).toBeGreaterThanOrEqual(64);
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.x + r.width).toBeLessThanOrEqual(layout.width + 1);
      }
    }
  }
});
test('Focus: settings persist, critical choices stay visible, pause preserves time', async ({
  page,
}, info) => {
  await page.goto(origin + '/preview.html');
  await page.locator('[data-disclosure=config] > summary').click();
  await page.selectOption('#preview-time', 'standard');
  await expect(page.locator('#preview-time')).toHaveValue('standard');
  await expect(page.locator('[data-disclosure=config]')).toHaveAttribute('open', '');
  await click(page, 'Начать приёмку');
  await click(page, 'Проверить сведения по приёмке');
  await click(page, 'Продолжить');
  for (const action of [
    'Уточнить обращение и пообещать вернуться',
    'Проверить сведения о размещении',
    'Передать проверенный запрос коллеге',
  ]) {
    await click(page, 'Подойти к местам 18–19');
    await click(page, action);
    if (action !== 'Передать проверенный запрос коллеге') await click(page, 'Продолжить');
  }
  await expect(page.locator('#shift-seconds')).toHaveCount(0);
  await click(page, 'Продолжить');
  await expect(page.locator('#shift-seconds')).toBeVisible();
  await expect(page.locator('.option:visible')).toHaveCount(2);
  await expect(page.locator('[data-disclosure=tools]')).toHaveCount(0);
  await shot(page, 'critical', info);
  await click(page, 'Учебная пауза');
  const remaining = await page.evaluate(
    () => JSON.parse(sessionStorage.getItem('reis400.ux-preview.v1')).critical.remainingMs
  );
  await click(page, 'Вернуться к решению');
  const actual = await page.evaluate(
    () => JSON.parse(sessionStorage.getItem('reis400.ux-preview.v1')).critical.deadline - Date.now()
  );
  expect(actual).toBeLessThanOrEqual(remaining);
  expect(actual).toBeGreaterThan(remaining - 1500);
});
test('Focus: transport red passes text contrast; decision alternatives have equal styling', async ({
  page,
}) => {
  await page.goto(origin + '/preview.html');
  const style = await page
    .locator('.primary-button')
    .evaluate((e) => ({ bg: getComputedStyle(e).backgroundColor, fg: getComputedStyle(e).color }));
  expect(style).toEqual({ bg: 'rgb(218, 32, 50)', fg: 'rgb(255, 255, 255)' });
  const lum = (rgb) =>
    rgb
      .map((v) => {
        v /= 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      })
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  expect((lum([255, 255, 255]) + 0.05) / (lum([218, 32, 50]) + 0.05)).toBeGreaterThanOrEqual(4.5);
  await click(page, 'Начать приёмку');
  const styles = await page.locator('.option').evaluateAll((nodes) =>
    nodes.map((e) => ({
      bg: getComputedStyle(e).backgroundColor,
      color: getComputedStyle(e).color,
      size: getComputedStyle(e).fontSize,
    }))
  );
  expect(styles).toHaveLength(2);
  expect(styles[0]).toEqual(styles[1]);
});
