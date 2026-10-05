export const NEW_TANKS=[
 {id:'mortar',name:'모타르',role:'고각 포격',description:'무거운 박격포와 공중 분열탄으로 엄폐 뒤를 공략합니다.',color:'#c0cb91',hp:255,attack:.98,mobility:.78},
 {id:'mole',name:'몰',role:'지형 굴착',description:'굴착탄으로 발판을 무너뜨리고 아래 전선으로 길을 냅니다.',color:'#ecc05b',hp:270,attack:.92,mobility:.88},
 {id:'hive',name:'하이브',role:'다연장 로켓',description:'가벼운 로켓과 넓은 삼연장 일제사격으로 지역을 제압합니다.',color:'#ffb454',hp:205,attack:1,mobility:1.2},
 {id:'venom',name:'베놈',role:'지속 피해',description:'산성 포탄과 독가스 지대로 적을 두 라운드 동안 압박합니다.',color:'#a6df73',hp:235,attack:.95,mobility:1.02},
 {id:'glacier',name:'글레이셔',role:'냉각 제어',description:'빙결탄은 이동 연료를 줄이고 냉각 지대는 다음 이동을 늦춥니다.',color:'#b4efff',hp:260,attack:.95,mobility:.88},
 {id:'bolt',name:'볼트',role:'정밀 관통',description:'빠른 레일 탄환과 좁은 관통 폭발로 정확한 직접 명중을 노립니다.',color:'#bcc4d4',hp:195,attack:1.12,mobility:1.08},
 {id:'ricochet',name:'리코셰',role:'도탄 포격',description:'지면에서 튕기는 탄환으로 색다른 사선을 만듭니다.',color:'#e78f79',hp:225,attack:1,mobility:1.06},
 {id:'solar',name:'솔라',role:'열 에너지',description:'열탄과 충전 광탄을 사용합니다. 축열 능력은 다음 포격을 강화합니다.',color:'#ffe197',hp:215,attack:1.06,mobility:1},
];
// Three familiar weapon slots remain stable for controls and old saves.
export const ARSENALS={
 bastion:{shell:{label:'고폭탄'},cluster:{label:'관통 집속탄',shieldPierce:.8},arc:{label:'중장갑 관통탄',shieldPierce:1}},
 striker:{shell:{label:'속사 경량탄',damage:64,speed:1.12,radius:52},cluster:{label:'쌍열 확산탄',spread:125},arc:{label:'돌격탄',damage:96,speed:1.1}},
 arc:{shell:{label:'플라즈마탄',color:'#bb9dff',damage:83,radius:46},cluster:{label:'이온 분열탄',color:'#d4b9ff'},arc:{label:'충전 플라즈마',damage:127,radius:44,shieldPierce:.85}},
 warden:{shell:{label:'충격탄',damage:72,knockback:22},cluster:{label:'진압 분열탄',knockback:12},arc:{label:'중량 충격탄',damage:105,knockback:42}},
 mortar:{shell:{label:'박격포탄',damage:91,gravity:1.3,speed:.88,radius:78},cluster:{label:'공중 분열탄',spread:65,damage:49,gravity:1.3,speed:.88},arc:{label:'중박격포',damage:122,gravity:1.4,speed:.85,radius:86}},
 mole:{shell:{label:'굴착탄',damage:55,radius:50,terrainRadius:94,terrainDepth:88,color:'#ecc05b'},cluster:{label:'붕괴 분열탄',damage:32,terrainRadius:72,terrainDepth:62},arc:{label:'심층 드릴탄',damage:82,terrainRadius:120,terrainDepth:120}},
 hive:{shell:{label:'로켓',damage:68,speed:1.08,color:'#ffa854'},cluster:{label:'삼연장 로켓',spread:140,damage:47,color:'#ff925e'},arc:{label:'고열 로켓',damage:106,radius:80}},
 venom:{shell:{label:'산성탄',damage:58,poison:9,color:'#a3df69'},cluster:{label:'독가스 분열탄',damage:30,zone:'poison',color:'#9ad36e'},arc:{label:'농축 독가스탄',damage:74,zone:'poison',poison:14,radius:85,color:'#c8f285'}},
 glacier:{shell:{label:'빙결탄',damage:67,freeze:true,color:'#a9eaff'},cluster:{label:'냉각 분열탄',damage:36,zone:'freeze',color:'#a9eaff'},arc:{label:'극저온탄',damage:92,zone:'freeze',freeze:true,color:'#d0f5ff'}},
 bolt:{shell:{label:'레일탄',damage:87,radius:30,speed:1.22,shieldPierce:.9,color:'#dbe8ff'},cluster:{label:'분열 철갑탄',damage:42,spread:50},arc:{label:'관통 레일탄',damage:131,radius:30,speed:1.2,shieldPierce:1,color:'#f1f7ff'}},
 ricochet:{shell:{label:'도탄',damage:74,bounces:1,color:'#ffb285'},cluster:{label:'도탄 분열탄',damage:41,bounces:1},arc:{label:'이중 도탄',damage:103,bounces:2,color:'#ffe0b2'}},
 solar:{shell:{label:'열탄',damage:79,color:'#ffe09a'},cluster:{label:'광자 분열탄',damage:43,color:'#ffe09a'},arc:{label:'충전 광탄',damage:125,radius:65,color:'#fff0b2'}},
};
export const SIGNATURES={bastion:{label:'고정 앵커',kind:'anchor'},striker:{label:'추가 기동',kind:'fuel'},arc:{label:'이온 충전',kind:'charge'},warden:{label:'전면 방벽',kind:'shield'},mortar:{label:'사격 안정화',kind:'scan'},mole:{label:'굴착 이동',kind:'dig'},hive:{label:'로켓 재장전',kind:'reload'},venom:{label:'해독 장치',kind:'cleanse'},glacier:{label:'냉각 방어',kind:'shield'},bolt:{label:'정밀 스캔',kind:'scan'},ricochet:{label:'도탄 추적',kind:'scan'},solar:{label:'축열',kind:'charge'}};
export function weaponFor(tank,slot,base){return {...base,...ARSENALS[tank]?.[slot]};}
export const NEW_MAPS=[
 ['cloud-garden','공중 정원','공중 전선','coast',[[80,350,230],[1090,1360,230],[100,520,420],[920,1340,420],[580,860,330],[60,650,620],[790,1380,620]],1,.8],
 ['broken-bridge','붕괴 교량','공중 전선','coast',[[80,480,310],[960,1360,310],[480,960,380],[60,570,570],[870,1380,570]],1,1],
 ['mine-canyon','폐광 협곡','공중 전선','desert',[[70,390,340],[1050,1370,340],[170,570,490],[870,1270,490],[580,860,620]],1,1.35],
 ['neon-docks','네온 도크','산업 전선','frost',[[80,400,440],[1040,1360,440],[440,650,560],[790,1000,560],[610,830,370]],1,1.2],
 ['crystal-cavern','수정 동굴','산업 전선','frost',[[70,360,540],[1080,1370,540],[410,610,430],[830,1030,430],[650,790,350],[450,990,150]],1,1.45],
 ['glacier-rift','빙하 균열','산업 전선','frost',[[80,360,290],[1080,1360,290],[390,600,420],[840,1050,420],[610,830,580],[100,500,650],[940,1340,650]],1,.7],
 ['volcanic-basin','화산 분지','심층 전선','desert',[[60,420,470],[1020,1380,470],[480,630,590],[810,960,590]],1,1],
 ['sea-fortress','해상 요새','심층 전선','coast',[[80,350,360],[1090,1360,360],[450,650,450],[790,990,450],[100,540,620],[900,1340,620]],1,1.15],
 ['desert-ruins','사막 유적','심층 전선','desert',[[70,370,510],[1070,1370,510],[390,550,360],[890,1050,360],[610,830,550]],1,.85],
 ['abyss-base','심해 기지','심층 전선','frost',[[60,410,460],[1030,1380,460],[460,650,600],[790,980,600],[610,830,320]],1,1.3],
 ['orbital-station','궤도 정거장','궤도 전선','frost',[[70,360,270],[1080,1370,270],[420,630,400],[810,1020,400],[610,830,560],[80,420,650],[1020,1360,650]],.58,1.4],
 ['scrap-graveyard','고철 묘지','궤도 전선','desert',[[60,380,530],[1060,1380,530],[420,590,440],[850,1020,440],[630,810,600]],1,1.1],
].map(([id,name,region,theme,layout,gravity,hardness],i)=>({id,map:id,name,region,theme,layout,gravity,hardness,index:i+12,seed:14000+i*137,wind:18+i,platforms:true,hazard:id==='volcanic-basin'?'lava':null}));
