import {loadPlaywright,findChromium} from './browser-runtime.mjs';
import assert from 'node:assert/strict';
const {chromium}=await loadPlaywright();
const browser=await chromium.launch({executablePath:await findChromium(),headless:true,args:process.env.PRODUCTION_LAN?['--host-resolver-rules=MAP fortress.xsw.kr 192.168.68.106']:[]});
try {
const page=await browser.newPage({viewport:{width:390,height:844}}); const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(process.env.BASE_URL||'http://localhost:4173');await page.waitForFunction(()=>window.FortressAfterlight);
const before=await page.evaluate(()=>JSON.parse(JSON.stringify(window.FortressAfterlight.profile)));
await page.locator('[data-page="hangar"]').click(); await page.locator('#settings-button').click();await page.locator('#test-points').click();await page.locator('#test-points').click();
assert.equal(await page.evaluate(()=>window.FortressAfterlight.profile.credits),before.credits+20000);
await page.locator('[data-close="settings-dialog"]').click();assert.equal(await page.locator('[data-upgrade="hull"]').isEnabled(),true);await page.locator('[data-upgrade="hull"]').click();
const after=await page.evaluate(()=>JSON.parse(JSON.stringify(window.FortressAfterlight.profile)));assert.equal(after.upgrades.hull,before.upgrades.hull+1);assert.deepEqual(after.missions,before.missions);assert.equal(after.tank,before.tank);
await page.reload();await page.waitForFunction(()=>window.FortressAfterlight);assert.deepEqual(await page.evaluate(()=>JSON.parse(JSON.stringify(window.FortressAfterlight.profile))),after);assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,credits:after.credits,hull:after.upgrades.hull,persisted:true,url:page.url()}));
}finally{await browser.close()}
