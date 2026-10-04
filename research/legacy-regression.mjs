import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { installLegacyLocalUpgrade } from '../original/assets/legacy-local-upgrade.js';

const raw = fs.readFileSync(new URL('../backup/original-public-bundle/index-Dvs0axOV.js', import.meta.url), 'utf8');
const source = `const ${raw.slice(raw.indexOf('Ns=8,Gt='), raw.indexOf('const qn=4200'))}`;
const engine = vm.runInNewContext(`${source}; ({World:Je,tank:cs,map:Cn,toFixed:At,toPixels:Dt,toIntegerPixels:it,terrainDiffs:kn,decideAi:an,aiSeed:on,itemIds:An,itemLabels:Li,tanks:ds});`, { Uint8Array, Uint32Array, BigInt, Math, JSON, Map, Set });

const delegated = [];
class GameScene {}
const methodNames = ['createWorld', 'createWater', 'fireActiveUnit', 'runLocalAiTurn', 'selectWeapon', 'cycleWeapon', 'availableWeatherItems', 'updateItemControls', 'redrawHud', 'beginTurn', 'update'];
for (const name of methodNames) GameScene.prototype[name] = function (...args) { delegated.push(name); return `${name}:original`; };
GameScene.prototype.animateProjectile = function () { return 'animateProjectile:original'; };
GameScene.prototype.cleanup = function () { return 'cleanup:original'; };
const roster = Object.fromEntries(engine.tanks.map(id => [id, { weapons: Object.values(engine.tank(id).weapons) }]));
const audio = { playSfx() {}, stopGameplayLoops() {} };
const runtime = { ...engine, GameScene, roster, Audio: audio, playFireSound() {} };
installLegacyLocalUpgrade(runtime);

const online = new GameScene();
online.matchData = { online: { transport: 'p2p' } };
for (const name of methodNames) {
  const before = delegated.length;
  const result = online[name]('shot1');
  assert.equal(delegated.length, before + 1, `${name} must delegate exactly once online`);
  if (!['createWorld', 'createWater', 'redrawHud'].includes(name)) assert.equal(result, `${name}:original`);
}

function makeScene(tankId = 'cannonrider', slot = 'shot2') {
  const tank = engine.tank(tankId);
  const target = engine.tank('redfin');
  const scene = new GameScene();
  Object.assign(scene, {
    matchData: { seed: 888, aiDifficulty: 'hard', mapId: 'grassland' },
    world: new engine.World({ seed: 888, width: 1600, height: 900,
      terrain: engine.map('grassland'), mapTheme: 'grassland',
      units: [{ id: 'p1', team: 0, x: engine.toFixed(245), y: 0, hp: tank.stats.hp, maxHp: tank.stats.hp,
        alive: true, delay: 0, stats: { ...tank.stats }, combatClass: tank.class, weatherAffinity: tank.weatherAffinity },
      { id: 'p2', team: 1, x: engine.toFixed(900), y: 0, hp: target.stats.hp, maxHp: target.stats.hp,
        alive: true, delay: 0, stats: { ...target.stats }, combatClass: target.class, weatherAffinity: target.weatherAffinity }], suddenDeath: true }),
    tankForUnit: new Map([['p1', tankId], ['p2', 'redfin']]), activeId: 'p1', phase: 'aim',
    angles: new Map([['p1', Math.max(tank.stats.angleMin, Math.min(45, tank.stats.angleMax))]]),
    facing: new Map([['p1', 1]]), localItems: new Map([['p1', []]]), power: 70,
    selectedWeaponIndex: Object.values(tank.weapons).findIndex(definition => definition.slot === slot),
    controls: { setInteractive() {}, setItems() {}, setWeapon() {}, setReadout() {} },
    currentWeaponSlot() { return Object.values(tank.weapons)[this.selectedWeaponIndex].slot; },
    consumeLocalItem(id, item) { this.localItems.set(id, this.localItems.get(id).filter(candidate => candidate !== item)); },
    refreshWeatherPresentation() {}, playBodyAnimation() {}, erased: [], animated: [], explosions: [],
    animateProjectile(id, weapon, path, impact, radius, callback) { this.animated.push({ weapon, path, impact, radius }); callback(); },
    showOnlineExplosion(impact, radius) { this.explosions.push({ impact, radius }); },
    eraseTerrainRect(diff) { this.erased.push(diff); }, showDamageFeedback() {}, syncUnits() {}, syncCameraLayers() {},
    time: { delayedCall(delay, callback) { callback(); } }, finishMatch() { this.phase = 'ended'; },
    weaponText: { text: '', setText(text) { this.text = text; } },
  });
  return scene;
}

let checkedWeapons = 0;
for (const tankId of engine.tanks) {
  for (const slot of ['shot1', 'shot2', 'ss']) {
    const scene = makeScene(tankId, slot);
    const beforeTurn = scene.world.turn;
    scene.fireActiveUnit();
    assert.equal(scene.world.turn, beforeTurn + 1, `${tankId}/${slot} advances one turn`);
    assert(scene.world.units.every(unit => Number.isFinite(unit.hp)), `${tankId}/${slot}: finite health`);
    const weapon = engine.tank(tankId).weapons[slot];
    if (weapon.usesPerMatch !== undefined) assert.equal(scene.world.weaponUsesRemaining('p1', weapon), weapon.usesPerMatch - 1);
    checkedWeapons++;
  }
}

const double = makeScene('cannonrider', 'shot2');
double.fireActiveUnit();
assert.equal(double.animated.length, 2, 'local double shot renders both engine trajectories');

const limited = makeScene('ballista', 'ss');
limited.fireActiveUnit();
limited.phase = 'aim';
limited.fireActiveUnit();
limited.phase = 'aim';
const turnBeforeThird = limited.world.turn;
limited.fireActiveUnit();
assert.equal(limited.world.turn, turnBeforeThird, 'exhausted SS does not fire or consume a turn');
assert.equal(limited.world.weaponUsesRemaining('p1', engine.tank('ballista').weapons.ss), 0);

const repair = makeScene();
repair.world.units[0].hp -= 200;
repair.localItems.set('p1', ['repair-kit']);
repair.selectedItem = 'repair-kit';
repair.fireActiveUnit();
assert.equal(repair.world.units[0].hp, repair.world.units[0].maxHp - 50, 'repair kit heals 150');
assert.equal(repair.world.turn, 1, 'repair kit ends turn');
assert.equal(repair.animated.length, 0, 'repair kit does not fire a shell');
assert.equal(repair.localItems.get('p1').length, 0, 'repair kit is consumed once');

const dualItem = makeScene('redfin', 'shot1');
dualItem.localItems.set('p1', ['dual-shot']);
dualItem.selectedItem = 'dual-shot';
dualItem.fireActiveUnit();
assert.equal(dualItem.animated.length, 2, 'dual-shot item adds a full second trajectory');

const unowned = makeScene('redfin', 'shot1');
unowned.selectedItem = 'dual-shot';
unowned.fireActiveUnit();
assert.equal(unowned.animated.length, 1, 'unowned item cannot be applied');

// Reproduce the public camera race: a new projectile begins after restoration
// starts but before its finishing callback clears the old shot anchor.
const lifecycle = new GameScene();
const timers = [];
lifecycle.scene = { isActive: () => true };
lifecycle.cameras = { main: { stopFollow() {}, setFollowOffset() {}, zoomTo() {}, pan() {} } };
lifecycle.time = { delayedCall(delay, callback) {
  const timer = { delay, callback, removed: false, remove() { this.removed = true; } };
  timers.push(timer);
  return timer;
} };
lifecycle.shotCameraAnchor = { zoom: 1, centerX: 600, centerY: 450 };
lifecycle.scheduleCameraRestore(1);
timers[0].callback();
const oldCompletion = timers[1];
lifecycle.animateProjectile('cannonrider', 'shot2', [{ x: 0, y: 0 }]);
assert.equal(oldCompletion.removed, true, 'a new projectile cancels the finishing restore timer');
const nextAnchor = { zoom: 1.2, centerX: 900, centerY: 450 };
lifecycle.shotCameraAnchor = nextAnchor;
oldCompletion.callback();
assert.equal(lifecycle.shotCameraAnchor, nextAnchor, 'even a queued old callback cannot clear a later shot anchor');
lifecycle.scheduleCameraRestore(1);
timers[2].callback();
const currentCompletion = timers[3];
lifecycle.cleanup();
assert.equal(currentCompletion.removed, true, 'shutdown cancels the finishing timer');
currentCompletion.callback();
assert.equal(lifecycle.shotCameraAnchor, nextAnchor, 'queued completion is invalidated on shutdown');

// The public backend transport implementation stays byte-for-byte intact.
const patched = fs.readFileSync(new URL('../original/assets/index-Dvs0axOV.js', import.meta.url), 'utf8');
const backendStart = raw.indexOf('class Kt extends Error');
const backendEnd = raw.indexOf('class Co{');
assert(patched.includes(raw.slice(backendStart, backendEnd)), 'original online transport/client unchanged');
assert(!patched.includes('vt.bindControls();Mo();'), 'legacy entry does not register a root-scope stale service worker');

const report = { passed: true, checkedWeapons, onlineDelegationMethods: methodNames.length,
  checks: ['36 local typed weapons', 'double trajectory rendering', 'SS ammo exhaustion', 'repair item', 'dual-shot item', 'unowned item rejection', 'camera restore generation race', 'camera shutdown timer cancellation', 'online transport byte preservation', 'root SW registration disabled'] };
fs.writeFileSync(new URL('./legacy-regression-results.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
