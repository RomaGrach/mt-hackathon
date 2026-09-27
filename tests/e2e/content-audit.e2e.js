import { test, expect } from '@playwright/test';
import { createApp } from '../../backend/http.js';
import { DESIGN002_CONTENT } from '../../backend/design002-content.js';
let app, origin;
test.beforeAll(async () => {
  app = createApp({ database: ':memory:', sweep: false, rateLimit: 100000, sessionLimit: 1000 });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  origin = 'http://127.0.0.1:' + app.server.address().port;
});
test.afterAll(async () => {
  if (app) await new Promise((r) => app.server.close(r));
});
const idle = (page) => expect(page.locator('#app')).toHaveAttribute('aria-busy', 'false');
async function state(page) {
  const id = new URL(page.url()).hash.slice(5);
  const r = await page.request.get(origin + '/api/v2/runs/' + id);
  expect(r.ok()).toBeTruthy();
  return r.json();
}
async function action(page, run, a) {
  const index = run.actions.indexOf(a);
  expect(index).toBeGreaterThanOrEqual(0);
  const button = page.locator(`[data-shift-action="${index}"]:visible`).first();
  if (!(await button.isVisible()))
    await page
      .locator(`[data-game-tab=${a.command === 'task' ? 'tasks' : 'scene'}]:visible`)
      .first()
      .click();
  await button.click();
  await idle(page);
  return state(page);
}
test('Design002 course: real controls, automatic result, reload, profile and three rankings', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(origin);
  await idle(page);
  await page.locator('#join-form button').click();
  await idle(page);
  await page.locator('[data-action=course-start]').first().click();
  await idle(page);
  await expect(page).toHaveURL(/#run\//);
  let r = await state(page);
  for (let n = 0; n < 80 && r.phase !== 'result'; n++) {
    const actions = r.actions.filter((a) => a.available !== false);
    let a =
      actions.find((a) => a.command === 'begin') || actions.find((a) => a.command === 'choose');
    if (!a && r.step === 0) a = actions.find((a) => a.command === 'task');
    a ||=
      actions.find((a) => a.command === 'focus') ||
      actions.find((a) => a.command === 'task') ||
      actions.find((a) => a.command === 'continue') ||
      actions.find((a) => a.command === 'inspect');
    expect(a, 'available non-abort work').toBeTruthy();
    r = await action(page, r, a);
  }
  expect(r.phase).toBe('result');
  expect(r.step).toBe(r.totalTurns);
  expect(r.engineVersion).toBe('shift-4');
  expect(r.result.scenarioVersion).toBe(DESIGN002_CONTENT.version);
  expect(r.result.stats.resolved).toBeGreaterThan(0);
  const gain = r.result.competencyGain;
  await page.reload();
  await idle(page);
  expect((await state(page)).result.competencyGain).toBe(gain);
  await page.locator('[data-action=nav][data-view=profile]:visible').first().click();
  await idle(page);
  await expect(page.locator('.d2-history[data-action=history]')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  );
  const menu = page.locator('.site-menu > summary');
  if (await menu.isVisible()) await menu.click();
  await page.locator('[data-action=nav][data-view=leaderboard]:visible').first().click();
  await idle(page);
  for (const scope of ['crew', 'depot', 'company']) {
    await page.locator('[data-action=scope][data-id=' + scope + ']').click();
    await idle(page);
    await expect(page.getByRole('heading', { name: 'Рейтинг компетенций' })).toBeVisible();
  }
  expect(errors).toEqual([]);
});
