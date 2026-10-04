import test from 'node:test';
import assert from 'node:assert/strict';
import { createProfile, sanitizeProfile, isUnlocked, completeMission, purchaseUpgrade, safeRead, safeWrite } from '../src/storage.js';
import { MISSIONS, TANKS, UPGRADES } from '../src/data.js';

const ids = MISSIONS.map(m => m.id);
const tankIds = TANKS.map(t => t.id);
const sanitize = value => sanitizeProfile(value, ids, tankIds);

test('corrupt or incompatible saves are rejected without altering a fresh profile', () => {
  for (const input of [null, undefined, false, [], 'save', 2, {}, {version:1}, {version:'2'}, {version:3}]) {
    assert.throws(() => sanitize(input), /진행 기록/);
  }
  const a = createProfile(), b = createProfile();
  a.upgrades.hull = 3;
  a.missions[ids[0]] = 2;
  assert.deepEqual(b, {version:2,credits:0,tank:'bastion',missions:{},upgrades:{hull:0,attack:0,fuel:0}});
});

test('untrusted imported saves keep only game-owned tanks, upgrades and mission IDs', () => {
  const input = JSON.parse(`{"version":2,"credits":"348.9","tank":"<img src=x onerror=alert(1)>","upgrades":{"hull":99,"attack":-2,"fuel":"3.8","admin":100},"missions":{"${ids[0]}":12,"${ids[1]}":"2.9","${ids[2]}":-1,"unknown":3,"__proto__":{"polluted":true}},"debug":true}`);
  const p = sanitize(input);
  assert.deepEqual(p, {version:2,credits:348,tank:'bastion',missions:{[ids[0]]:3,[ids[1]]:2},upgrades:{hull:5,attack:0,fuel:3}});
  assert.equal({}.polluted,undefined);
  assert.equal(input.upgrades.hull,99,'Import sanitization does not mutate the source');
  assert.equal(sanitize({...createProfile(),tank:'arc'}).tank,'arc');
  const inherited = Object.create({[ids[0]]:3});
  assert.deepEqual(sanitize({...createProfile(),missions:inherited}).missions,{});
});

test('credits never import negative or non-finite values and upgrades remain 0 through 5', () => {
  for (const value of [-1,-999,NaN,Infinity,-Infinity,'NaN','Infinity',null,true,{},[100]]) {
    const p = sanitize({...createProfile(),credits:value,upgrades:{hull:value,attack:value,fuel:value}});
    assert.equal(p.credits,0,String(value));
    assert.deepEqual(p.upgrades,{hull:0,attack:0,fuel:0});
  }
  assert.equal(sanitize({...createProfile(),credits:10000000}).credits,100000);
  assert.deepEqual(sanitize({...createProfile(),upgrades:{hull:100,attack:5.9,fuel:'6'}}).upgrades,{hull:5,attack:5,fuel:5});
});

test('campaign unlocks in order and rejects indexes or forged gaps', () => {
  const p = createProfile();
  assert.deepEqual(MISSIONS.map((_,i)=>isUnlocked(p,MISSIONS,i)),[true,false,false,false,false,false,false,false,false]);
  for (let i=0;i<MISSIONS.length;i++) {
    assert.equal(isUnlocked(p,MISSIONS,i),true);
    completeMission(p,MISSIONS[i],{won:true,stars:1});
    if(i+1<MISSIONS.length) assert.equal(isUnlocked(p,MISSIONS,i+1),true);
    if(i+2<MISSIONS.length) assert.equal(isUnlocked(p,MISSIONS,i+2),false);
  }
  for(const index of [-1,9,Infinity,NaN,.5,'0']) assert.equal(isUnlocked(p,MISSIONS,index),false);
  assert.equal(isUnlocked(p,[],0),false);
  const forged = createProfile();
  forged.missions[ids[5]]=3;
  assert.equal(isUnlocked(forged,MISSIONS,6),false);
});

test('mission loss does not grant credits, stars or progression', () => {
  const p = createProfile();
  assert.equal(completeMission(p,MISSIONS[0],{won:false,stars:3}),0);
  assert.deepEqual(p,createProfile());
});

test('first completion pays once and replaying lower or equal stars never duplicates a reward', () => {
  const p = createProfile(), mission = MISSIONS[0];
  assert.equal(completeMission(p,mission,{won:true,stars:2}),mission.reward+70);
  const earned = p.credits;
  for(const stars of [2,1,2,0]) assert.equal(completeMission(p,mission,{won:true,stars}),0);
  assert.equal(p.credits,earned);
  assert.equal(p.missions[mission.id],2);
});

test('improving a record pays only newly earned stars and caps records at three', () => {
  const p = createProfile(), mission = MISSIONS[0];
  assert.equal(completeMission(p,mission,{won:true,stars:1}),mission.reward+35);
  assert.equal(completeMission(p,mission,{won:true,stars:2}),35);
  assert.equal(completeMission(p,mission,{won:true,stars:99}),35);
  assert.equal(completeMission(p,mission,{won:true,stars:3}),0);
  assert.equal(p.credits,mission.reward+105);
  assert.equal(p.missions[mission.id],3);
});

test('upgrades require enough credit, debit exactly once, and stop at maximum level', () => {
  const p = createProfile(), u = UPGRADES.hull;
  p.credits = u.costs[0]-1;
  const before = structuredClone(p);
  assert.equal(purchaseUpgrade(p,'hull',u),false);
  assert.deepEqual(p,before);
  p.credits = u.costs.reduce((a,b)=>a+b,0);
  for(let level=0;level<5;level++) {
    const previous = p.credits;
    assert.equal(purchaseUpgrade(p,'hull',u),true);
    assert.equal(p.upgrades.hull,level+1);
    assert.equal(p.credits,previous-u.costs[level]);
    assert.ok(p.credits>=0);
  }
  assert.equal(p.credits,0);
  p.credits=9999;
  const maxed=structuredClone(p);
  assert.equal(purchaseUpgrade(p,'hull',u),false);
  assert.deepEqual(p,maxed);
});

test('unknown upgrades or invalid prices cannot grant currency or mutate progression', () => {
  const p = createProfile();p.credits=200;
  const before=structuredClone(p);
  for(const [key,definition] of [['unknown',UPGRADES.hull],['hull',undefined],['hull',{max:5,costs:[-140]}],['hull',{max:5,costs:[NaN]}],['hull',{max:5,costs:[Infinity]}]]) {
    assert.equal(purchaseUpgrade(p,key,definition),false);
    assert.deepEqual(p,before);
  }
});

test('blocked browser storage is a safe read/write failure', () => {
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new Error('Blocked by browser policy')}});
  try { assert.equal(safeRead('save'),null);assert.equal(safeWrite('save',createProfile()),false); }
  finally { if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else delete globalThis.localStorage; }
});
