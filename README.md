# Neon Rush

A browser-based arcade time-trial racing game. One car, one track, one best time.

Everything is procedural: the car, the track, the scenery and the sounds are generated at runtime, so the project has no asset files and runs as a fully static site.

## Run locally

Because the game uses ES modules, open it through a local web server rather than double-clicking `index.html`.

```
python -m http.server
```

Then visit:

```
http://localhost:8000
```

(Any static server works: `npx serve`, VS Code Live Server, etc.)

## Deploy to GitHub Pages

1. Create a GitHub repository.
2. Upload the project (keep the folder structure as-is).
3. Push the files to the `main` branch.
4. Open **Settings → Pages**.
5. Under *Build and deployment*, select **Deploy from a branch**.
6. Choose the `main` branch and the `/ (root)` folder, then save.
7. Open the generated GitHub Pages URL.

All paths are relative, so the game works from a project sub-path (e.g. `https://user.github.io/neon-rush/`). No server, build step or backend is required.

## Controls

| Key | Action |
| --- | --- |
| W / Arrow Up | Accelerate |
| S / Arrow Down | Brake / Reverse (when nearly stopped) |
| A / Arrow Left | Steer left |
| D / Arrow Right | Steer right |
| Space | Drift (hold) |
| R | Restart |
| Esc | Pause / Resume |

Drifting is optional. Holding Space loosens the rear grip and lets the car rotate faster; a very hard turn at high speed also slides a little on its own.

## How the race works

- Press **Start race**. A three-light countdown runs; the car can't move until the lights turn green.
- The timer starts on GO and uses `performance.now()`, so it never drifts with frame rate. Paused time is not counted.
- Pass the 8 checkpoint gates in order, then cross the finish gate. The next gate pulses cyan; passed gates turn green with a ✓ label.
- Falling off (e.g. missing the jump), leaving the course or being stuck for 3 seconds respawns you at the last checkpoint. The timer keeps running.
- Your best time is stored in `localStorage` under `neonRushBestTime` (milliseconds) and survives refreshes. The sound preference is stored under `neonRushMuted`.

## Ghost car

Every lap is recorded (position and orientation, 30 times a second). When you set a new best time, that lap is saved to `localStorage` under `neonRushBestGhost` and replayed as a translucent cyan ghost on your next runs. The HUD shows your split against the ghost at every checkpoint (green = ahead, red = behind), and the finish screen shows the final gap. There is no ghost until you finish your first lap.

## Dependency

Three.js **r128** is loaded as an ES module from jsDelivr via an import map in `index.html`:

```
https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js
```

It is the only external dependency (plus the Rajdhani web font from Google Fonts, which has a system fallback). If you prefer to self-host, download `three.module.js` into the project and point the import map at the local file.

## Project structure

```
/
├── index.html        page + UI overlays + import map
├── style.css         HUD / menu styling
├── src/
│   ├── main.js       entry, WebGL detection
│   ├── game.js       scene setup, state machine, race logic, effects
│   ├── car.js        car mesh + arcade physics
│   ├── track.js      centerline control points, ground queries, track geometry
│   ├── scenery.js    deterministic trackside objects
│   ├── camera.js     chase camera
│   ├── ghost.js      records laps, replays your best as a ghost
│   ├── input.js      keyboard
│   ├── timer.js      race timer + formatting
│   ├── ui.js         DOM UI controller
│   ├── audio.js      Web Audio synthesized sounds
│   ├── particles.js  particle pool + skid marks
│   └── utils.js      helpers
├── assets/
│   ├── textures/     (empty – textures are generated on canvas)
│   └── models/       (empty – models are procedural)
└── README.md
```

## Tuning

Track layout lives in `CONTROL_POINTS` at the top of `src/track.js`; car handling constants are at the top of `src/car.js` and in `Car.update()`.

## Browser support

Current desktop Chrome, Edge, Firefox and Safari (import maps require Safari 16.4+). WebGL is feature-detected; if unavailable a message is shown instead of the game.
