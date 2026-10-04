# Original Fortress audit and preserved local fixes

Audited public production entry: `original/assets/index-Dvs0axOV.js` (1,434,245 characters before changes), `index-Bgt7x0wV.css`, public HTML and manifest. The immutable pre-change copies and SHA-256 manifest are in `backup/original-public-bundle/`.

## Architecture

- Phaser 3 WebGL/Canvas game at 1280 × 720; simulation world 1600 × 900; chunked editable terrain with bit-packed collision masks and fixed-point deterministic ballistics.
- Eight Phaser scenes: mode, AI difficulty, roster, map select, online lobby, ranking, room connection, match. Twelve tanks and eight map themes. Mobile dual-thumb controls, fullscreen/audio settings, minimap, dynamic weather and local XP are implemented.
- Deterministic simulation: `Je` world (original offset 1219704), `an` AI planner (1240486), `cs` normalized tank registry (1251482), `Gl` game scene (1389159). The original app code starts immediately after the embedded Phaser library at `Ns=8,Gt=...` around offset 1209220. The engine is recoverable as a standalone evaluation unit; `legacy-regression.mjs` extracts precisely this unit without requiring Phaser or a DOM. No original TypeScript source maps are present in the downloaded public entry.
- Original audio already has crossfading title / battle_grass / battle_tense tracks, with battle_tense triggered at turn 30 or any living unit below 34% HP. Weather rain/wind loops and basic event effects exist, but there is no campaign, layered music intensity, progression map or 3D effect renderer.

## Confirmed problems

1. Local match fire calls legacy `world.fire()` instead of the richer `world.fireWeapon()` used online. All 36 raw tank weapon descriptions exist, but local chain, double, mines, poison, EMP, shields, artillery and guided types previously collapsed to basic shells. Local SS ammunition was unlimited.
2. Local units omit combat class; class attack/defense affinity is silently bypassed.
3. Local AI drops weapon type/properties and does not filter exhausted SS ammunition.
4. Local inventory rolls from seven item IDs but input/UI expose only weather-shield and clear-sky. Up to all three rolled items can be unusable.
5. The game scene lacks reliable local match completion following a movement-triggered mine death.
6. Camera restore uses an untracked second completion timer. A later projectile can start before that timer completes, and the old callback then clears its camera anchor, causing an undefined zoom exception. The readable patch tracks both timers and uses a per-projectile generation token; scene shutdown cancels and invalidates both stages. This presentation fix applies to both local and online scenes without changing simulation.
7. The original root service worker registration is unsuitable for a new homepage deployed under the same origin; older workers can serve stale navigation and assets.

## Applied local corrections

`original/assets/legacy-local-upgrade.js` is a readable, idempotent patch module. It restores normalized typed weapon dispatch, all projectile trajectories, exact terrain removal masks, SS use counts and HUD counts; assigns local combat classes; filters AI ammo and non-ballistic support decisions; executes and consumes all seven inventory items; displays persistent effect feedback and flood water; enables the same conditional sudden-death mechanism already used online; and completes matches after mine deaths. Every wrapper explicitly delegates to the original method for online matches. The original API/WebRTC transport block remains byte-for-byte unchanged.

The bundle changes are limited to importing/installing the patch, exposing a read-only `window.FortressLegacy` runtime for diagnostics, permitting all owned local item IDs in local input only, assigning the Phaser game instance for exposure, and removing the invocation that registers the original root-scope service worker. The immutable original bundle remains available in the backup.

## Public backend contract

- `POST /api/players`, `GET /api/players`, `POST /api/players/mastery`: player identity and progression.
- `GET /api/rooms`, `POST /api/rooms`, `POST /api/rooms/join`, `POST /api/rooms/ready`: matchmaking and lobby bootstrap.
- `GET /api/leaderboard?scope=...&around=me&tankId=...`: ranking.
- `GET /api/p2p/state?since=...`, `GET/POST /api/p2p/signal`: bootstrap state and WebRTC signaling.
- Legacy server client contains `POST /api/match/turn` and `/api/match/leave`; live gameplay explicitly requires a direct host-authority WebRTC peer and submits turns via that peer.
- Same-origin public host on fortress.xsw.kr; *.vercel.app and portress.xsw.kr point to https://fortress.xsw.kr; private/local hosts use port 3195. Preserve this deployment relationship unless actual server source/configuration is supplied.
- Browser storage keys: `portress.player.v1` (identity), `portress.progress.v1` (local XP), `portress.audio.v1` (audio settings). No credentials or private server paths were inspected.

## Assets and extension points

`asset-inventory.json` contains exact public paths: 40 map images, 192 tank frames, 12 projectile sprites, 20 effect images, 17 UI images, 23 MP3 audio files and 23 optional OGG fallbacks. `download-public-assets.py` downloads only these named public resources with at most eight requests in flight and MP3-first fallback. It keeps inherited proxy settings and records hashes and failure details.

Campaign and visual upgrades can run independently while linking back to this preserved original through `original.html`. Keep the published `/assets`, `/maps`, `/sprites`, `/audio` paths available for original modes. The runtime exposes the game and the actual deterministic engine for controlled extensions. Do not alter online packet/state shapes or deterministic world rules independently on only one peer.

## Verification

`node research/legacy-regression.mjs` passes: all 36 actual engine weapon definitions dispatch through the local scene patch, double shots render twice, SS exhaustion blocks a third use, repair kits heal 150 and end a turn, dual-shot adds a second shell, unowned items are rejected, eleven wrapped methods delegate exactly once online, the original backend client bytes are unchanged, stale root-worker registration is disabled, a queued old camera callback cannot clear a later shot anchor, and shutdown cancels camera completion timers. Syntax checks pass for both the edited bundle and the readable patch module.

A real two-client WebRTC match requires the existing live lobby server and consenting session participants; no online messages or match writes were sent during this audit. Browser validation of the preserved client should be completed after its public assets have downloaded.
