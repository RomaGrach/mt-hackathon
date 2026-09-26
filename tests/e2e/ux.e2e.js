import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { createApp } from '../../backend/http.js';
let app, origin;
test.beforeAll(async () => {
  app = createApp({ database: ':memory:', sweep: false, rateLimit: 10000, sessionLimit: 1000 });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + app.server.address().port;
});
test.afterAll(async () => {
  if (app) await new Promise((resolve) => app.server.close(resolve));
});
test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
});
test.afterEach(async ({ page }) => {
  expect(page.errors).toEqual([]);
});
const idle = async (page) => expect(page.locator('#app')).toHaveAttribute('aria-busy', 'false');
async function join(page) {
  await page.goto(origin);
  await idle(page);
  await page.locator('#join-form button').click();
  await idle(page);
}
async function start(page) {
  await page.locator('[data-action="brief"][data-id="conflict"]').first().click();
  await idle(page);
  await page.locator('[data-action="start"]:not([data-practice])').click();
  await idle(page);
}
async function noOverflow(page) {
  const result = await page.evaluate(() => ({
    width: window.innerWidth,
    scroll: document.documentElement.scrollWidth,
    wide: [...document.querySelectorAll('body *')]
      .filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1)
      .slice(0, 8)
      .map((e) => [e.tagName, e.className]),
  }));
  expect(result.scroll, JSON.stringify(result)).toBeLessThanOrEqual(result.width + 1);
}
async function step(page, name) {
  await page.getByRole('button', { name, exact: true }).click();
}
async function overview(page) {
  await page.goto(origin + '/preview.html');
  await step(page, 'Начать приёмку');
  await step(page, 'Проверить сведения по приёмке');
  await step(page, 'Продолжить');
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'overview');
}

test('UX: live pages reflow at 320px and 200% text without losing actions', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await join(page);
  await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
  await noOverflow(page);
  for (const view of ['profile', 'leaderboard', 'notices', 'home']) {
    await page.locator('.site-menu > summary').click();
    await page.locator('.nav-item[data-view="' + view + '"]').click();
    await idle(page);
    await noOverflow(page);
  }
  await start(page);
  await noOverflow(page);
  await expect(page.locator('[data-action="choose"]').first()).toBeVisible();
  const targets = await page.locator('button').evaluateAll((nodes) =>
    nodes
      .filter((n) => n.getClientRects().length)
      .map((n) => ({
        name: n.textContent.trim().slice(0, 60),
        height: n.getBoundingClientRect().height,
      }))
      .filter((x) => x.height < 44)
  );
  expect(targets).toEqual([]);
});
test('UX: two synchronous clicks produce exactly one server decision', async ({ page }) => {
  await join(page);
  await start(page);
  let posts = 0;
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith('/decision')) posts++;
  });
  await page
    .locator('[data-action="choose"]')
    .first()
    .evaluate((button) => {
      button.click();
      button.click();
    });
  await idle(page);
  const id = new URL(page.url()).hash.slice(5),
    run = await (await page.request.get(origin + '/api/runs/' + id)).json();
  expect(run.history).toHaveLength(1);
  expect(posts).toBe(1);
});
test('UX: both responses lost, reload recovers stored receipt without duplicating choice', async ({
  page,
}) => {
  await join(page);
  await start(page);
  const requests = [];
  await page.route('**/api/runs/*/decision', async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fetch();
    await route.abort();
  });
  await page.locator('[data-action="choose"]').first().click();
  await idle(page);
  await expect(page.locator('.error-toast')).toBeVisible();
  await expect(page.locator('[data-action="refresh"]')).toBeFocused();
  const stored = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem('reis400.pending-command.v1'))
  );
  expect(stored.body).toEqual(requests[0]);
  expect(requests[1]).toEqual(requests[0]);
  await page.unroute('**/api/runs/*/decision');
  await page.reload();
  await idle(page);
  expect(await page.evaluate(() => sessionStorage.getItem('reis400.pending-command.v1'))).toBe(
    null
  );
  const id = new URL(page.url()).hash.slice(5),
    run = await (await page.request.get(origin + '/api/runs/' + id)).json();
  expect(run.history).toHaveLength(1);
  await expect(page.locator('[data-action="continue"]')).toBeVisible();
});
test('UX: initial connection failure offers retry, offline is not a pause', async ({ page }) => {
  await page.route('**/api/bootstrap', (route) => route.abort());
  await page.goto(origin);
  await idle(page);
  await expect(page.locator('.error-toast')).toBeVisible();
  await expect(page.locator('#join-form')).toHaveCount(0);
  await page.unroute('**/api/bootstrap');
  await page.locator('[data-action="refresh"]').click();
  await idle(page);
  await expect(page.locator('#join-form')).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    window.dispatchEvent(new Event('offline'));
  });
  await expect(page.locator('.connection-warning')).toContainText('таймер не остановлен');
});
test('UX: prototype observation, addressed task, retained focus, reload and readable mobile', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await overview(page);
  await expect(page.locator('.preview-banner')).toContainText('Демо · без зачёта');
  await expect(page.locator('.incident-card')).toHaveCount(1);
  await step(page, 'Подойти к местам 18–19');
  await step(page, 'Уточнить обращение и пообещать вернуться');
  await step(page, 'Продолжить');
  await expect(page.locator('.known-tasks')).toContainText('места 18');
  await step(page, 'Осмотреть салон');
  await step(page, 'Продолжить');
  await expect(page.locator('.incident-card')).toHaveCount(2);
  await noOverflow(page);
  await step(page, 'Вернуться к проходу');
  await step(page, '← К обзору вагона');
  await expect(page.locator('[data-focus-incident="b-aisle"]')).toBeFocused();
  await page.reload();
  await expect(page.locator('.incident-card')).toHaveCount(2);
  await expect(page.locator('.known-tasks')).toContainText('места 18');
  if (process.env.UX_CAPTURE) {
    mkdirSync('docs/design/screenshots', { recursive: true });
    await page.screenshot({
      path: 'docs/design/screenshots/overview-' + testInfo.project.name + '.png',
      fullPage: true,
    });
  }
  await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
  await noOverflow(page);
});
test('UX: reduced motion, visible keyboard focus and current home screenshot', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await join(page);
  await noOverflow(page);
  await page.keyboard.press('Tab'); // Establish keyboard modality before checking :focus-visible.
  await page.locator('.site-menu > summary').click();
  await page.keyboard.press('Tab');
  await page.locator('.nav-item[data-view="home"]').focus();
  const focus = await page.locator('.nav-item[data-view="home"]').evaluate((el) => ({
    style: getComputedStyle(el).outlineStyle,
    width: getComputedStyle(el).outlineWidth,
  }));
  expect(focus.style).not.toBe('none');
  expect(parseFloat(focus.width)).toBeGreaterThanOrEqual(2);
  const animation = await page.evaluate(() =>
    [...document.querySelectorAll('*')].some((el) => getComputedStyle(el).animationName !== 'none')
  );
  expect(animation).toBe(false);
  if (process.env.UX_CAPTURE) {
    mkdirSync('docs/design/screenshots', { recursive: true });
    await page.screenshot({
      path: 'docs/design/screenshots/home-' + testInfo.project.name + '.png',
      fullPage: true,
    });
  }
});
