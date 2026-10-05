// The official skill client, adapted only to this machine's installed browser runtime.
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {findChromium} from './browser-runtime.mjs';
const path='C:/Users/KSD/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js';
let source=await readFile(path,'utf8');
source=source.replace('import { chromium } from "playwright";',`const {chromium}=await import(${JSON.stringify(process.env.PLAYWRIGHT_MODULE)});`);
source=source.replace('chromium.launch({',`chromium.launch({executablePath:${JSON.stringify(await findChromium())},`);
// The menu contains preview canvases. Refresh the handle after the start click.
source=source.replace('if (!canvas) canvas = await getCanvasHandle(page);','canvas = await getCanvasHandle(page);');
source=source.replace('for (const canvas of document.querySelectorAll("canvas")) {','for (const canvas of document.querySelectorAll("canvas")) { if(!canvas.getClientRects().length)continue;');
const temporary=new URL('./.game-skill-client.mjs',import.meta.url);await writeFile(temporary,source);
try{const code=await new Promise(resolve=>{const child=spawn(process.execPath,[temporary.pathname.replace(/^\/([A-Z]:)/,'$1'),...process.argv.slice(2)],{stdio:'inherit'});child.on('exit',resolve);});process.exitCode=code;}finally{await unlink(temporary);}
