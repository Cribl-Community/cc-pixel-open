# Pixel Open: CriblCon 26 Edition

A pixel-art tennis game with real ball physics, built as a Cribl App for CriblCon 26. Goats included.

## Summary

Pixel Open is a Cribl App you can actually play. Pick one of ten players, walk out onto one of six Cribl-branded stadiums and play a match from the broadcast camera, or run the World Tour all the way to the grand finale at CriblCon 26 in Chicago.

Goat mode is on by default: the players, the ball kids, the umpire and the crowd of around 800 fans are all Cribl goats, and they bleat. Every pixel and every sound is generated in code; the app ships no image or audio files.

It is also a showcase for Cribl Apps: a full Vite + React game scaffolded with `@cribl/apps`, running inside Cribl's sandboxed app frame and saving to the app's KV store.

## What This App Does

* Primary purpose: a playable tennis game embedded in Cribl, and a demo of what a Cribl App can be.
* Key capabilities:
  * **Real physics.** The ball flies with gravity, air drag and Magnus lift from spin, then grips and kicks at the bounce, so topspin jumps, slice skids and clay plays slow while grass plays fast.
  * **Ten players**, each with their own style (baseliner, counter-puncher, big server, serve-and-volley, all-court), strokes, grunt and computer brain.
  * **Six stadiums in Cribl colors**, each with a live crowd, sponsor boards carrying Cribl logos, and court lettering:

    | Stadium | Event | Surface | Light |
    |---|---|---|---|
    | CriblCon Court | CriblCon 26, Chicago | Hard, teal | Night: sparks in the air and a sword in a stone |
    | Harbour Park | Stream Slam | Hard, Cribl blue | Midday sun |
    | Terre Rouge | Edge Masters | Red clay | Late afternoon |
    | Royal Lawn | Lake Championships | Grass | Day |
    | Empire Arena | Search Nights | Hard | Floodlights and LED boards |
    | Neon Dome | Insights Finals | Indoor hard | Violet spotlights and LED boards |

  * **Goat mode**, on by default. Each goat's coat follows the player's hair color. Switch it off on the title screen or in Settings to play with people.
  * **Two modes.** Quick Match (any player, opponent and stadium; short set, one set or best of three; Rookie, Pro or Legend) and the World Tour: six tournaments of quarterfinal, semifinal and final, each round tougher than the last, ending at CriblCon 26.
  * **Sound, all synthesized.** Racket hits, bounces that differ per surface, shoe squeaks, grunts (bleats in goat mode), a crowd that claps, oohs and roars, and a chair umpire who calls the score. Sound starts muted.
* Intended users:
  * Anyone at CriblCon, or anyone with access to the app
* Works with:
  * Cribl.Cloud, where Cribl Apps runs (currently in Preview)

## When To Use This App

* Between sessions at CriblCon 26
* To show what a Cribl App can do beyond dashboards and forms
* As a worked example of porting an existing React app into the Cribl Apps scaffold

## Before You Install

* Required Cribl product or deployment type: Cribl.Cloud with Cribl Apps (Preview) enabled
* Required permissions or roles: none beyond access to the app
* Required external systems or APIs: none
* Required configuration values: none
* Known limits or prerequisites: a mouse or keyboard (a gamepad or touch screen also works); a recent Chrome, Edge, Firefox or Safari

## Installation

Use Marketplace installation whenever the app is available there.

### Install From Marketplace or URL
1. Go to Apps in your Cribl environment.
2. Choose the Marketplace or import from URL option.
3. If the app is available in the Cribl Marketplace, install it directly from there.
4. If the app is distributed as a Marketplace-hosted URL, use the URL to import it.
5. Review the app details and complete installation.

### If The App Is Not Yet In The Cribl Marketplace
1. Get the `pixel-open-<version>.tgz` package from the author, or build it with `npm run package` (see Development).
2. In Cribl, go to Apps and choose import from file.
3. Upload the `.tgz` file.
4. Review the app details and complete installation.

## Configuration

There is nothing to configure at install time. Each player's settings live in the game and are saved for them:

| Setting | Required | Description | Example | Scope |
|---|---|---|---|---|
| Sound | No | Sound on or off, and the volume. Off by default. | On, 80% | per-user |
| Goat mode | No | Goats or people on court and in the stands. On by default. | Goats | per-user |
| Umpire & line calls | No | The speech-synthesis umpire and line judges. | On | per-user |
| Game speed | No | Relaxed, Normal or Real time. The physics are real at every speed; slower speeds give you more time. | Normal | per-user |
| Movement | No | Auto-run (your player runs to the ball), Assisted, or Manual. | Auto-run | per-user |

## How To Use

### Typical Workflow
1. Open the app from the Apps page.
2. Choose **Quick match** (or **World Tour**).
3. Pick your player, an opponent, a stadium, a format and a difficulty, then press **Play**.
4. Serve: hold the mouse button to toss, and release in the green zone of the meter.
5. Rally: auto-run moves your player to the ball. Click before the ball arrives and point where you want it to land; your player swings when the ball reaches them.

### Controls

| Input | Action |
|---|---|
| Mouse | Point where the ball should land (a ring on the court shows it) |
| Left click (hold) / J | Topspin. Hold to load power. Serving: flat serve |
| Right click / K | Slice. Aim short near the net for a drop shot. Serving: slice |
| Middle click / L | Lob. Serving: kick |
| WASD / arrows | Aim without the mouse (and move, when auto-run is off) |
| Space | Power shot (costs 250 STYLE) |
| Shift | Sprint, when moving yourself |
| Esc or P · M · Enter | Pause · sound on/off · skip the changeover |

Gamepads work too (stick, A topspin, B slice, Y lob, X power, RB sprint), and touch screens get an on-screen stick and buttons.

### First-Run Checklist
* Click **Sound off** on the title screen to turn the crowd on.
* Open **How to play** for the controls.
* Keep goat mode on, at least for the first match.

## Permissions

The app needs no Cribl product permissions: `config/policies.yml` declares none. Its only platform calls go to its own app-scoped KV store, which the AppUser role grants automatically.

### Cribl API Endpoints Used

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/kvstore/pixel-open-v1/users/<user id>` | Load the player's saved settings, tour progress and records |
| PUT | `/api/v1/kvstore/pixel-open-v1/users/<user id>` | Save them after a change |

If the KV store can't be reached, the game still plays; it just doesn't save.

## External API Access

The app makes no external calls. Fonts and all code are bundled into the package.

### Default Configuration
* `default/proxies.yml` — no external domains
* `default/policies.yml` — no product API paths
* `default/schedules.yml` — no schedules

### External Endpoints
None.

## Data And Storage

* Each player has one KV key, `pixel-open-v1/users/<Cribl user id>`, holding their settings, last match setup, World Tour progress and career records (wins, titles, aces, fastest serve and more) as JSON.
* Saves are per user. The KV store belongs to the app, so the key includes the signed-in user's id (from `window.getCriblUser()`) to keep players from overwriting each other.
* Writes are batched and skipped when nothing changed. If the first read fails, the game plays on without saving rather than overwrite an existing save.
* The app never deletes a save.

## Support

### Community Built
Pixel Open is a community contribution by Alexander Brunner for CriblCon 26. It does not carry an official Cribl support commitment. For questions, bugs or ideas, contact Alexander Brunner at abrunner@cribl.io.

## Known Limitations

* Cribl Apps is a Preview feature and runs on Cribl.Cloud only.
* Gamepad support depends on the browser allowing gamepads inside Cribl's app frame.
* The game keeps its own dark pixel-art look in both the light and dark Cribl themes.
* Sound needs a click before it can play, as browsers require.

## Troubleshooting

### The App Opens But Some Features Do Not Work
Possible causes:
* No sound: sound is off by default. Click **Sound off** on the title screen, or press M.
* Keys don't respond: click on the game once so it has keyboard focus.
* A gamepad isn't detected: use the mouse or keyboard; the browser may not expose gamepads inside the app frame.

### The App Cannot Connect To An API Or Service
Check:
* That the app's KV store is available. Without it, settings and tour progress won't save.

### The App Works Locally But Not In Cribl
Check:
* That you uploaded a package built with `npm run package`, not a development build
* The package version installed in Cribl

## Development

Requirements: Node.js 22.22.2 or newer.

```bash
npm install
npm run dev
npm test
npm run package
```

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server. Open it in a browser, or connect it to Cribl's live preview. |
| `npm test` | Vitest: ball physics, scoring, headless AI-vs-AI matches, aim accuracy, synthesized sounds and the KV storage adapter |
| `npm run typecheck` / `npm run lint` / `npm run format` | TypeScript, oxlint, Prettier (`src/` only) |
| `npm run build` | Type-check and build `dist/` |
| `npm run package` | Build and pack `build/pixel-open-<version>.tgz`. Bumps the patch version; use `-- --minor`, `-- --major` or `-- --version X.Y.Z` instead. |

Outside Cribl the app runs normally but doesn't save, because there is no KV store.

### How it's built

* **Stack:** Vite, React 19, TypeScript, Tailwind CSS v4 and zustand, scaffolded with `npx @cribl/apps@latest create` and ported from the Next.js version of the game.
* **Rendering:** each frame is composited in software into one `ImageData` at a low resolution (up to 480×270) and scaled up by a whole number, so the pixels stay crisp. The stadium is ray-cast from the broadcast camera, the players are 3D rigs with inverse kinematics rasterized every frame, and around 800 spectators track the ball with their heads.
* **Cribl branding:** the Cribl logo, the goat and the product logos come from `@capra/icons`. Their SVG paths are rasterized in code into the pixel masks used on the boards, the net and the court.
* **Sound:** Web Audio synthesis: damped resonant modes, filtered noise and formant voices. The goats' bleats are a glottal source with a fast tremolo through "eh" formants.
* **Cribl platform:** saves go through a zustand storage adapter that talks to the app KV store (`src/game/state/kvStorage.ts`). The app never touches browser storage, which Cribl's sandboxed frame blocks.

## Project Layout

```text
src/
  main.tsx, App.tsx      entry point
  components/            screens, HUD, menus
    cribl/               landing pieces: skyline, CriblCon badge, Cribl Apps card, ticker
  game/
    sim/                 ball physics, court, players, AI, scoring, match rules, venues
    art/                 rasterizer, player rig, stadium painter, crowd, goats, Cribl marks, skyline
    render/              match renderer and controller, portraits, particles
    audio/               Web Audio engine and synthesized sounds
    input/               mouse, keyboard, gamepad and touch
    state/               settings and progress store, KV storage adapter, HUD state
config/
  policies.yml           no product API grants
  proxies.yml            no external domains
  schedules.yml          no schedules
AGENTS.md                notes for coding agents
README.md
```

## Versioning And Releases

* The app follows semantic versioning.
* `npm run package` bumps the version as it builds each release package.
* Release notes should mention changes to what the app saves.

## Contributing

Ideas, bug reports and changes are welcome: contact Alexander Brunner at abrunner@cribl.io. Run `npm test`, `npm run lint` and `npm run typecheck` before sending a change.

## License

No license has been chosen yet, so ask the author before reusing the code. Cribl logos and icons come from `@capra/icons`, licensed under the Cribl Developer Agreement for use on the Cribl platform. The Press Start 2P and Pixelify Sans fonts are licensed under the SIL Open Font License 1.1.

## App Metadata

| Field | Value |
|---|---|
| App Name | Pixel Open: CriblCon 26 Edition |
| App ID | pixel-open |
| Version | 1.0.0 |
| Author | Alexander Brunner |
| Support Model | community-built |
| Support Label | Community Built |
| Support Contact | abrunner@cribl.io |
| License | Not yet chosen |
| License File | — |
| Product Tags | — |
| Category | Games |
| Audience | end-user |
| Availability | preview |
| Requires External Access | no |
| Repository | — |
| Documentation | This README |
| README Schema Version | 1.0 |
