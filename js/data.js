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
  hunter: { hp: 200, sh: 0, sp: 2.6, sc: 1.7, col: 0x5fbf5f, fr: 2.4, bs: 15, bd: 12, burst: 3, spread: 1, armor: .5, pref: 9 },
  // Bosses: armor = fraction of all incoming damage ignored
  zealot: { model: 'elite', tint: 0xe0c060, bn: 'Zealot Commander', hp: 200, sh: 220, sp: 5.2, sc: 1.8, col: 0xffd060, fr: 1.3, bs: 24, bd: 14, burst: 3, pref: 11, sum: 1, armor: .25 },
  warlord: { model: 'hunter', tint: 0x8a2a2a, bn: 'Hunter Warlord', hp: 650, sh: 0, sp: 3.2, sc: 2.3, col: 0xff5a3a, fr: 2, bs: 17, bd: 17, burst: 5, spread: 1, armor: .5, pref: 9 },
  bonded: { model: 'hunter', tint: 0x2f6f8f, bn: 'Bonded Hunter', hp: 420, sh: 0, sp: 3.4, sc: 2.1, col: 0x7dff6a, fr: 2.2, bs: 17, bd: 15, burst: 3, spread: 1, armor: .45, pref: 9 },
  blademaster: { model: 'selite', tint: 0xd8dde6, bn: 'Blademaster', hp: 300, sh: 260, sp: 6, sc: 1.7, col: 0x6fd0ff, fr: 1.2, bs: 0, bd: 30, burst: 0, pref: 0, melee: 1, armor: .25 },
  warden: { model: 'elite', tint: 0x30c8c0, bn: 'Forerunner Warden', hp: 450, sh: 300, sp: 4.4, sc: 2.2, col: 0x40ffe8, fr: 1.1, bs: 22, bd: 14, burst: 5, spread: 1, pref: 12, sum: 1, armor: .25 }
};
// Boss weak points [x, y, z, radius] in model space (scaled with the boss). Elites: helmet gem + back power core.
// Hunters: exposed orange core in the stomach and on the back. A hit deals CRIT_MUL and ignores armor.
const CRITS = {
  elite: { col: 0xffe066, pts: [[0, 1.78, .38, .15], [0, 1.2, -.32, .2]] },
  hunter: { col: 0xff7a2a, pts: [[0, 1.12, .4, .18], [0, 1.15, -.6, .2]] }
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
    n: 'Medkit', d: 'Full health, +10 max health', f: p => {
      p.maxHp += 10;
      p.hp = p.maxHp;
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
  }
];
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
