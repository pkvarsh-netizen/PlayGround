# SUNSET CITY

An open-world crime sandbox that runs in the browser. Drive, steal, shoot, run jobs and outrun a rising police response across a procedurally generated sunset city.

Built with **Three.js** and plain ES modules — no build step, no package install, no external services.

## Play

Serve the folder with any static file server, then open it in a browser:

```bash
python3 -m http.server 3002
# http://localhost:3002
```

## Controls

| Desktop | Action |
| --- | --- |
| `W A S D` | Move / drive |
| `Mouse` | Look / aim (click to lock the pointer) |
| `Left click` | Fire |
| `F` | Enter / exit a vehicle |
| `Shift` | Sprint |
| `Space` | Jump / handbrake |
| `H` | Horn |
| `T` | Change radio station |
| `M` | District map |
| `Esc` | Pause |

On phones and tablets: the left stick drives movement and steering, drag the right side of the screen to look, and use the on-screen **FIRE**, **JUMP**, **ENTER / EXIT**, **RUN** and **BRAKE** buttons.

## Features

- Hand-built procedural city: 7×7 blocks, towers with lit facades, parks, billboards, street lamps, traffic and pedestrians.
- Third-person on-foot movement, aiming, shooting, health, armor and cash pickups.
- Arcade vehicle handling with multiple car types, engine audio, radio stations and vehicle damage.
- Five-star wanted system with police cars, foot officers, sirens and escalating response.
- Jobs: courier package runs and repo vehicle theft, with timers, distance markers and payouts.
- Sunset-to-night day cycle, minimap, full district map, pause menu and death/respawn flow.
- Touch-first responsive HUD plus desktop controls.
- Procedural Web Audio soundtrack, engine, gunshot and siren synthesis — no audio files.

## Project layout

```
index.html          markup, HUD, overlays
styles.css          UI, start screen, responsive + touch layout
src/main.js         boot, menus, render loop, debug state
src/game.js         gameplay systems, entities, police, missions, HUD
src/world.js        city generation, sky, lighting, scenery
src/entities.js     car / humanoid / marker / pickup meshes
src/input.js        keyboard, mouse and multi-touch input
src/audio.js        procedural Web Audio
vendor/             local Three.js and geometry helper
assets/             local display / UI fonts
```

## Notes

- All geometry, textures, lighting and audio are generated at runtime.
- The renderer uses adaptive resolution so the game stays playable on software WebGL while looking sharp on GPU-backed browsers.
