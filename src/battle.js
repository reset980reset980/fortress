import { MISSIONS, TANKS, WEAPONS } from './data.js';

export const WORLD_WIDTH = 1440;
export const WORLD_HEIGHT = 800;
const GRAVITY = 350;
const DEG = Math.PI / 180;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const lerp = (a, b, t) => a + (b - a) * t;

export function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createTerrain(seed, theme = 'coast') {
  const rand = seededRandom(seed);
  const phase = rand() * Math.PI * 2;
  const height = new Float32Array(WORLD_WIDTH + 1);
  const amplitude = theme === 'desert' ? 39 : theme === 'frost' ? 32 : 25;
  for (let x = 0; x <= WORLD_WIDTH; x++) {
    const edge = Math.sin((x / WORLD_WIDTH) * Math.PI);
    height[x] = 585 + Math.sin(x / 210 + phase) * amplitude * edge
      + Math.sin(x / 93 + phase * 1.7) * 14 * edge + Math.cos(x / 470 + phase) * 21;
  }
  return height;
}

export function launchVelocity(angle, power) {
  const speed = 145 + clamp(power, 10, 100) * 6.5;
  return { vx: Math.cos(angle * DEG) * speed, vy: -Math.sin(angle * DEG) * speed };
}

export function stepBallistic(projectile, dt, wind) {
  projectile.x += projectile.vx * dt + wind * 0.5 * dt * dt;
  projectile.y += projectile.vy * dt + GRAVITY * 0.5 * dt * dt;
  projectile.vx += wind * dt;
  projectile.vy += GRAVITY * dt;
  projectile.age = (projectile.age || 0) + dt;
  return projectile;
}

export function simulateShot({ x, y, angle, power, wind = 0, terrain, step = 1 / 60 }) {
  const velocity = launchVelocity(angle, power);
  const p = { x: x + Math.cos(angle * DEG) * 35, y: y - Math.sin(angle * DEG) * 35, ...velocity, age: 0 };
  const points = [{ x: p.x, y: p.y }];
  for (let i = 0; i < Math.ceil(8 / step); i++) {
    stepBallistic(p, step, wind);
    if (i % 3 === 0) points.push({ x: p.x, y: p.y });
    if (p.x < -90 || p.x > WORLD_WIDTH + 90 || p.y > WORLD_HEIGHT + 100) break;
    const ground = terrain[clamp(Math.round(p.x), 0, WORLD_WIDTH)];
    if (p.y >= ground && p.age > 0.055) break;
  }
  return { x: p.x, y: p.y, time: p.age, points };
}

export function simulateWeaponShot(options) {
  if (options.weapon !== 'cluster') {
    const shot = simulateShot(options);
    return { ...shot, branches: [], impacts: [{ x: shot.x, y: shot.y }] };
  }
  const { x, y, angle, power, terrain, wind = 0 } = options;
  const step = options.step || 1 / 60;
  const p = { x: x + Math.cos(angle * DEG) * 36, y: y - Math.sin(angle * DEG) * 36, ...launchVelocity(angle, power), age: 0 };
  const points = [{ x: p.x, y: p.y }];
  let didSplit = false;
  for (let i = 0; i < Math.ceil(8 / step); i++) {
    stepBallistic(p, step, wind);
    if (i % 3 === 0) points.push({ x: p.x, y: p.y });
    if (p.vy >= -18 && p.age > 0.38) { didSplit = true; break; }
    if (p.x < -90 || p.x > WORLD_WIDTH + 90 || (p.y >= terrain[clamp(Math.round(p.x), 0, WORLD_WIDTH)] && p.age > 0.055)) break;
  }
  const branches = [], impacts = [];
  if (didSplit) {
    for (let spread = -1; spread <= 1; spread++) {
      const bomblet = { x: p.x, y: p.y, vx: p.vx * 0.84 + spread * 95, vy: Math.max(20, p.vy + 30 + Math.abs(spread) * 15), age: p.age };
      const branch = [{ x: bomblet.x, y: bomblet.y }];
      for (let i = 0; i < Math.ceil(8 / step); i++) {
        stepBallistic(bomblet, step, wind);
        if (i % 3 === 0) branch.push({ x: bomblet.x, y: bomblet.y });
        if (bomblet.x < -90 || bomblet.x > WORLD_WIDTH + 90 || bomblet.y >= terrain[clamp(Math.round(bomblet.x), 0, WORLD_WIDTH)] || bomblet.age > 9) break;
      }
      branches.push(branch);
      impacts.push({ x: bomblet.x, y: bomblet.y });
    }
  } else impacts.push({ x: p.x, y: p.y });
  return { x: impacts[Math.floor(impacts.length / 2)].x, y: impacts[Math.floor(impacts.length / 2)].y, time: p.age, points, branches, impacts };
}

const THEMES = {
  coast: { sky: ['#071c32', '#1b4d6c', '#8ea9ab'], glow: '#c5edf8', mountain: ['#203f57', '#2e5a6f', '#3e6d7b'], soil: ['#416361', '#172d33'], surface: '#91b7a1', accent: '#77d6ff', sun: '#e7f6f9' },
  desert: { sky: ['#211c38', '#65506a', '#d68c70'], glow: '#ffc7a1', mountain: ['#56445c', '#835c67', '#a97569'], soil: ['#a5765c', '#473340'], surface: '#e0b08a', accent: '#ffbd82', sun: '#ffe4c0' },
  frost: { sky: ['#101a36', '#3c5576', '#a2b7c9'], glow: '#c2e7f4', mountain: ['#344765', '#516d8c', '#7c98ae'], soil: ['#647b8e', '#263c52'], surface: '#e2eff4', accent: '#9bdffd', sun: '#effbff' },
};

const TANK_ART = {
  bastion: [10, 340, 533, 188],
  striker: [553, 352, 543, 182],
  arc: [1100, 359, 526, 158],
  warden: [1646, 352, 519, 176],
};

function roundedRect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

export class Battle {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.mission = options.mission || MISSIONS[0];
    this.tankType = typeof options.tank === 'string' ? (TANKS.find(t => t.id === options.tank) || TANKS[0]) : (options.tank || TANKS[0]);
    this.upgrades = options.upgrades || {};
    this.onState = options.onState || (() => {});
    this.onEvent = options.onEvent || (() => {});
    this.onFinish = options.onFinish || (() => {});
    this.random = seededRandom(this.mission.seed);
    this.terrain = createTerrain(this.mission.seed, this.mission.theme);
    this.palette = THEMES[this.mission.theme] || THEMES.coast;
    this.phase = 'aim';
    this.round = 1;
    this.angle = 45;
    this.power = 66;
    this.weapon = 'shell';
    this.wind = Math.round((this.random() * 1.6 - 0.8) * (this.mission.wind || 15));
    this.fuelMax = Math.round(100 * this.tankType.mobility + (this.upgrades.fuel || 0) * 14);
    this.fuel = this.fuelMax;
    this.ammo = { shell: Infinity, cluster: 3, arc: 2 };
    this.abilities = { shield: 1, repair: 1, scan: 1 };
    this.scanning = false;
    this.movement = 0;
    this.paused = false;
    this.reducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.destroyed = false;
    this.elapsed = 0;
    this.status = '포신 각도와 화력을 조절해 발사하세요';
    this.intensity = 0.2;
    this.damageDealt = 0;
    this.projectiles = [];
    this.particles = [];
    this.labels = [];
    this.craters = [];
    this.smoke = [];
    this.enemyQueue = [];
    this.pendingAction = null;
    this.actionTimer = 0;
    this.impactTimer = -1;
    this.shotBy = null;
    this.shake = 0;
    this.flash = 0;
    this.stateTimer = 0;
    this.maxHp = Math.round(this.tankType.hp + (this.upgrades.hull || 0) * 25);
    this.attack = this.tankType.attack * (1 + (this.upgrades.attack || 0) * 0.08);
    this.player = { id: 'player', x: 205, hp: this.maxHp, maxHp: this.maxHp, type: this.tankType.id, color: this.tankType.color, angle: this.angle, shield: 0, facing: 1, recoil: 0, name: this.tankType.name, attack: this.attack };
    const specs = this.mission.enemies || [{ hp: 130, tank: 'striker', color: '#f49387', attack: 0.65 }];
    this.enemies = specs.map((spec, index) => ({ id: `enemy-${index}`, x: specs.length === 1 ? 1065 : 850 + index * (430 / Math.max(specs.length - 1, 1)), hp: spec.hp, maxHp: spec.hp, type: spec.tank || 'bastion', color: spec.color || '#ff998c', angle: 135, shield: 0, facing: -1, recoil: 0, attack: spec.attack || 1, name: this.mission.index === 8 && index === 0 ? '오블리비언' : `${(TANKS.find(t => t.id === spec.tank) || TANKS[0]).name} ${index + 1}` }));
    for (const actor of this.actors()) actor.y = this.groundAt(actor.x) - 20;
    this.ornaments = Array.from({ length: 65 }, () => ({ x: this.random() * WORLD_WIDTH, size: 2 + this.random() * 6, alpha: 0.2 + this.random() * 0.35 }));
    this.stars = Array.from({ length: 75 }, () => ({ x: this.random() * WORLD_WIDTH, y: this.random() * 340, size: this.random() * 1.7 + 0.4, alpha: this.random() * 0.4 + 0.15 }));
    this.weather = Array.from({ length: this.mission.theme === 'frost' ? 55 : 20 }, () => ({ x: this.random() * WORLD_WIDTH, y: this.random() * WORLD_HEIGHT, size: this.random() * 2 + 0.6, velocity: this.random() * 20 + 10 }));
    this.lastTime = null;
    this.tankAtlas = new Image();
    this.tankAtlas.src = '/assets/art/tanks.png';
    this.tankAtlas.onload = () => { if (!this.destroyed) this.draw(); };
    this.environment = null;
    this.environmentPreview = new Image();
    this.environmentPreview.src = `/assets/environments/${this.mission.theme}-v1.png`;
    // Headless simulation tests do not construct a GPU renderer. In browsers,
    // keep the rendered Blender preview visible while the local GLB loads.
    if (typeof document.createElement === 'function') {
      import('./environment.js').then(({ BattlefieldEnvironment }) => {
        if (this.destroyed) return;
        const rect = this.canvas.getBoundingClientRect();
        this.environment = new BattlefieldEnvironment(this.mission.theme, rect.width * Math.min(window.devicePixelRatio || 1, 1.5));
      }).catch(() => { /* The Blender preview remains usable without WebGL2. */ });
    }
    this._visibility = () => { if (document.hidden) this.setMove(0); this.lastTime = null; };
    document.addEventListener('visibilitychange', this._visibility);
    this.resize();
    this.emitState();
    this.frame = this.frame.bind(this);
    this.raf = requestAnimationFrame(this.frame);
  }

  actors() { return [this.player, ...this.enemies]; }
  groundAt(x) { return this.terrain[clamp(Math.round(x), 0, WORLD_WIDTH)]; }
  canControl() { return !this.destroyed && !this.paused && this.phase === 'aim' && this.player.hp > 0; }
  setAngle(angle) {
    if (!this.canControl() || !Number.isFinite(Number(angle))) return;
    this.angle = clamp(Math.round(Number(angle)), 18, 162);
    this.player.angle = this.angle;
    this.player.facing = this.angle > 90 ? -1 : 1;
    this.emitState();
  }
  setPower(power) {
    if (!this.canControl() || !Number.isFinite(Number(power))) return;
    this.power = clamp(Math.round(Number(power)), 10, 100);
    this.emitState();
  }
  setMove(direction) {
    this.movement = this.canControl() ? Math.sign(Number(direction) || 0) : 0;
  }
  setWeapon(weapon) {
    if (!this.canControl() || !WEAPONS[weapon] || this.ammo[weapon] <= 0) return false;
    this.weapon = weapon;
    this.emitState();
    return true;
  }
  fire(power) {
    if (!this.canControl()) return false;
    if (power !== undefined) this.setPower(power);
    if (this.ammo[this.weapon] <= 0) this.weapon = 'shell';
    if (Number.isFinite(this.ammo[this.weapon])) this.ammo[this.weapon]--;
    this.movement = 0;
    this.shotBy = this.player;
    this.launch(this.player, this.angle, this.power, this.weapon);
    return true;
  }
  useAbility(ability) {
    if (!this.canControl() || !this.abilities[ability]) return false;
    if (ability === 'repair' && this.player.hp >= this.maxHp) return false;
    this.abilities[ability]--;
    if (ability === 'shield') {
      this.player.shield = 1;
      this.status = '방어막 활성화 · 이번 적 턴의 피해 55% 감소';
      this.onEvent('shield', { x: this.player.x, y: this.player.y, intensity: 0.5, color: '#75d7ff' });
      this.addLabel(this.player.x, this.player.y - 60, '방어막 가동', '#95e6ff');
    } else if (ability === 'repair') {
      const restore = Math.min(this.maxHp - this.player.hp, Math.round(this.maxHp * 0.38));
      this.player.hp += restore;
      this.status = `긴급 수리 · 체력 ${restore} 회복`;
      this.onEvent('repair', { x: this.player.x, y: this.player.y, intensity: 0.3, color: '#85e6b7' });
      this.addLabel(this.player.x, this.player.y - 55, `+${restore}`, '#92edbd');
    } else if (ability === 'scan') {
      this.scanning = true;
      this.status = '궤도 스캔 · 남은 전투 동안 전체 예상 궤도 표시';
      this.onEvent('scan', { x: this.player.x, y: this.player.y, intensity: 0.25, color: '#a3e1ff' });
    }
    this.emitState();
    return true;
  }
  pause(paused = true) {
    this.paused = !!paused;
    if (this.paused) this.movement = 0;
    this.lastTime = null;
    this.emitState();
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width || this.canvas.clientWidth || WORLD_WIDTH));
    const height = Math.max(1, Math.round(rect.height || this.canvas.clientHeight || WORLD_HEIGHT));
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.pixelRatio = dpr;
    this.scale = Math.min(width / WORLD_WIDTH, height / WORLD_HEIGHT);
    this.offsetX = (width - WORLD_WIDTH * this.scale) / 2;
    this.offsetY = (height - WORLD_HEIGHT * this.scale) / 2;
    this.environment?.resize(width * Math.min(window.devicePixelRatio || 1, 1.5));
    this.draw();
  }
  getSnapshot() {
    return { phase: this.phase, playerHp: Math.round(this.player.hp), playerMaxHp: this.maxHp, enemies: this.enemies.map(e => ({ id: e.id, hp: Math.round(e.hp), maxHp: e.maxHp, name: e.name })), angle: this.angle, power: this.power, wind: this.wind, round: this.round, fuel: Math.round(this.fuel), fuelMax: this.fuelMax, weapon: this.weapon, ammo: { ...this.ammo }, abilities: { ...this.abilities }, status: this.status, text: this.status, intensity: this.intensity, paused: this.paused, scanning: this.scanning, activeId: this.shotBy?.id || (this.phase === 'aim' ? 'player' : null), storm: this.round >= 16, damageDealt: Math.round(this.damageDealt) };
  }
  emitState() { if (!this.destroyed) this.onState(this.getSnapshot()); }
  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this._visibility);
    this.projectiles.length = 0;
    this.particles.length = 0;
    this.environment?.destroy();
  }

  launch(actor, angle, power, weapon = 'shell') {
    actor.angle = angle;
    actor.facing = Math.cos(angle * DEG) < 0 ? -1 : 1;
    actor.recoil = 1;
    const velocity = launchVelocity(angle, power);
    this.projectiles.push({ x: actor.x + Math.cos(angle * DEG) * 36, y: actor.y - 13 - Math.sin(angle * DEG) * 36, ...velocity, age: 0, weapon, source: actor, trail: [], split: weapon !== 'cluster', damageScale: 1 });
    this.phase = 'projectile';
    this.status = actor.id === 'player' ? '포탄 비행 중' : `${actor.name}의 반격`;
    this.intensity = 0.7;
    this.impactTimer = -1;
    this.onEvent('fire', { x: actor.x + Math.cos(angle * DEG) * 36, y: actor.y - 13 - Math.sin(angle * DEG) * 36, intensity: weapon === 'arc' ? 0.9 : 0.55, color: WEAPONS[weapon].color, weapon, enemy: actor.id !== 'player' });
    this.burst(actor.x + Math.cos(angle * DEG) * 36, actor.y - 13 - Math.sin(angle * DEG) * 36, WEAPONS[weapon].color, 10, 95);
    this.emitState();
  }

  frame(time) {
    if (this.destroyed) return;
    if (this.lastTime !== null && !this.paused && !document.hidden) this.environment?.recordFrameGap(time - this.lastTime);
    const dt = this.lastTime === null ? 0 : clamp((time - this.lastTime) / 1000, 0, 0.05);
    this.lastTime = time;
    if (!this.paused && !document.hidden) this.update(dt);
    this.draw();
    if (!this.destroyed) this.raf = requestAnimationFrame(this.frame);
  }

  update(dt) {
    this.elapsed += dt;
    this.shake *= Math.exp(-dt * 12);
    this.flash *= Math.exp(-dt * 9);
    for (const actor of this.actors()) actor.recoil = Math.max(0, actor.recoil - dt * 5);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.vx *= 1 - dt * 0.4;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.labels.length - 1; i >= 0; i--) {
      this.labels[i].life -= dt;
      this.labels[i].y -= dt * 20;
      if (this.labels[i].life <= 0) this.labels.splice(i, 1);
    }
    for (const flake of this.weather) {
      flake.x = (flake.x + (this.wind * 0.6 + 9) * dt + WORLD_WIDTH) % WORLD_WIDTH;
      flake.y = (flake.y + flake.velocity * dt) % WORLD_HEIGHT;
    }
    if (this.phase === 'ended') return;
    if (this.phase === 'aim' && this.movement && this.fuel > 0) {
      const distance = Math.min(dt * (82 * this.tankType.mobility), this.fuel / 0.75) * this.movement;
      if (this.moveActor(this.player, distance)) {
        this.fuel = Math.max(0, this.fuel - Math.abs(distance) * 0.75);
        if (this.random() < 0.5) this.burst(this.player.x - this.movement * 26, this.player.y + 16, this.palette.surface, 1, 18);
      }
      if (this.fuel <= 0) { this.movement = 0; this.status = '이동 연료 소진 · 다음 턴에 보충됩니다'; }
    }
    if (this.projectiles.length) {
      const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
      const subdt = dt / steps;
      for (let step = 0; step < steps && this.projectiles.length; step++) this.updateProjectiles(subdt);
    } else if (this.phase === 'projectile') {
      if (this.impactTimer < 0) this.impactTimer = 0.6;
      this.impactTimer -= dt;
      if (this.impactTimer <= 0) this.endShot();
    }
    if (this.phase === 'enemy' && this.pendingAction) {
      this.actionTimer -= dt;
      if (this.actionTimer <= 0) {
        const action = this.pendingAction;
        this.pendingAction = null;
        if (action.actor.hp > 0) {
          this.shotBy = action.actor;
          this.launch(action.actor, action.angle, action.power, action.weapon);
        } else this.nextEnemy();
      }
    }
    this.intensity = this.phase === 'projectile' ? 0.72 : clamp(0.2 + (1 - this.player.hp / this.maxHp) * 0.36 + this.enemies.filter(e => e.hp > 0).length * 0.055 + (this.round >= 16 ? 0.2 : 0), 0.2, 0.85);
    this.stateTimer -= dt;
    if (this.stateTimer <= 0) { this.stateTimer = 0.1; this.emitState(); }
  }

  moveActor(actor, distance) {
    const next = clamp(actor.x + distance, 65, WORLD_WIDTH - 65);
    if (Math.abs(next - actor.x) < 0.1) return false;
    if (this.actors().some(a => a !== actor && a.hp > 0 && Math.abs(a.x - next) < 65)) return false;
    if (Math.abs(this.groundAt(next) - this.groundAt(actor.x)) > 14) return false;
    actor.x = next;
    actor.y = this.groundAt(next) - 20;
    if (actor.id !== 'player') actor.facing = -1;
    return true;
  }

  updateProjectiles(dt) {
    const newProjectiles = [];
    for (let index = this.projectiles.length - 1; index >= 0; index--) {
      const p = this.projectiles[index];
      const prevX = p.x, prevY = p.y;
      stepBallistic(p, dt, this.wind);
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 25) p.trail.shift();
      if (!p.split && p.vy >= -18 && p.age > 0.38) {
        p.split = true;
        for (let i = -1; i <= 1; i++) newProjectiles.push({ x: p.x, y: p.y, vx: p.vx * 0.84 + i * 95, vy: Math.max(20, p.vy + 30 + Math.abs(i) * 15), age: p.age, weapon: 'cluster', source: p.source, trail: [], split: true, damageScale: 1 });
        this.projectiles.splice(index, 1);
        this.burst(p.x, p.y, '#ffbd9f', 18, 120);
        this.onEvent('cluster', { x: p.x, y: p.y, intensity: 0.3, color: '#ffa99b' });
        continue;
      }
      if (p.x < -85 || p.x > WORLD_WIDTH + 85 || p.y > WORLD_HEIGHT + 100 || p.age > 9) {
        this.projectiles.splice(index, 1);
        this.status = '포탄이 전장을 벗어났습니다';
        continue;
      }
      const hitTank = this.actors().find(actor => actor.hp > 0 && (actor !== p.source || p.age > 0.25) && Math.hypot(p.x - actor.x, p.y - (actor.y - 4)) < 24);
      if (hitTank || (p.x >= 0 && p.x <= WORLD_WIDTH && p.y >= this.groundAt(p.x) && p.age > 0.04)) {
        let impactX = p.x, impactY = p.y;
        if (!hitTank) {
          for (let n = 0; n < 5; n++) {
            const t = n / 4;
            const tx = lerp(prevX, p.x, t), ty = lerp(prevY, p.y, t);
            if (tx >= 0 && tx <= WORLD_WIDTH && ty >= this.groundAt(tx)) { impactX = tx; impactY = this.groundAt(tx); break; }
          }
        }
        this.projectiles.splice(index, 1);
        this.impact(p, impactX, impactY, hitTank);
      }
    }
    this.projectiles.push(...newProjectiles);
  }

  impact(projectile, x, y, directTarget) {
    const weapon = WEAPONS[projectile.weapon];
    const radius = weapon.radius;
    const damage = weapon.damage * projectile.source.attack;
    const oldY = this.actors().map(actor => actor.y);
    for (const actor of this.actors()) {
      if (actor.hp <= 0) continue;
      const distance = Math.hypot(actor.x - x, actor.y - 2 - y);
      if (distance < radius + 20 || actor === directTarget) {
        let amount = Math.round(damage * (actor === directTarget ? 1.16 : clamp(1 - distance / (radius + 24), 0.16, 1)));
        if (actor.shield) amount = Math.round(amount * (projectile.weapon === 'arc' ? 0.65 : 0.45));
        this.hurt(actor, amount, projectile.source.id === 'player', actor === directTarget ? '직격' : '');
      }
    }
    const craterRadius = projectile.weapon === 'cluster' ? 38 : projectile.weapon === 'arc' ? 52 : 55;
    const depth = projectile.weapon === 'cluster' ? 25 : projectile.weapon === 'arc' ? 46 : 36;
    for (let px = Math.max(0, Math.floor(x - craterRadius)); px <= Math.min(WORLD_WIDTH, Math.ceil(x + craterRadius)); px++) {
      const norm = (px - x) / craterRadius;
      const crater = y + Math.sqrt(Math.max(0, 1 - norm * norm)) * depth;
      this.terrain[px] = Math.max(this.terrain[px], Math.min(735, crater));
    }
    this.craters.push({ x, y, radius: craterRadius });
    if (this.craters.length > 42) this.craters.shift();
    this.actors().forEach((actor, index) => {
      actor.y = this.groundAt(actor.x) - 20;
      const drop = actor.y - oldY[index];
      if (actor.hp > 0 && drop > 27) this.hurt(actor, Math.round(Math.min(30, (drop - 20) * 0.7)), projectile.source.id === 'player', '낙하');
    });
    this.shake = Math.max(this.shake, projectile.weapon === 'arc' ? 10 : 6);
    this.flash = Math.max(this.flash, 0.16);
    this.burst(x, y, weapon.color, projectile.weapon === 'arc' ? 46 : 34, 210);
    this.burst(x, y + 5, this.palette.surface, 20, 145, 600);
    this.onEvent('impact', { x, y, intensity: projectile.weapon === 'arc' ? 1 : projectile.weapon === 'cluster' ? 0.5 : 0.7, radius, color: weapon.color, weapon: projectile.weapon, direct: !!directTarget });
  }

  hurt(actor, amount, credit = false, tag = '') {
    const actual = Math.min(actor.hp, Math.max(1, amount));
    actor.hp = Math.max(0, actor.hp - actual);
    if (credit && actor.id !== 'player') this.damageDealt += actual;
    this.addLabel(actor.x, actor.y - 42, `${tag ? tag + ' ' : ''}−${actual}`, actor.id === 'player' ? '#ffb3a8' : '#fff1ca');
    this.onEvent('damage', { x: actor.x, y: actor.y, intensity: clamp(actual / 100, 0.2, 1), amount: actual, target: actor.id, color: actor.color, destroyed: actor.hp <= 0 });
    if (actor.hp <= 0) {
      this.burst(actor.x, actor.y - 7, '#ffc37d', 50, 200);
      this.shake = Math.max(this.shake, 8);
    }
  }

  endShot() {
    if (this.checkFinish()) return;
    if (this.shotBy?.id === 'player') {
      this.enemyQueue = this.enemies.filter(enemy => enemy.hp > 0);
      this.nextEnemy();
    } else this.nextEnemy();
  }

  nextEnemy() {
    if (this.checkFinish()) return;
    const actor = this.enemyQueue.shift();
    if (!actor) { this.beginPlayerTurn(); return; }
    if (actor.hp <= 0) { this.nextEnemy(); return; }
    if (Math.abs(actor.x - this.player.x) > 1040) {
      for (let i = 0; i < 18; i++) this.moveActor(actor, -4);
    } else if (this.round % 4 === 0 && this.random() > 0.5) {
      const direction = actor.x > WORLD_WIDTH - 120 ? -1 : (this.random() > 0.5 ? 1 : -1);
      for (let i = 0; i < 10; i++) this.moveActor(actor, direction * 3);
    }
    const shot = this.findEnemyShot(actor);
    this.pendingAction = { actor, ...shot };
    actor.angle = shot.angle;
    this.shotBy = actor;
    this.phase = 'enemy';
    this.actionTimer = 1.1;
    this.status = `${actor.name} · 사격 위치 계산 중`;
    this.emitState();
  }

  findEnemyShot(actor) {
    const skill = clamp(this.mission.difficulty || 0, 0, 1);
    const aimX = clamp(this.player.x + (this.random() - 0.5) * (170 - skill * 145), 60, WORLD_WIDTH - 60);
    const aimY = this.groundAt(aimX) - 20;
    let weapon = 'shell';
    if (this.mission.index >= 3 && this.round % 4 === 0) weapon = 'arc';
    if (this.mission.index >= 5 && this.round % 5 === 0) weapon = 'cluster';
    let best = { distance: Infinity, angle: 135, power: 70 };
    const evaluate = (angle, power) => {
      const shot = simulateWeaponShot({ x: actor.x, y: actor.y - 13, angle, power, wind: this.wind, terrain: this.terrain, weapon, step: 1 / 45 });
      const distance = Math.min(...shot.impacts.map(impact => Math.hypot(impact.x - aimX, impact.y - aimY) + (impact.x < 0 || impact.x > WORLD_WIDTH ? 90 : 0))) + shot.time * 4;
      if (distance < best.distance) best = { distance, angle, power };
    };
    const min = actor.x > this.player.x ? 100 : 24;
    const max = actor.x > this.player.x ? 158 : 80;
    for (let angle = min; angle <= max; angle += 5) for (let power = 25; power <= 100; power += 5) evaluate(angle, power);
    const coarse = { ...best };
    for (let angle = coarse.angle - 4; angle <= coarse.angle + 4; angle++) for (let power = coarse.power - 4; power <= coarse.power + 4; power++) evaluate(clamp(angle, 18, 162), clamp(power, 10, 100));
    const angleError = (this.random() - 0.5) * 0.45;
    const powerError = (this.random() - 0.5) * 0.5;
    return { angle: clamp(best.angle + angleError, 18, 162), power: clamp(best.power + powerError, 10, 100), weapon };
  }

  beginPlayerTurn() {
    this.round++;
    this.fuel = this.fuelMax;
    if (this.ammo[this.weapon] <= 0) this.weapon = 'shell';
    this.player.shield = 0;
    this.wind = Math.round((this.random() * 2 - 1) * (this.mission.wind || 15));
    this.shotBy = null;
    this.phase = 'aim';
    this.status = this.round >= 16 ? '결전 구역 축소 · 안전 구역 안으로 이동하세요' : '지휘관의 턴 · 바람이 바뀌었습니다';
    if (this.round >= 16) {
      const margin = Math.min(WORLD_WIDTH * 0.5, 85 + (this.round - 16) * 92);
      for (const actor of this.actors()) if (actor.hp > 0 && (actor.x < margin || actor.x > WORLD_WIDTH - margin || this.round >= 23)) this.hurt(actor, 24 + (this.round - 16) * 6, false, '폭풍');
      if (this.checkFinish()) return;
    }
    this.onEvent('turn', { x: this.player.x, y: this.player.y, round: this.round, intensity: 0.2 });
    this.emitState();
  }

  checkFinish() {
    if (this.phase === 'ended') return true;
    const won = this.enemies.every(enemy => enemy.hp <= 0) && this.player.hp > 0;
    if (this.player.hp > 0 && !won) return false;
    this.phase = 'ended';
    this.movement = 0;
    this.pendingAction = null;
    this.intensity = won ? 0.1 : 0.45;
    const stars = won ? 1 + (this.player.hp / this.maxHp >= 0.5 ? 1 : 0) + (this.round <= 9 ? 1 : 0) : 0;
    this.status = won ? '작전 완료 · 전선을 확보했습니다' : '작전 실패 · 정비 후 다시 도전하세요';
    const result = { won, stars, rounds: this.round, hpRemaining: Math.round(this.player.hp), damageDealt: Math.round(this.damageDealt) };
    this.onEvent(won ? 'victory' : 'defeat', { x: this.player.x, y: this.player.y, intensity: won ? 0.8 : 0.6, color: won ? '#a7e7d3' : '#ff9d94' });
    this.emitState();
    this.onFinish(result);
    return true;
  }

  addLabel(x, y, text, color) {
    this.labels.push({ x, y, text, color, life: 1.6 });
    if (this.labels.length > 24) this.labels.shift();
  }
  burst(x, y, color, count, velocity, gravity = 240) {
    for (let i = 0; i < count; i++) {
      const angle = this.random() * Math.PI * 2;
      const speed = velocity * (0.2 + this.random() * 0.8);
      const life = 0.3 + this.random() * 0.8;
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - velocity * 0.15, life, maxLife: life, size: this.random() * 4 + 1, color, gravity });
    }
    if (this.particles.length > 300) this.particles.splice(0, this.particles.length - 300);
  }

  draw() {
    if (!this.ctx || this.destroyed) return;
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#07121e';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const sx = this.scale * this.pixelRatio;
    ctx.setTransform(sx, 0, 0, sx, this.offsetX * this.pixelRatio, this.offsetY * this.pixelRatio);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT); ctx.clip();
    if (this.shake > 0.1 && !this.paused && !this.reducedMotion) ctx.translate(Math.sin(this.elapsed * 71) * this.shake, Math.cos(this.elapsed * 53) * this.shake * 0.6);
    this.drawBackground(ctx);
    this.drawTerrain(ctx);
    if (this.phase === 'aim') this.drawTrajectory(ctx);
    for (const actor of this.actors()) this.drawTank(ctx, actor);
    for (const p of this.projectiles) this.drawProjectile(ctx, p);
    for (const p of this.particles) {
      ctx.globalAlpha = Math.min(1, p.life / p.maxLife * 1.4);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    this.drawWeather(ctx);
    for (const label of this.labels) {
      ctx.globalAlpha = Math.min(1, label.life * 1.6);
      ctx.font = '700 18px "Noto Sans KR", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#07121e'; ctx.shadowBlur = 8;
      ctx.fillStyle = label.color; ctx.fillText(label.text, label.x, label.y);
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
    if (this.flash > 0.005) { ctx.fillStyle = `rgba(240,225,195,${this.flash})`; ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT); }
    this.drawAtmosphere(ctx);
    ctx.restore();
  }

  drawBackground(ctx) {
    if (this.environment) {
      this.environment.setQuality(this.reducedMotion);
      const drawStarted = performance.now();
      const rendered = this.environment.render(this.elapsed, this.player.x, this.reducedMotion);
      if (rendered) {
        ctx.drawImage(rendered, 0, 0, WORLD_WIDTH, WORLD_HEIGHT);
        this.environment.recordDrawCost(performance.now() - drawStarted); return;
      }
    }
    if (this.environmentPreview.complete && this.environmentPreview.naturalWidth > 0) {
      ctx.drawImage(this.environmentPreview, 0, 0, WORLD_WIDTH, WORLD_HEIGHT); return;
    }
    const p = this.palette;
    const sky = ctx.createLinearGradient(0, 0, 0, 650);
    sky.addColorStop(0, p.sky[0]); sky.addColorStop(0.52, p.sky[1]); sky.addColorStop(1, p.sky[2]);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    for (const star of this.stars) {
      ctx.globalAlpha = star.alpha * (0.85 + Math.sin(this.elapsed * 0.5 + star.x) * 0.15);
      ctx.fillStyle = '#e0edff'; ctx.fillRect(star.x, star.y, star.size, star.size);
    }
    ctx.globalAlpha = 1;
    const sunX = this.mission.theme === 'desert' ? 1040 : 1095;
    const sunY = this.mission.theme === 'frost' ? 146 : 185;
    const glow = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 220);
    glow.addColorStop(0, p.glow + '4d'); glow.addColorStop(1, p.glow + '00');
    ctx.fillStyle = glow; ctx.fillRect(sunX - 220, sunY - 220, 440, 440);
    ctx.fillStyle = p.sun; ctx.globalAlpha = 0.82; ctx.beginPath(); ctx.arc(sunX, sunY, this.mission.theme === 'desert' ? 34 : 27, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    if (this.mission.theme === 'frost') {
      ctx.save(); ctx.globalAlpha = 0.14; ctx.filter = 'blur(10px)';
      for (let ribbon = 0; ribbon < 2; ribbon++) {
        ctx.beginPath();
        for (let x = -40; x <= WORLD_WIDTH + 40; x += 20) {
          const y = 160 + Math.sin(x / 220 + this.elapsed * 0.08 + ribbon) * 63 + ribbon * 33;
          if (x === -40) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = ribbon ? '#b8a7ff' : '#8ef4d5'; ctx.lineWidth = 25; ctx.stroke();
      }
      ctx.restore();
    }
    for (let layer = 0; layer < 3; layer++) {
      const base = 425 + layer * 52;
      const drift = Math.sin(this.elapsed * 0.025) * (2 + layer * 2);
      ctx.beginPath(); ctx.moveTo(-20, WORLD_HEIGHT);
      for (let x = -20; x <= WORLD_WIDTH + 20; x += 12) {
        const wave = Math.sin((x + drift) / (120 - layer * 18) + this.mission.seed * 0.01 + layer) * (45 + layer * 9)
          + Math.cos(x / (54 + layer * 13) + layer * 2.3) * (19 + layer * 7);
        ctx.lineTo(x, base + wave);
      }
      ctx.lineTo(WORLD_WIDTH + 20, WORLD_HEIGHT); ctx.closePath();
      ctx.fillStyle = p.mountain[layer]; ctx.fill();
      if (this.mission.theme === 'frost' && layer === 0) {
        ctx.strokeStyle = '#afc4d42e'; ctx.lineWidth = 4; ctx.stroke();
      }
    }
    if (this.mission.theme === 'coast') {
      const water = ctx.createLinearGradient(0, 473, 0, 635);
      water.addColorStop(0, '#73b4c140'); water.addColorStop(1, '#16394d');
      ctx.fillStyle = water; ctx.fillRect(0, 493, WORLD_WIDTH, 165);
      for (let line = 0; line < 13; line++) {
        const y = 499 + line * 8;
        ctx.strokeStyle = `rgba(157,212,226,${0.05 + line * 0.004})`;
        ctx.beginPath();
        for (let x = 0; x <= WORLD_WIDTH; x += 30) ctx.lineTo(x, y + Math.sin(x / 80 + this.elapsed * 0.45 + line) * 1.5);
        ctx.stroke();
      }
    }
    this.drawRuins(ctx);
    const fog = ctx.createLinearGradient(0, 390, 0, 605);
    fog.addColorStop(0, p.glow + '00'); fog.addColorStop(0.6, p.glow + '16'); fog.addColorStop(1, p.glow + '00');
    ctx.fillStyle = fog; ctx.fillRect(0, 390, WORLD_WIDTH, 215);
    for (let cloud = 0; cloud < 3; cloud++) {
      const cx = ((this.elapsed * (3 + cloud) + cloud * 490) % (WORLD_WIDTH + 500)) - 250;
      const cy = 265 + cloud * 48;
      const mist = ctx.createRadialGradient(cx, cy, 0, cx, cy, 220);
      mist.addColorStop(0, p.glow + '0c'); mist.addColorStop(1, p.glow + '00');
      ctx.fillStyle = mist; ctx.fillRect(cx - 220, cy - 100, 440, 200);
    }
  }

  drawRuins(ctx) {
    ctx.save();
    ctx.fillStyle = this.mission.theme === 'desert' ? '#5d4854' : '#24495f';
    ctx.globalAlpha = 0.7;
    const x = 645, y = 505;
    ctx.fillRect(x - 58, y - 55, 116, 55);
    ctx.fillRect(x - 34, y - 97, 68, 42);
    ctx.beginPath(); ctx.moveTo(x - 39, y - 97); ctx.lineTo(x, y - 120); ctx.lineTo(x + 39, y - 97); ctx.fill();
    ctx.fillRect(x + 72, y - 32, 38, 32);
    ctx.strokeStyle = '#406b7e'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x + 102, y - 32); ctx.lineTo(x + 102, y - 157); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 85, y - 134); ctx.lineTo(x + 119, y - 144); ctx.stroke();
    ctx.globalAlpha = 0.7 + Math.sin(this.elapsed * 3) * 0.15;
    ctx.fillStyle = this.palette.accent; ctx.fillRect(x - 8, y - 71, 16, 5); ctx.fillRect(x + 99, y - 159, 6, 5);
    ctx.restore();
  }

  drawTerrain(ctx) {
    const soil = ctx.createLinearGradient(0, 530, 0, 800);
    soil.addColorStop(0, this.palette.soil[0]); soil.addColorStop(0.45, this.palette.soil[1]); soil.addColorStop(1, '#101b28');
    ctx.beginPath(); ctx.moveTo(0, WORLD_HEIGHT);
    for (let x = 0; x <= WORLD_WIDTH; x += 2) ctx.lineTo(x, this.terrain[x]);
    ctx.lineTo(WORLD_WIDTH, WORLD_HEIGHT); ctx.closePath(); ctx.fillStyle = soil; ctx.fill();
    // Lit upper shelf and eroded strata follow the live destructible contour.
    ctx.save();
    ctx.clip();
    ctx.lineCap = 'round';
    for (let band = 0; band < 8; band++) {
      ctx.beginPath();
      for (let x = 0; x <= WORLD_WIDTH; x += 8) {
        const y = this.terrain[x] + 20 + band * 28 + Math.sin(x / 67 + band * 1.9) * 5;
        if (!x) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = band % 2 ? '#08162140' : '#ded3b21c';
      ctx.lineWidth = 3 + band % 3; ctx.stroke();
    }
    const shelf = ctx.createLinearGradient(0, 555, 0, 650);
    shelf.addColorStop(0, this.palette.surface); shelf.addColorStop(1, this.palette.soil[0]);
    ctx.beginPath();
    for (let x = 0; x <= WORLD_WIDTH; x += 2) {
      if (!x) ctx.moveTo(x, this.terrain[x]); else ctx.lineTo(x, this.terrain[x]);
    }
    for (let x = WORLD_WIDTH; x >= 0; x -= 2) ctx.lineTo(x, this.terrain[x] + 13 + Math.sin(x / 19) * 2);
    ctx.closePath(); ctx.fillStyle = shelf; ctx.fill();
    ctx.restore();
    ctx.beginPath();
    for (let x = 0; x <= WORLD_WIDTH; x += 2) { if (!x) ctx.moveTo(x, this.terrain[x]); else ctx.lineTo(x, this.terrain[x]); }
    ctx.lineWidth = this.mission.theme === 'frost' ? 5 : 3; ctx.strokeStyle = this.palette.surface; ctx.stroke();
    ctx.save();
    ctx.beginPath(); ctx.moveTo(0, WORLD_HEIGHT);
    for (let x = 0; x <= WORLD_WIDTH; x += 4) ctx.lineTo(x, this.terrain[x] + 6);
    ctx.lineTo(WORLD_WIDTH, WORLD_HEIGHT); ctx.closePath(); ctx.clip();
    ctx.globalAlpha = this.environment?.ready ? 0.015 : 0.055;
    ctx.strokeStyle = '#b9d7d8'; ctx.lineWidth = 1;
    for (let y = 590; y < 800; y += 34) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD_WIDTH, y + 12); ctx.stroke(); }
    if (!this.environment?.ready) for (let x = 0; x < WORLD_WIDTH; x += 80) { ctx.beginPath(); ctx.moveTo(x, 555); ctx.lineTo(x, 800); ctx.stroke(); }
    ctx.restore();
    for (const rock of this.ornaments) {
      const y = this.groundAt(rock.x);
      ctx.globalAlpha = rock.alpha;
      ctx.fillStyle = this.palette.surface;
      ctx.beginPath(); ctx.moveTo(rock.x - rock.size, y + 1); ctx.lineTo(rock.x - rock.size * 0.35, y - rock.size * 0.6); ctx.lineTo(rock.x + rock.size * 0.7, y - rock.size * 0.4); ctx.lineTo(rock.x + rock.size, y + 1); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (this.round >= 16) {
      const margin = Math.min(WORLD_WIDTH * 0.5, 85 + (this.round - 16) * 92);
      ctx.fillStyle = 'rgba(214,82,88,0.12)'; ctx.fillRect(0, 0, margin, WORLD_HEIGHT); ctx.fillRect(WORLD_WIDTH - margin, 0, margin, WORLD_HEIGHT);
      ctx.setLineDash([9, 11]); ctx.strokeStyle = '#ff9c93a0'; ctx.lineWidth = 2;
      for (const x of [margin, WORLD_WIDTH - margin]) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD_HEIGHT); ctx.stroke(); }
      ctx.setLineDash([]);
    }
  }

  drawTrajectory(ctx) {
    const trajectory = simulateWeaponShot({ x: this.player.x, y: this.player.y - 13, angle: this.angle, power: this.power, wind: this.wind, terrain: this.terrain, weapon: this.weapon, step: 1 / 60 });
    const points = trajectory.points;
    const count = this.scanning ? points.length : Math.min(15, Math.max(5, Math.floor(points.length * 0.42)));
    for (let i = 1; i < count; i++) {
      const point = points[i];
      if (point.x < 0 || point.x > WORLD_WIDTH) continue;
      ctx.globalAlpha = this.scanning ? 0.6 - i / count * 0.3 : 0.65 * (1 - i / count);
      ctx.fillStyle = WEAPONS[this.weapon].color;
      ctx.beginPath(); ctx.arc(point.x, point.y, i % 3 === 0 ? 2.8 : 1.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (this.scanning) {
      for (const branch of trajectory.branches) for (let i = 1; i < branch.length; i++) {
        const point = branch[i];
        ctx.globalAlpha = 0.4; ctx.fillStyle = WEAPONS[this.weapon].color;
        ctx.beginPath(); ctx.arc(point.x, point.y, 1.8, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      for (const impact of trajectory.impacts) if (impact.x >= 0 && impact.x <= WORLD_WIDTH) {
        const y = this.groundAt(impact.x);
        ctx.strokeStyle = '#9fe7ff8c'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(impact.x, y, WEAPONS[this.weapon].radius * 0.55, 9, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(impact.x - 8, y); ctx.lineTo(impact.x + 8, y); ctx.moveTo(impact.x, y - 8); ctx.lineTo(impact.x, y + 8); ctx.stroke();
      }
    }
    ctx.strokeStyle = '#bcdded4d'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(this.player.x, this.player.y - 12, 57, -162 * DEG, -18 * DEG); ctx.stroke();
  }

  drawTank(ctx, actor) {
    const slope = Math.atan2(this.groundAt(actor.x + 26) - this.groundAt(actor.x - 26), 52);
    const alive = actor.hp > 0;
    const heavy = actor.type === 'warden';
    const fast = actor.type === 'striker';
    const width = heavy ? 67 : fast ? 56 : 61;
    ctx.save();
    ctx.translate(actor.x, actor.y);
    ctx.fillStyle = '#05101866'; ctx.beginPath(); ctx.ellipse(0, 24, width * 0.65, 8, 0, 0, Math.PI * 2); ctx.fill();
    if (actor.shield && alive) {
      ctx.save(); ctx.shadowColor = '#73dcff'; ctx.shadowBlur = 17;
      ctx.strokeStyle = '#92e9ff90'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, -8, 48, 43, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#76d8ff10'; ctx.fill(); ctx.restore();
    }
    ctx.rotate(slope);
    if (!alive) {
      ctx.globalAlpha = 0.65; ctx.fillStyle = '#21303a';
      ctx.beginPath(); roundedRect(ctx, -width / 2, -5, width, 27, 8); ctx.fill();
      ctx.fillStyle = '#111f2b'; ctx.fillRect(-19, -15, 33, 16);
      ctx.strokeStyle = '#42505b'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(actor.facing * 23, -7); ctx.stroke();
      ctx.restore();
      if (Math.sin(this.elapsed * 3 + actor.x) > -0.75) {
        ctx.globalAlpha = 0.2; ctx.fillStyle = '#b9ccd1';
        ctx.beginPath(); ctx.arc(actor.x + Math.sin(this.elapsed + actor.x) * 9, actor.y - 30 - (this.elapsed * 12 + actor.x) % 55, 10, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      }
      return;
    }
    const track = ctx.createLinearGradient(0, 6, 0, 24); track.addColorStop(0, '#45525f'); track.addColorStop(1, '#0d1721');
    ctx.fillStyle = track; ctx.strokeStyle = '#788893'; ctx.lineWidth = 1.4;
    ctx.beginPath(); roundedRect(ctx, -width / 2, 5, width, 21, 10); ctx.fill(); ctx.stroke();
    for (let i = 0; i < 5; i++) {
      ctx.beginPath(); ctx.arc(-width * 0.34 + i * width * 0.17, 15, 6.2, 0, Math.PI * 2); ctx.fillStyle = '#1b2936'; ctx.fill(); ctx.strokeStyle = '#71808a'; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); ctx.arc(-width * 0.34 + i * width * 0.17, 15, 2.1, 0, Math.PI * 2); ctx.fillStyle = '#8c9aa2'; ctx.fill();
    }
    const body = ctx.createLinearGradient(0, -14, 0, 11); body.addColorStop(0, alive ? actor.color : '#677782'); body.addColorStop(0.18, '#617b87'); body.addColorStop(1, '#253a49');
    ctx.fillStyle = body; ctx.strokeStyle = '#9bb4bf'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-width / 2 + 4, 5); ctx.lineTo(-width / 2 + 11, -10); ctx.lineTo(width / 2 - 9, -10); ctx.lineTo(width / 2 + 2, 5); ctx.lineTo(width / 2 - 1, 11); ctx.lineTo(-width / 2 + 1, 11); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#172c39'; ctx.fillRect(-width / 2 + 8, -3, width - 16, 4);
    ctx.fillStyle = actor.color; ctx.globalAlpha = 0.85; ctx.fillRect(-width / 2 + 11, -3, width * 0.3, 3); ctx.globalAlpha = 1;
    ctx.fillStyle = '#becfd2'; ctx.fillRect(actor.facing > 0 ? width / 2 - 6 : -width / 2 + 1, 1, 5, 5);
    ctx.fillStyle = '#f28e77'; ctx.fillRect(actor.facing > 0 ? -width / 2 + 4 : width / 2 - 7, 1, 3, 5);
    if (this.tankAtlas.complete && this.tankAtlas.naturalWidth && TANK_ART[actor.type]) {
      const crop = TANK_ART[actor.type];
      const spriteWidth = heavy ? 96 : fast ? 87 : 90;
      const spriteHeight = crop[3] / crop[2] * spriteWidth;
      ctx.save();
      if (actor.facing < 0) ctx.scale(-1, 1);
      ctx.drawImage(this.tankAtlas, ...crop, -spriteWidth / 2, 24 - spriteHeight, spriteWidth, spriteHeight);
      ctx.restore();
    }
    const turret = ctx.createLinearGradient(0, -26, 0, -9); turret.addColorStop(0, actor.color); turret.addColorStop(0.15, '#89a0af'); turret.addColorStop(1, '#2e4355');
    ctx.fillStyle = turret; ctx.strokeStyle = '#bacad1';
    ctx.beginPath(); roundedRect(ctx, heavy ? -22 : -18, -25, heavy ? 44 : 36, 18, 5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#172e43'; ctx.fillRect(-7, -22, 14, 4);
    ctx.fillStyle = actor.color; ctx.fillRect(-6, -21, 12, 2);
    if (actor.type === 'arc') {
      ctx.fillStyle = '#d8c8ff'; ctx.shadowColor = '#b79dff'; ctx.shadowBlur = 7; ctx.fillRect(-16, -23, 4, 10); ctx.fillRect(12, -23, 4, 10); ctx.shadowBlur = 0;
    }
    ctx.restore();
    ctx.save(); ctx.translate(actor.x, actor.y - 13); ctx.rotate(-actor.angle * DEG);
    const barrel = ctx.createLinearGradient(0, -6, 0, 6); barrel.addColorStop(0, '#b8cad2'); barrel.addColorStop(0.5, '#547586'); barrel.addColorStop(1, '#1f3443');
    ctx.fillStyle = barrel; ctx.strokeStyle = '#95aab5'; ctx.lineWidth = 1;
    ctx.beginPath(); roundedRect(ctx, 4 - actor.recoil * 7, -4.5, heavy ? 42 : 37, 9, 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1c2e3e'; ctx.fillRect(heavy ? 37 - actor.recoil * 7 : 32 - actor.recoil * 7, -6, 7, 12);
    ctx.fillStyle = actor.color; ctx.fillRect(14, -4, 3, 8);
    ctx.restore();
    ctx.save(); ctx.translate(actor.x, actor.y);
    const hpRatio = actor.hp / actor.maxHp;
    ctx.fillStyle = '#081727b8'; ctx.beginPath(); roundedRect(ctx, -37, -59, 74, 7, 3); ctx.fill();
    ctx.fillStyle = hpRatio < 0.3 ? '#ffad9b' : actor.color; ctx.beginPath(); roundedRect(ctx, -36, -58, 72 * hpRatio, 5, 2); ctx.fill();
    ctx.fillStyle = '#e0eef5b0'; ctx.font = '500 11px "Noto Sans KR", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(actor.id === 'player' ? 'YOUR UNIT' : actor.name, 0, -68);
    if (this.phase === 'aim' && actor.id === 'player') {
      ctx.strokeStyle = '#adf1de'; ctx.lineWidth = 1.7;
      ctx.beginPath(); ctx.moveTo(-8, -89); ctx.lineTo(0, -81); ctx.lineTo(8, -89); ctx.stroke();
      ctx.strokeStyle = '#95dfd84d'; ctx.beginPath(); ctx.ellipse(0, 28, 46, 8, 0, 0, Math.PI * 2); ctx.stroke();
    }
    if (hpRatio < 0.35) {
      const pulse = Math.sin(this.elapsed * 3 + actor.x) * 0.5 + 0.5;
      ctx.globalAlpha = 0.25; ctx.fillStyle = '#ffc07d'; ctx.beginPath(); ctx.arc(-8, -21, 5 + pulse * 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  drawProjectile(ctx, projectile) {
    const color = WEAPONS[projectile.weapon].color;
    if (projectile.y < 0 && projectile.x > 20 && projectile.x < WORLD_WIDTH - 20) {
      ctx.save(); ctx.translate(projectile.x, 23);
      ctx.fillStyle = '#081627b0'; ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-5, 4); ctx.lineTo(0, -3); ctx.lineTo(5, 4); ctx.stroke();
      ctx.restore();
    }
    if (projectile.trail.length > 1) {
      ctx.lineWidth = projectile.weapon === 'arc' ? 4 : 2;
      for (let i = 1; i < projectile.trail.length; i++) {
        const a = projectile.trail[i - 1], b = projectile.trail[i];
        ctx.globalAlpha = i / projectile.trail.length * 0.55; ctx.strokeStyle = color;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    ctx.save(); ctx.translate(projectile.x, projectile.y); ctx.rotate(Math.atan2(projectile.vy, projectile.vx));
    ctx.shadowBlur = projectile.weapon === 'arc' ? 23 : 10; ctx.shadowColor = color;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(0, 0, projectile.weapon === 'cluster' && projectile.split ? 5 : 8, projectile.weapon === 'arc' ? 4 : 3.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff7e6'; ctx.fillRect(0, -1.3, 4, 2.6);
    if (projectile.weapon === 'arc') { ctx.strokeStyle = '#ece0ff'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(0, 0, 9 + Math.sin(this.elapsed * 30) * 2, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
  }

  drawWeather(ctx) {
    if (this.mission.theme === 'frost') {
      ctx.fillStyle = '#e1f4ff';
      for (const f of this.weather) { ctx.globalAlpha = 0.2 + f.size * 0.1; ctx.beginPath(); ctx.arc(f.x, f.y, f.size, 0, Math.PI * 2); ctx.fill(); }
    } else {
      ctx.strokeStyle = this.palette.surface;
      for (const f of this.weather) {
        if (f.y < 480) continue;
        ctx.globalAlpha = this.mission.theme === 'desert' ? 0.18 : 0.07;
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x + 6, f.y - 1); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawAtmosphere(ctx) {
    const vignette = ctx.createRadialGradient(WORLD_WIDTH / 2, 400, 290, WORLD_WIDTH / 2, 400, 900);
    vignette.addColorStop(0, '#05101b00'); vignette.addColorStop(1, '#05101b86');
    ctx.fillStyle = vignette; ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    ctx.fillStyle = '#c1dbe14d'; ctx.font = '500 12px system-ui, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(`${this.mission.region || '유리 해안'}  /  ${String(this.round).padStart(2, '0')} ROUND`, 31, 37);
    if (this.phase === 'enemy') {
      ctx.fillStyle = '#f0bdac'; ctx.textAlign = 'center'; ctx.font = '600 16px "Noto Sans KR", system-ui, sans-serif'; ctx.fillText('적 전차의 턴', WORLD_WIDTH / 2, 53);
    }
    if (this.round >= 16) {
      ctx.textAlign = 'right'; ctx.fillStyle = '#ffb7a5'; ctx.fillText('결전 · 안전 구역 축소', WORLD_WIDTH - 30, 37);
    }
  }
}
