import test from 'node:test';
import assert from 'node:assert/strict';
import {tankFeedback} from '../src/battle.js';
test('recoil mirrors direction, hit rocks and decays without moving collision coordinates',()=>{const actor={x:205,y:400,facing:1,recoil:1,recoilPower:1,hitAge:1};const right=tankFeedback(actor);assert.ok(right.x<0);assert.ok(tankFeedback({...actor,facing:-1}).x>0);assert.deepEqual([actor.x,actor.y],[205,400]);const hit=tankFeedback({...actor,recoil:0,hitAge:.035,hitPower:1,hitDirection:-1});assert.ok(Math.abs(hit.roll)>0);assert.ok(Math.abs(hit.x)>0);const settled=tankFeedback({...actor,recoil:0,hitAge:1,hitPower:1});assert.ok(Math.abs(settled.x)<.01);assert.deepEqual(tankFeedback({...actor,hitPower:1,hitAge:0},true),{x:0,y:0,roll:0});});
