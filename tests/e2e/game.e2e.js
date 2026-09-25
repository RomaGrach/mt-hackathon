import { test, expect } from '@playwright/test';
import { createApp } from '../../backend/http.js';
import { scenarios as catalog } from '../../backend/catalog.js';

let app, origin, now;
test.beforeAll(async () => {
  now = Date.now();
  app = createApp({
    database: ':memory:',
    clock: () => now,
    sweep: false,
    rateLimit: 10000,
    sessionLimit: 1000,
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + app.server.address().port;
});
test.afterAll(async () => {
  if (app) await new Promise((resolve) => app.server.close(resolve));
});
test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.runtimeErrors = errors;
});
test.afterEach(async ({ page }) => {
  expect(page.runtimeErrors).toEqual([]);
});
async function idle(page) {
  await expect(page.locator('#app')).toHaveAttribute('aria-busy', 'false');
}
async function join(page) {
  await page.goto(origin);
  await idle(page);
  await page.locator('#join-form button').click();
  await idle(page);
  await expect(page.locator('.scenario-card')).toHaveCount(5);
}
async function start(page, id, practice = false) {
  await page
    .locator('[data-action="brief"][data-id="' + id + '"]')
    .first()
    .click();
  await idle(page);
  await page
    .locator(
      practice
        ? '[data-action="start"][data-practice="true"]'
        : '[data-action="start"]:not([data-practice])'
    )
    .click();
  await idle(page);
  await expect(page).toHaveURL(/#run\//);
}
async function state(page) {
  const id = new URL(page.url()).hash.slice(5);
  const response = await page.request.get(origin + '/api/runs/' + id);
  expect(response.ok()).toBeTruthy();
  return response.json();
}
async function finish(page) {
  for (let step = 0; step < 30; step++) {
    await idle(page);
    const run = await state(page);
    if (run.phase === 'result') return run;
    if (run.phase === 'feedback') {
      await page.locator('[data-action="continue"]').click();
      continue;
    }
    const source = catalog.find((s) => s.id === run.scenarioId).nodes[run.nodeId];
    const choice =
      source.options.find(
        (o) => o.recommended && run.node.options.some((v) => v.id === o.id && v.available)
      ) ||
      source.options.find(
        (o) => !o.critical && run.node.options.some((v) => v.id === o.id && v.available)
      );
    expect(choice).toBeTruthy();
    await page.locator('[data-action="choose"][data-id="' + choice.id + '"]').click();
  }
  throw new Error('Scenario did not terminate');
}
async function nav(page, view) {
  await page.locator('.nav-item[data-view="' + view + '"]').click();
  await idle(page);
}
async function bootstrap(page) {
  return (await page.request.get(origin + '/api/bootstrap')).json();
}

test('полное прохождение, разбор, профиль и три общих рейтинга', async ({ page }) => {
  await join(page);
  await start(page, 'conflict');
  const result = await finish(page);
  expect(result.result.passed).toBe(true);
  await expect(page.locator('[data-action="replay"]')).toHaveCount(result.history.length);
  await nav(page, 'profile');
  await expect(page.locator('.history-button')).toHaveCount(1);
  const boot = await bootstrap(page);
  expect(boot.profile.totalPoints).toBeGreaterThan(0);
  await nav(page, 'leaderboard');
  for (const scope of ['crew', 'depot', 'company']) {
    await page.locator('[data-action="scope"][data-id="' + scope + '"]').click();
    await idle(page);
    await expect(page.locator('.leader-row.is-me')).toHaveCount(1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
});

test('reload не сбрасывает дедлайн, таймаут и критическая ошибка сохраняются', async ({ page }) => {
  await join(page);
  await start(page, 'medical');
  const first = await state(page);
  now += 7000;
  await page.reload();
  await idle(page);
  expect((await state(page)).deadline).toBe(first.deadline);
  now = first.deadline;
  await page.reload();
  await idle(page);
  const expired = await state(page);
  expect(expired.history[0].timedOut).toBe(true);
  expect(expired.criticalError).toBe(true);
  const result = await finish(page);
  expect(result.result.passed).toBe(false);
  expect((await bootstrap(page)).profile.totalPoints).toBe(0);
});

test('переигрывание произвольной развилки не даёт повторных рейтинговых очков', async ({
  page,
}) => {
  await join(page);
  await start(page, 'service');
  const first = await finish(page);
  const before = (await bootstrap(page)).profile.totalPoints;
  await page.locator('[data-action="replay"]').first().click();
  await idle(page);
  expect((await state(page)).practice).toBe(true);
  const replay = await finish(page);
  expect(replay.result.passed).toBe(true);
  expect((await bootstrap(page)).profile.totalPoints).toBe(before);
  expect(first.result.passed).toBe(true);
});

test('уведомления, смена бригады, экспорт и удаление профиля', async ({ page }) => {
  await join(page);
  await nav(page, 'notices');
  await page.locator('[data-action="read-all"]').click();
  await idle(page);
  expect((await bootstrap(page)).notices.every((n) => n.readAt)).toBe(true);
  await nav(page, 'profile');
  await page.locator('#profile-crew').selectOption('spb-2');
  await page.locator('#crew-form button').click();
  await idle(page);
  expect((await bootstrap(page)).profile.crew).toBe('spb-2');
  const download = page.waitForEvent('download');
  await page.locator('[data-action="export"]').click();
  expect((await download).suggestedFilename()).toBe('reis400-profile.json');
  await idle(page);
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('[data-action="delete"]').click();
  await idle(page);
  await expect(page.locator('#join-form')).toBeVisible();
  expect((await page.request.get(origin + '/api/bootstrap')).status()).toBe(401);
});

test('потерянный сетевой ответ не удваивает решение', async ({ page }) => {
  await join(page);
  await start(page, 'conflict');
  let lost = false;
  await page.route('**/api/runs/*/decision', async (route) => {
    if (!lost) {
      lost = true;
      await route.fetch();
      await route.abort();
    } else await route.continue();
  });
  await page.locator('[data-action="choose"]').first().click();
  await idle(page);
  const run = await state(page);
  expect(lost).toBe(true);
  expect(run.history).toHaveLength(1);
  expect(run.revision).toBe(1);
  await expect(page.locator('.error-toast')).toHaveCount(0);
});

test('узкий экран: навигация с непрочитанными уведомлениями не расширяет страницу', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await join(page);
  await expect(page.locator('.nav-item[data-view="notices"]')).toHaveAttribute(
    'aria-label',
    'Уведомления'
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(361);
  await start(page, 'conflict');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(361);
  await nav(page, 'profile');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(361);
});
