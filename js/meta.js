/*
 * meta.js: Save data, armory upgrades, starting loadouts and legendary boons.
 * Classic script (no modules): all files share one global scope, so load order in index.html matters.
 */

let S = {
  cr: 0, ups: {}, own: {}, sel: null, done: {}
};
try {
  Object.assign(S, JSON.parse(localStorage.getItem('spartan_save') || '{}'));
}
catch (e) { }

function save() {
  try {
    localStorage.setItem('spartan_save', JSON.stringify(S));
  }
  catch (e) { }
}
const UPS = [
  {
    id: 'sh', n: 'Spartan Training', d: '+10 max shield per level', max: 5, cost: l => 60 * (l + 1), f: (p, l) => {
      p.maxSh += 10 * l;
      p.sh = p.maxSh;
    }
  },
  {
    id: 'hp', n: 'Armor Plating', d: '+6 max health per level', max: 5, cost: l => 60 * (l + 1), f: (p, l) => {
      p.maxHp += 6 * l;
      p.hp = p.maxHp;
    }
  },
  {
    id: 'dm', n: 'Marksman Training', d: '+6% damage per level', max: 5, cost: l => 80 * (l + 1), f: (p, l) => {
      p.dmg *= 1 + .06 * l;
    }
  },
  {
    id: 'ng', n: 'Grenade Pouch', d: '+1 max grenade per level', max: 3, cost: l => 90 * (l + 1), f: (p, l) => {
      p.nadeMax += l;
      p.nades = Math.min(p.nadeMax, 2 + l);
    }
  }
];
const LOADS = [
  { id: 'mg', n: 'M6D Magnum', c: 150 }, { id: 'br', n: 'BR55 Battle Rifle', c: 350 }, { id: 'sg', n: 'M90 Shotgun', c: 400 }, { id: 'pr', n: 'Type-25 Plasma Rifle', c: 450 }
];
const LEG = [
  {
    n: 'Mjolnir Mk VI', d: 'LEGENDARY: +60 max shield, +20 max health, faster recharge', f: p => {
      p.maxSh += 60;
      p.sh = p.maxSh;
      p.maxHp += 20;
      p.hp = p.maxHp;
      p.shDelay = Math.max(.8, p.shDelay - 1);
    }
  },
  {
    n: 'Prometheus Rounds', d: 'LEGENDARY: +60% weapon damage', f: p => p.dmg *= 1.6
  },
  {
    n: 'Overclocked Trigger', d: 'LEGENDARY: +40% fire rate, 30% faster reloads', f: p => {
      p.rate *= .7;
      p.reloadT *= .7;
    }
  },
  {
    n: 'Reclaimer Gift', d: 'LEGENDARY: +4 max grenades, grenades deal x1.6', f: p => {
      p.nadeMax += 4;
      p.nades = p.nadeMax;
      p.nadeMul *= 1.6;
    }
  },
  {
    n: 'Second Wind', d: 'LEGENDARY: revive once at 60% health', f: p => {
      p.revive = (p.revive || 0) + 1;
    }
  },
  {
    // w: offers the slot-replace screen like weapon boons; x: the non-weapon part, applied there too
    w: 'sw', x: p => { p.meleeMul *= 3; }, n: 'Hardlight Overdrive', d: 'LEGENDARY: melee x3 and the Energy Sword', f: p => {
      p.meleeMul *= 3;
      setW(p, 'sw');
    }
  },
  { n: 'Infinity Magazine', d: 'LEGENDARY: 25% of your shots cost no ammo', f: p => p.infMag = .25 },
  { n: 'Bubble Shield', d: 'LEGENDARY: when your shield breaks, take no damage for 2s (every 20s)', f: p => p.bubble = 1 },
  { n: 'Vampire Rounds', d: 'LEGENDARY: every kill restores 8 health', f: p => p.vamp = 8 },
  { n: 'Chain Reaction', d: 'LEGENDARY: enemies you kill have a 35% chance to explode', f: p => p.chain = .35 },
  { n: 'Active Camo', d: 'LEGENDARY: after a thruster dash, enemies hold their fire for 2s', f: p => p.camo = 1 },
  {
    n: 'Overcharged Shields', d: 'LEGENDARY: shields recharge twice as fast and start 1s sooner', f: p => {
      p.shRate = 2;
      p.shDelay = Math.max(.6, p.shDelay - 1);
    }
  },
  { n: 'Grenadier', d: 'LEGENDARY: regain a grenade every 8 seconds', f: p => p.nadeRegen = 8 },
  {
    n: 'Spartan Charge', d: 'LEGENDARY: melee x2, and melee kills fully restore your shield', f: p => {
      p.meleeMul *= 2;
      p.mkShield = 1;
    }
  }
];
LEG.forEach(b => b.r = 'l');

function earn(n) {
  P.cr += Math.round(n * DIFF.cr);
}
