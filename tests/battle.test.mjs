import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle, createTerrain, launchVelocity, stepBallistic, simulateShot, simulateWeaponShot } from '../src/battle.js';
import { MISSIONS, TANKS } from '../src/data.js';

// No browser, timers, real canvas, audio, or RAF loop runs in these tests.
const gradient = { addColorStop() {} };
const ctx = new Proxy({}, {
  get(target, key) {
    if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
    return target[key] ?? (() => {});
  },
  set(target, key, value) { target[key] = value; return true; },
});
const listeners = new Map();
globalThis.window = { devicePixelRatio: 1, matchMedia: () => ({ matches: false }) };
globalThis.document = {
  hidden: false,
  addEventListener(name, listener) { listeners.set(listener, name); },
  removeEventListener(name, listener) { listeners.delete(listener); },
};
globalThis.Image = class { complete = false; naturalWidth = 0; };
let scheduledFrames = 0;
globalThis.requestAnimationFrame = () => ++scheduledFrames;
globalThis.cancelAnimationFrame = () => {};

function createBattle(options = {}) {
  const events = [], results = [], snapshots = [];
  const canvas = { getContext: () => ctx, getBoundingClientRect: () => ({ width: 1440, height: 800 }) };
  const battle = new Battle(canvas, {
    mission: MISSIONS[0], tank: TANKS[0], ...options,
    onEvent: (type, data) => events.push({ type, data }),
    onState: snapshot => snapshots.push(snapshot),
    onFinish: result => results.push(result),
  });
  return { battle, events, results, snapshots, canvas };
}

function advanceUntil(battle, predicate, frameLimit = 3000) {
  for (let frame = 0; frame < frameLimit; frame++) {
    if (predicate()) return frame;
    battle.update(1 / 60);
  }
  assert.fail(`Battle did not reach expected state within ${frameLimit} simulated frames`);
}

function findPlayerShot(battle, target) {
  let best = { distance: Infinity, angle: 45, power: 60 };
  for (let angle = 20; angle <= 80; angle += 2) {
    for (let power = 25; power <= 100; power += 2) {
      const shot = simulateShot({ x: battle.player.x, y: battle.player.y - 13, angle, power, wind: battle.wind, terrain: battle.terrain });
      const distance = Math.hypot(shot.x - target.x, shot.y - target.y);
      if (distance < best.distance) best = { distance, angle, power };
    }
  }
  return best;
}

test('seeded terrain and exact ballistic integration preserve symmetry, gravity, wind, and power', () => {
  const terrain = createTerrain(1218, 'coast');
  assert.equal(terrain.length, 1441);
  assert.deepEqual(terrain, createTerrain(1218, 'coast'));
  assert.notDeepEqual(terrain, createTerrain(2530, 'coast'));
  assert.ok([...terrain].every(y => y > 480 && y < 700));
  const flat = new Float32Array(1441).fill(585);
  const options = { x: 205, y: 550, angle: 45, power: 66, terrain: flat };
  const forward = simulateShot(options);
  const reverse = simulateShot({ ...options, x: 1235, angle: 135 });
  assert.ok(Math.abs((forward.x - 205) - (1235 - reverse.x)) < 1e-6);
  assert.ok(forward.x > 1000 && forward.x < 1250);
  assert.ok(simulateShot({ ...options, wind: 30 }).x > forward.x);
  assert.ok(simulateShot({ ...options, power: 30 }).x < forward.x);
  const velocity = launchVelocity(45, 66);
  const projectile = { x: 0, y: 0, age: 0, ...velocity };
  stepBallistic(projectile, 1, 0);
  assert.ok(Math.abs(projectile.x - velocity.vx) < 1e-8);
  assert.ok(Math.abs(projectile.y - (velocity.vy + 175)) < 1e-8);
});

test('fuel limits movement and angle/power remain inside playable bounds', () => {
  const { battle } = createBattle();
  battle.setAngle(200); assert.equal(battle.angle, 162);
  battle.setAngle(-1); assert.equal(battle.angle, 18);
  battle.setPower(1); assert.equal(battle.power, 10);
  battle.setPower(200); assert.equal(battle.power, 100);
  battle.setMove(1);
  for (let frame = 0; frame < 240; frame++) battle.update(1 / 60);
  assert.equal(battle.fuel, 0);
  assert.ok(battle.player.x > 205);
  const stoppedAt = battle.player.x;
  for (let frame = 0; frame < 60; frame++) battle.update(1 / 60);
  assert.equal(battle.player.x, stoppedAt);
  battle.beginPlayerTurn();
  assert.equal(battle.fuel, battle.fuelMax);
  battle.destroy();
});

test('repair, shield, and scan have one charge and shield reduces actual hit damage', () => {
  const { battle, events } = createBattle();
  assert.equal(battle.useAbility('repair'), false);
  assert.equal(battle.abilities.repair, 1);
  battle.hurt(battle.player, 50);
  assert.equal(battle.useAbility('repair'), true);
  assert.equal(battle.player.hp, battle.maxHp);
  assert.equal(battle.useAbility('repair'), false);
  assert.equal(battle.useAbility('scan'), true);
  assert.equal(battle.scanning, true);
  assert.equal(battle.useAbility('scan'), false);
  assert.equal(battle.useAbility('shield'), true);
  assert.equal(battle.useAbility('shield'), false);
  const hp = battle.player.hp;
  battle.impact({ weapon: 'shell', source: battle.enemies[0] }, battle.player.x, battle.player.y - 2, battle.player);
  const expected = Math.round(Math.round(77 * battle.enemies[0].attack * 1.16) * 0.45);
  assert.equal(hp - battle.player.hp, expected);
  assert.ok(events.some(event => event.type === 'shield'));
  assert.ok(events.some(event => event.type === 'repair'));
  battle.beginPlayerTurn();
  assert.equal(battle.player.shield, 0);
  battle.destroy();
});

test('firing locks controls, pause/hidden frames freeze projectiles, and destroy releases listeners', () => {
  const { battle } = createBattle();
  battle.setWeapon('arc');
  assert.equal(battle.fire(), true);
  assert.equal(battle.ammo.arc, 1);
  assert.equal(battle.fire(), false);
  const angle = battle.angle, power = battle.power;
  battle.setAngle(90); battle.setPower(20); battle.setMove(1);
  assert.equal(battle.angle, angle); assert.equal(battle.power, power); assert.equal(battle.movement, 0);
  const projectile = battle.projectiles[0];
  const x = projectile.x, y = projectile.y;
  battle.pause(true); battle.frame(1000); battle.frame(2000);
  assert.equal(projectile.x, x); assert.equal(projectile.y, y);
  battle.pause(false); battle.frame(3000); battle.frame(3050);
  assert.notEqual(projectile.x, x);
  const hiddenAt = projectile.x;
  document.hidden = true; battle.frame(3100); battle.frame(3150); document.hidden = false;
  assert.equal(projectile.x, hiddenAt);
  const listener = battle._visibility;
  assert.equal(listeners.has(listener), true);
  battle.destroy();
  assert.equal(listeners.has(listener), false);
});

test('cluster splits into three separated bomblets and creates three real craters', () => {
  const prediction = simulateWeaponShot({ x: 205, y: 550, angle: 45, power: 60, terrain: createTerrain(1218), weapon: 'cluster', step: 1 / 120 });
  assert.equal(prediction.branches.length, 3);
  assert.equal(prediction.impacts.length, 3);
  assert.ok(prediction.impacts[2].x - prediction.impacts[0].x > 150);
  const { battle, events } = createBattle();
  battle.setWeapon('cluster'); battle.fire();
  advanceUntil(battle, () => battle.craters.length === 3);
  assert.equal(battle.ammo.cluster, 2);
  assert.ok(events.some(event => event.type === 'cluster'));
  assert.equal(events.filter(event => event.type === 'impact').length, 3);
  assert.ok(battle.craters[2].x - battle.craters[0].x !== 0);
  battle.destroy();
});

test('player, AI, and player turns resolve to a victory with final control locks', () => {
  const { battle, results, events } = createBattle();
  const initialTerrain = battle.terrain.slice();
  let playerTurns = 0;
  while (!results.length && playerTurns < 8) {
    assert.equal(battle.phase, 'aim');
    const target = battle.enemies.find(enemy => enemy.hp > 0);
    const shot = findPlayerShot(battle, target);
    battle.setAngle(shot.angle); battle.setPower(shot.power); battle.fire(); playerTurns++;
    advanceUntil(battle, () => battle.phase === 'aim' || battle.phase === 'ended');
  }
  assert.equal(results.length, 1);
  assert.equal(results[0].won, true);
  assert.ok(results[0].stars >= 1 && results[0].stars <= 3);
  assert.ok(events.some(event => event.type === 'turn'));
  assert.ok(events.some(event => event.type === 'fire' && event.data.enemy));
  assert.ok(battle.terrain.some((height, index) => height > initialTerrain[index]));
  assert.equal(battle.phase, 'ended');
  assert.equal(battle.fire(), false);
  assert.equal(battle.useAbility('scan'), false);
  battle.destroy();
});

test('round 16 storm shrinks the safety zone and eliminates a stalled battle', () => {
  const { battle, results } = createBattle({ mission: MISSIONS[8] });
  battle.round = 17;
  battle.player.hp = 5;
  battle.beginPlayerTurn();
  assert.equal(battle.phase, 'ended');
  assert.equal(results[0].won, false);
  assert.equal(results[0].stars, 0);
  assert.equal(results[0].rounds, 18);
  battle.destroy();
});

test('all nine campaign missions are solvable with affordable upgrade progression', () => {
  const levels = [0, 0, 1, 1, 2, 2, 3, 3, 4];
  for (const mission of MISSIONS) {
    const level = levels[mission.index];
    const { battle, results } = createBattle({ mission, upgrades: { hull: level, attack: level } });
    for (let turn = 0; turn < 20 && !results.length; turn++) {
      if (battle.player.hp < battle.maxHp * 0.7) battle.useAbility('repair');
      if (battle.round === 2) battle.useAbility('shield');
      const target = battle.enemies.filter(enemy => enemy.hp > 0).sort((a, b) => a.hp - b.hp)[0];
      battle.setWeapon(battle.ammo.arc > 0 && target.hp > 90 ? 'arc' : 'shell');
      const shot = findPlayerShot(battle, target);
      battle.setAngle(shot.angle); battle.setPower(shot.power); battle.fire();
      advanceUntil(battle, () => battle.phase === 'aim' || battle.phase === 'ended');
    }
    assert.equal(results[0]?.won, true, `Mission ${mission.index + 1} must be possible with level ${level}`);
    battle.destroy();
  }
});
