import {TANKS} from './data.js';
export const SAVE_KEY='fortress-afterlight-v2';
export const SETTINGS_KEY='fortress-afterlight-settings-v2';
export const createProfile=()=>({version:2,credits:0,tank:'bastion',missions:{},visualFloor:0,collection:['bastion','striker','arc','warden'],mastery:{},upgrades:{hull:0,attack:0,fuel:0,ammo:0,repair:0,shield:0}});
const integer=(value,max)=>{if(typeof value!=='number'&&typeof value!=='string')return 0;const n=Number(value);return Number.isFinite(n)?Math.max(0,Math.min(max,Math.floor(n))):0};
export function sanitizeProfile(value,missionIds=[],tankIds=TANKS.map(t=>t.id)){
 if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==2)throw new Error('호환되는 진행 기록이 아닙니다.');
 const p=createProfile();p.credits=integer(value.credits,1000000000);if(tankIds.includes(value.tank))p.tank=value.tank;
 for(const k of Object.keys(p.upgrades))p.upgrades[k]=integer(value.upgrades?.[k],5);
 p.visualFloor=value.visualFloor===undefined?Math.max(...Object.values(p.upgrades)):integer(value.visualFloor,5);
 p.collection=[...new Set([...p.collection,...(Array.isArray(value.collection)?value.collection.filter(id=>tankIds.includes(id)):[])])];
 for(const id of tankIds){const wins=integer(value.mastery?.[id],100000);if(wins)p.mastery[id]=wins;}
 if(!p.collection.includes(p.tank))p.tank='bastion';
 for(const id of missionIds){if(!Object.prototype.hasOwnProperty.call(value.missions||{},id))continue;const n=integer(value.missions[id],3);if(n>0)p.missions[id]=n}
 return p;
}
export function isUnlocked(profile,missions,index){return Number.isInteger(index)&&index>=0&&index<missions.length&&missions.slice(0,index).every(m=>profile.missions[m.id]>0)}
export function completeMission(profile,mission,result){if(!result.won)return 0;if(mission.mode==='duel'){const reward=mission.reward;profile.credits+=reward;return reward;}const old=profile.missions[mission.id]||0;const stars=Math.max(1,Math.min(3,Math.floor(result.stars)||1));const reward=(old===0?mission.reward:Math.max(60,Math.round(mission.reward*.45)))+Math.max(0,stars-old)*35;profile.missions[mission.id]=Math.max(old,stars);profile.credits+=reward;return reward;}
export function purchaseUpgrade(profile,key,definition){if(!Object.prototype.hasOwnProperty.call(profile.upgrades,key)||!Array.isArray(definition?.costs))return false;const level=profile.upgrades[key],cost=definition.costs[level];if(!Number.isInteger(level)||level<0||!Number.isInteger(definition.max)||level>=Math.min(5,definition.max)||!Number.isFinite(cost)||cost<0||!Number.isFinite(profile.credits)||profile.credits<cost)return false;profile.credits-=cost;profile.upgrades[key]=level+1;return true;}
export function safeRead(key){try{return localStorage.getItem(key)}catch{return null}}
export function ownsTank(profile,tank){return (profile.collection||['bastion','striker','arc','warden']).includes(tank);}
export function tankCost(index){return 300+Math.max(0,index-4)*75;}
export function collectTank(profile,tank,index){if(index<4||index>=TANKS.length||TANKS[index]?.id!==tank||ownsTank(profile,tank)||profile.credits<tankCost(index))return false;profile.credits-=tankCost(index);profile.collection.push(tank);return true;}
export function recordMastery(profile,tank){if(!TANKS.some(t=>t.id===tank)||!ownsTank(profile,tank))return 0;profile.mastery||={};const wins=(profile.mastery[tank]||0)+1;profile.mastery[tank]=wins;const bonus=wins%5===0?150:0;profile.credits+=bonus;return bonus;}
export function safeWrite(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}}
