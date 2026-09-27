import { test, expect } from '@playwright/test';
import { createApp } from '../../backend/http.js';
import { SHIFT_CONTENT } from '../../backend/shift-content.js';
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
async function action(page, type, id) {
  await idle(page);
  let run = await state(page);
  const index = run.actions.findIndex(
    (a) => a.command === type && (!id || a.actionId === id || a.incidentId === id)
  );
  expect(index, `available ${type}/${id}`).toBeGreaterThanOrEqual(0);
  const button = page.locator(`[data-shift-action="${index}"]:visible`).first();
  if (!(await button.isVisible()))
    await page.locator(`[data-game-tab=${type === 'focus' ? 'map' : 'tools'}]`).click();
  await button.click();
  await idle(page);
  return state(page);
}
async function work(page, id, incident = 'a-seat') {
  let r = await state(page);
  if (r.phase === 'feedback') r = await action(page, 'continue');
  if (r.phase === 'scene' && r.stage === 'service' && r.focusIncidentId !== incident && incident)
    r = await action(page, 'overview');
  if (r.phase === 'overview' && incident) await action(page, 'focus', incident);
  return action(page, 'choose', id);
}
test('current course entry completes reviewed dialogue, debrief, reload and profile', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(origin);
  await idle(page);
  await page.locator('#join-form button').click();
  await idle(page);
  const skip = page.getByRole('button', { name: 'Пропустить', exact: true });
  if (await skip.isVisible()) await skip.click();
  await page.locator('[data-action=course-start]').first().click();
  await idle(page);
  await expect(page).toHaveURL(/#run\//);
  await action(page, 'begin');
  await work(page, 'inspect-predeparture', null);
  await work(page, 'acknowledge');
  await work(page, 'check-seat-yourself');
  let r = await state(page);
  if (r.phase === 'feedback') r = await action(page, 'continue');
  if (r.phase === 'scene') await action(page, 'overview');
  await action(page, 'inspect');
  await work(page, 'assist-aisle', 'b-aisle');
  await work(page, 'show-seat-yourself');
  await work(page, 'close-seat-yourself');
  r = await state(page);
  if (r.phase === 'feedback') await action(page, 'continue');
  r = await action(page, 'finish');
  expect(r.contentVersion).toBe(SHIFT_CONTENT.version);
  expect(r.result.passed).toBe(true);
  await page.locator('[data-action=debrief-ack]').click();
  await idle(page);
  await page.reload();
  await idle(page);
  await expect(page.locator('[data-action=debrief-ack]')).toHaveCount(0);
  const menu = page.locator('.site-menu > summary');
  if (await menu.isVisible()) await menu.click();
  await page.locator('[data-action=nav][data-view=profile]').click();
  await idle(page);
  await expect(page.locator('.shift-history-button')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  );
  expect(errors).toEqual([]);
});
