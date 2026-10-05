import {sanitizeProfile} from './storage.js';
import {MISSIONS} from './data.js';
export function mergeGuest(account,guest){
 const ids=MISSIONS.map(m=>m.id),a=sanitizeProfile(account,ids),b=sanitizeProfile(guest,ids);
 a.credits=Math.max(a.credits,b.credits);a.collection=[...new Set([...a.collection,...b.collection])];a.tank=b.tank;
 for(const id of ids)a.missions[id]=Math.max(a.missions[id]||0,b.missions[id]||0);
 for(const id of Object.keys(a.tankProgress)){
  for(const part of Object.keys(a.tankProgress[id].upgrades))a.tankProgress[id].upgrades[part]=Math.max(a.tankProgress[id].upgrades[part],b.tankProgress[id].upgrades[part]);
  a.tankProgress[id].visualFloor=Math.max(a.tankProgress[id].visualFloor,b.tankProgress[id].visualFloor);
  a.mastery[id]=Math.max(a.mastery[id]||0,b.mastery[id]||0);
 }
 return a;
}
const LAST='fortress-account-last',CACHE=id=>'fortress-account-cache:'+id;
const read=k=>{try{return JSON.parse(localStorage.getItem(k)||'null')}catch{return null}};
const write=(k,v)=>{try{if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,JSON.stringify(v))}catch{}};
const $=s=>document.querySelector(s);

export function setupAccounts({getProfile,setProfile,guestProfile,notice,beforeOpen}){
 let user=null,revision=0,dirty=false,loading=true,syncing=null,timer=null,conflict=false,epoch=0;
 const dialog=$('#account-dialog');
 async function request(action,data){
  const response=await fetch('/api/account/'+action,{method:data===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:data===undefined?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});
  let result;try{result=await response.json()}catch{throw new Error('계정 서버에 연결할 수 없습니다.')}
  if(!response.ok){const e=new Error(result.error||'계정 요청에 실패했습니다.');e.status=response.status;throw e;}
  return result;
 }
 function status(message){$('#account-message').textContent=message;}
 function render(){
  $('#account-button').textContent=user?user.nickname:'로그인';
  $('#account-summary').textContent=user?`${user.nickname} · ${user.id}${user.role==='admin'?' · 관리자':''}`:'게스트 · 이 브라우저에 저장';
  $('#account-sync').textContent=loading?'계정 확인 중':user?(conflict?'저장 충돌 · 서버 기록 확인 필요':dirty?'기기에 보관됨 · 서버 저장 대기':'계정에 저장됨'):'로그인하면 다른 기기에서 이어 할 수 있습니다.';
  $('#account-session').hidden=!user;
  $('#account-forms').hidden=!!user;
  $('#account-recovery-email').textContent=user?.email||'복구 이메일 미설정';
  $('#account-reload').hidden=!conflict;
  $('#account-migrate').hidden=!user;
  $('#account-email-form').hidden=!user;
  $('#account-button').disabled=loading;
 }
 function cache(){if(user)write(CACHE(user.id),{user,revision,profile:getProfile(),dirty});}
 function install(result,restorePending=true){
  $('#mail-availability').hidden=result.mailAvailable!==false;
  const saved=restorePending?read(CACHE(result.user.id)):null;
  user=result.user;revision=saved?.dirty?saved.revision:result.revision;dirty=!!saved?.dirty;conflict=dirty&&revision!==result.revision;epoch++;
  write(LAST,user.id);setProfile(dirty?saved.profile:result.profile,user.id);cache();render();
 }
 async function sync(){
  clearTimeout(timer);
  if(syncing){await syncing;if(dirty&&!conflict)return sync();return;}
  if(!user||!dirty||conflict)return;
  const snapshot=JSON.stringify(getProfile()),currentEpoch=epoch;
  syncing=(async()=>{
   try{const result=await request('profile',{profile:JSON.parse(snapshot),revision});
    if(currentEpoch!==epoch)return;
    revision=result.revision;dirty=JSON.stringify(getProfile())!==snapshot;cache();render();
   }catch(e){if(e.status===409)conflict=true;cache();render();status(e.message);throw e;}
  })();
  try{await syncing}finally{syncing=null;}
  if(dirty&&!conflict)return sync();
 }
 function changed(){if(!user)return;dirty=true;cache();render();clearTimeout(timer);timer=setTimeout(()=>sync().catch(()=>{}),450);}
 async function login(form,register=false){
  if(loading)return;
  const data=Object.fromEntries(new FormData(form));data.keep=form.elements.keep?.checked||false;
  status('계정 확인 중…');loading=true;render();
  try{
   const result=await request(register?'register':'login',data);
   install(result);
   // Passwords are held only in the form, then delegated to the browser password manager.
   if(form.elements.remember?.checked&&'PasswordCredential' in window&&navigator.credentials){
    navigator.credentials.store(new PasswordCredential({id:data.id,password:data.password,name:result.user.nickname})).catch(()=>{});
   }
   form.reset();status(register?'가입 완료. 아래에서 기존 기기 기록을 가져올 수 있습니다.':'로그인했습니다. 계정 기록을 불러왔습니다.');
  }catch(e){status(e.message)}finally{loading=false;render();if(dirty&&!conflict)sync().catch(()=>{});}
 }
 $('#account-login-form').onsubmit=e=>{e.preventDefault();login(e.currentTarget)};
 $('#account-register-form').onsubmit=e=>{e.preventDefault();login(e.currentTarget,true)};
 for(const button of document.querySelectorAll('[data-account-view]'))button.onclick=()=>{
  for(const form of document.querySelectorAll('[data-account-form]'))form.hidden=form.dataset.accountForm!==button.dataset.accountView;
  status('');
 };
 for(const button of document.querySelectorAll('[data-password-toggle]'))button.onclick=()=>{
  const input=$('#'+button.dataset.passwordToggle),visible=input.type==='password';input.type=visible?'text':'password';button.textContent=visible?'숨기기':'보기';button.setAttribute('aria-pressed',String(visible));
 };
 async function logout(switching=false){
  try{await sync();if(dirty||conflict)throw new Error('먼저 서버 저장을 완료하거나 저장 충돌을 해결하세요.');await request('logout',{});
   user=null;dirty=false;conflict=false;epoch++;write(LAST,null);setProfile(guestProfile(),'guest');render();status(switching?'다른 계정으로 로그인하세요.':'로그아웃했습니다. 게스트 기록으로 전환했습니다.');
   for(const form of document.querySelectorAll('[data-account-form]'))form.hidden=form.dataset.accountForm!=='login';
  }catch(e){status(e.message)}
 }
 $('#account-logout').onclick=()=>logout();$('#account-switch').onclick=()=>logout(true);
 $('#account-migrate').onclick=async()=>{
  const old=guestProfile();$('#migration-preview').textContent=`기기 기록 ${Number(old.credits||0).toLocaleString('ko-KR')} PT · 완료 작전 ${Object.keys(old.missions||{}).length}개 → ${user.nickname}. 포인트와 강화는 더 높은 값을 유지하며, 작전·보유 전차를 합칩니다. 합치기 전 계정 기록도 이 기기에 백업됩니다.`;
  $('#account-migration').hidden=false;
 };
 $('#migration-cancel').onclick=()=>$('#account-migration').hidden=true;
 $('#migration-confirm').onclick=async()=>{
  try{await sync();if(conflict)throw new Error('먼저 저장 충돌을 해결하세요.');write(CACHE(user.id)+':before-import',{profile:getProfile(),revision});setProfile(mergeGuest(getProfile(),guestProfile()),user.id);changed();await sync();$('#account-migration').hidden=true;status('기기 기록을 계정에 저장했습니다.');}catch(e){status(e.message)}
 };
 $('#account-reload').onclick=async()=>{
  try{write(CACHE(user.id)+':conflict-backup',{profile:getProfile(),revision});install(await request('me'),false);status('서버 기록을 불러왔습니다. 이 기기의 미전송 기록은 별도로 보존했습니다.');}catch(e){status(e.message)}
 };
 $('#account-forgot-form').onsubmit=async e=>{e.preventDefault();try{const result=await request('forgot',Object.fromEntries(new FormData(e.currentTarget)));status(result.message)}catch(err){status(err.message)}};
 $('#account-reset-form').onsubmit=async e=>{e.preventDefault();try{const data=Object.fromEntries(new FormData(e.currentTarget));data.token=resetToken;const result=await request('reset',data);resetToken='';e.target.reset();user=null;write(LAST,null);setProfile(guestProfile(),'guest');render();$('#account-reset-form').hidden=true;$('#account-login-form').hidden=false;status(result.message)}catch(err){status(err.message)}};
 $('#account-email-form').onsubmit=async e=>{e.preventDefault();try{await request('email',Object.fromEntries(new FormData(e.currentTarget)));user.email=e.target.elements.email.value.trim();e.target.reset();cache();render();status('복구 이메일을 저장했습니다.')}catch(err){status(err.message)}};
 $('#account-button').onclick=()=>{beforeOpen();dialog.showModal();render()};
 $('#account-close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{for(const input of dialog.querySelectorAll('input[type=password],input[data-secret]'))input.value='';});
 window.addEventListener('online',()=>sync().catch(()=>{}));
 window.addEventListener('beforeunload',e=>{if(dirty){cache();e.preventDefault();e.returnValue='';}});
 let resetToken=new URLSearchParams(location.hash.slice(1)).get('reset')||'';
 if(resetToken){history.replaceState(null,'',location.pathname+location.search);dialog.showModal();$('#account-login-form').hidden=true;$('#account-reset-form').hidden=false;}
 (async()=>{
  const last=read(LAST),saved=last?read(CACHE(last)):null;
  try{const result=await request('me');
   if(saved?.user?.id===result.user.id&&saved.dirty){user=result.user;revision=saved.revision;dirty=true;conflict=result.revision!==saved.revision;setProfile(saved.profile,user.id);epoch++;cache();}
   else install(result);
  }catch(e){
   if(e.status!==401&&saved){user=saved.user;revision=saved.revision;dirty=!!saved.dirty;setProfile(saved.profile,user.id);epoch++;status('오프라인 계정 기록입니다. 연결되면 서버 저장을 시도합니다.');}
   else{write(LAST,null);if(saved?.dirty)status('미전송 계정 기록이 이 기기에 보존돼 있습니다. 같은 계정으로 로그인하세요.');}
  }finally{loading=false;render();if(dirty&&!conflict)sync().catch(()=>{});}
 })();
 return {changed,sync,get user(){return user},get loading(){return loading},get dirty(){return dirty}};
}
