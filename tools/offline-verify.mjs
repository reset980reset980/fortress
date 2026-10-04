import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { loadPlaywright, findChromium } from './browser-runtime.mjs';
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ executablePath: await findChromium(), headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext();
const page = await context.newPage();
const report = { passed: false, checks: [], errors: [] };
page.on('pageerror', e => report.errors.push(e.message));
try {
  await page.goto(process.env.BASE_URL || 'http://localhost:4173');
  await page.waitForFunction(() => navigator.serviceWorker.controller, {}, { timeout: 30000 });
  report.cachedResources = await page.evaluate(async () => {
    const cache = await caches.open('fortress-afterlight-v3-20261005'); return (await cache.keys()).length;
  });
  assert.ok(report.cachedResources >= 33);
  // An old tab can recreate its old cache after the new worker activates. Put
  // a stale executable response ahead of the current cache to exercise that
  // real upgrade race. Offline fetches must still use only the new version.
  await page.evaluate(async () => {
    const paths = (await caches.keys()).filter(k => k.startsWith('fortress-afterlight-') && k !== 'fortress-afterlight-v3-20261005');
    await Promise.all(paths.map(k => caches.delete(k)));
    const current = await caches.open('fortress-afterlight-v3-20261005');
    const entries = await Promise.all((await current.keys()).map(async request => [request, await current.match(request)]));
    await caches.delete('fortress-afterlight-v3-20261005');
    const old = await caches.open('fortress-afterlight-v2-20261004');
    await old.put('/src/battle.js', new Response('throw new Error("Stale pre-3D cache was served");', { headers: { 'Content-Type': 'text/javascript' } }));
    const replacement = await caches.open('fortress-afterlight-v3-20261005');
    await Promise.all(entries.map(([request, response]) => replacement.put(request, response)));
  });
  await context.setOffline(true); await page.reload();
  await page.locator('#deploy-button').waitFor(); await page.click('#deploy-button');
  await page.waitForFunction(() => FortressAfterlight.battle?.environment?.ready && FortressAfterlight.audio.buffers.size >= 12, {}, { timeout: 30000 });
  assert.equal(await page.evaluate(() => FortressAfterlight.state.phase), 'aim');
  assert.deepEqual(report.errors, []);
  report.environment = await page.evaluate(() => FortressAfterlight.battle.environment.stats);
  assert.ok(report.environment.textures >= 3);
  report.checks.push('Campaign menu reloads offline', 'Blender GLB and textures render offline',
    'Old pre-3D cache cannot override the current offline build', 'All12 audio buffers decode offline', 'No browser exceptions');
  report.passed = true;
} finally {
  await writeFile('research/offline-verification.json', JSON.stringify(report, null, 2));
  await browser.close(); console.log(JSON.stringify(report, null, 2));
}
