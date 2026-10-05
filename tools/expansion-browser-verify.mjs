import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {loadPlaywright,findChromium} from './browser-runtime.mjs';
const {chromium}=await loadPlaywright();
const browser=await chromium.launch({executablePath:await findChromium(),headless:true,args:['--enable-unsafe-swiftshader',...(process.env.PRODUCTION_LAN?['--host-resolver-rules=MAP fortress.xsw.kr 192.168.68.106']:[])]});
const report={passed:false,errors:[],maps:[],tanks:[],viewports:[]};
try{
 const context=await browser.newContext({viewport:{width:1280,height:800}});const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.addInitScript(()=>{if(!localStorage.getItem('fortress-afterlight-v2'))localStorage.setItem('fortress-afterlight-v2',JSON.stringify({version:2,credits:30000,tank:'bastion',missions:{},upgrades:{hull:4,attack:4,ammo:4,shield:4,repair:4,fuel:4}}));});
 await page.goto(process.env.BASE_URL||'http://localhost:4173');await page.waitForFunction(()=>window.FortressAfterlight);
 await page.locator('[data-page="hangar"]').click();assert.equal(await page.locator('[data-select-tank]').count(),12);
 for(const id of ['mortar','mole','hive','venom','glacier','bolt','ricochet','solar']){await page.locator(`[data-select-tank="${id}"]`).click();assert.equal(await page.evaluate(()=>FortressAfterlight.profile.tank),id);}
 const owned=await page.evaluate(()=>({...FortressAfterlight.profile}));assert.equal(owned.collection.length,12);await page.reload();assert.equal(await page.evaluate(()=>FortressAfterlight.profile.collection.length),12);
 await page.locator('[data-page="duel"]').click();assert.equal(await page.locator('[data-duel-map]').count(),24);
 const maps=await page.locator('[data-duel-map]').evaluateAll(bs=>bs.map(b=>({index:b.dataset.duelMap,name:b.textContent})));
 const tanks=await page.locator('[data-duel-player]').evaluateAll(bs=>bs.map(b=>b.dataset.duelPlayer));
 for(let i=0;i<maps.length;i++){
  await page.locator(`[data-duel-map="${i}"]`).click();await page.locator(`[data-duel-player="${tanks[i%12]}"]`).click();await page.locator('#duel-start').click();
  await page.waitForFunction(()=>FortressAfterlight.battle?.environment?.ready||FortressAfterlight.battle?.environment?.fallbackReason==='slow-renderer',null,{timeout:30000});
  const scene=await page.evaluate(()=>{const b=FortressAfterlight.battle;return {map:b.mission.map,loaded:b.environment.map,stats:b.environment.stats,platforms:b.platforms.length,tank:b.player.type,labels:b.getSnapshot().weaponLabels};});assert.equal(scene.loaded,scene.map);assert.equal(scene.stats.error,null);report.maps.push(scene);
  if(i>=12)await page.screenshot({path:`research/expanded-${scene.map}.png`});
  await page.evaluate(()=>{const b=FortressAfterlight.battle;b.setAngle(18);b.setPower(30);b.useAbility('signature');b.fire();});
  await page.waitForFunction(()=>FortressAfterlight.battle.craters.length>0||FortressAfterlight.battle.phase!=='projectile',null,{timeout:15000});
  const fired=await page.evaluate(()=>({tank:FortressAfterlight.battle.player.type,craters:FortressAfterlight.battle.craters.length,phase:FortressAfterlight.battle.phase}));report.tanks.push(fired);
  await page.locator('#pause-button').click();await page.locator('#exit-button').click();console.log(`Verified ${i+1}/24: ${scene.map}, ${scene.tank}`);
 }
 for(const size of [{width:390,height:844},{width:844,height:390}]){await page.setViewportSize(size);await page.locator('[data-page="hangar"]').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:`research/expansion-hangar-${size.width}.png`});await page.locator('[data-page="duel"]').click();await page.locator('[data-duel-map="22"]').click();await page.locator('#duel-start').click();await page.waitForTimeout(1200);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:`research/expansion-mobile-${size.width}.png`});report.viewports.push(size);await page.locator('#pause-button').click();await page.locator('#exit-button').click();}
 assert.deepEqual(report.errors,[]);report.passed=true;
}finally{await writeFile('research/expansion-browser-verification.json',JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify({passed:report.passed,maps:report.maps.length,tanks:new Set(report.tanks.map(t=>t.tank)).size,errors:report.errors}));}
