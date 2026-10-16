/*
 * run.js: Run flow: new run, rooms, bosses, mission start and end.
 * Classic script (no modules): all files share one global scope, so load order in index.html matters.
 */

// Difficulty: Legendary scales enemy toughness, incoming damage, enemy fire rate and shot speed, room size and credits.
const DIFFS = {
  normal: { hp: 1, dmg: 1, fr: 1, bs: 1, extra: 0, cr: 1 },
  legendary: { hp: 1.5, dmg: 1.6, fr: .8, bs: 1.15, extra: 2, cr: 1.5 }
};
let LEGEND = false;
let DIFF = DIFFS.normal;

// leg: true/false picks the difficulty; omitted keeps the current one (New run after a death)
// noStart: build the player only (a co-op guest waits for the host to pick the mission)
function newRun(leg, noStart) {
  if (leg != null)
    LEGEND = leg;
  DIFF = LEGEND ? DIFFS.legendary : DIFFS.normal;
  audio.init();
  clearHz();
  enemies.forEach(e => scene.remove(e.g));
  shots.forEach(s => scene.remove(s.m));
  nades.forEach(n => scene.remove(n.m));
  drops.forEach(d => scene.remove(d.m));
  drops = [];
  rockets.forEach(r => scene.remove(r.m));
  rockets = [];
  L = null;
  decor.forEach(g => scene.remove(g));
  needles.forEach(n => scene.remove(n.m));
  needles = [];
  debris.forEach(d => scene.remove(d.m));
  debris = [];
  enemies = [];
  shots = [];
  nades = [];
  room = 0;
  kills = 0;
  yaw = 0;
  pitch = 0;
  P = { x: 0, z: A * .64, hp: 40, maxHp: 40, sh: 60, maxSh: 60, shDelay: 3, last: -99, speed: 6, dmg: 8, rate: .09, cd: 0, magMax: 32, ammo: 32, reload: 0, wpn: 'ar', slots: ['ar', null], sa: [32, 0], sr: [W.ar.rs, 0], cur: 0, mb: 0,reloadT: 1.3, nades: 2, nadeMax: 3, nadeMul: 1, mcd: 0, meleeMul: 1, boons: [], done: [], cr: 0, revive: 0, y: 0, vy: 0, thrust: true, tcd: 0, dash: 0, dashF: 0, dashS: 0 };
  // Armory upgrades and your starting sidearm are for solo runs only: multiplayer starts everyone equal
  if (!NET.mode) {
    UPS.forEach(x => {
      const l = S.ups[x.id] || 0;
      if (l)
        x.f(P, l);
    });
    if (S.sel && S.own[S.sel]) {
      P.slots[1] = S.sel;
      P.sa[1] = W[S.sel].mag;
      P.sr[1] = W[S.sel].rs;
    }
  }
  setGun('ar');
  if (!noStart)
    nextRoom();
}

function nextRoom() {
  if (!L) {
    nextMission();
    return;
  }
  room++;
  lroom++;
  L.cleared = false;
  // Each room after the first is its own area: fresh cover and ground, entered from the south
  if (lroom > 1) {
    setupRoom();
    // the doorway you just came through from the hallway
    addEntry();
  }
  state = 'play';
  NET.phase = 'p';
  NET.menu = 0;
  if (NET.down)
    netRevive();
  // every new room starts at full health and shields
  P.hp = P.maxHp;
  P.sh = Math.max(P.sh, P.maxSh);
  ov.style.display = 'none';
  ov.style.background = '';
  ov.style.justifyContent = '';
  sfx.room();
  music.set(1);
  P.nades = Math.min(P.nadeMax, P.nades + 1);
  P.hp = Math.min(P.maxHp, P.hp + 6);
  // The room's enemies warp in a second after you arrive (see L.wave in update)
  L.waveT = 1;
  L.wave = () => {
  // Every extra co-op player adds two enemies per room
  const n = Math.min(3 + lroom * 2 + P.done.length * 2 + DIFF.extra + 2 * NET.others(), 14 + DIFF.extra + 2 * NET.others());
  if (lroom > L.rooms) {
    for (let i = 0; i < (L.bossN || 1); i++)
      spawn(L.boss);
    bossTotal = enemies.filter(e => e.boss).reduce((s, b) => s + b.maxhp + b.maxsh, 0);
    for (let i = 0; i < 3; i++)
      spawn(L.mix[0]);
  }
  else
    for (let i = 0; i < n; i++) {
      const mx = L.mix;
      let t = mx[0];
      // The Flood: combat forms, packs of three infection forms, and (from room 2) carriers
      if (L.flood) {
        const q = Math.random();
        if (q < .5)
          spawn('fcomb');
        else if (q < .82 || lroom < 2)
          for (let k = 0; k < 3; k++)
            spawn('finf');
        else
          spawn('fcarr');
        continue;
      }
      const r = Math.random();
      if (lroom >= 2 && r < .45)
        t = mx[1];
      if (lroom >= 3 && r > .8)
        t = mx[2];
      if (lroom >= 2 && r > .68 && r <= .8)
        t = 'selite';
      if (lroom >= 2 && r > .58 && r <= .68)
        t = 'kgrunt';
      // Jackal Snipers from room 2; Skimmers from the second mission; Jackal Majors from the third
      const r2 = Math.random();
      if (lroom >= 2 && r2 < .1)
        t = 'jsniper';
      else if (P.done.length >= 1 && r2 > .9)
        t = 'skimmer';
      if (t === 'jackal' && P.done.length >= 2 && Math.random() < .4)
        t = 'jmajor';
      // Legendary, from the third mission: sometimes a Cloaked Sword Elite
      if (LEGEND && P.done.length >= 2 && lroom >= 2 && Math.random() < .12)
        t = 'celite';
      spawn(t);
    }
  if (lroom === L.rooms)
    spawn(L.flood ? 'fcarr' : 'hunter');
  // a flash where each one appears
  enemies.forEach(e => {
    if (!e.camo)
      flashFx(e.x, groundH(e.x, e.z) + 1.2 * e.sc, e.z, 1.6 * e.sc, ET[e.t].col || 0x7fd8ff);
  });
  sfx.room();
  if (enemies.some(e => e.camo))
    banner('WARNING: ACTIVE CAMO DETECTED');
  };
  addGate(lroom <= L.rooms);
  banner(lroom > L.rooms ? 'BOSS: ' + (L.bn || ET[L.boss].bn) : L.n + ' - ROOM ' + lroom + '/' + L.rooms);
  lock();
}

function setupRoom() {
  clearHz();
  drops.forEach(d => scene.remove(d.m));
  drops = [];
  L.lay = roomLayout(L, lroom);
  L.seed = L.id + lroom;
  buildLevel(L);
  P.x = 0;
  P.z = A * .64;
  P.y = groundH(P.x, P.z);
  P.vy = 0;
  P.dash = 0;
  yaw = 0;
  pitch = 0;
}

// Room cleared: the exit gate opens. Walking through it brings up the boon choice, then the next room starts.
function openGate() {
  NET.phase = 'g';
  setGateOpen();
  sfx.recharge();
  banner('ROOM CLEAR: HEAD THROUGH THE EXIT');
}

// Through the exit gate: choose a boon (afterPick then starts the next room)
function startPick() {
  NET.phase = 'k';
  NET.menu = 0;
  state = 'pick';
  if (gate)
    gate.open = false;
  document.exitPointerLock && document.exitPointerLock();
  makeChoices();
  ov.style.display = 'flex';
  showPick('CHOOSE A BOON');
  // You walked in on purpose, so no anti-misclick lock (the legendary pick after a boss keeps it)
  pickAt = 0;
  pickTick();
}

function bossDown() {
  NET.phase = 'L';
  NET.menu = 0;
  clearHz();
  earn(100 + 50 * P.done.length);
  S.done[L.id] = 1;
  P.done.push(L.id);
  save();
  state = 'pick';
  P.pending = 1;
  music.set(0);
  sfx.clear();
  document.exitPointerLock && document.exitPointerLock();
  // Each legendary boon can only be taken once per run; if you have them all, a normal boon offer instead
  choices = LEG.filter(b => !P.boons.includes(b.n)).sort(() => Math.random() - .5).slice(0, 3);
  if (!choices.length)
    makeChoices();
  showPick('MISSION COMPLETE: ' + (L.bn || ET[L.boss].bn) + ' DEFEATED');
}

// Every mission starts with full magazines, full reserves and a full sword battery.
function refillAmmo() {
  P.slots.forEach((w, i) => {
    if (!w)
      return;
    const m = Math.max(1, Math.round(W[w].mag + (P.mb || 0) * W[w].mbs));
    if (i === P.cur)
      P.ammo = m;
    else
      P.sa[i] = m;
    if (w !== 'sw')
      P.sr[i] = rxOf(w);
  });
  P.reload = 0;
  P.bl = 0;
}

function startLevel(i) {
  clearHz();
  // A copy, so the run's boss pick and per-room layout don't change the level table
  L = Object.assign({}, LV[i], pickBoss(LV[i]), { lay0: LV[i].lay, seed: LV[i].id + 1 });
  lroom = 0;
  buildLevel(L);
  refillAmmo();
  P.x = 0;
  P.z = A * .64;
  P.y = 0;
  P.vy = 0;
  P.dash = 0;
  yaw = 0;
  pitch = 0;
  nextRoom();
}

function endRun(v) {
  const bonus = v ? Math.round(250 * DIFF.cr) : 0;
  S.cr += P.cr + bonus;
  save();
  if (room > best) {
    best = room;
    try {
      localStorage.setItem('spartan_fps_best', best);
    }
    catch (e) { }
  }
  ov.style.background = '';
  ov.style.justifyContent = '';
  if (v) {
    state = 'dead';
    ov.style.display = 'flex';
    ov.innerHTML = '<h2>RUN COMPLETE</h2><div>All missions cleared' + (LEGEND ? ' on LEGENDARY' : '') + '. +' + (P.cr + bonus) + ' credits banked</div><div class="cards"><button class="card" onclick="newRun()"><b>New run</b></button><button class="card" onclick="armory()"><b>Armory</b></button></div>';
  }
}
