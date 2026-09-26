import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createApp } from '../../backend/http.js';
let app, origin, now;
test.beforeAll(async () => {
  now = Date.parse('2026-09-26T10:00:00Z');
  app = createApp({
    database: ':memory:',
    clock: () => now,
    sweep: false,
    rateLimit: 100000,
    sessionLimit: 1000,
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + app.server.address().port;
});
test.afterAll(async () => {
  if (app) await new Promise((resolve) => app.server.close(resolve));
});
test.beforeEach(async ({ page }) => {
  page.runtimeErrors = [];
  page.on('pageerror', (e) => page.runtimeErrors.push(e.message));
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
  await expect(page.locator('#shift-start-form')).toBeVisible();
}
async function state(page) {
  const id = new URL(page.url()).hash.slice(5);
  const response = await page.request.get(origin + '/api/v2/runs/' + id);
  expect(response.ok()).toBeTruthy();
  return response.json();
}
async function action(page, type, id) {
  await idle(page);
  const run = await state(page);
  const index = run.actions.findIndex(
    (a) => a.command === type && (!id || a.actionId === id || a.incidentId === id)
  );
  expect(index, 'offered action ' + type + ' ' + id).toBeGreaterThanOrEqual(0);
  const b = page.locator('[data-shift-action="' + index + '"]');
  if (!(await b.isVisible())) await page.locator('[data-disclosure=tools] > summary').click();
  await b.click();
  await idle(page);
  return state(page);
}
async function work(page, id, incident = 'a-seat') {
  let r = await state(page);
  if (r.phase === 'feedback') r = await action(page, 'continue');
  if (r.phase === 'overview' && incident) await action(page, 'focus', incident);
  return action(page, 'choose', id);
}
async function start(page, options = {}) {
  if (Object.keys(options).length) {
    await page.locator('[data-disclosure=shift-options] > summary').click();
    for (const [id, value] of Object.entries(options))
      await page.locator('#shift-' + id).selectOption(value);
  }
  await page.locator('#shift-start-form > button').click();
  await idle(page);
  await expect(page).toHaveURL(/#run\//);
  return state(page);
}
async function finish(page) {
  if ((await state(page)).phase === 'feedback') await action(page, 'continue');
  return action(page, 'finish');
}
async function early(page, serviceClass = null) {
  await action(page, 'begin');
  await work(page, 'inspect-predeparture', null);
  await work(page, 'acknowledge-and-promise');
  await action(page, 'continue');
  await action(page, 'inspect');
  await work(
    page,
    serviceClass ? 'correct-' + serviceClass + '-card' : 'clear-aisle',
    serviceClass ? 'b-service' : 'b-aisle'
  );
  await work(page, 'verify-and-request');
  await action(page, 'continue');
  await action(page, 'wait');
  await work(page, 'confirm-and-return-p1');
  return finish(page);
}
async function late(page) {
  await action(page, 'begin');
  await work(page, 'inspect-predeparture', null);
  await work(page, 'acknowledge-and-promise');
  await work(page, 'verify-and-request');
  await action(page, 'continue');
  await action(page, 'wait');
  return action(page, 'continue');
}
async function nav(page, view) {
  const b = page.locator('.nav-item[data-view="' + view + '"]');
  if (!(await b.isVisible())) await page.locator('.site-menu > summary').click();
  await b.click();
  await idle(page);
}
async function motivation(page) {
  return (await page.request.get(origin + '/api/v2/motivation')).json();
}
async function screenshot(page, name, info) {
  if (process.env.CAPTURE_V2 === '1') {
    const dir = 'docs/implementation/screenshots';
    await mkdir(dir, { recursive: true });
    await page.screenshot({
      path: dir + '/' + name + '-' + info.project.name + '.png',
      fullPage: true,
    });
  }
}

test('v2 реальная смена → разбор → XP → профиль, без prototype/reset', async ({ page }, info) => {
  await join(page);
  await screenshot(page, 'home', info);
  await start(page);
  await action(page, 'begin');
  await screenshot(page, 'inspection', info);
  await work(page, 'inspect-predeparture', null);
  await action(page, 'continue');
  await expect(page.locator('[data-focus-incident="b-aisle"]')).toHaveCount(0);
  await expect(page.locator('main#main')).toHaveCount(1);
  await work(page, 'acknowledge-and-promise');
  await action(page, 'continue');
  await action(page, 'inspect');
  await action(page, 'continue');
  await screenshot(page, 'overview', info);
  await work(page, 'clear-aisle', 'b-aisle');
  await work(page, 'verify-and-request');
  await action(page, 'continue');
  await action(page, 'wait');
  await work(page, 'confirm-and-return-p1');
  const run = await finish(page);
  expect(run.result.passed).toBe(true);
  expect(run.result.episodePoints).toBe(70);
  expect(run.result.scales).toEqual({ loyalty: 85, safety: 90 });
  await screenshot(page, 'result', info);
  expect((await motivation(page)).lifetimePracticeXP).toBe(0);
  await page.locator('[data-action=debrief-ack]').click();
  await idle(page);
  expect((await motivation(page)).lifetimePracticeXP).toBe(20);
  await page.reload();
  await idle(page);
  await expect(page.locator('[data-action=debrief-ack]')).toHaveCount(0);
  expect((await motivation(page)).lifetimePracticeXP).toBe(20);
  await nav(page, 'profile');
  await expect(page.locator('.shift-history-button')).toHaveCount(1);
  await screenshot(page, 'profile', info);
  await nav(page, 'leaderboard');
  for (const scope of ['crew', 'depot', 'company']) {
    await page.locator('[data-action=scope][data-id=' + scope + ']').click();
    await idle(page);
    await expect(page.getByText('0 из 100 СП', { exact: false }).first()).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
});

test('v2 reload в критическом окне не сбрасывает deadline; timeout в браузере сохраняется один раз', async ({
  page,
}) => {
  await join(page);
  await start(page);
  const open = await late(page);
  now = open.criticalWindow.openedAt + 7000;
  await page.reload();
  await idle(page);
  expect((await state(page)).criticalWindow.deadline).toBe(open.criticalWindow.deadline);
  now = open.criticalWindow.deadline;
  await page.reload();
  await idle(page);
  expect((await state(page)).feedback.timedOut).toBe(true);
  await expect(page.getByRole('heading', { name: 'Время вышло' })).toBeVisible();
  await page.reload();
  await idle(page);
  await work(page, 'confirm-and-return-p1');
  const result = await finish(page);
  expect(result.result.scales.safety).toBe(40);
  expect(result.result.criticalErrors).toHaveLength(1);
  expect(result.result.passed).toBe(false);
});

test('v2 потерянный ответ команды и ack: reload восстанавливает ровно тот же requestId', async ({
  page,
}) => {
  await join(page);
  await start(page);
  let body,
    drop = true;
  await page.route('**/api/v2/runs/*/commands', async (route) => {
    if (drop) {
      body = route.request().postDataJSON();
      await route.fetch();
      await route.abort();
    } else await route.continue();
  });
  await page.locator('[data-shift-action="0"]').click();
  await idle(page);
  await expect(page.locator('.error-toast')).toBeVisible();
  const pending = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem('reis400.pending-command.v2'))
  );
  expect(pending.body.requestId).toBe(body.requestId);
  drop = false;
  await page.reload();
  await idle(page);
  expect((await state(page)).revision).toBe(1);
  await expect(page.locator('.error-toast')).toHaveCount(0);
  await work(page, 'inspect-predeparture', null);
  await work(page, 'acknowledge-and-promise');
  await action(page, 'continue');
  await action(page, 'inspect');
  await work(page, 'clear-aisle', 'b-aisle');
  await work(page, 'verify-and-request');
  await action(page, 'continue');
  await action(page, 'wait');
  await work(page, 'confirm-and-return-p1');
  await finish(page);
  let loseAck = true;
  await page.route('**/api/v2/results/*/debrief-ack', async (route) => {
    if (loseAck) {
      await route.fetch();
      await route.abort();
    } else await route.continue();
  });
  await page.locator('[data-action=debrief-ack]').click();
  await idle(page);
  expect((await motivation(page)).lifetimePracticeXP).toBe(20);
  loseAck = false;
  await page.reload();
  await idle(page);
  expect((await motivation(page)).lifetimePracticeXP).toBe(20);
  await expect(page.locator('[data-action=debrief-ack]')).toHaveCount(0);
});

test('v2 другой класс/вариант, untimed, цель и практика от развилки работают на 360px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await join(page);
  await start(page, { class: 'first', time: 'untimed', variant: 'clear-aisle-service-check' });
  const r = await early(page, 'first');
  expect(r.result.passed).toBe(true);
  expect(r.context.serviceClass).toBe('first');
  expect(r.result.variantId).toBe('clear-aisle-service-check');
  await page.locator('[data-disclosure=branch-practice] > summary').click();
  await page.locator('#shift-replay-form button').click();
  await idle(page);
  const branch = await state(page);
  expect(branch.mode).toBe('training');
  expect(branch.id).not.toBe(r.id);
  page.once('dialog', (d) => d.accept());
  await action(page, 'abort');
  await nav(page, 'profile');
  await page.locator('#goal-days').selectOption('1');
  await page.locator('input[name=paused]').check();
  await page.locator('#motivation-preferences button').click();
  await idle(page);
  expect((await motivation(page)).preferences.paused).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(361);
});

test('v2 добровольное соревнование, собственный результат и отсутствие вымышленных соперников', async ({
  page,
}) => {
  await join(page);
  await page.locator('[data-disclosure=competition] > summary').click();
  await page.locator('[data-action=period-entry][data-entry=join]').click();
  await idle(page);
  await page.locator('[data-action=competitive-start]').click();
  await idle(page);
  const r = await early(page);
  expect(r.result.rankingEligible).toBe(true);
  expect(r.result.seasonPoints).toBe(100);
  await nav(page, 'leaderboard');
  await expect(page.getByText('100 из 100 СП', { exact: false }).first()).toBeVisible();
  await expect(page.locator('.v2-leader-table')).toHaveCount(0);
});
