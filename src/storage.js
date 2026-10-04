export const SAVE_KEY='fortress-afterlight-v2';
export const SETTINGS_KEY='fortress-afterlight-settings-v2';
export const createProfile=()=>({version:2,credits:0,tank:'bastion',missions:{},upgrades:{hull:0,attack:0,fuel:0}});
const integer=(value,max)=>{if(typeof value!=='number'&&typeof value!=='string')return 0;const n=Number(value);return Number.isFinite(n)?Math.max(0,Math.min(max,Math.floor(n))):0};
export function sanitizeProfile(value,missionIds=[],tankIds=['bastion','striker','arc','warden']){
 if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==2)throw new Error('호환되는 진행 기록이 아닙니다.');
 const p=createProfile();p.credits=integer(value.credits,100000);if(tankIds.includes(value.tank))p.tank=value.tank;
 for(const k of Object.keys(p.upgrades))p.upgrades[k]=integer(value.upgrades?.[k],5);
 for(const id of missionIds){if(!Object.prototype.hasOwnProperty.call(value.missions||{},id))continue;const n=integer(value.missions[id],3);if(n>0)p.missions[id]=n}
 return p;
}
export function isUnlocked(profile,missions,index){return Number.isInteger(index)&&index>=0&&index<missions.length&&missions.slice(0,index).every(m=>profile.missions[m.id]>0)}
export function completeMission(profile,mission,result){if(!result.won)return 0;const old=profile.missions[mission.id]||0;const stars=Math.max(1,Math.min(3,Math.floor(result.stars)||1));const reward=(old===0?mission.reward:0)+Math.max(0,stars-old)*35;profile.missions[mission.id]=Math.max(old,stars);profile.credits+=reward;return reward;}
export function purchaseUpgrade(profile,key,definition){if(!Object.prototype.hasOwnProperty.call(profile.upgrades,key)||!Array.isArray(definition?.costs))return false;const level=profile.upgrades[key],cost=definition.costs[level];if(!Number.isInteger(level)||level<0||!Number.isInteger(definition.max)||level>=Math.min(5,definition.max)||!Number.isFinite(cost)||cost<0||!Number.isFinite(profile.credits)||profile.credits<cost)return false;profile.credits-=cost;profile.upgrades[key]=level+1;return true;}
export function safeRead(key){try{return localStorage.getItem(key)}catch{return null}}
export function safeWrite(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}}
