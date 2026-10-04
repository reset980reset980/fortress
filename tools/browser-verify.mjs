import {loadPlaywright,findChromium} from './browser-runtime.mjs';
const {chromium}=await loadPlaywright();
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:await findChromium(),headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--enable-unsafe-swiftshader']});
const report={checks:[],consoleErrors:[],pageErrors:[],requestsFailed:[]};
const context=await browser.newContext({viewport:{width:1440,height:1100}});
const page=await context.newPage();
page.on('pageerror',e=>report.pageErrors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text())});page.on('requestfailed',r=>report.requestsFailed.push(r.url()));
const base=process.env.BASE_URL||'http://localhost:4173';
try{
 await page.goto(base);await page.locator('#deploy-button').waitFor();
 assert.equal(await page.locator('[data-mission][disabled]').count(),8);report.checks.push('Fresh profile locks 8 missions');
 await page.screenshot({path:'research/menu-desktop.png',fullPage:true});
 await page.click('[data-page="hangar"]');await page.click('[data-select-tank="warden"]');assert.equal(await page.evaluate(()=>FortressAfterlight.profile.tank),'warden');report.checks.push('Tank selection saved');
 await page.screenshot({path:'research/hangar-desktop.png'});
 await page.click('[data-page="campaign"]');await page.click('#deploy-button');await page.waitForFunction(()=>FortressAfterlight.battle&&FortressAfterlight.audio.context?.state==='running');
 assert.equal(await page.evaluate(()=>FortressAfterlight.state.playerMaxHp),285);assert.equal(await page.evaluate(()=>FortressAfterlight.effects.supported),true);report.checks.push('Selected tank and WebGL/audio run in browser');
 await page.click('[data-ability="scan"]');assert.equal(await page.evaluate(()=>FortressAfterlight.state.abilities.scan),0);
 await page.keyboard.down('ArrowRight');await page.waitForTimeout(500);await page.keyboard.up('ArrowRight');assert.ok(await page.evaluate(()=>FortressAfterlight.state.fuel<85));report.checks.push('Keyboard movement consumes fuel');
 await page.click('#pause-button');const elapsed=await page.evaluate(()=>FortressAfterlight.battle.elapsed);await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>FortressAfterlight.battle.elapsed),elapsed);await page.click('#resume-button');report.checks.push('Pause freezes simulation');
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.ok(await page.evaluate(()=>Math.abs(FortressAfterlight.battle.canvas.width/Math.min(devicePixelRatio,2)-document.querySelector('#battle-canvas').getBoundingClientRect().width)<2));await page.waitForFunction(()=>FortressAfterlight.battle.environment?.ready||FortressAfterlight.battle.environment?.fallbackReason==='slow-renderer');assert.ok(await page.evaluate(()=>FortressAfterlight.battle.environment.canvas.width<=640||FortressAfterlight.battle.environment.fallbackReason==='slow-renderer'));
 await page.screenshot({path:'research/battle-mobile.png',fullPage:true});report.checks.push('Portrait390px fits and resizes backing canvas');
 // Plan a legitimate shot using the same deterministic ballistic helper; actual UI fires it.
 for(let turn=0;turn<6;turn++){
  await page.waitForFunction(()=>FortressAfterlight.state.phase==='aim'||FortressAfterlight.state.phase==='ended',{},{timeout:25000});
  if(await page.evaluate(()=>FortressAfterlight.state.phase==='ended'))break;
  await page.evaluate(async()=>{const {simulateShot}=await import('/src/battle.js');const b=FortressAfterlight.battle,e=b.enemies.find(e=>e.hp>0);if(b.player.hp<b.player.maxHp*.7)b.useAbility('repair');if(b.round===1)b.useAbility('shield');let best={score:Infinity};for(let a=24;a<78;a+=1)for(let p=35;p<=100;p+=1){const hit=simulateShot({x:b.player.x,y:b.player.y-9,angle:a,power:p,wind:b.wind,terrain:b.terrain});const score=Math.abs(hit.x-e.x)+Math.abs(hit.y-e.y)*.1;if(score<best.score)best={a,p,score}}b.setWeapon(b.ammo.arc>0?'arc':'shell');b.setAngle(best.a);b.setPower(best.p)});
  await page.click('#fire-button');assert.equal(await page.locator('#fire-button').isDisabled(),true);
 }
 await page.locator('#result-dialog[open]').waitFor({timeout:25000});const result=await page.evaluate(()=>({state:FortressAfterlight.state,profile:FortressAfterlight.profile}));assert.ok(result.profile.missions['shore-01']>=1);assert.ok(result.profile.credits>=180);report.checks.push('Actual battle victory awards credits and unlocks next mission');
 await page.screenshot({path:'research/victory-mobile.png'});
 await page.click('#result-home');assert.equal(await page.locator('[data-mission="1"]').isDisabled(),false);
 await page.reload();assert.equal(await page.locator('[data-mission="1"]').isDisabled(),false);report.checks.push('Progress survives reload');
 await page.screenshot({path:'research/menu-mobile.png',fullPage:true});
 await page.setViewportSize({width:844,height:390});await page.click('#deploy-button');await page.screenshot({path:'research/battle-landscape.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);report.checks.push('Mobile landscape844px fits');
 await page.click('#pause-button');await page.click('#exit-button');await page.click('#settings-button');await page.check('#mute-toggle');assert.equal(await page.evaluate(()=>FortressAfterlight.audio.muted),true);report.checks.push('Mute setting applies and saves');
 await page.click('[data-close="settings-dialog"]');await page.reload();assert.equal(await page.evaluate(()=>FortressAfterlight.audio.muted),true);report.checks.push('Mute persists after reload');
 assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.requestsFailed,[]);assert.deepEqual(report.consoleErrors,[]);report.passed=true;
}finally{await writeFile('research/browser-verification.json',JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify(report,null,2))}
