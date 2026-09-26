import { chromium, devices } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createApp } from '../backend/http.js';
const app = createApp({ database: ':memory:', sweep: false, rateLimit: 10000, sessionLimit: 1000 });
await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + app.server.address().port;
let browser;
try {
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || undefined });
  const context = await browser.newContext({
    ...devices['Pixel 7'],
    viewport: { width: 360, height: 800 },
  });
  const page = await context.newPage(),
    cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: 200000,
    uploadThroughput: 96000,
  });
  const started = performance.now();
  await page.goto(origin);
  await page.locator('#app[aria-busy=false] #join-form button').waitFor();
  const firstControlMs = Math.round(performance.now() - started);
  const clickStart = performance.now();
  await page.locator('#join-form button').click();
  await page.locator('#app[aria-busy=false] .scenario-card').first().waitFor();
  const clickToReadyMs = Math.round(performance.now() - clickStart);
  const resources = await page.evaluate(() =>
    performance.getEntriesByType('resource').map((r) => ({
      name: new URL(r.name).pathname,
      bytes: r.decodedBodySize,
      durationMs: Math.round(r.duration),
    }))
  );
  const report = {
    date: new Date().toISOString(),
    browser: browser.version(),
    node: process.version,
    platform: process.platform,
    device: 'Pixel 7 emulation, viewport 360x800; not a physical phone',
    cpuSlowdown: 4,
    latencyMs: 150,
    downloadBytesPerSecond: 200000,
    uploadBytesPerSecond: 96000,
    cacheDisabled: true,
    firstControlMs,
    clickToReadyMs,
    resources,
    note: 'Single synthetic sample on this computer. Not INP, not a percentile, not human reading/search/thinking time, not proof of low-end phone performance.',
  };
  mkdirSync('research/ux', { recursive: true });
  writeFileSync('research/ux/emulation-measurement.json', JSON.stringify(report, null, 2) + '\n');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  mkdirSync('docs/design/screenshots', { recursive: true });
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => app.server.close(resolve));
}
