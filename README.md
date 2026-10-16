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

## Install as an app

The game is an installable web app (PWA): it gets its own window and desktop/Start-menu icon, and runs offline (multiplayer needs internet).

- **Chrome / Edge (Windows, Mac, Linux, Android, ChromeOS):** open the game and click **INSTALL AS APP** on the title screen, or the install icon at the right of the address bar.
- **Safari (Mac):** File → Add to Dock. **Safari (iPhone/iPad):** Share → Add to Home Screen.

Installed, the game fills the whole window. Updates arrive automatically the next time you open it online.

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

**Warzone Firefight** (1-4 players): co-op on **Arc Facility**, a big UNSC excavation complex in a natural rocky quarry ringed by cliffs. Team base building 01 (a REQ station inside, a walkable roof) sits in the middle. North of it: a hangar, a mesa, a Covenant outpost, a container yard, a drill rig in a flooded basin, a watchtower with a skybridge to a silo, and building 02. South of it: a comms array, a fuel depot, a landing pad with a control tower, a refinery, a crashed dropship and a second mesa. The objectives are spread out: round 2 defends two generators out in the south, round 4 the core up in the north. Almost everything can be climbed for a vantage point: stairs, rooftops, catwalks, tank tops, containers and lookouts. Enemy squads drop in from eight directions all round the map (a banner says where). Any of the first four rounds may turn into a Flood outbreak (at most one a match): Flood squads (combat forms, swarms of infection forms, carriers), and an Abomination leading the commander round. Hold out through five timed rounds: Clear the Area, Defend the Generators, Eliminate the Commanders, Defend the Core, and a Legendary Boss. Everyone heals to full between rounds; dead players redeploy at the base after 5 seconds with full ammo; you lose if a round's clock runs out or both generators fall. Objectives are marked on screen (through walls): generators to guard show their letter, health and distance (red when under attack, and a light beam over them), and commanders and bosses to kill are marked in orange. Kills earn REQ points to spend at any of the five REQ stations (in the base, the hangar, building 02, by the container yard and at the comms array; press **E**): weapons, ammo and grenade resupply, an overshield, and legendary weapon variants as the REQ level rises each round.

How it connects: peer to peer over WebRTC with [PeerJS](https://peerjs.com/). Every guest connects straight to the host's browser. The free public PeerJS server is only used to find each other by code, so there is no game server to run. Some strict corporate or school networks block direct connections; home networks usually work. If the host closes the game, the match ends.

## Controls

The full list is under **Controls** in the pause menu (Esc) and in Settings, which also has a **Fullscreen** button. The basics: WASD to move, mouse to look and fire, Space to jump, Shift + WASD to thruster-boost in that direction (in versus Shift + W sprints instead of boosting forward), R to reload, Q for a grenade, F to melee.

## Features

- Two weapon slots, with a choice of which gun to drop when you take a third.
- Weapons: MA40 Assault Rifle, BR55 Battle Rifle, M6D Magnum, M90 Shotgun, S2 AM Sniper, Type-25 Plasma Rifle, M41 Rocket Launcher, Type-33 Needler (homing, supercombine) and the Energy Sword.
- Per-weapon reload animations, dropped magazines and sound effects.
- Three themed levels (UNSC outpost, Covenant cruiser, Forerunner ring), each with rooms of waves and a boss.
- Boons come in five rarities (common, uncommon, rare, epic, legendary): each card rolls one, rarer ones turn up more often later in a run, and legendaries can appear on any boon screen as well as after a boss. Highlights include the Type-51 Carbine (hits leave a stacking radiation burn), the Spartan Laser (hold to charge a beam that cuts through a whole line), Ricochet Rounds, Shield Siphon, Last Stand and Thruster Overclock.
- You start every room at full health and shields.
- Aiming: enemies are hit anywhere on their bodies (feet to head), near-misses get a little bullet magnetism, the reticle turns red over an enemy in your weapon's range, and recoil settles back after you stop firing.
- Roguelite loop: a run is three missions, each picked at random from all the levels (an equal chance for each); boon after every room, a legendary boon after each boss. Beat the third boss to win. Enemies scale with each level cleared.
- Missions are a run of separate rooms: each room has its own cover layout and ground. Clear it and the exit gate on the far wall opens; walk through it to pick a boon, then walk the hallway beyond it to the next room, where the enemies warp in a second after you arrive. Hallways are part of the level: each is built behind the gate as the room is cleared (visible through it), with the end of the last one behind the doorway you enter the next room by. Every hallway is generated (two to four runs joined by turns, different lengths, widths and heights) in one of six styles after Halo's corridors: a UNSC ship corridor, a Covenant ship, a Forerunner passage, a Flood-infested hall, an open canyon path, or a UNSC bunker tunnel.
- Nine bosses (Zealot Commander, Hunter Warlord, Forerunner Warden, Bonded Hunters, Blademaster, Shipmaster, Skirmisher Alpha, Grunt Deacon, Ironclad Hunter). Each mission draws its boss from a pool of three, so runs differ.
- Fourteen legendary boons, including Infinity Magazine, Bubble Shield, Vampire Rounds, Chain Reaction, Active Camo, Overcharged Shields, Grenadier and Spartan Charge.
- Enemies have CE-style detailed surfaces (armour plating with seams, rivets and wear; mottled skin; veined Flood flesh) and CE rank colours: red majors among the Grunts and Elites are tougher.
- Enemy roster: Grunts (and suicide Grunts), Jackals with needlers, Jackal Snipers (laser-sighted beam rifles) and Jackal Majors, Elites and Sword Elites, flying Skimmers, Hunters (with a shield bash), and the Flood (after Halo 3's): spider-legged infection forms, combat forms (infected Marines and Elites with whip arms), bloated carrier forms, and the hulking Abomination and the Proto-Gravemind as bosses.
- Ghosts (Firefight): the team gets a drivable Ghost at the base from round 1, and a new one each round if it was destroyed. E gets in and out; the mouse steers, W/S/A/D drive, Shift boosts, click fires the twin plasma cannons, and ramming at speed splatters enemies. It soaks most of the damage aimed at its driver. From round 3 an enemy Ghost joins each round, circle-strafing and boosting in to ram.
- Warthog (Firefight, REQ level 2, 250 REQ): delivered beside the base. Walk up to a seat and press E: the driver's side (the mouse steers, W/S throttle and reverse, it drifts in hard turns, and it runs enemies over), the passenger's side (shoot your own weapons from the seat) or the chaingun in the back. It soaks most of the damage aimed at its crew and can be bought again once it's destroyed.
- Compass (every mode): a heading strip across the top of the screen marks enemies (red, bosses orange), teammates (blue) and, in Firefight, REQ stations (yellow), generators under attack (cyan) and the latest enemy drop zone (purple). Versus shows directions only.
- Shallow water (the Blood Gulch creek, the flooded pit on Arc Facility) is knee deep at most and slows you a little while you wade.
- Halo: Combat Evolved look: bloom on glowing things, CE's saturated colour grade and vignette, real-time sun shadows from characters, vehicles and props, chrome-like reflective Covenant armour and weapons, drifting cloud layers and a glowing sun on outdoor levels, and the CE HUD (blue shield bar and segmented health top-right, ammo with bullet rows top-left, the motion tracker bottom-left, the broken-ring reticle). The settings panel has a GRAPHICS: HIGH/LOW toggle (LOW turns off bloom, grading and shadows).
- Look: first-person weapons are fully modelled and held in armoured Spartan gloves (the MA40 and BR55 have working digital ammo counters, the Needler's crystals run down as you fire, Covenant weapons glow), and enemies have detailed armour, glowing trim and a stylized rim light.
- Enemy tactics (every mode): ranged enemies fight from cover, hiding then stepping out (or standing up behind low cover) to fire, and move when flanked; they hold fire until they can see you. Jackal Snipers climb to high ground with a clear line of sight. Melee and suicide enemies rush you. Enemy plasma flies as fast glowing bolts.
- Quarantine Zone: a Flood-infested swamp facility, with the Proto-Gravemind or the Flood Abomination as its boss.
- Legendary runs: from the third mission, Cloaked Sword Elites can appear: only a faint shimmer, sword included, they reveal themselves only when they strike or are hit.
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
  hall.js         the hallway walk between rooms
  graphics.js     the CE look: post-processing (bloom, grade), sun shadows, reflections, skies
  gunmodels.js    the first-person weapon models and arms
  weapons.js      weapon table (W), viewmodels, firing, grenades, pickups
  meta.js         save data, armory upgrades, loadouts, legendary boons
  run.js          run flow: rooms, mission start/end
  bosses.js       boss kits: signature moves, summons, boss AI
  ai.js           enemy tactics: cover, peeking, line of sight, sniper perches
  compass.js      the HUD compass and its markers
  ghost.js        Ghosts: the drivable one (Firefight) and the enemy one
  warthog.js      the Warthog (Firefight): three seats, driving, the chaingun
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
