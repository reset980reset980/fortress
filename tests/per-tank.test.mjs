import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfile,sanitizeProfile,purchaseUpgrade,tankProgress} from '../src/storage.js';
import {UPGRADES} from '../src/data.js';
test('purchases, models and reload keep every tank independent',()=>{
 const p=createProfile();p.credits=10000;
 assert.equal(purchaseUpgrade(p,'hull',UPGRADES.hull),true);
 const remaining=p.credits;p.tank='warden';
 assert.equal(p.upgrades.hull,0);assert.equal(p.visualFloor,0);
 assert.equal(purchaseUpgrade(p,'attack',UPGRADES.attack),true);
 assert.ok(p.credits<remaining);assert.equal(p.upgrades.hull,0);
 const loaded=sanitizeProfile(JSON.parse(JSON.stringify(p)));
 assert.equal(loaded.upgrades.attack,1);assert.equal(loaded.upgrades.hull,0);
 loaded.tank='bastion';assert.equal(loaded.upgrades.hull,1);assert.equal(loaded.upgrades.attack,0);
 assert.notEqual(tankProgress(loaded,'bastion').upgrades,tankProgress(loaded,'warden').upgrades);
});
test('old shared growth migrates only to selected owned tank without losing currency or records',()=>{
 const old={version:2,tank:'warden',credits:410890,missions:{one:2},upgrades:{hull:5,attack:3},visualFloor:5};
 const p=sanitizeProfile(old,['one']);assert.equal(p.credits,410890);assert.equal(p.missions.one,2);
 assert.equal(p.upgrades.hull,5);assert.equal(p.visualFloor,5);
 p.tank='arc';assert.equal(p.upgrades.hull,0);assert.equal(p.visualFloor,0);
 const loaded=sanitizeProfile(JSON.parse(JSON.stringify(p)),['one']);
 loaded.tank='warden';assert.equal(loaded.upgrades.hull,5);assert.equal(loaded.visualFloor,5);
 assert.equal(old.upgrades.hull,5);
});
test('per-tank imports ignore forged tanks and legacy alias cannot overwrite another tank',()=>{
 const p=sanitizeProfile({version:2,tank:'arc',upgrades:{hull:5},tankProgress:{arc:{upgrades:{attack:99},visualFloor:99},forged:{upgrades:{hull:5}}}});
 assert.equal(p.upgrades.hull,0);assert.equal(p.upgrades.attack,5);assert.equal(p.visualFloor,5);
 assert.equal(Object.hasOwn(p.tankProgress,'forged'),false);
});
