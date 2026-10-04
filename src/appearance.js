export function drawModifications(ctx,levels={},width=90,facing=1){
 ctx.save();ctx.scale(facing,1);
 const hull=levels.hull||0,attack=levels.attack||0,fuel=levels.fuel||0,ammo=levels.ammo||0,repair=levels.repair||0,shield=levels.shield||0;
 if(hull){ctx.fillStyle='#789daa';ctx.strokeStyle='#d2e3e9';ctx.lineWidth=1;for(let i=0;i<Math.min(5,hull);i++){ctx.fillRect(-width*.37+i*width*.14,0,width*.12,9);ctx.strokeRect(-width*.37+i*width*.14,0,width*.12,9);}}
 if(attack){ctx.fillStyle='#dfbd72';ctx.fillRect(16,-19,12+attack*2,4);for(let i=0;i<attack;i++)ctx.fillRect(18+i*3,-22,2,8);}
 if(fuel){ctx.fillStyle='#75dccd';for(let i=0;i<Math.min(5,fuel);i++){ctx.fillRect(-width*.43-i*3,3,3,8);}ctx.fillStyle='#d3fff5';ctx.fillRect(-width*.44,5,2,4);}
 if(ammo){ctx.fillStyle='#c39d6c';for(let i=0;i<Math.min(5,ammo);i++){ctx.fillRect(-25+i*7,-18,5,11);ctx.fillStyle='#f3d09b';ctx.fillRect(-25+i*7,-18,5,2);ctx.fillStyle='#c39d6c';}}
 if(repair){ctx.fillStyle='#567c6c';ctx.fillRect(-width*.35,-5,11+repair,10);ctx.fillStyle='#e8ffdc';ctx.fillRect(-width*.35+5,-3,2,6);ctx.fillRect(-width*.35+3,-1,6,2);}
 if(shield){ctx.strokeStyle='#83d5ff';ctx.lineWidth=1+shield*.3;ctx.beginPath();ctx.arc(0,-25,5+shield*.7,Math.PI,Math.PI*2);ctx.stroke();ctx.fillStyle='#a6eaff';ctx.fillRect(-1,-26,2,4);}
 ctx.restore();
}
