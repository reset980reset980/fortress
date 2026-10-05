import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfile} from '../src/storage.js';
import {mergeGuest} from '../src/accounts.js';
test('guest migration retains administrator wallet and independent growth without double awarding points',()=>{
 const a=createProfile(),b=createProfile();a.credits=1000000;a.upgrades.attack=2;a.missions['shore-01']=3;
 b.tank='warden';b.credits=410890;b.upgrades.hull=5;b.visualFloor=5;b.missions['shore-02']=2;
 const merged=mergeGuest(a,b);
 assert.equal(merged.credits,1000000);assert.equal(merged.tank,'warden');assert.equal(merged.upgrades.hull,5);
 assert.equal(merged.tankProgress.bastion.upgrades.attack,2);assert.equal(merged.tankProgress.arc.upgrades.hull,0);
 assert.equal(merged.missions['shore-01'],3);assert.equal(merged.missions['shore-02'],2);
 assert.deepEqual(mergeGuest(merged,b),merged);assert.equal(a.credits,1000000);assert.equal(a.tank,'bastion');
});
