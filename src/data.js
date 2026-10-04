export const TANKS = [
  { id: 'bastion', name: '바스티온', role: '균형형 전차', description: '안정적인 장갑과 화력. 처음 출격하는 지휘관에게.', color: '#65c9ff', hp: 240, attack: 1, mobility: 1 },
  { id: 'striker', name: '스트라이커', role: '고속 돌격 전차', description: '빠른 기동으로 사선을 바꾸고 약점을 파고듭니다.', color: '#ffc168', hp: 210, attack: 1.08, mobility: 1.32 },
  { id: 'arc', name: '아크', role: '고화력 실험 전차', description: '강력한 포격으로 전선을 무너뜨리는 화력 특화형.', color: '#bb9dff', hp: 195, attack: 1.22, mobility: 0.92 },
  { id: 'warden', name: '워든', role: '중장갑 방어 전차', description: '두꺼운 장갑으로 버티며 마지막까지 전선을 지킵니다.', color: '#83e1b1', hp: 285, attack: 0.94, mobility: 0.85 },
];

export const WEAPONS = {
  shell: { label: '고폭탄', description: '기본 포탄 · 균형 잡힌 피해와 지형 파괴', damage: 77, radius: 67, ammo: Infinity, color: '#ffc679' },
  cluster: { label: '집속탄', description: '정점에서 3발로 분리 · 넓은 지역 제압', damage: 44, radius: 47, ammo: 3, color: '#ff9d91' },
  arc: { label: '플라즈마', description: '강력한 충격 · 장갑을 관통하는 집중 공격', damage: 112, radius: 52, ammo: 2, color: '#bdabff' },
};

const enemy = (hp, tank, color, attack = 1) => ({ hp, tank, color, attack });

export const MISSIONS = [
  { id: 'shore-01', index: 0, name: '첫 번째 신호', region: '유리 해안', briefing: '해안 관측소에서 미확인 전차가 발견됐습니다. 포신 각도와 화력을 조절해 첫 번째 전선을 확보하세요.', objective: '정찰 전차 1대 격파', seed: 1218, theme: 'coast', wind: 13, difficulty: 0.05, enemies: [enemy(130, 'striker', '#f49387', 0.65)], reward: 180 },
  { id: 'shore-02', index: 1, name: '방파제 너머', region: '유리 해안', briefing: '적이 방파제 뒤로 후퇴했습니다. 바람을 읽고 높은 탄도로 엄폐한 적을 타격하세요.', objective: '해안 방어대 격파', seed: 2530, theme: 'coast', wind: 21, difficulty: 0.2, enemies: [enemy(175, 'bastion', '#f49387', 0.82)], reward: 210 },
  { id: 'shore-03', index: 2, name: '밀려오는 파도', region: '유리 해안', briefing: '상륙 부대 두 대가 관측소를 압박하고 있습니다. 집속탄으로 전선을 흔들고 방어막을 활용하세요.', objective: '상륙 부대 2대 격파', seed: 3927, theme: 'coast', wind: 25, difficulty: 0.34, enemies: [enemy(145, 'striker', '#f49387', 0.75), enemy(165, 'warden', '#ffb07b', 0.75)], reward: 280 },
  { id: 'dune-01', index: 3, name: '사막의 잔광', region: '앰버 사막', briefing: '붉은 협곡에 보급로가 끊겼습니다. 불규칙한 모래 언덕을 넘어 적의 선발대를 저지하세요.', objective: '협곡 보급로 탈환', seed: 4512, theme: 'desert', wind: 30, difficulty: 0.4, enemies: [enemy(230, 'arc', '#d99afa', 0.95)], reward: 280 },
  { id: 'dune-02', index: 4, name: '교차 사격', region: '앰버 사막', briefing: '두 대의 기동 전차가 교차 사격을 준비합니다. 연료를 아껴 이동하고 수리 시점을 선택하세요.', objective: '기동 전차 2대 격파', seed: 5308, theme: 'desert', wind: 33, difficulty: 0.5, enemies: [enemy(185, 'striker', '#ffaf7a', 0.82), enemy(200, 'bastion', '#f18c84', 0.82)], reward: 340 },
  { id: 'dune-03', index: 5, name: '태양 아래 요새', region: '앰버 사막', briefing: '고대 요새의 중장갑 전차가 길을 막습니다. 플라즈마의 집중 화력으로 방어선을 돌파하세요.', objective: '요새 방어대 2대 격파', seed: 6450, theme: 'desert', wind: 34, difficulty: 0.6, enemies: [enemy(255, 'warden', '#d7b786', 0.87), enemy(150, 'arc', '#dc9bdf', 0.85)], reward: 390 },
  { id: 'frost-01', index: 6, name: '얼음의 경계', region: '프로스트 능선', briefing: '눈보라 속에서 적의 포성이 들립니다. 얼어붙은 능선을 점령하고 북부 신호를 복구하세요.', objective: '북부 전초기지 확보', seed: 7620, theme: 'frost', wind: 37, difficulty: 0.66, enemies: [enemy(220, 'bastion', '#9dcbe6', 0.9), enemy(205, 'striker', '#c8a8f2', 0.9)], reward: 440 },
  { id: 'frost-02', index: 7, name: '침묵의 함대', region: '프로스트 능선', briefing: '세 대의 전차가 최종 관문을 지키고 있습니다. 탄약과 방어 장비를 배분해 연속 포격을 견디세요.', objective: '최종 관문 방어대 3대 격파', seed: 8917, theme: 'frost', wind: 40, difficulty: 0.75, enemies: [enemy(170, 'striker', '#dcb0e9', 0.77), enemy(185, 'arc', '#98c8eb', 0.77), enemy(205, 'warden', '#a8d0c0', 0.77)], reward: 520 },
  { id: 'frost-03', index: 8, name: '새벽을 되찾다', region: '프로스트 능선', briefing: '최후의 지휘 전차 오블리비언이 모습을 드러냈습니다. 모든 전술을 동원해 이 전쟁의 마지막 포성을 울리세요.', objective: '오블리비언과 호위 전차 격파', seed: 9929, theme: 'frost', wind: 42, difficulty: 0.86, enemies: [enemy(380, 'warden', '#d2a8ff', 1.05), enemy(170, 'arc', '#faad92', 0.8)], reward: 800 },
];

export const UPGRADES = {
  hull: { label: '강화 장갑', description: '단계마다 최대 체력 +25', max: 5, costs: [140, 210, 300, 410, 540] },
  attack: { label: '포신 개량', description: '단계마다 모든 무기 피해 +8%', max: 5, costs: [160, 240, 340, 460, 600] },
  fuel: { label: '동력 시스템', description: '단계마다 이동 연료 +14', max: 5, costs: [120, 190, 270, 370, 490] },
};
