/**
 * Browser regression for the preserved local Fortress mode.
 * Run from the project root after tools/server.mjs is serving all public assets.
 * PLAYWRIGHT_MODULE, CHROMIUM_PATH and LEGACY_BASE_URL may override defaults.
 * The fixture never enters the online lobby and blocks any accidental /api call.
 */
import assert from 'node:assert/strict';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = resolve(projectRoot, 'research');
await mkdir(outputDirectory, { recursive: true });

async function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_MODULE,
    '/workspace/browser-tools/node_modules/playwright-core/index.mjs',
    'playwright-core', 'playwright'].filter(Boolean);
  const errors = [];
  for (const candidate of candidates) {
    try { return await import(candidate.startsWith('/') ? pathToFileURL(candidate).href : candidate); }
    catch (error) { errors.push(`${candidate}: ${error.message}`); }
  }
  throw new Error(`Could not import Playwright. Set PLAYWRIGHT_MODULE.\n${errors.join('\n')}`);
}

async function executable() {
  const candidates = [process.env.CHROMIUM_PATH, '/usr/bin/chromium',
    '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].filter(Boolean);
  for (const candidate of candidates) {
    try { await access(candidate); return candidate; } catch {}
  }
  throw new Error('No Chromium executable found. Set CHROMIUM_PATH.');
}

const report = { passed: false, checks: [], errors: [], errorStacks: [], failedRequests: [], apiRequests: [], fixtureResults: {} };
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ executablePath: await executable(), headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, serviceWorkers: 'block' });
const page = await context.newPage();
page.on('pageerror', error => {report.errors.push(error.message);report.errorStacks.push(error.stack)});
page.on('requestfailed', request => report.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
await page.route('**/api/**', route => {
  report.apiRequests.push(route.request().url());
  return route.abort('blockedbyclient');
});
page.setDefaultTimeout(20000);

async function startLocalFixture() {
  await page.evaluate(() => {
    const runtime = window.FortressLegacy;
    for (const scene of runtime.game.scene.getScenes(true)) runtime.game.scene.stop(scene.sys.settings.key);
    runtime.game.scene.start('game', {
      picks: ['cannonrider', 'redfin'], seed: 888, mapId: 'grassland',
      // No aiDifficulty and no online property: local hotseat only.
    });
  });
  await page.waitForFunction(() => {
    const scene = window.FortressLegacy.game.scene.getScene('game');
    return scene.scene.isActive() && scene.phase === 'aim' && scene.activeId === 'p1' && scene.weaponText;
  });
  return page.evaluate(() => {
    const scene = window.FortressLegacy.game.scene.getScene('game');
    scene.time.timeScale = 8;
    scene.tweens.timeScale = 8;
    scene._verificationProjectiles = [];
    const originalAnimate = scene._verificationOriginalAnimate ?? scene.animateProjectile;
    scene._verificationOriginalAnimate = originalAnimate;
    scene.animateProjectile = function (tankId, slot, path, impact, radius, callback) {
      this._verificationProjectiles.push({ tankId, slot, points: path.length,
        impact: impact ? { x: impact.x, y: impact.y } : null, radius });
      return originalAnimate.call(this, tankId, slot, path, impact, radius, callback);
    };
    return { tanks: Array.from(scene.tankForUnit.values()),
      classes: scene.world.units.map(unit => unit.combatClass),
      localPatchInstalled: scene.__localUpgradeInstalled,
      suddenDeathEnabled: scene.world.options.suddenDeath,
      terrainChunks: scene.terrainChunks.length };
  });
}

async function firePlayerOne(slot) {
  return page.evaluate(requestedSlot => {
    const scene = window.FortressLegacy.game.scene.getScene('game');
    scene.activeId = 'p1';
    scene.phase = 'aim';
    scene.selectedItem = null;
    scene.angles.set('p1', 45);
    scene.facing.set('p1', 1);
    scene.controls.setInteractive(true);
    scene.selectWeapon(requestedSlot);
    scene.power = 70;
    const before = scene.world.turn;
    scene.fireActiveUnit();
    return { before, after: scene.world.turn, phase: scene.phase,
      currentWeapon: scene.currentWeaponSlot(), hud: scene.weaponText.text };
  }, slot);
}

async function waitForLocalResolution() {
  await page.waitForFunction(() => {
    const scene = window.FortressLegacy.game.scene.getScene('game');
    return !scene._localShotPending && scene.phase !== 'flight';
  }, undefined, { timeout: 30000 });
}

try {
  const base = process.env.LEGACY_BASE_URL || 'http://127.0.0.1:4173';
  await page.goto(`${base.replace(/\/$/, '')}/original.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.FortressLegacy?.game.scene.getScene('mode').scene.isActive(), undefined, { timeout: 40000 });
  const boot = await page.evaluate(() => ({
    canvasCount: document.querySelectorAll('#game canvas').length,
    textureCount: Object.keys(window.FortressLegacy.game.textures.list).length,
    modeActive: window.FortressLegacy.game.scene.getScene('mode').scene.isActive(),
  }));
  assert.equal(boot.canvasCount, 1);
  assert(boot.textureCount >= 270, `Expected preloaded original textures; found ${boot.textureCount}`);
  report.fixtureResults.boot = boot;
  report.checks.push('Original mode boots with all map, tank and effect textures');

  const local = await startLocalFixture();
  assert.equal(local.localPatchInstalled, true);
  assert.deepEqual(local.tanks, ['cannonrider', 'redfin']);
  assert.deepEqual(local.classes, ['classic', 'modern']);
  assert.equal(local.suddenDeathEnabled, true);
  assert(local.terrainChunks > 0);
  report.fixtureResults.local = local;
  await page.screenshot({ path: resolve(outputDirectory, 'legacy-local-ready.png'), fullPage: true });
  report.checks.push('Actual local scene initializes class affinity and editable terrain');

  const doubleFire = await firePlayerOne('shot2');
  assert.equal(doubleFire.after, doubleFire.before + 1);
  await waitForLocalResolution();
  const double = await page.evaluate(() => {
    const scene = window.FortressLegacy.game.scene.getScene('game');
    return { projectiles: scene._verificationProjectiles, hp: scene.world.units.map(unit => unit.hp),
      phase: scene.phase, hud: scene.weaponText.text };
  });
  assert.equal(double.projectiles.length, 2, 'Cannonrider shot2 must render two real projectiles');
  assert(double.projectiles.every(projectile => projectile.slot === 'shot2' && projectile.points > 0));
  assert(double.hp.every(Number.isFinite));
  report.fixtureResults.double = double;
  await page.screenshot({ path: resolve(outputDirectory, 'legacy-double-shot.png'), fullPage: true });
  report.checks.push('Cannonrider shot2 executes two real animated trajectories and settles');

  await startLocalFixture();
  const firstSpecial = await firePlayerOne('ss');
  assert.equal(firstSpecial.after, firstSpecial.before + 1);
  assert(firstSpecial.hud.includes('남은 특수탄 1'), firstSpecial.hud);
  await waitForLocalResolution();
  const secondSpecial = await firePlayerOne('ss');
  assert.equal(secondSpecial.after, secondSpecial.before + 1);
  assert(secondSpecial.hud.includes('남은 특수탄 0'), secondSpecial.hud);
  await waitForLocalResolution();
  const limit = await page.evaluate(() => {
    const runtime = window.FortressLegacy;
    const scene = runtime.game.scene.getScene('game');
    scene.activeId = 'p1';
    scene.phase = 'aim';
    // Exercise the keyboard-equivalent selection guard first.
    scene.selectWeapon('shot1');
    scene.selectWeapon('ss');
    const selectionAfterExhaustedRequest = scene.currentWeaponSlot();
    // Also exercise fire's independent guard, as an input race would.
    scene.selectedWeaponIndex = 2;
    scene.power = 70;
    const turnBefore = scene.world.turn;
    const projectilesBefore = scene._verificationProjectiles.length;
    scene.fireActiveUnit();
    return { selectionAfterExhaustedRequest, turnBefore, turnAfter: scene.world.turn,
      projectilesBefore, projectilesAfter: scene._verificationProjectiles.length,
      remaining: scene.world.weaponUsesRemaining('p1', runtime.tank('cannonrider').weapons.ss),
      currentWeapon: scene.currentWeaponSlot(), hud: scene.weaponText.text };
  });
  assert.equal(limit.selectionAfterExhaustedRequest, 'shot1');
  assert.equal(limit.remaining, 0);
  assert.equal(limit.turnAfter, limit.turnBefore);
  assert.equal(limit.projectilesAfter, limit.projectilesBefore);
  assert.equal(limit.currentWeapon, 'shot1');
  report.fixtureResults.special = { firstSpecial, secondSpecial, limit };
  await page.screenshot({ path: resolve(outputDirectory, 'legacy-special-limit.png'), fullPage: true });
  report.checks.push('SS HUD decrements from 1 to 0, and selection/fire both reject a third use');

  assert.deepEqual(report.apiRequests, [], 'Local browser fixture must not send online API requests');
  assert.deepEqual(report.errors, [], 'No browser page errors');
  assert.deepEqual(report.failedRequests, [], 'All requested public assets must load');
  report.checks.push('No online API calls, browser exceptions or failed asset requests');
  report.passed = true;
} catch (error) {
  report.failure = { message: error.message, stack: error.stack };
  await page.screenshot({ path: resolve(outputDirectory, 'legacy-verification-failure.png'), fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await writeFile(resolve(outputDirectory, 'legacy-browser-verification.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
  console.log(JSON.stringify(report, null, 2));
}
