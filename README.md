# Spartan Run

A Halo-inspired first-person rogue-lite that runs in the browser. Built with plain JavaScript, [Three.js](https://threejs.org/) (r128) and the Web Audio API. No build step, no framework, no audio or model files: sound, music and enemy models are generated in code.

> **Fan project.** Not affiliated with or endorsed by Microsoft, Xbox Game Studios or 343 Industries. *Halo* and related names are their trademarks. See [Legal](#legal).

## Play

Open `index.html` through any static server (browsers block some features on `file://`):

```bash
python3 -m http.server 8000     # then visit http://localhost:8000
# or: npm start
```

After pushing to GitHub, enable **Settings → Pages → Source: GitHub Actions** and the included workflow publishes the game on every push to `main`.

## Multiplayer

Click **MULTIPLAYER** on the title screen. Set a name and colour, then either:

- **Host** a game (Co-op, Co-op Legendary or Versus). You get a 6-character code and a **Copy invite link** button. Send the link to friends, and press **Start** when everyone is in.
- **Join** by typing a friend's code, or open their invite link and press **Join**.

**Co-op** (2-4 players): the host's game runs the missions and enemies. Everyone picks their own boons; the next room starts when the whole squad has picked. Downed players come back in the next room. If everyone goes down, the run ends.

**Versus** (2-4 players): free-for-all slayer on **Blood Gulch**, modelled on the classic Halo map: a long box canyon between two bases, with rolling hills, sniper ridges along the cliffs, a winding creek, rock outcrops and trees to hide behind. Hills block line of sight and shots.

- **Loadout:** pick your primary (Assault Rifle, Battle Rifle, Shotgun or Needler) and secondary (Magnum or Plasma Rifle) in the lobby, or from the Esc menu during a match (used from your next spawn).
- **Power weapons:** a sniper rifle or rocket launcher spawns at a random spot every 35-55 seconds (at most two at once). They're shared: the first player to reach one takes it. Grenades and ammo lie around the map too.
- **Sprint:** hold Shift while moving forward. You can't shoot while sprinting.
- **Winning:** first to 15 kills, or the most kills when the 5-minute clock runs out (a shared lead is a draw). Hold **Tab** for scores.

How it connects: peer to peer over WebRTC with [PeerJS](https://peerjs.com/). Every guest connects straight to the host's browser. The free public PeerJS server is only used to find each other by code, so there is no game server to run. Some strict corporate or school networks block direct connections; home networks usually work. If the host closes the game, the match ends.

## Controls

| Input | Action |
| --- | --- |
| WASD | Move |
| Mouse | Look (click to lock the pointer) |
| Esc / P | Pause menu: resume, quit, volume and mouse sensitivity sliders |
| Left click (hold) | Fire |
| Right click (hold) | Zoom |
| Q | Grenade |
| Space | Jump |
| F | Melee |
| Shift + A/D | Thruster dash |
| Shift + W | Sprint (versus) |
| R | Reload |
| Mouse wheel / 1 / 2 | Swap weapons |
| 1-3 | Pick a boon on the boon screen |
| M / N | Mute everything / mute music |
| Tab (hold) | Multiplayer scoreboard |

## Features

- Two weapon slots, with a choice of which gun to drop when you take a third.
- Weapons: MA40 Assault Rifle, BR55 Battle Rifle, M6D Magnum, M90 Shotgun, S2 AM Sniper, Type-25 Plasma Rifle, M41 Rocket Launcher, Type-33 Needler (homing, supercombine) and the Energy Sword.
- Per-weapon reload animations, dropped magazines and sound effects.
- Three themed levels (UNSC outpost, Covenant cruiser, Forerunner ring), each with rooms of waves and a boss.
- Roguelite loop: boon after every room, a legendary boon after each boss, then mission select. Enemies scale with each level cleared.
- Missions are a run of separate rooms: each room has its own cover layout and ground. Clear it, pick a boon, then walk through the exit gate on the far wall into the next room.
- Nine bosses (Zealot Commander, Hunter Warlord, Forerunner Warden, Bonded Hunters, Blademaster, Shipmaster, Skirmisher Alpha, Grunt Deacon, Ironclad Hunter). Each mission draws its boss from a pool of three, so runs differ.
- Fourteen legendary boons, including Infinity Magazine, Bubble Shield, Vampire Rounds, Chain Reaction, Active Camo, Overcharged Shields, Grenadier and Spartan Charge.
- Weapon variants: from the second mission on, boon screens can offer a special version of a gun you carry (MA40 Shredder, BR55 Recon, M6D Executioner, M90 Breacher, S2 Railgun, Type-25 Storm, M41 Hunter-Killer, Type-33 Hive, Prophet's Bane).
- Bosses enrage at half health (a single burst can't skip past it) and are invulnerable for 1.5s while they do; in co-op their health scales hard with squad size. Legendary boons can only be taken once per run.
- Outdoor levels have rolling hills (cover, walls and markings stay on level ground) and scattered ground detail.
- Meta-progression: credits are banked even if you die and spent in the Armory on permanent upgrades and starting sidearms.
- Original adaptive score, synthesised live. The title theme (original, in the spirit of epic sci-fi scores) moves from an a cappella monk choir to piano and strings, then to war drums with a driving string ostinato; it starts on your first click or key press.

## Project layout

```
index.html        page shell and HUD markup
css/style.css     page, HUD and overlay styles
js/               game code (classic scripts, loaded in this order)
  core.js         renderer, scene, camera, collision helpers
  data.js         enemy stats (ET), boon pool (BOONS), global state
  audio.js        Web Audio SFX, in-game score, title theme
  enemies.js      enemy models, spawning, damage
  levels.js       level definitions (LV) and arena builder
  weapons.js      weapon table (W), viewmodels, firing, grenades, pickups
  meta.js         save data, armory upgrades, loadouts, legendary boons
  run.js          run flow: rooms, mission start/end
  bosses.js       boss kits: signature moves, summons, boss AI
  title.js        title-screen scene (portal, ring, meadow) and logo
  menus.js        overlay screens
  input.js        mouse and keyboard
  multiplayer.js  online co-op and versus (PeerJS), Blood Gulch map
  main.js         update loop, HUD, boot
vendor/           optional local copy of three.min.js
```

The scripts are **not ES modules**: they share one global scope, so the `<script>` order in `index.html` matters. Functions can call each other freely, but code that runs at load time (for example `buildLevel(LV[0], true)`) must come after what it uses. If you want modules later, add `import`/`export` per file and switch the tags to `type="module"`.

## Offline / no CDN

`index.html` loads Three.js r128 from cdnjs and falls back to `vendor/three.min.js`. To work offline:

```bash
curl -L -o vendor/three.min.js https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js
```

## Extending the game

- **New weapon:** add an entry to `W` in `js/weapons.js`, a viewmodel branch in `setGun`, a case in `raw.shot` / `raw.reloadX` in `js/audio.js`, and a boon in `BOONS` (`js/data.js`) with `w: '<key>'`.
- **New boon:** add `{ n, d, f: p => ... }` to `BOONS` (`js/data.js`) or `LEG` (`js/meta.js`).
- **New enemy or boss:** add to `ET` (`js/data.js`); give a boss `bn` (display name) and optional `model`/`tint` to reuse a model, then add its moves and summon squad to `BOSSKIT` (`js/bosses.js`); new moves go in `MOVES`. Add a model branch in `buildEnemy` for a new look.
- **New level:** add an entry to `LV` (`js/levels.js`) with colours, a pillar layout and a boss key. Pillar colliders are 3x3 boxes; the visual style is chosen by `sty` in `buildLevel`.
- **Armory:** edit `UPS` and `LOADS` in `js/meta.js`.

## Saved data

Progress is stored in the browser's `localStorage`: `spartan_save` (credits, upgrades, unlocks), `spartan_fps_best` (best room) and `spartan_settings` (volumes, mouse sensitivity). Clear them from dev tools to reset.

## Ideas / roadmap

- Per-level music and a pause menu
- Spartan Laser, brutes and more bosses
- Touch and gamepad controls
- Port to Godot 4 with imported `.glb` models (data tables map directly to resources)

## Legal

The code is released under the MIT licence (see `LICENSE`). That licence covers this code only. It grants no rights to Halo characters, names, designs or music. The score is original and not derived from any Halo recording or composition. If you plan to distribute or monetise the game, rename it and replace Halo-specific names and designs, or get permission from the rights holder.
