import {loadPlaywright,findChromium} from './browser-runtime.mjs';
import {mkdir} from 'node:fs/promises';
const {chromium}=await loadPlaywright();
await mkdir('research',{recursive:true});
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:await findChromium(),headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(process.env.BASE_URL||'http://localhost:4173'); await page.click('#deploy-button');
await page.waitForTimeout(1500);
for(const [w,h] of [[390,844],[844,390],[360,640],[667,375]]){
 await page.setViewportSize({width:w,height:h});await page.waitForTimeout(300);
 const layout=await page.evaluate(()=>{let ids=['.battle-board','.battle-controls','.abilities','#fire-button','#angle','#power'];return {rects:ids.map(s=>{let r=document.querySelector(s).getBoundingClientRect();return {s,x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}}),scale:FortressAfterlight.battle.scale,zoom:FortressAfterlight.battle.mobileZoom,scroll:document.documentElement.scrollWidth>innerWidth}});
 assert.equal(layout.scroll,false);for(const r of layout.rects){assert.ok(r.x>=0&&r.right<=w+1&&r.y>=0&&r.bottom<=h+1,JSON.stringify(r));}
 if(w<h){assert.ok(layout.zoom);assert.ok(layout.rects[0].h>=h-260);await page.click('#view-toggle');assert.equal(await page.evaluate(()=>FortressAfterlight.battle.mobileZoom),false);await page.click('#view-toggle');}
 for(const selector of ['#angle','#power','[data-ability=shield]','[data-weapon=shell]','#move-left']){const reachable=await page.locator(selector).evaluate(el=>{let r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))});assert.ok(reachable,selector+' is not covered');}
 const hit=await page.locator('#fire-button').evaluate(el=>{let r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('#fire-button')===el});assert.ok(hit);
 await page.screenshot({path:`research/mobile-${w}.png`}); console.log(w,h,JSON.stringify(layout));
}
await page.setViewportSize({width:390,height:844});await page.click('#fire-button');await page.waitForFunction(()=>FortressAfterlight.battle.craters.length>0,{}, {timeout:25000});assert.deepEqual(errors,[]);await browser.close();console.log('Mobile layout, reachable touch controls, overview toggle, and real firing passed');
