/*
 * data.js: Enemy stats (ET), the boon pool (BOONS) and global game state.
 * Classic script (no modules): all files share one global scope, so load order in index.html matters.
 */

const ET = {
  grunt: { hp: 18, sh: 0, sp: 3, sc: 1, col: 0xe8943a, fr: 2.2, bs: 13, bd: 6, burst: 1, pref: 11, panic: 1 },
  jackal: { hp: 16, sh: 35, sp: 5.5, sc: .95, col: 0xff5fd0, fr: 1.7, bs: 13, bd: 3, burst: 3, pref: 14, needle: 1 },
  // Suicide Grunt: sprints at you and detonates (see kamiBoom)
  kgrunt: { model: 'kgrunt', tint: 0xc94f2a, hp: 18, sh: 0, sp: 6.8, sc: 1, col: 0x6fd0ff, fr: 9, bs: 0, bd: 0, burst: 0, pref: 0, kami: 1 },
  elite: { hp: 30, sh: 70, sp: 4.5, sc: 1.15, col: 0x7b86f0, fr: 1.9, bs: 21, bd: 8, burst: 3, pref: 12 },
  // Sword Elite: melee only; bd is slash damage, fr the time between slashes
  selite: { model: 'selite', tint: 0x8a1f2a, hp: 30, sh: 70, sp: 5.2, sc: 1.15, col: 0x6fd0ff, fr: 1.5, bs: 0, bd: 30, burst: 0, pref: 0, melee: 1 },
  // Cloaked Sword Elite (Legendary, later missions): active camo (sword included), visible only while attacking or just after being hit
  celite: { model: 'selite', tint: 0x1c2a40, hp: 30, sh: 80, sp: 5.6, sc: 1.15, col: 0x6fd0ff, fr: 1.4, bs: 0, bd: 32, burst: 0, pref: 0, melee: 1, camo: 1 },
  hunter: { hp: 200, sh: 0, sp: 2.6, sc: 1.7, col: 0x5fbf5f, fr: 2.4, bs: 15, bd: 12, burst: 3, spread: 1, armor: .5, pref: 9 },
  // Bosses: armor = fraction of all incoming damage ignored
  zealot: { model: 'elite', tint: 0xe0c060, bn: 'Zealot Commander', hp: 200, sh: 220, sp: 5.2, sc: 1.8, col: 0xffd060, fr: 1.3, bs: 24, bd: 14, burst: 3, pref: 11, sum: 1, armor: .25 },
  warlord: { model: 'hunter', tint: 0x8a2a2a, bn: 'Hunter Warlord', hp: 650, sh: 0, sp: 3.2, sc: 2.3, col: 0xff5a3a, fr: 2, bs: 17, bd: 17, burst: 5, spread: 1, armor: .5, pref: 9 },
  bonded: { model: 'hunter', tint: 0x2f6f8f, bn: 'Bonded Hunter', hp: 420, sh: 0, sp: 3.4, sc: 2.1, col: 0x7dff6a, fr: 2.2, bs: 17, bd: 15, burst: 3, spread: 1, armor: .45, pref: 9 },
  blademaster: { model: 'selite', tint: 0xd8dde6, bn: 'Blademaster', hp: 300, sh: 260, sp: 6, sc: 1.7, col: 0x6fd0ff, fr: 1.2, bs: 0, bd: 30, burst: 0, pref: 0, melee: 1, armor: .25 },
  warden: { model: 'elite', tint: 0x30c8c0, bn: 'Forerunner Warden', hp: 450, sh: 300, sp: 4.4, sc: 2.2, col: 0x40ffe8, fr: 1.1, bs: 22, bd: 14, burst: 5, spread: 1, pref: 12, sum: 1, armor: .25 },
  // More bosses (each mission picks one from its pool each run; see LV bosses in levels.js)
  shipmaster: { model: 'elite', tint: 0x7a3fb0, bn: 'Shipmaster', hp: 320, sh: 300, sp: 4.8, sc: 2, col: 0xc890ff, fr: 1.2, bs: 24, bd: 14, burst: 4, spread: 1, pref: 12, sum: 1, armor: .25 },
  skirmisher: { model: 'jackal', tint: 0x8a4a2a, bn: 'Skirmisher Alpha', hp: 260, sh: 220, sp: 6.5, sc: 1.8, col: 0xff8a4a, fr: 1.1, bs: 24, bd: 9, burst: 3, pref: 16, needle: 1, armor: .2 },
  deacon: { model: 'grunt', tint: 0xd8b040, bn: 'Grunt Deacon', hp: 380, sh: 140, sp: 3.6, sc: 2.2, col: 0x9fe8ff, fr: 1.4, bs: 20, bd: 12, burst: 5, spread: 1, pref: 12, armor: .3 },
  ironclad: { model: 'hunter', tint: 0x6a7480, bn: 'Ironclad Hunter', hp: 720, sh: 0, sp: 3, sc: 2.4, col: 0x8ff6ff, fr: 2.1, bs: 18, bd: 18, burst: 3, spread: 1, armor: .5, pref: 10 },
  // Jackal Sniper: hangs back, aims a red laser sight, then fires a beam rifle shot (MOVES.snipe). Jackal Major: tougher, faster-firing, gold armour
  jsniper: { model: 'jsniper', hp: 16, sh: 0, sp: 4.5, sc: .95, col: 0xff4f8f, fr: 3.4, bs: 0, bd: 24, burst: 0, pref: 22, sniper: 1 },
  jmajor: { model: 'jmajor', tint: 0x8a6a2a, hp: 26, sh: 75, sp: 6, sc: 1.05, col: 0xffb040, fr: 1.25, bs: 15, bd: 4, burst: 4, pref: 13, needle: 1 },
  // Skimmer: flies (fly) a few metres up, darting about and over cover
  // Ghost: a Covenant hover bike (Firefight, from round 3): circle-strafes with plasma cannons, boosts in to ram (ghostAI)
  ghost: { model: 'ghost', hp: 280, sh: 0, sp: 8, sc: 1.6, col: 0x6fd0ff, fr: 1.1, bs: 30, bd: 5, burst: 4, pref: 16, armor: .35, veh: 1, hov: -.6 },
  skimmer: { model: 'skimmer', hp: 14, sh: 25, sp: 7.5, sc: 1, col: 0x9fff6a, fr: 1.3, bs: 17, bd: 5, burst: 3, pref: 12, fly: 1 },
  // The Flood. boom: [radius, damage to enemies, damage to you] when a kami form bursts; prime / kfuse: how close it gets and how long it takes; brood: infection forms released
  finf: { model: 'finf', hp: 5, sh: 0, sp: 8.5, sc: .55, col: 0xd8e070, fr: 9, bs: 0, bd: 0, burst: 0, pref: 0, kami: 1, boom: [2.2, 15, 9], prime: 1.3, kfuse: .12 },
  fcomb: { model: 'fcomb', hp: 55, sh: 0, sp: 5.4, sc: 1.1, col: 0xd8e070, fr: 1.3, bs: 0, bd: 16, burst: 0, pref: 0, melee: 1 },
  fcarr: { model: 'fcarr', hp: 30, sh: 0, sp: 2.2, sc: 1, col: 0xd8e070, fr: 9, bs: 0, bd: 0, burst: 0, pref: 0, kami: 1, boom: [5, 50, 30], prime: 2.6, kfuse: .9, brood: 3 },
  gravemind: { model: 'gravemind', tint: 0xb07c68, bn: 'Proto-Gravemind', hp: 950, sh: 0, sp: 1.3, sc: 2.2, col: 0xd8e070, fr: 1.6, bs: 14, bd: 12, burst: 5, spread: 1, pref: 10, armor: .35 },
  abom: { model: 'ftank', bn: 'Flood Abomination', hp: 720, sh: 0, sp: 4.8, sc: 1.75, col: 0xd8e070, fr: 1.6, bs: 0, bd: 28, burst: 0, pref: 0, melee: 1, armor: .35 }
};
// Boss weak points [x, y, z, radius] in model space (scaled with the boss). Elites: helmet gem + back power core.
// Hunters: exposed orange core in the stomach and on the back. A hit deals CRIT_MUL and ignores armor.
const CRITS = {
  elite: { col: 0xffe066, pts: [[0, 1.78, .38, .15], [0, 1.2, -.32, .2]] },
  hunter: { col: 0xff7a2a, pts: [[0, 1.12, .4, .18], [0, 1.15, -.6, .2]] },
  // Jackal: head and the back of the harness; Grunt: breather mask and methane tank
  jackal: { col: 0xffa050, pts: [[0, 1.7, .28, .13], [0, 1.15, -.22, .16]] },
  grunt: { col: 0x7fe0ff, pts: [[0, 1.3, .46, .14], [0, 1.3, -.38, .2]] },
  // Flood: glowing pustules on the Gravemind's crown and back; the Abomination's head growth and hump
  gravemind: { col: 0xeaff60, pts: [[0, 2.75, .78, .2], [0, 2.3, -.95, .26]] },
  ftank: { col: 0xeaff60, pts: [[0, 1.86, .6, .15], [.15, 1.75, -.58, .22]] },
  fcomb: { col: 0xeaff60, pts: [[0, 1.66, .44, .12], [.1, 1.45, -.3, .17]] }
};
const CRIT_MUL = 2.5;
const BOONS = [
  {
    n: 'Overshield Capacitor', d: '+30 max shield', f: p => {
      p.maxSh += 30;
      p.sh += 30;
    }
  },
  {
    n: 'Quick Recharge', d: 'Shields recharge 1s sooner', f: p => p.shDelay = Math.max(.8, p.shDelay - 1)
  },
  {
    n: 'Hardened Rounds', d: '+30% weapon damage (diminishing returns)', f: p => p.dmg *= 1.3
  },
  {
    n: 'Tuned Trigger', d: '+25% fire rate (diminishing returns)', f: p => p.rate *= .8
  },
  {
    n: 'Extended Mag', d: '+16 magazine (scaled to weapon), refill', f: p => {
      p.mb = (p.mb || 0) + 16;
      recalcMag();
      p.ammo = p.magMax;
    }
  },
  {
    n: 'Grenade Bandolier', d: '+2 max grenades, refill', f: p => {
      p.nadeMax += 2;
      p.nades = p.nadeMax;
    }
  },
  {
    n: 'Bigger Boom', d: '+40% grenade radius and damage', f: p => p.nadeMul *= 1.4
  },
  {
    // (rooms already start at full health, so this is a lasting upgrade instead)
    mx: p => (p.hpRegen || 0) >= 6, n: 'Biofoam Injector', d: '+20 max health, and health slowly regenerates (+2/s, stacks) after 5s without being hit', f: p => {
      p.maxHp += 20;
      p.hp += 20;
      p.hpRegen = (p.hpRegen || 0) + 2;
    }
  },
  {
    n: 'Hardlight Strike', d: 'Melee damage x2', f: p => p.meleeMul *= 2
  },
  {
    n: 'Fast Hands', d: 'Reload 40% faster', f: p => p.reloadT *= .6
  },
  // once: offered until taken; mx: stop offering when maxed
  {
    once: 1, n: 'Scavenger', d: 'Ammo pickups give double ammo', f: p => p.scav = 2
  },
  {
    once: 1, n: 'Steady Aim', d: '40% tighter weapon spread', f: p => p.acc = .6
  },
  {
    once: 1, n: 'Headhunter', d: 'Headshots deal 40% more', f: p => p.hsMul = 1.4
  },
  {
    once: 1, n: 'Sticky Grenades', d: 'Grenades stick to enemies they touch', f: p => p.sticky = 1
  },
  {
    once: 1, n: 'Adrenaline', d: '+35% move speed for 3s after each kill', f: p => p.adr = 1
  },
  {
    once: 1, n: 'EMP Discharge', d: 'When your shield breaks, strip the shields of enemies within 7m (10s cooldown)', f: p => p.emp = 1
  },
  {
    mx: p => p.dr >= .36, n: 'Thick Plating', d: 'Take 12% less damage (up to 36%)', f: p => p.dr = Math.min(.36, (p.dr || 0) + .12)
  },
  {
    n: 'Deep Pockets', d: '+50% max reserve ammo, and fill it', f: p => {
      p.resMul = (p.resMul || 1) + .5;
      p.slots.forEach((w, i) => {
        if (w && w !== 'sw')
          p.sr[i] = rxOf(w);
      });
    }
  },
  {
    w: 'br', n: 'BR55 Battle Rifle', d: 'WEAPON: precise three-round burst, headshots x2.2', f: p => setW(p, 'br')
  },
  {
    w: 'mg', n: 'M6D Magnum', d: 'WEAPON: heavy pistol, headshots x2.5', f: p => setW(p, 'mg')
  },
  {
    w: 'sg', n: 'M90 Shotgun', d: 'WEAPON: 9 pellets, devastating up close', f: p => setW(p, 'sg')
  },
  {
    w: 'sn', n: 'S2 AM Sniper Rifle', d: 'WEAPON: pierces 2 enemies, headshots x3. Right-click zooms', f: p => setW(p, 'sn')
  },
  {
    w: 'pr', n: 'Type-25 Plasma Rifle', d: 'WEAPON: rapid fire, shreds shields', f: p => setW(p, 'pr')
  },
  {
    w: 'rk', n: 'M41 Rocket Launcher', d: 'WEAPON: explosive rounds, 2 per magazine', f: p => setW(p, 'rk')
  },
  {
    w: 'nd', n: 'Type-33 Needler', d: 'WEAPON: homing needles; 7 stuck in one enemy supercombine and explode', f: p => setW(p, 'nd')
  },
  {
    w: 'sw', n: 'Energy Sword', d: 'WEAPON: click to slash, lunges at enemies in front of you', f: p => setW(p, 'sw')
  },
  {
    w: 'cb', r: 'r', n: 'Type-51 Carbine', d: 'WEAPON: precise semi-auto, headshots x2.4; hits leave a stacking radiation burn', f: p => setW(p, 'cb')
  },
  {
    w: 'sl', r: 'e', n: 'Spartan Laser', d: 'WEAPON: hold fire to charge (0.8s), then a beam that cuts through every enemy in a line', f: p => setW(p, 'sl')
  },
  {
    once: 1, r: 'u', n: 'Shield Siphon', d: 'Kills restore 15 shield', f: p => p.siphon = 15
  },
  {
    mx: p => (p.tcdMul || 1) <= .4, r: 'c', n: 'Thruster Overclock', d: 'Thruster recharges 30% faster', f: p => p.tcdMul = (p.tcdMul || 1) * .7
  },
  {
    once: 1, r: 'r', n: 'Last Stand', d: '+50% damage while you are below 30% health', f: p => p.lastStand = 1
  },
  {
    once: 1, r: 'e', n: 'Ricochet Rounds', d: '25% of your hits ricochet into another enemy within 8m for 60% damage', f: p => p.rico = .25
  }
];
// Rarity of each boon (r): common, uncommon, rare, epic; legendary boons are the LEG list (meta.js). Each card in a boon
// offer rolls a rarity first (see makeChoices), so the rarer ones turn up less often, and more often later in a run.
const RARITY = { c: { n: 'COMMON', w: 50 }, u: { n: 'UNCOMMON', w: 28 }, r: { n: 'RARE', w: 14 }, e: { n: 'EPIC', w: 6 }, l: { n: 'LEGENDARY', w: 2 } };
const BOON_R = {
  'Overshield Capacitor': 'c', 'Quick Recharge': 'c', 'Extended Mag': 'c', 'Grenade Bandolier': 'c', 'Biofoam Injector': 'c', 'Fast Hands': 'c', 'Deep Pockets': 'c', 'M6D Magnum': 'c',
  'Hardened Rounds': 'u', 'Tuned Trigger': 'u', 'Bigger Boom': 'u', 'Hardlight Strike': 'u', 'Scavenger': 'u', 'Steady Aim': 'u', 'BR55 Battle Rifle': 'u', 'M90 Shotgun': 'u', 'Type-25 Plasma Rifle': 'u',
  'Headhunter': 'r', 'Sticky Grenades': 'r', 'Adrenaline': 'r', 'Thick Plating': 'r', 'S2 AM Sniper Rifle': 'r', 'Type-33 Needler': 'r',
  'EMP Discharge': 'e', 'M41 Rocket Launcher': 'e', 'Energy Sword': 'e'
};
BOONS.forEach(b => b.r = b.r || BOON_R[b.n] || 'c');
let state = 'title';
let P;
let enemies = [];
let shots = [];
let nades = [];
let fx = [];
let tracers = [];
let room = 0;
let kills = 0;
let best = 0;
let T = 0;
let yaw = 0;
let pitch = 0;
let choices = [];
let vig = 0;
let hitT = 0;
let hitCol = '';
try {
  best = +localStorage.getItem('spartan_fps_best') || 0;
}
catch (e) { }
const keys = {};
let down = false;
let locked = false;
let L = null;
let bossTotal = 0; // combined starting health + shields of the current boss fight (for the boss bar)
let lroom = 0;
let pw = null;
let ptitle = 'ROOM CLEARED';
