import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {TANKS,MISSIONS,BATTLE_MAPS} from '../src/data.js';
import {createProfile,sanitizeProfile,collectTank,recordMastery} from '../src/storage.js';
import {evolutionStage} from '../src/evolution.js';
test('all 72 authored models and 24 packed GLBs/previews exist and are distinct',()=>{
 assert.equal(TANKS.length,12);assert.equal(MISSIONS.length,18);assert.equal(BATTLE_MAPS.length,24);
 const hashes=[];for(const t of TANKS)for(let stage=0;stage<6;stage++){const data=readFileSync(new URL(`../sprites/evolution/${t.id}-${stage}-v2.png`,import.meta.url));assert.ok(data.length>10000);hashes.push(createHash('sha256').update(data).digest('hex'));}assert.equal(new Set(hashes).size,72);
 const scenes=[];for(const m of BATTLE_MAPS){const glb=readFileSync(new URL(`../assets/environments/${m.map}-v1.glb`,import.meta.url));assert.equal(glb.toString('ascii',0,4),'glTF');scenes.push(createHash('sha256').update(glb).digest('hex'));assert.ok(readFileSync(new URL(`../assets/environments/${m.map}-v1.png`,import.meta.url)).length>10000);}assert.equal(new Set(scenes).size,24);
});
test('collection debits once, mastery rewards five wins and survives sanitized reload',()=>{
 const p=createProfile();p.credits=1000;assert.equal(collectTank(p,'mortar',4),true);assert.equal(p.credits,700);assert.equal(collectTank(p,'mortar',4),false);assert.equal(collectTank(p,'forged',5),false);p.tank='mortar';for(let i=0;i<4;i++)assert.equal(recordMastery(p,'mortar'),0);assert.equal(recordMastery(p,'mortar'),150);assert.equal(p.credits,850);const loaded=sanitizeProfile(p,MISSIONS.map(m=>m.id));assert.deepEqual(loaded,p);
});
test('combined growth uses milestones while legacy model progression is preserved',()=>{
 assert.equal(evolutionStage({hull:5}),1);assert.equal(evolutionStage({hull:5,attack:1}),2);assert.equal(evolutionStage({hull:5,attack:5,fuel:5,shield:5,repair:5}),5);
 const legacy=sanitizeProfile({version:2,credits:42,tank:'warden',missions:{},upgrades:{hull:5}});assert.equal(legacy.visualFloor,5);assert.equal(legacy.credits,42);assert.equal(evolutionStage({...legacy.upgrades,__floor:legacy.visualFloor}),5);
});
