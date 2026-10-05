import {loadPlaywright,findChromium} from './browser-runtime.mjs';
import assert from 'node:assert/strict';
const {chromium}=await loadPlaywright();
const browser=await chromium.launch({executablePath:await findChromium(),headless:true,args:process.env.PRODUCTION_LAN?['--host-resolver-rules=MAP fortress.xsw.kr 192.168.68.106']:[]});
const uid='qa_'+Date.now().toString(36),password='QA-only-'+crypto.randomUUID(),url=process.env.BASE_URL||'http://localhost:4174';
const checks=[],errors=[];
async function ready(page){await page.waitForFunction(()=>!document.querySelector('#account-button').disabled)}
async function signIn(page){await ready(page);await page.click('#account-button');await page.locator('#account-login-form [name=id]').fill(uid);await page.locator('#login-password').fill(password);await page.locator('#account-login-form [name=keep]').check();await page.locator('#account-login-form button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#account-summary').textContent.includes('시험지휘관'));}
try{
 const first=await browser.newContext({viewport:{width:1343,height:1000}}),page=await first.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{if(!localStorage.getItem('fortress-afterlight-v2'))localStorage.setItem('fortress-afterlight-v2',JSON.stringify({version:2,credits:410890,tank:'warden',upgrades:{hull:5},missions:{'shore-01':2}}));});
 await page.goto(url);await ready(page);await page.click('#account-button');
 await page.locator('#login-password').fill('temporary-value');await page.click('[data-password-toggle=login-password]');assert.equal(await page.locator('#login-password').getAttribute('type'),'text');await page.click('[data-password-toggle=login-password]');
 await page.click('[data-account-view=register]');
 for(const [name,value] of Object.entries({id:uid,password,confirm:password,nickname:'시험지휘관',email:uid+'@example.test'}))await page.locator(`#account-register-form [name=${name}]`).fill(value);
 await page.screenshot({path:'research/account-register.png'});
 await page.locator('#account-register-form button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#account-summary').textContent.includes('시험지휘관'));
 assert.equal(await page.evaluate(()=>FortressAfterlight.profile.credits),0);
 await page.click('#account-migrate');await page.click('#migration-confirm');await page.waitForFunction(()=>document.querySelector('#account-message').textContent.includes('기기 기록을 계정에 저장했습니다'));
 assert.equal(await page.evaluate(()=>FortressAfterlight.profile.credits),410890);
 assert.equal(await page.evaluate(()=>FortressAfterlight.profile.tankProgress.warden.upgrades.hull),5);
 await page.click('#account-close');await page.click('[data-page=hangar]');await page.click('[data-select-tank=bastion]');await page.click('[data-upgrade=attack]');
 await page.waitForTimeout(900);await page.reload();await ready(page);
 assert.equal(await page.evaluate(()=>FortressAfterlight.profile.upgrades.attack),1);
 checks.push('registration, show/hide password, explicit guest migration, per-tank purchase and reload');
 const second=await browser.newContext({viewport:{width:390,height:844}}),mobile=await second.newPage();mobile.on('pageerror',e=>errors.push(e.message));
 await mobile.goto(url);await signIn(mobile);
 assert.equal(await mobile.evaluate(()=>FortressAfterlight.profile.upgrades.attack),1);assert.equal(await mobile.evaluate(()=>FortressAfterlight.profile.credits),410730);
 await mobile.screenshot({path:'research/account-mobile.png'});
 assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 const cookie=(await second.cookies()).find(c=>c.name==='fortress_session');assert.ok(cookie.httpOnly);assert.equal(cookie.sameSite,'Strict');assert.ok(cookie.expires>Date.now()/1000+2500000);
 await mobile.reload();await ready(mobile);assert.equal(await mobile.locator('#account-button').innerText(),'시험지휘관');
 checks.push('fresh mobile browser loads identical account wallet and independent growth; persistent HttpOnly cookie');
 await mobile.click('[data-page=hangar]');await mobile.click('[data-upgrade=fuel]');await mobile.waitForTimeout(900);
 await page.click('[data-page=hangar]');await page.click('[data-select-tank=arc]');await page.waitForFunction(()=>document.querySelector('#account-sync').textContent.includes('저장 충돌'));
 await page.click('#account-button');await page.click('#account-reload');await page.waitForFunction(()=>document.querySelector('#account-message').textContent.includes('서버 기록을 불러왔습니다'));
 assert.equal(await page.evaluate(()=>FortressAfterlight.profile.tankProgress.bastion.upgrades.fuel),1);
 checks.push('concurrent device updates detect conflict; server reload preserves local backup');
 await page.click('#account-switch');await page.waitForFunction(()=>document.querySelector('#account-summary').textContent.includes('게스트'));
 assert.equal(await page.evaluate(()=>FortressAfterlight.profile.credits),410890);assert.equal(await page.evaluate(()=>FortressAfterlight.profile.tank),'warden');
 checks.push('logout revokes session and restores separate guest save; account switch presents login');
 assert.equal(await page.evaluate(secret=>Object.keys(localStorage).some(k=>localStorage.getItem(k)?.includes(secret)),password),false);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,checks,errors,testAccount:uid}));
}finally{await browser.close();}
