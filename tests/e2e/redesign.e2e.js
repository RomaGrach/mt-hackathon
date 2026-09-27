import { test, expect } from '@playwright/test';
import { createApp } from '../../backend/http.js';

let app;
let origin;

test.beforeAll(async () => {
  app = createApp({ database: ':memory:', sweep: false, rateLimit: 10000, sessionLimit: 1000 });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${app.server.address().port}`;
});

test.afterAll(async () => {
  if (app) await new Promise((resolve) => app.server.close(resolve));
});

test('illustrated course reflows and the custom practice remains usable', async ({ page }) => {
  for (const asset of ['home-journey.webp', 'carriage-interior.webp', 'course-landscape.webp']) {
    const response = await page.request.get(`${origin}/assets/${asset}`);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('image/webp');
    expect((await response.body()).subarray(0, 4).toString()).toBe('RIFF');
  }

  await page.goto(origin);
  await expect(
    page.getByRole('heading', { name: 'Учебная смена от ситуации до разбора' })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Войти как проводник' }).click();
  await expect(page.getByRole('heading', { name: 'Моя смена' })).toBeVisible();
  await expect(page.locator('.course-hero')).toBeVisible();
  await expect(page.locator('.course-footer')).toBeVisible();
  await expect(page.locator('.course-module[open]')).toHaveCount(0);

  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const layout = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      wide: [...document.querySelectorAll('body *')]
        .filter((element) => element.getBoundingClientRect().right > innerWidth + 1)
        .slice(0, 8)
        .map((element) => [
          element.tagName,
          element.className,
          element.getBoundingClientRect().right,
        ]),
    }));
    expect(layout.scrollWidth, JSON.stringify(layout)).toBeLessThanOrEqual(width + 1);
    await expect(page.getByRole('button', { name: 'Начать смену' })).toBeVisible();
  }
  await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
  await page.evaluate(() => (document.documentElement.style.fontSize = ''));

  await page.getByRole('button', { name: 'Своя тренировка' }).click();
  await expect(page.locator('#shift-start-form')).toBeVisible();
  await expect(page.locator('[data-home-pane="course"]')).toBeHidden();
  await page.getByRole('button', { name: 'Курс', exact: true }).click();
  await expect(page.locator('[data-home-pane="course"]')).toBeVisible();
  await expect(page.locator('#shift-start-form')).toBeHidden();
});

test('course sections keep the chevron in place and lessons clear on narrow screens', async ({
  page,
}) => {
  await page.goto(origin);
  await page.getByRole('button', { name: 'Войти как проводник' }).click();
  const module = page.locator('[data-disclosure="course-first"]');
  const summary = module.locator('summary');
  const chevron = module.locator('.module-chevron');
  const index = module.locator('.module-index');
  await expect(chevron.locator('svg')).toBeVisible();

  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    if (await module.evaluate((element) => element.open)) await summary.click();
    await expect(chevron).toHaveCSS('transform', 'none');
    const position = () =>
      chevron.evaluate((element) => {
        const icon = element.getBoundingClientRect();
        const header = element.closest('summary').getBoundingClientRect();
        return { x: icon.x - header.x, y: icon.y - header.y };
      });
    const before = await position();
    const indexStyle = () =>
      index.evaluate((element) => {
        const style = getComputedStyle(element);
        return { background: style.backgroundColor, color: style.color, shadow: style.boxShadow };
      });
    const beforeIndex = await indexStyle();
    await summary.click();
    await expect(module).toHaveAttribute('open', '');
    await expect(chevron).toHaveCSS('transform', 'matrix(-1, 0, 0, -1, 0, 0)');
    const after = await position();
    expect(Math.abs(after.x - before.x)).toBeLessThan(1);
    expect(Math.abs(after.y - before.y)).toBeLessThan(1);
    expect(await indexStyle()).toEqual(beforeIndex);
    await expect(module.locator('.lesson-row')).toHaveCount(2);
    expect(
      await page
        .locator('.course-modules')
        .evaluate((element) => getComputedStyle(element, '::before').content)
    ).toBe('none');
  }
});

test('course disclosure animates and locked lesson statuses stay aligned', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin);
  await page.getByRole('button', { name: 'Войти как проводник' }).click();
  await page.getByRole('button', { name: 'Начать смену' }).click();
  await page.locator('[data-game-tab="tools"]').click();
  await page.locator('[data-game-pane="tools"] [data-view="home"]').click();

  const module = page.locator('[data-disclosure="course-standard"]');
  const summary = module.locator('summary');
  const content = module.locator('.module-lessons');
  await expect(summary).toHaveCSS('user-select', 'none');
  const opening = await summary.evaluate((element) => {
    element.click();
    const section = element.parentElement;
    const body = section.querySelector('.module-lessons');
    return { open: section.open, animations: body.getAnimations().length };
  });
  expect(opening).toEqual({ open: true, animations: 1 });
  await expect.poll(() => content.evaluate((element) => element.getAnimations().length)).toBe(0);

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const boxes = await module.locator('.lesson-locked').evaluateAll((elements) =>
      elements.map((element) => {
        const { x, width } = element.getBoundingClientRect();
        return { x, width };
      })
    );
    expect(boxes).toHaveLength(2);
    expect(Math.abs(boxes[0].x - boxes[1].x)).toBeLessThan(1);
    expect(Math.abs(boxes[0].width - boxes[1].width)).toBeLessThan(1);
  }

  const closing = await summary.evaluate((element) => {
    element.click();
    const section = element.parentElement;
    const body = section.querySelector('.module-lessons');
    const animation = body.getAnimations()[0];
    animation.pause();
    const duration = animation.effect.getTiming().duration;
    animation.currentTime = 0;
    const startHeight = body.getBoundingClientRect().height;
    animation.currentTime = duration * 0.25;
    const quarterHeight = body.getBoundingClientRect().height;
    animation.currentTime = duration * 0.5;
    const halfHeight = body.getBoundingClientRect().height;
    animation.currentTime = duration - 1;
    const remainingHeight = body.getBoundingClientRect().height;
    const layoutGap =
      section.getBoundingClientRect().height - element.getBoundingClientRect().height;
    const collapsing = section.hasAttribute('data-collapsing');
    animation.play();
    return { startHeight, quarterHeight, halfHeight, remainingHeight, layoutGap, collapsing };
  });
  expect(closing.quarterHeight).toBeGreaterThan(closing.startHeight * 0.55);
  expect(closing.halfHeight).toBeLessThan(closing.quarterHeight);
  expect(closing.halfHeight).toBeGreaterThan(closing.startHeight * 0.15);
  expect(closing.remainingHeight).toBeLessThan(2);
  expect(closing.layoutGap).toBeLessThan(3);
  expect(closing.collapsing).toBe(true);
  await expect.poll(() => module.evaluate((element) => element.open)).toBe(false);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await summary.click();
  await expect(module).toHaveAttribute('open', '');
  expect(await content.evaluate((element) => element.getAnimations().length)).toBe(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await summary.evaluate((element) => {
    element.click();
    element.click();
  });
  await expect.poll(() => content.evaluate((element) => element.getAnimations().length)).toBe(0);
  await expect(module).toHaveAttribute('open', '');
});

test('menu names unread notifications and opens their messages', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin);
  await page.getByRole('button', { name: 'Войти как проводник' }).click();
  await expect(page.locator('.site-menu > summary .notice-count')).toHaveText('2');
  await page.locator('.site-menu > summary').click();
  const entry = page.locator('.nav-item[data-view="notices"]');
  await expect(entry).toHaveAttribute('aria-label', /Уведомления, непрочитано: 2/);
  await expect(entry.locator('.notice-count')).toHaveText('2');
  await expect(entry.locator('.nav-item-preview')).toContainText('Полноценная учебная смена');
  await expect(entry.locator('.nav-item-preview')).toContainText('Личная цель');
  const menuLayout = await entry.evaluate((element) => ({
    titleHeight: element.querySelector('.nav-item-main > span:first-child').getBoundingClientRect()
      .height,
    mainBottom: element.querySelector('.nav-item-main').getBoundingClientRect().bottom,
    previewTop: element.querySelector('.nav-item-preview').getBoundingClientRect().top,
  }));
  expect(menuLayout.titleHeight).toBeLessThan(30);
  expect(menuLayout.previewTop).toBeGreaterThanOrEqual(menuLayout.mainBottom - 1);
  await entry.click();
  await expect(page.locator('.notification.unread')).toHaveCount(2);
  await expect(page.locator('.page-heading')).toContainText('Непрочитанных: 2');
  await page.getByRole('button', { name: 'Отметить всё прочитанным' }).click();
  await expect(page.locator('.site-menu > summary .notice-count')).toHaveCount(0);
  await expect(page.locator('.notification.unread')).toHaveCount(0);
});

test('game navigation displays one pane at a time on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(origin);
  await page.getByRole('button', { name: 'Войти как проводник' }).click();
  await page.getByRole('button', { name: 'Начать смену' }).click();
  await expect(page).toHaveURL(/#run\//);
  await expect(page.locator('#app')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('[data-game-pane="scene"]')).toBeVisible();
  await expect(page.locator('[data-game-pane="map"]')).toBeHidden();

  await page.locator('[data-game-tab="map"]').click();
  await expect(page.locator('[data-game-pane="scene"]')).toBeHidden();
  await expect(page.locator('[data-game-pane="map"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);

  await page.locator('[data-game-tab="scene"]').click();
  await expect(page.locator('[data-game-pane="scene"]')).toBeVisible();
  await expect(page.locator('[data-game-pane="map"]')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Начать приёмку' })).toBeVisible();
});

test('the first course shift reaches debrief and persists course progress', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin);
  await page.getByRole('button', { name: 'Войти как проводник' }).click();
  await page.getByRole('button', { name: 'Начать смену' }).click();
  await expect(page).toHaveURL(/#run\//);
  await expect(page.locator('#app')).toHaveAttribute('aria-busy', 'false');

  const state = async () => {
    const id = new URL(page.url()).hash.slice(5);
    const response = await page.request.get(`${origin}/api/v2/runs/${id}`);
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const act = async (type, id) => {
    const run = await state();
    const index = run.actions.findIndex(
      (action) =>
        action.command === type && (!id || action.actionId === id || action.incidentId === id)
    );
    expect(
      index,
      `offered ${type} ${id || ''} in ${run.phase}: ${JSON.stringify(run.actions.map(({ command, actionId, incidentId }) => ({ command, actionId, incidentId })))}`
    ).toBeGreaterThanOrEqual(0);
    let target = page
      .locator(`[data-game-pane="scene"] [data-command="${type}"][data-shift-action="${index}"]`)
      .first();
    if (!(await target.isVisible())) {
      const pane = type === 'focus' ? 'map' : 'tools';
      await page.locator(`[data-game-tab="${pane}"]`).click();
      target = page.locator(`[data-game-pane="${pane}"] [data-shift-action="${index}"]`).first();
    }
    await target.click();
    await expect(page.locator('#app')).toHaveAttribute('aria-busy', 'false');
  };
  const work = async (id, incident = 'a-seat') => {
    if ((await state()).phase === 'feedback') await act('continue');
    if ((await state()).phase === 'overview' && incident) await act('focus', incident);
    await act('choose', id);
  };

  await act('begin');
  await work('inspect-predeparture', null);
  await work('acknowledge-and-promise');
  await act('continue');
  await act('inspect');
  await work('clear-aisle', 'b-aisle');
  await work('verify-and-request');
  await act('continue');
  await act('wait');
  if ((await state()).actions.some((action) => action.command === 'wait')) await act('wait');
  await work('confirm-and-return-p1');
  if ((await state()).phase === 'feedback') await act('continue');
  await act('finish');

  const result = await state();
  expect(result.phase).toBe('result');
  expect(result.result.passed).toBe(true);
  await expect(page.locator('[data-phase="result"] [data-game-pane="scene"] h1')).toBeVisible();
  await page.getByRole('button', { name: 'Разбор просмотрен' }).click();
  expect((await state()).debrief.acknowledged).toBe(true);
  await page.getByRole('button', { name: 'Новая смена' }).click();
  await expect(page.locator('.course-count')).toContainText('1 из 8');
  await page.reload();
  await expect(page.locator('.course-count')).toContainText('1 из 8');
});
