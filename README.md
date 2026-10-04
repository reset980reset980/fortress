# FORTRESS · AFTERLIGHT 2.0

기존 FORTRESS 공개 클라이언트를 분석하고, 원본 대전을 유지한 채 새로운 전술 포격 캠페인과 제작 에셋을 추가한 정적 웹 패키지입니다.

## 구현 내용

- 세 전선·9개 캠페인 작전, 점진적 해금, 생존율/라운드 기반 별 등급, 크레딧 보상, 4종 기체, 기체·아이템 6계열 각5단계 공용 개량.
- 실제 바람/중력 탄도, 지형 파괴와 낙하 피해, 3발로 분리되는 집속탄, 플라즈마, 연료 이동, 보호막/긴급 수리/전체 궤도 스캔, 16라운드부터 폭풍 피해.
- 시뮬레이션을 사용하는 AI 조준, 캠페인 난이도 조절, 무료 훈련, 키보드/터치 입력, 탭 전환 시 자동 일시정지.
- 직접 제작한 키 아트와 투명 전차 스프라이트. 해안·사막·설원 배경은 절차적으로 렌더링.
- 직접 작곡한 메뉴 음악, 동기화한 전투 음악3스템, 효과음/결과음8개. 전투 강도·체력·적 턴에 따른 실시간 믹싱, 위치별 효과음, 음소거 저장, 오디오 보이스 제한, 코덱 실패 시 Web Audio 합성 대체.
- 진짜 WebGL3D 파편의 회전·조명·깊이, 충격파·포구 섬광·보호막·수리 효과. 상한456개, 가벼운 모드148개, GPU컨텍스트 복구. WebGL 불가 시 기본 Canvas 전투 효과 유지.
- 로컬 자동 저장, 저장 파일 내보내기/가져오기, 잘못된 저장값 검증, 전투 결과 중복 지급 방지·재승리 포인트 보상, 모바일 저사양/동작 줄이기.
- PWA 캠페인 캐시. 한 번 정상 로딩한 이후 캠페인은 오프라인 실행 가능. 기존 온라인 대전은 서버가 필요합니다.
- 기존 게임: 36종 무기 정의가 로컬 전투에도 제대로 적용되도록 수정, SS횟수·아이템·클래스 상성·AI·서든데스 보완. 2연발 카메라 복구 타이머 충돌 수정.

## 실행

Node.js18이상:

```bash
git clone https://github.com/reset980reset980/fortress.git
cd fortress
npm start
```

`http://localhost:4173/`에서 캠페인을, `/original.html`에서 기존 AI/동일 기기/온라인 대전을 실행합니다. 설치할 런타임 npm 의존성은 없습니다. `file://`로 열면 ES모듈·오디오·PWA가 작동하지 않으므로 HTTP서버를 사용하세요.

원래 서버의 정적 루트에 배포해야 기존 API와 WebRTC로 연결됩니다. 이 미리보기 서버는 API백엔드를 구현하지 않습니다.

## Windows에서 D:\project\fortress에 받기

PowerShell에서 아래 명령을 실행하면 지정한 폴더에 전체 소스와 이미지·음원이 내려받아집니다. Git과 Node.js 18 이상이 필요합니다.

```powershell
git clone https://github.com/reset980reset980/fortress.git "D:\project\fortress"
cd D:\project\fortress
npm start
```

이미 이 저장소를 받은 폴더라면 변경 사항을 보관한 뒤 `git pull --ff-only`로 갱신하세요.

## 미니PC 적용

2026-10-05 기존 `minipc` SSH 설정으로 실제 운영 서버 `ksd-webserver`에 접속해 최초 AFTERLIGHT 배포를 완료했습니다. Caddy는 웹 요청을3098번 서비스로, `/api/*`를3195번 API로 전달합니다. 정적 서비스 코드의 실제 공개 루트는 `/home/reset980/project/portress/.deploy`입니다. 백엔드 프로젝트 루트와 구분해야 합니다. 최초 배포 전 프로젝트/정적 파일/프록시 설정 백업은 `/home/reset980/backups/fortress-production-20261004T173832Z`이며, 정적 파일 실제 복원과 원본 비교를 통과했습니다. API/DB/프록시 및 실행 중인 백엔드를 유지했습니다.

미니PC에서 운영 웹 루트 바깥의 별도 폴더에 이 저장소를 받은 뒤, 실제 서비스가 제공하는 **정적 웹 루트**를 지정해 실행합니다. 백엔드 프로젝트 루트 대신 공개 정적 파일만 제공하는 폴더를 지정하세요. 스크립트는 해당 루트를 먼저 tar.gz로 백업하고 체크섬과 복원 가능한 구성인지 검증한 뒤 정적 파일을 복사합니다. 마지막에 읽기 권한을 설정한 index.html을 원자적으로 교체합니다. 기존 API서버·DB·프록시설정은 건드리지 않습니다. Bash·GNU tar·기본 파일 도구·Python3가 필요합니다. 웹 루트 안의 심볼릭 링크나 특수 파일은 교체 전에 거부합니다.

```bash
bash tools/deploy.sh /실제/정적/웹루트
```

백업은 웹루트의 상위 디렉터리 `fortress-backups/fortress-시간.tar.gz`에 만들어집니다. 원복:

```bash
bash tools/restore.sh /백업/fortress-시간.tar.gz /실제/정적/웹루트
```

운영 서버가 오래 캐시하는 경우 `/sw.js`, `/index.html`, `/src/*`에는 재검증 캐시 정책을 사용하세요. 기존 번들은 해시가 다른 `assets/legacy-*.js`로 제공하여 변경 전 JS캐시와 충돌하지 않습니다. API/WebRTC 상태 형식은 변경하지 않았습니다.

## 원본 백업

수정 전 HTML/JS/CSS/manifest/SW와 공개 에셋을 포함하는 `fortress-public-original-20261004.tar.gz` 및 SHA-256은 작업 환경에 별도로 보관했습니다. 중복된 대형 압축 파일은 GitHub에 포함하지 않습니다. `backup/original-public-bundle/`에 수정 전 주요 파일을 보존했고, `research/public-asset-backup.json`에는306개 에셋의 원래 URL·크기·해시가 있습니다. 공개 TS소스·서버코드·DB는 포함되지 않습니다.

## 검증

```bash
npm test
npm run check
node research/legacy-regression.mjs
```

네 가지 자동 검사 파일에서 전투·저장/보상·오디오·VFX검사를 통과했습니다. 실제 원본 엔진의 무기36종과 온라인 위임11분기, 카메라 타이머 충돌도 검사했습니다.

브라우저 검증 소스는 `tools/browser-verify.mjs`, `tools/legacy-browser-verify.mjs`, `tools/offline-verify.mjs`입니다. Playwright core와Chromium이 필요하고 `PLAYWRIGHT_MODULE`, `CHROMIUM_PATH`로 설치 위치를 지정할 수 있습니다. 검증 기록은 `research/`의 JSON 보고서로 포함했습니다.

실제 Chromium에서 PC/390px세로 / 844px 가로 레이아웃, 이동/일시정지, 실제 승리/보상/다음 해금, 재접속 저장, 음소거 유지와 기존 2연발 / SS 제한을 확인했습니다. WebGL 스트레스·상한·소멸·복구 검사는 GPU 오류 0으로 통과했습니다. 시뮬레이션으로 9개 작전의 클리어 가능성을 확인했으나, 실제 미니PC / 휴대폰 성능 및 두 명의 원격 WebRTC 대전은 이 환경에서 측정하지 않았습니다.

에셋 출처와 편집 가능한 음악 제작 소스는 ASSETS.md 및 tools/compose_music.py를 확인하세요.

## Blender 전장 배경

2026-10-05 해안/사막/설원 전장을 Blender 모델 기반의 실제3D 배경으로 다시 제작했습니다. 절벽, 항만 교량/크레인, 폐수로 아치, 설산, 중계기지/안테나가 원근 카메라, 그림자와 거리 안개를 사용합니다. 전차·탄도·지형 파괴는 기존2D 전투 좌표를 유지합니다. 낮은 품질에서는 그림자와 카메라 움직임을 줄이며 WebGL2가 없거나 손실되면 Blender 렌더 이미지로 전투가 계속됩니다. 모델과 텍스처는 오프라인 캐시에 포함됩니다.

편집 원본은 `authoring/environments/*-v1.blend`입니다. 모든 텍스처가 원본/GLB에 포함되며, 제삼자 모델이나 유료 생성 서비스를 사용하지 않았습니다. 제작 재현:

```bash
blender --background --factory-startup --python tools/build-environments.py
npm install
npm run build:environment-engine
npm run verify:environment
```

브라우저 검증은 `PLAYWRIGHT_MODULE`과 `CHROMIUM_PATH`가 지정된 환경에서 실행합니다. `BASE_URL`로 실제 운영 주소도 검증할 수 있습니다. 운영 프록시의 CSP를 유지하기 위해 내장 GLB 텍스처는 이미지 로더로 디코딩합니다. Three.js MIT 라이선스는 `assets/vendor/THREE-LICENSE.txt`에 포함했습니다. 844×390 가로 화면은 조작 패널을 전장 오른쪽에 배치해 전투/발사/능력 버튼이 한 화면에 들어옵니다. 실제 휴대폰 GPU와 두 명의 원격 WebRTC 대전은 별도 검증 항목입니다.

대전 메뉴: 새 3D AI 자유대전에서 9개 맵/4개 상대 기체/3개 난이도를 선택합니다. 승리 보상은 90/150/230 PT이며 캠페인 진행을 변경하지 않습니다. 캠페인 재승리는 기본 작전 보상의 45% (최소60 PT)와 별 등급 개선 보너스를 지급합니다. 기존 온라인 대전은 original.html에서 실행되며 AI/캠페인 로컬 포인트와 공유하지 않습니다. 기존 version2 저장은 유지하며 새 아이템 개량을 0단계로 보충합니다.

공중 대전 맵 3종: 구름 위 부유섬, 철골 공중 공장, 용암 계단. 자유대전에서 12개 맵을 선택하며 모든 자유대전의 기본 지형과 출발 지점은 좌우 대칭입니다. 새 맵은 7개 파괴 가능한 발판과 바닥을 가지며 발판이 파괴되면 중력으로 아래 발판에 착지하고 최대30 낙하 피해를 받고 전투를 계속합니다. 탄도 예측·집속탄·AI 모두 실제 발판 충돌을 사용합니다. 격납고/선택 카드/전투 전차의 외형에 장갑판, 포신 고리, 추진기, 탄약통, 수리 상자와 보호막 코일이 개량 단계별로 추가됩니다.
