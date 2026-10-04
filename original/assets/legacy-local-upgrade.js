/**
 * Local-mode corrections for the preserved public Fortress release.
 * Online matches always delegate to the original methods and protocol.
 * Uses the same deterministic weapon engine as the existing online mode.
 */
export function installLegacyLocalUpgrade(runtime) {
  const {
    GameScene, Audio: audio, tank: tankDefinition, toPixels, toFixed,
    toIntegerPixels, terrainDiffs, decideAi, aiSeed, itemLabels, itemIds,
  } = runtime;
  const prototype = GameScene.prototype;
  if (prototype.__localUpgradeInstalled) return;
  Object.defineProperty(prototype, '__localUpgradeInstalled', { value: true });

  const original = Object.fromEntries([
    'createWorld', 'createWater', 'fireActiveUnit', 'runLocalAiTurn',
    'selectWeapon', 'cycleWeapon', 'availableWeatherItems', 'updateItemControls',
    'redrawHud', 'beginTurn', 'update', 'animateProjectile', 'scheduleCameraRestore', 'cleanup',
  ].map(name => [name, prototype[name]]));

  function weapon(scene, slot = scene.currentWeaponSlot()) {
    const tank = tankDefinition(scene.tankForUnit.get(scene.activeId));
    const definition = tank.weapons[slot];
    return { ...definition, damage: Math.round(definition.damage * tank.attackScalePermille / 1000) };
  }

  function localOnly(scene) { return !scene.matchData.online; }

  // Camera restoration has two stages in the public client. Its second timer
  // was untracked, and could clear the anchor of a later projectile. This is a
  // presentation-only lifecycle correction, shared by local and online modes.
  prototype.animateProjectile = function (...args) {
    if (!this.cameras?.main || !this.scene.isActive()) return;
    this._localCameraGeneration = (this._localCameraGeneration ?? 0) + 1;
    this._cameraRestoreCompletionTimer?.remove(false);
    this._cameraRestoreCompletionTimer = undefined;
    return original.animateProjectile.apply(this, args);
  };

  prototype.scheduleCameraRestore = function (delay) {
    this.cameraRestoreTimer?.remove(false);
    this._cameraRestoreCompletionTimer?.remove(false);
    this._cameraRestoreCompletionTimer = undefined;
    const generation = this._localCameraGeneration ?? 0;
    this.cameraRestoreTimer = this.time.delayedCall(delay, () => {
      if (generation !== (this._localCameraGeneration ?? 0) || !this.scene.isActive()) return;
      const camera = this.cameras?.main;
      const anchor = this.shotCameraAnchor;
      if (!camera || !anchor) return;
      this.cameraRestoreTimer = undefined;
      camera.stopFollow();
      camera.setFollowOffset(0, 0);
      const reduceMotion = typeof window !== 'undefined'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const duration = reduceMotion ? 0 : 260;
      if (duration === 0) {
        camera.setZoom(anchor.zoom).centerOn(anchor.centerX, anchor.centerY);
        if (generation === (this._localCameraGeneration ?? 0)) this.shotCameraAnchor = undefined;
        return;
      }
      camera.zoomTo(anchor.zoom, duration, 'Sine.easeInOut');
      camera.pan(anchor.centerX, anchor.centerY, duration, 'Sine.easeInOut');
      this._cameraRestoreCompletionTimer = this.time.delayedCall(duration + 20, () => {
        if (generation !== (this._localCameraGeneration ?? 0) || this.shotCameraAnchor !== anchor) return;
        this.shotCameraAnchor = undefined;
        this._cameraRestoreCompletionTimer = undefined;
      });
    });
  };

  prototype.cleanup = function (...args) {
    this._localCameraGeneration = (this._localCameraGeneration ?? 0) + 1;
    this._cameraRestoreCompletionTimer?.remove(false);
    this._cameraRestoreCompletionTimer = undefined;
    return original.cleanup.apply(this, args);
  };

  function message(scene, text, x, y, color = '#9ff0dc') {
    if (!scene.add?.text) return;
    const label = scene.add.text(x, y, text, {
      fontFamily: 'Trebuchet MS, Apple SD Gothic Neo, sans-serif',
      fontStyle: 'bold', fontSize: scene.mobile ? '25px' : '19px',
      color, stroke: '#0d2029', strokeThickness: 4,
    }).setOrigin(.5).setDepth(930);
    scene.tweens.add({ targets: label, y: y - 44, alpha: 0, duration: 1100,
      ease: 'Cubic.easeOut', onComplete: () => label.destroy() });
  }

  prototype.createWorld = function () {
    original.createWorld.call(this);
    if (!localOnly(this)) return;
    this.world.options.suddenDeath = true;
    this._localShotPending = false;
    this._localWater = null;
    for (const unit of this.world.units) {
      unit.combatClass = tankDefinition(this.tankForUnit.get(unit.id)).class;
    }
  };

  prototype.createWater = function () {
    original.createWater.call(this);
    if (localOnly(this)) this._localWater = this.add.graphics().setDepth(9);
  };

  prototype.availableWeatherItems = function (unitId) {
    if (!localOnly(this)) return original.availableWeatherItems.call(this, unitId);
    return (this.localItems.get(unitId) ?? []).filter(id => itemIds.includes(id));
  };

  prototype.updateItemControls = function (unitId) {
    if (!localOnly(this)) return original.updateItemControls.call(this, unitId);
    const descriptions = {
      'dual-shot': '추가 발사', teleport: '탄착점으로 이동',
      'repair-kit': 'HP +150 · 턴 종료', 'movement-lock': '2턴 이동봉인',
      'power-up': '위력 +30%', 'weather-shield': '이번 발사', 'clear-sky': '2턴 맑음',
    };
    this.controls.setItems(this.availableWeatherItems(unitId).map(id => ({
      id, label: `${itemLabels[id]} · ${descriptions[id]}`,
    })));
  };

  prototype.selectWeapon = function (slot) {
    if (localOnly(this) && this.activeId && !this.world.canUseWeapon(this.activeId, weapon(this, slot))) {
      audio.playSfx('ui_click', .35);
      const unit = this.world.units.find(candidate => candidate.id === this.activeId);
      if (unit) message(this, '특수탄 사용 횟수를 모두 소진했습니다', toPixels(unit.x), toPixels(unit.y) - 75, '#ffd16d');
      return;
    }
    return original.selectWeapon.call(this, slot);
  };

  prototype.cycleWeapon = function () {
    if (!localOnly(this)) return original.cycleWeapon.call(this);
    const definitions = runtime.roster[this.tankForUnit.get(this.activeId)]?.weapons ?? [];
    for (let offset = 1; offset <= definitions.length; offset++) {
      const candidate = definitions[(this.selectedWeaponIndex + offset) % definitions.length];
      if (this.world.canUseWeapon(this.activeId, weapon(this, candidate.slot))) {
        this.selectWeapon(candidate.slot);
        return;
      }
    }
  };

  prototype.runLocalAiTurn = function (actor) {
    if (!localOnly(this)) return original.runLocalAiTurn.call(this, actor);
    if (!this.matchData.aiDifficulty || this.phase !== 'ai-aim' || !actor.alive || this.activeId !== actor.id) return;
    const tank = tankDefinition(this.tankForUnit.get(actor.id));
    // The original aiming solver models ballistic flight. Support actions are
    // handled deliberately rather than being scored as imaginary damage.
    const definitions = Object.values(tank.weapons)
      .filter(definition => this.world.canUseWeapon(actor.id, definition))
      .filter(definition => !['shield_grant', 'fortress_mode'].includes(definition.type))
      .map(definition => ({ ...definition, damage: Math.round(definition.damage * tank.attackScalePermille / 1000) }));
    const decision = decideAi({
      world: this.world, actorId: actor.id, difficulty: this.matchData.aiDifficulty,
      seed: aiSeed(this.matchData.seed, actor.id, this.world.turn), weapons: definitions,
    });
    this.presentAiDecision(actor, decision);
  };

  prototype.fireActiveUnit = function () {
    if (!localOnly(this)) return original.fireActiveUnit.call(this);
    const actor = this.world.units.find(unit => unit.id === this.activeId);
    if (!actor?.alive || this.phase !== 'aim') return;
    const definition = weapon(this);
    if (!this.world.canUseWeapon(actor.id, definition)) {
      this.charging = false;
      this.power = 0;
      audio.stopGameplayLoops();
      this.selectWeapon('shot1');
      return;
    }
    this.phase = 'flight';
    this.charging = false;
    this.controls.setInteractive(false);
    audio.stopGameplayLoops();
    this.shotBefore = new Map(this.world.units.map(unit => [unit.id, {
      hp: unit.hp, alive: unit.alive, y: toIntegerPixels(unit.y),
    }]));
    const beforeTerrain = this.world.terrain.data.slice();
    const item = this.selectedItem;
    const effectiveItem = item && this.availableWeatherItems(actor.id).includes(item) ? item : null;
    if (effectiveItem) this.consumeLocalItem(actor.id, effectiveItem);
    let result;
    if (effectiveItem === 'repair-kit') {
      const healed = Math.min(150, actor.maxHp - actor.hp);
      actor.hp += healed;
      result = { trajectories: [], impacts: [], damageEvents: [], effects: [
        { type: 'repair', x: toIntegerPixels(actor.x), y: toIntegerPixels(actor.y), value: healed },
      ], applied: { blastRadius: 0 } };
      actor.delay += actor.stats.baseDelay + 50;
      this.world.lastActingTeam = actor.team;
      this.world.turn += 1;
      this.world.resolvePersistentEffects(result.trajectories, result.impacts, result.damageEvents, result.effects);
      this.world.resolveSuddenDeath(result.trajectories, result.impacts, result.damageEvents, result.effects);
    } else {
      if (effectiveItem === 'clear-sky') this.world.activateClearSky(2);
      result = this.world.fireWeapon(actor.id, {
        angleDegrees: this.angles.get(actor.id), power: Math.max(8, Math.round(this.power)),
        facing: this.facing.get(actor.id), ignoreWeather: effectiveItem === 'weather-shield',
        extraShots: effectiveItem === 'dual-shot' ? 1 : 0,
      }, { ...definition, damage: effectiveItem === 'power-up' ? Math.floor(definition.damage * 1.3) : definition.damage });
      if (effectiveItem) actor.delay += 50;
      if (effectiveItem === 'teleport') {
        const impact = result.impacts[0] ?? result.trajectories[0]?.impact;
        if (impact) this.world.teleportUnit(actor.id, impact.x);
      }
      if (effectiveItem === 'movement-lock') {
        for (const event of result.damageEvents) {
          const target = this.world.units.find(unit => unit.id === event.targetUnitId);
          if (target?.alive && target.id !== actor.id) target.immobileUntilTurn = Math.max(target.immobileUntilTurn ?? 0, this.world.turn + 2);
        }
      }
      runtime.playFireSound(this.tankForUnit.get(actor.id), this.currentWeaponSlot());
      this.playBodyAnimation(actor.id, 'fire');
    }
    this.refreshWeatherPresentation(true);
    this._localShotPending = true;
    const projectiles = result.trajectories ?? [];
    let index = 0;
    const presentNext = () => {
      const trajectory = projectiles[index++];
      if (!trajectory) {
        for (const difference of terrainDiffs(beforeTerrain, this.world, result.impacts ?? [])) this.eraseTerrainRect(difference);
        this.resolveLocalWeaponResult(result);
        return;
      }
      this.animateProjectile(this.tankForUnit.get(actor.id), definition.slot,
        trajectory.path, trajectory.impact, trajectory.radius, () => {
          if (trajectory.impact && !['shield_grant', 'fortress_mode', 'ram'].includes(definition.type)) {
            this.showOnlineExplosion(trajectory.impact, trajectory.radius);
          }
          this.time.delayedCall(index < projectiles.length ? 160 : 0, presentNext);
        });
    };
    presentNext();
  };

  prototype.resolveLocalWeaponResult = function (result) {
    const labels = {
      shield: '실드 +', fortress: '요새 모드', poison: '독 피해 ',
      fire_zone: '화염 ', emp: 'EMP', knockback: '넉백', mine_placed: '기뢰 설치',
      repair: '수리 +', sudden_death: '서든 데스', water_rise: '수위 상승',
    };
    for (const effect of result.effects ?? []) {
      if (labels[effect.type]) message(this, `${labels[effect.type]}${effect.type === 'repair' || effect.type === 'poison' ? effect.value : ''}`,
        effect.x, Math.max(130, effect.y - 60), effect.type === 'repair' ? '#91f1b3' : '#d3b4ff');
    }
    if (this._localWater && this.world.waterLineY < 900) {
      this._localWater.clear().fillStyle(parseInt(this.map.surface.water.slice(1), 16), .6)
        .fillRect(0, this.world.waterLineY, 1600, 900 - this.world.waterLineY)
        .lineStyle(3, parseInt(this.map.surface.highlight.slice(1), 16), .8)
        .lineBetween(0, this.world.waterLineY, 1600, this.world.waterLineY);
    }
    for (const unit of this.world.units) {
      const before = this.shotBefore.get(unit.id);
      if (!before || unit.hp >= before.hp) continue;
      this.showDamageFeedback(unit, before.hp - unit.hp);
      if (before.alive && !unit.alive) audio.playSfx(toIntegerPixels(unit.y) >= this.world.waterLineY ? 'splash_fall' : 'tank_destroy');
      else { audio.playSfx('tank_hit', .78); this.playBodyAnimation(unit.id, 'hit'); }
    }
    this.syncUnits(true);
    this.redrawHud();
    this.syncCameraLayers();
    const alive = this.world.units.filter(unit => unit.alive);
    this.time.delayedCall(760, () => {
      this._localShotPending = false;
      if (this.phase === 'ended') return;
      if (alive.length <= 1) this.finishMatch(alive[0]);
      else this.beginTurn();
    });
  };

  prototype.beginTurn = function () {
    if (localOnly(this)) {
      const alive = this.world.units.filter(unit => unit.alive);
      if (alive.length <= 1) return this.finishMatch(alive[0]);
    }
    return original.beginTurn.call(this);
  };

  prototype.update = function (...args) {
    const result = original.update.apply(this, args);
    if (localOnly(this) && ['aim', 'ai-aim'].includes(this.phase) && !this._localShotPending) {
      const alive = this.world.units.filter(unit => unit.alive);
      if (alive.length <= 1) this.finishMatch(alive[0]);
    }
    return result;
  };

  prototype.redrawHud = function () {
    original.redrawHud.call(this);
    if (!localOnly(this) || !this.activeId || !this.weaponText) return;
    const definition = weapon(this);
    const remaining = this.world.weaponUsesRemaining(this.activeId, definition);
    if (remaining !== null) this.weaponText.setText(`${this.weaponText.text}   남은 특수탄 ${remaining}`);
  };
}
