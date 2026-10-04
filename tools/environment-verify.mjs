import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadPlaywright, findChromium } from './browser-runtime.mjs';
const { chromium } = await loadPlaywright();
const base = process.env.BASE_URL || 'http://localhost:4173';
const browser = await chromium.launch({ executablePath: await findChromium(), headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'] });
const report = { passed: false, checks: [], scenes: [], errors: [], requestsFailed: [] };
await mkdir('research', { recursive: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
// A rendering fixture unlocks the regions; campaign progression is covered by
// the separate real battle/victory browser test and battle/storage unit tests.
await context.addInitScript(() => {
  localStorage.setItem('fortress-afterlight-v2', JSON.stringify({ version: 2, credits: 0, tank: 'bastion',
    upgrades: { hull: 0, attack: 0, fuel: 0 }, missions: Object.fromEntries(['shore-01','shore-02','shore-03','dune-01','dune-02','dune-03','frost-01','frost-02','frost-03'].map(id => [id, 1])) }));
});
const page = await context.newPage();
page.on('pageerror', e => report.errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
page.on('requestfailed', r => report.requestsFailed.push(r.url()));
try {
  await page.goto(base);
  for (const [index, theme] of [[0, 'coast'], [3, 'desert'], [6, 'frost']]) {
    await page.click(`[data-mission="${index}"]`); await page.click('#deploy-button');
    await page.waitForFunction(() => FortressAfterlight.battle?.environment?.ready, {}, { timeout: 30000 });
    await page.waitForTimeout(300);
    const stats = await page.evaluate(() => FortressAfterlight.battle.environment.stats);
    assert.equal(stats.theme, theme); assert.ok(stats.triangles > 20000 && stats.triangles < 100000);
    assert.ok(stats.drawCalls <= 16); assert.equal(stats.error, null);
    assert.ok(stats.textures >= 3, 'Embedded rock textures actually loaded');
    await page.locator('.battle-board').screenshot({ path: `research/environment-${theme}.png` });
    report.scenes.push(stats);
    const cameraBefore = await page.evaluate(() => FortressAfterlight.battle.environment.camera.position.x);
    const playerBefore = await page.evaluate(() => FortressAfterlight.battle.player.x);
    await page.keyboard.down('ArrowRight'); await page.waitForTimeout(500); await page.keyboard.up('ArrowRight');
    assert.notEqual(await page.evaluate(() => FortressAfterlight.battle.environment.camera.position.x), cameraBefore);
    assert.ok(await page.evaluate(() => FortressAfterlight.battle.player.x) > playerBefore);
    await page.click('#fire-button');
    await page.waitForFunction(() => FortressAfterlight.battle.craters.length > 0, {}, { timeout: 20000 });
    assert.equal(await page.evaluate(() => FortressAfterlight.battle.environment.ready), true);
    await page.click('#pause-button');
    const frozen = await page.evaluate(() => ({ elapsed: FortressAfterlight.battle.elapsed, frames: FortressAfterlight.battle.environment.frameCount }));
    await page.waitForTimeout(250);
    assert.deepEqual(await page.evaluate(() => ({ elapsed: FortressAfterlight.battle.elapsed, frames: FortressAfterlight.battle.environment.frameCount })), frozen);
    await page.evaluate(() => { window.__previousEnvironment = FortressAfterlight.battle.environment; });
    await page.click('#exit-button');
    assert.equal(await page.evaluate(() => __previousEnvironment.destroyed && !__previousEnvironment.ready), true);
  }
  report.checks.push('Three Blender GLBs load with bounded geometry/draw calls', 'Camera parallax responds to real movement',
    'Actual shots destroy the collision terrain while 3D backgrounds remain visible', 'Pause freezes both simulation and background', 'Leaving battles disposes the renderer');
  await page.setViewportSize({ width: 844, height: 390 }); await page.click('#deploy-button');
  await page.waitForFunction(() => FortressAfterlight.battle?.environment?.ready);
  const fit = await page.evaluate(() => {
    const box = selector => { const r=document.querySelector(selector).getBoundingClientRect(); return { x:r.x, y:r.y, right:r.right, bottom:r.bottom }; };
    return { viewport: { width:innerWidth,height:innerHeight }, board:box('.battle-board'), controls:box('.battle-controls'), abilities:box('.abilities'),
      overflowX:document.documentElement.scrollWidth>innerWidth, overflowY:document.documentElement.scrollHeight>innerHeight };
  });
  assert.equal(fit.overflowX, false); assert.equal(fit.overflowY, false);
  for (const box of [fit.board, fit.controls, fit.abilities]) { assert.ok(box.bottom <= 390 && box.right <= 844); }
  await page.screenshot({ path: 'research/environment-landscape.png' }); report.landscape = fit;
  report.checks.push('844x390 fits battle, firing controls and abilities without scrolling');
  await page.evaluate(() => FortressAfterlight.battle.environment.renderer.getContext().getExtension('WEBGL_lose_context').loseContext());
  await page.waitForFunction(() => !FortressAfterlight.battle.environment.ready);
  assert.equal(await page.evaluate(() => FortressAfterlight.battle.environmentPreview.naturalWidth > 0), true);
  await page.screenshot({ path: 'research/environment-fallback.png' }); report.checks.push('Lost WebGL context uses the rendered Blender fallback');
  const fallbackContext = await browser.newContext();
  await fallbackContext.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) { return type === 'webgl2' ? null : original.call(this, type, ...args); };
  });
  const fallback = await fallbackContext.newPage(); await fallback.goto(base); await fallback.click('#deploy-button');
  await fallback.waitForFunction(() => FortressAfterlight.battle.environmentPreview.naturalWidth > 0);
  assert.equal(await fallback.evaluate(() => FortressAfterlight.battle.environment), null);
  await fallback.click('#fire-button'); await fallback.waitForFunction(() => FortressAfterlight.battle.craters.length > 0, {}, { timeout: 20000 });
  report.checks.push('Without WebGL2 the Blender preview and real combat remain usable');
  await fallbackContext.close();
  assert.deepEqual(report.errors, []); assert.deepEqual(report.requestsFailed, []); report.passed = true;
} finally {
  await writeFile('research/environment-verification.json', JSON.stringify(report, null, 2));
  await browser.close(); console.log(JSON.stringify(report, null, 2));
}
