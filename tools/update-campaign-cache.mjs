import {readFile,writeFile} from 'node:fs/promises';
import {TANKS,BATTLE_MAPS} from '../src/data.js';
let source=await readFile(new URL('../sw.js',import.meta.url),'utf8');
source=source.replace(/const CACHE=.*?;/,"const CACHE='fortress-afterlight-v16-expanded-fronts-20261005';");
const files=['/src/expansion.js','/src/evolution.js','/src/appearance-test.html','/src/appearance-test.js',...TANKS.flatMap(t=>Array.from({length:6},(_,stage)=>`/sprites/evolution/${t.id}-${stage}-v2.png`)),'/','/index.html','/manifest.json',...['style.css','app.js','storage.js','data.js','battle.js','platforms.js','appearance.js','audio.js','vfx.js','environment.js'].map(n=>'/src/'+n),'/assets/vendor/environment-engine.js',...['hero.png','tanks.png','emblem.svg'].map(n=>'/assets/art/'+n),...BATTLE_MAPS.flatMap(m=>['glb','png'].map(ext=>`/assets/environments/${m.map}-v1.${ext}`)),...['menu_ambient','battle_base','battle_pulse','battle_danger','fire','impact','shield','repair','ui','charge','victory','defeat'].map(n=>`/assets/audio/${n}.ogg`)];
source=source.replace(/const CAMPAIGN=.*?;\r?\n/,`const CAMPAIGN=${JSON.stringify(files)};\n`);
await writeFile(new URL('../sw.js',import.meta.url),source);
console.log(`Campaign cache: ${files.length} assets, ${TANKS.length} tanks, ${BATTLE_MAPS.length} maps`);
