/*
 * firefight.js: Warzone Firefight, a co-op multiplayer mode (1-4 players) on Arc Facility (arcmap.js).
 * Classic script (no modules): all files share one global scope, so load order in index.html matters.
 *
 * Five timed rounds with escalating objectives: clear the area, defend the generators, eliminate the commanders,
 * defend the core, and a legendary boss. Dead players respawn at the base after 5s; the team loses if a round's
 * clock runs out (or both generators fall in a defend round). Kills earn REQ points to spend at the REQ station in
 * the base (E): weapons, resupply, an overshield, and legendary variants as the REQ level rises each round.
 *
 * It rides on co-op multiplayer: the host runs the enemies and the rounds (ffUpdate), and publishes the firefight
 * state in its world update (w.ff); guests mirror it (ffClient). Enemies, damage and shots sync as in co-op.
 */

const FF_ROUNDS = [
  { n: 'CLEAR THE AREA', kind: 'clear', time: 180, squads: 6 },
  { n: 'DEFEND THE GENERATORS', kind: 'defend', time: 150, gens: [0, 1] },
  { n: 'ELIMINATE THE COMMANDERS', kind: 'bosses', time: 200 },
  { n: 'DEFEND THE CORE', kind: 'defend', time: 150, gens: [2] },
  { n: 'LEGENDARY BOSS', kind: 'boss', time: 240 }
];
const FF_BREAK = 20;
// REQ points per kill
const FF_PTS = { grunt: 10, kgrunt: 10, jackal: 15, jsniper: 20, jmajor: 25, skimmer: 20, elite: 30, selite: 35, celite: 40, hunter: 60, finf: 2, fcomb: 20, fcarr: 15, ghost: 60 };
// REQ station items: k = weapon (vr: its legendary variant), id = other; lv = REQ level needed
const FF_REQ = [
  { k: 'br', n: 'BR55 Battle Rifle', c: 60, lv: 1 }, { k: 'mg', n: 'M6D Magnum', c: 30, lv: 1 }, { k: 'pr', n: 'Type-25 Plasma Rifle', c: 60, lv: 1 },
  { k: 'nd', n: 'Type-33 Needler', c: 80, lv: 1 }, { k: 'sg', n: 'M90 Shotgun', c: 120, lv: 1 }, { id: 'ammo', n: 'Ammo resupply', c: 30, lv: 1 }, { id: 'nades', n: 'Grenade resupply', c: 40, lv: 1 },
  { k: 'sn', n: 'S2 Sniper Rifle', c: 200, lv: 2 }, { k: 'sw', n: 'Energy Sword', c: 220, lv: 2 },
  { k: 'rk', n: 'M41 Rocket Launcher', c: 300, lv: 3 }, { id: 'os', n: 'Overshield (+60 shield)', c: 150, lv: 3 },
  { k: 'sn', vr: 1, n: 'S2 Railgun (pierces everything)', c: 400, lv: 4 }, { k: 'sw', vr: 1, n: 'Prophet\'s Bane (legendary sword)', c: 420, lv: 4 }, { k: 'rk', vr: 1, n: 'M41 Hunter-Killer (homing rockets)', c: 450, lv: 4 }
];
// The map: Arc Facility (arcmap.js), defending building 01 in the south half, with a generator on each flank
const FF_SPAWNS = [[-4, -44], [4, -44], [-4, -48.5], [4, -48.5]]; // where players (re)deploy: inside building 01, around the REQ station
// REQ stations: inside the base, in the hangar, inside building 02, by the container yard and at the comms array
const FF_STATIONS = [[0, -47], [-51, -15], [58, -6], [4, 47], [34, -49]];
// Objectives, spread out so the fights cover the whole map: [x, z, name, health]. Round 2 defends the two generators
// out in the south (A by the landing pad, B by the refinery); round 4 the core, up in the north by the flooded rig.
const FF_GENS = [[32, -112, 'A', 1000], [-28, -110, 'B', 1000], [14, 32, 'C', 1600]];
// Enemy drop zones all round the base: [centre x, centre z, name]. Each squad picks one away from the players. Names
// follow the compass (compass.js), seen from the base: north is +z, east is -x.
const FF_ZONES = [[0, 78, 'NORTH'], [-40, 70, 'NORTH-EAST'], [60, 30, 'NORTH-WEST'], [-52, 18, 'THE MESA'], [-64, -40, 'EAST'], [70, -36, 'WEST'],
  [-56, -128, 'SOUTH-EAST'], [58, -96, 'SOUTH-WEST'], [12, -158, 'SOUTH'], [-32, -142, 'THE SOUTH MESA']];

const FF = { on: false, round: 0, ph: 'break', t: 0, rl: 1, left: 0, spawnT: 0, gens: [], stations: [], kills: 0, sq: 0, zn: '', zi: -1, znAt: 0, lastZ: -1, annT: -99 };

/* ---------- Setup (everyone) ---------- */

function ffSetup() {
  FF.on = true;
  FF.kills = 0;
  FF.sq = 0;
  FF.annT = -99;
  NET.ffMode = 1;
  clearHz();
  [enemies, shots, nades, drops, rockets, needles].forEach(a => a.forEach(o => scene.remove(o.g || o.m)));
  enemies = [];
  shots = [];
  nades = [];
  drops = [];
  rockets = [];
  needles = [];
  decor.forEach(g => scene.remove(g));
  L = Object.assign({}, ARC, { ff: 1 });
  lroom = 1;
  room = 0;
  buildLevel(L);
  // REQ stations: a pedestal with a glowing screen, a slowly turning hologram ring and a yellow beacon light
  const metal = new THREE.MeshPhongMaterial({ color: 0x4a5560, shininess: 80 });
  FF.stations = FF_STATIONS.map(([sx, sz]) => {
    const st = new THREE.Group();
    const box = (w, h, d, m, x, y, z) => {
      const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      o.position.set(x, y, z);
      st.add(o);
      return o;
    };
    box(1.4, 1.1, .8, metal, 0, .55, 0);
    box(1.2, .7, .06, new THREE.MeshBasicMaterial({ color: 0x5ec8f2 }), 0, 1.35, .2).rotation.x = -.35;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.6, .04, 6, 32), new THREE.MeshBasicMaterial({ color: 0x9fe4ff, transparent: true, opacity: .7 }));
    ring.position.y = 2.3;
    st.add(ring);
    const lamp = new THREE.PointLight(0xffd060, .6, 7);
    lamp.position.y = 2.6;
    st.add(lamp);
    st.position.set(sx, groundH(sx, sz), sz);
    envG.add(st);
    pillars.push({ v: 1, x: sx, z: sz, hw: .7, hd: .4, h: groundH(sx, sz) + 1.1 });
    return { g: st, ring };
  });
  // Generators: a dark base with a glowing core that dims and reddens as it takes damage
  FF.gens = FF_GENS.map(([x, z, name, max]) => {
    const g = new THREE.Group();
    const y = groundH(x, z);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, .6, 8), metal);
    base.position.y = .3;
    const core = new THREE.Mesh(new THREE.CylinderGeometry(.45, .45, 2, 12), new THREE.MeshBasicMaterial({ color: 0x5ff0ff }));
    core.position.y = 1.5;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(.9, .7, .3, 8), metal);
    cap.position.y = 2.6;
    // a tall light beam that marks it from anywhere on the map while it's an objective
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(.55, .55, 40, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0x5ff0ff, transparent: true, opacity: .16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 22;
    beam.visible = false;
    g.add(base, core, cap, beam);
    g.position.set(x, y, z);
    envG.add(g);
    pillars.push({ x, z, hw: .9, hd: .9, h: y + 2.8 });
    return { gen: true, name, x, y, z, hp: max, max, g, core, beam, flash: 0, pv: max, hitAt: -99 };
  });
  vehReset();
  P.x = FF_SPAWNS[0][0];
  P.z = FF_SPAWNS[0][1];
  P.y = groundH(P.x, P.z);
  yaw = Math.PI;
  pitch = 0;
  state = 'play';
  ov.style.display = 'none';
  ov.style.background = '';
  ov.style.justifyContent = '';
  P.req = P.req || 0;
  music.set(0);
  banner('WARZONE FIREFIGHT: ARC FACILITY');
  lock();
}

// Host: start the match (the first round begins after a short countdown)
function ffStart() {
  newRun(false, true);
  ffSetup();
  FF.round = 0;
  FF.ph = 'break';
  FF.t = 10;
  FF.rl = 1;
  // the team's Ghost is waiting from the start
  vehDeliver();
}

/* ---------- Rounds (host / solo) ---------- */

// Generators enemies can target and hit: only during a defend round
function ffTargets() {
  const R0 = FF_ROUNDS[FF.round - 1];
  return FF.ph === 'play' && R0 && R0.kind === 'defend' ? ffGensUp() : [];
}

const ffAlive = () => enemies.filter(e => !e.dead && !e.net).length;
// The objectives of round r (none outside defend rounds), and those still standing this round
const ffActive = r => {
  const R0 = FF_ROUNDS[r - 1];
  return R0 && R0.gens ? R0.gens.map(i => FF.gens[i]).filter(Boolean) : [];
};
const ffGensUp = () => ffActive(FF.round).filter(g => g.hp > 0);
const ffCap = () => 10 + 3 * NET.others();

function ffPick() {
  const r = FF.round;
  const q = Math.random();
  if (r >= 4 && q < .08)
    return 'hunter';
  if (r >= 2 && q < .16)
    return 'jsniper';
  if (r >= 2 && q < .26)
    return 'skimmer';
  if (r >= 2 && q < .36)
    return 'selite';
  if (q < .5)
    return r >= 3 ? 'jmajor' : 'jackal';
  if (q < .62)
    return 'elite';
  if (q < .7)
    return 'kgrunt';
  return 'grunt';
}

// A drop zone at least 35m from every player (and not the last one used, if there's a choice)
function ffZone() {
  const ps = (NET.host ? netRemotes() : []).concat([P]);
  const far = FF_ZONES.map((z, i) => i).filter(i => ps.every(p => Math.hypot(p.x - FF_ZONES[i][0], p.z - FF_ZONES[i][1]) > 35));
  const pool = far.length > 1 ? far.filter(i => i !== FF.lastZ) : far.length ? far : FF_ZONES.map((z, i) => i);
  const i = pool[Math.random() * pool.length | 0];
  FF.lastZ = i;
  return FF_ZONES[i];
}

// A clear spot near (cx, cz): inside the map, not in anything solid
function ffSpot(cx, cz, r) {
  for (let k = 0; k < 30; k++) {
    const x = cx + R(-r, r);
    const z = cz + R(-r, r);
    const p = { x, y: groundH(x, z) + .1, z };
    if (!outArena(p) && !inPillar(p, 1.2) && Math.hypot(x, z) < arcLimit(Math.atan2(z, x)) - 2)
      return [x, z];
  }
  return [cx, cz];
}

// Tell everyone where the enemy is coming from (not more than every 8s)
function ffAnnounce(name) {
  FF.sq++;
  FF.zn = name;
  FF.zi = FF.lastZ;
  FF.znAt = T;
  if (T - FF.annT > 8) {
    FF.annT = T;
    banner('ENEMIES INBOUND: ' + name);
  }
}

// A squad drops in at one of the zones round the map (a flash where each one lands)
function ffSquad(n) {
  const [cx, cz, name] = ffZone();
  ffAnnounce(name);
  for (let i = 0; i < n; i++) {
    const [x, z] = ffSpot(cx, cz, 7);
    spawn(ffPick(), x, z);
    const e = enemies[enemies.length - 1];
    // In defend rounds about half of them go for a generator
    if (FF_ROUNDS[FF.round - 1].kind === 'defend' && Math.random() < .5) {
      const up = ffGensUp();
      if (up.length)
        e.goal = up[Math.random() * up.length | 0];
    }
    flashFx(x, groundH(x, z) + 1.2, z, 1.6, 0xb48cff);
  }
  sfx.room();
}

function ffBoss(t, frac) {
  const zn = ffZone();
  const [cx, cz] = ffSpot(zn[0], zn[1], 5);
  spawn(t, cx, cz);
  const e = enemies[enemies.length - 1];
  e.hp *= frac;
  e.maxhp *= frac;
  e.sh *= frac;
  e.maxsh *= frac;
  flashFx(cx, groundH(cx, cz) + 2, cz, 4, 0xffd060);
  return e;
}

function ffBeginRound() {
  FF.round++;
  const R0 = FF_ROUNDS[FF.round - 1];
  FF.ph = 'play';
  FF.t = R0.time;
  FF.spawnT = 3.5;
  FF.left = R0.squads || 0;
  FF.annT = T;
  lroom = FF.round * 2; // enemies get a little tougher each round (see spawn)
  if (R0.kind === 'defend')
    ffActive(FF.round).forEach(g => g.hp = g.pv = g.max);
  if (R0.kind === 'bosses') {
    const pool = ['zealot', 'skirmisher', 'deacon', 'shipmaster'].sort(() => Math.random() - .5);
    [pool[0], pool[1]].forEach(t => ffBoss(t, .6));
  }
  if (R0.kind === 'boss')
    ffBoss(['warlord', 'warden', 'blademaster', 'ironclad', 'gravemind'][Math.random() * 5 | 0], 1);
  // a new Ghost for the team if the last one was destroyed; from round 3 an enemy Ghost joins the fight
  vehDeliver();
  if (FF.round >= 3) {
    const zn = ffZone();
    const [gx, gz] = ffSpot(zn[0], zn[1], 6);
    spawn('ghost', gx, gz);
    flashFx(gx, groundH(gx, gz) + 1.5, gz, 3, 0xb48cff);
  }
  bossTotal = enemies.filter(e => e.boss).reduce((s, b) => s + b.maxhp + b.maxsh, 0);
  music.set(1);
  banner('ROUND ' + FF.round + ': ' + R0.n + (FF.round >= 3 ? ' | ENEMY GHOST INBOUND' : ''));
}

function ffRoundWon() {
  // anything left over withdraws
  enemies.forEach(e => {
    if (!e.net) {
      e.dead = true;
      scene.remove(e.g);
    }
  });
  enemies = enemies.filter(e => !e.dead);
  clearHz();
  if (FF.round >= FF_ROUNDS.length) {
    FF.ph = 'win';
    ffEnd(true);
    return;
  }
  FF.ph = 'break';
  FF.t = FF_BREAK;
  FF.rl = Math.min(4, FF.round + 1);
  earn(25 * FF.round);
  P.req += 50;
  ffHeal();
  music.set(0);
  sfx.clear();
  banner('ROUND ' + FF.round + ' COMPLETE: REQ LEVEL ' + FF.rl);
}

// Between rounds: everyone back to full health and shields (anyone down redeploys)
function ffHeal() {
  if (NET.down)
    ffRespawn();
  else {
    P.hp = P.maxHp;
    P.sh = Math.max(P.sh, P.maxSh);
  }
}

function ffLose(why) {
  FF.ph = 'lose';
  FF.why = why;
  ffEnd(false, why);
}

function ffUpdate(dt) {
  FF.t -= dt;
  if (FF.ph === 'break') {
    if (FF.t <= 0)
      ffBeginRound();
    return;
  }
  if (FF.ph !== 'play')
    return;
  const R0 = FF_ROUNDS[FF.round - 1];
  FF.spawnT -= dt;
  const alive = ffAlive();
  if (R0.kind === 'clear') {
    if (FF.left > 0 && alive < 8 && FF.spawnT <= 0) {
      ffSquad(4 + NET.others());
      FF.left--;
      FF.spawnT = 5;
    }
    if (FF.left <= 0 && !alive)
      return ffRoundWon();
  }
  else if (R0.kind === 'defend') {
    if (alive < ffCap() && FF.spawnT <= 0) {
      ffSquad(R0.n.includes('CORE') ? 5 : 4);
      FF.spawnT = R0.n.includes('CORE') ? 5 : 7;
    }
    if (!ffGensUp().length)
      return ffLose(R0.gens.length > 1 ? 'THE GENERATORS WERE DESTROYED' : 'THE CORE WAS DESTROYED');
    if (FF.t <= 0)
      return ffRoundWon();
  }
  else {
    // commanders / boss: escorts keep coming until the bosses fall
    if (alive < ffCap() - 2 && FF.spawnT <= 0) {
      ffSquad(3);
      FF.spawnT = 9;
    }
    if (!enemies.some(e => e.boss && !e.dead))
      return ffRoundWon();
  }
  if (FF.t <= 0)
    ffLose('TIME EXPIRED');
}

/* ---------- Every page ---------- */

// REQ points for a kill (the host's own kills, or a guest's kill credit)
function ffReward(e) {
  if (!FF.on)
    return;
  P.req = (P.req || 0) + (e.boss ? 200 : FF_PTS[e.t] || 10);
  FF.kills++;
}

const ffNear = () => FF.on && FF_STATIONS.some(([x, z]) => Math.hypot(P.x - x, P.z - z) < 3.5);

function ffTick(dt) {
  if (!FF.on)
    return;
  FF.stations.forEach(s => s.ring.rotation.y += dt);
  const obj = ffObjective();
  FF.gens.forEach(g => {
    const k = g.hp / g.max;
    g.flash -= dt;
    // damage seen this frame (host or guest): it's under attack
    if (g.hp < g.pv)
      g.hitAt = T;
    g.pv = g.hp;
    const hot = T - g.hitAt < 1.5;
    g.beam.visible = !!obj && g.hp > 0 && ffActive(obj === 'next' ? FF.round + 1 : FF.round).includes(g);
    g.beam.material.color.setHex(hot && Math.floor(T * 6) % 2 ? 0xff4a3a : 0x5ff0ff);
    g.beam.material.opacity = obj === 'next' ? .08 : .16;
    g.core.material.color.setHex(g.hp <= 0 ? 0x202428 : g.flash > 0 ? 0xffffff : k > .5 ? 0x5ff0ff : k > .25 ? 0xffc040 : 0xff4a3a);
  });
  vehTick(dt);
  // respawn at the base
  if (NET.down && state === 'play') {
    NET.resp -= dt;
    if (NET.resp <= 0)
      ffRespawn();
  }
}

// Redeploy at the base with full health, shields and ammo (and at least two grenades)
// Are the generators the objective? 'now' in a defend round, 'next' in the break before one, otherwise null
function ffObjective() {
  if (!FF.on)
    return null;
  const R0 = FF_ROUNDS[FF.round - 1];
  if (FF.ph === 'play' && R0 && R0.kind === 'defend')
    return 'now';
  const N = FF_ROUNDS[FF.round];
  return FF.ph === 'break' && N && N.kind === 'defend' ? 'next' : null;
}

function ffRespawn() {
  netRevive();
  refillAmmo();
  P.nades = Math.max(P.nades, Math.min(2, P.nadeMax));
  const s = FF_SPAWNS[Math.random() * FF_SPAWNS.length | 0];
  P.x = s[0];
  P.z = s[1];
  P.y = groundH(P.x, P.z);
  P.vy = 0;
  yaw = Math.PI;
  banner('REDEPLOYED');
}

function ffText() {
  const R0 = FF_ROUNDS[Math.max(0, FF.round - 1)];
  const t = Math.max(0, Math.ceil(FF.t));
  const clock = (t / 60 | 0) + ':' + String(t % 60).padStart(2, '0');
  const head = FF.ph === 'break' ? (FF.round ? 'BREAK' : 'GET READY') + ' ' + clock : 'ROUND ' + FF.round + '/5: ' + R0.n + ' | ' + clock;
  const gens = FF.round && R0.kind === 'defend' && FF.ph === 'play' ? ' | ' + ffActive(FF.round).map(g => (g.name === 'C' ? 'CORE' : 'GEN ' + g.name) + ' ' + Math.round(100 * g.hp / g.max) + '%').join(' ') : '';
  const gh = P.veh ? ' | GHOST ' + Math.round(100 * VEH.hp / VEH.max) + '% BOOST ' + Math.round(100 * VEH.boost) + '%' : '';
  return 'FIREFIGHT | ' + head + gens + gh + ' | REQ ' + (P.req || 0) + ' (LV ' + FF.rl + ')';
}

// REQ station menu (E at the station). The match keeps running while it's open.
function ffReq() {
  if (!FF.on || state !== 'play' || NET.down)
    return;
  if (!ffNear()) {
    banner('FIND A REQ STATION (YELLOW ON THE COMPASS)');
    return;
  }
  NET.menu = 1;
  NET.menuAt = performance.now();
  down = false;
  document.exitPointerLock && document.exitPointerLock();
  ffReqDraw();
}

function ffReqDraw() {
  ov.style.display = 'flex';
  ov.style.background = 'rgba(8,10,20,.6)';
  ov.style.justifyContent = '';
  ov.innerHTML = '<h2>REQ STATION</h2><div>REQ points <b style="color:#ffd060">' + (P.req || 0) + '</b> | REQ level ' + FF.rl + '</div><div class="cards sm">'
    + FF_REQ.map((q, i) => {
      const locked = q.lv > FF.rl;
      const poor = (P.req || 0) < q.c;
      return '<button class="card" ' + (locked || poor ? 'disabled ' : '') + 'onclick="ffBuy(' + i + ')"' + (q.vr ? ' style="border-color:#c9a227"' : '') + '><b' + (q.vr ? ' style="color:#ffd060"' : '') + '>' + q.n + '</b><small>' + (locked ? 'REQ LEVEL ' + q.lv : q.c + ' REQ') + '</small></button>';
    }).join('') + '</div><button class="card" style="text-align:center;width:auto" onclick="netResume()">CLOSE (E)</button>';
}

function ffBuy(i) {
  const q = FF_REQ[i];
  if (!q || q.lv > FF.rl || (P.req || 0) < q.c || NET.down)
    return;
  P.req -= q.c;
  if (q.k) {
    setW(P, q.k);
    if (q.vr) {
      P.vr = P.vr || {};
      P.vr[q.k] = 1;
    }
  }
  else if (q.id === 'ammo')
    P.slots.forEach((w, s) => {
      if (w && w !== 'sw')
        P.sr[s] = rxOf(w);
    });
  else if (q.id === 'nades')
    P.nades = P.nadeMax;
  else if (q.id === 'os')
    P.sh = P.maxSh + 60;
  sfx.grab();
  ffReqDraw();
}

function ffEnd(win, why) {
  if (state === 'over')
    return;
  P.veh = 0;
  const bonus = win ? 300 : 50 * Math.max(0, FF.round - 1);
  const c = (P ? P.cr : 0) + bonus;
  netBank(bonus);
  music.set(win ? 2 : -1);
  if (win)
    sfx.clear();
  else
    sfx.dead();
  endScreen(win ? '<h2>FIREFIGHT VICTORY</h2>' : '<h2 style="color:#e5534b">DEFEAT</h2>', (win ? 'All 5 rounds cleared' : (why || 'Defeated') + ' in round ' + FF.round) + ' | ' + FF.kills + ' kills | +' + c + ' credits banked');
}

// Host: the firefight part of the world update
function ffState() {
  return { r: FF.round, ph: FF.ph, t: Math.max(0, Math.round(FF.t)), rl: FF.rl, gens: FF.gens.map(g => Math.round(g.hp)), why: FF.why || '', sq: FF.sq, zn: FF.zn, zi: FF.zi, v: [VEH.on ? 1 : 0, r1(VEH.x), r1(VEH.z), r2(VEH.yw), Math.round(VEH.hp), VEH.drv || ''] };
}

// Guest: mirror the host's firefight state
function ffClient(f) {
  if (!FF.on) {
    newRun(false, true);
    ffSetup();
  }
  const r = +f.r || 0;
  if (r !== FF.round || f.ph !== FF.ph) {
    if (f.ph === 'play' && r !== FF.round) {
      music.set(1);
      banner('ROUND ' + r + ': ' + FF_ROUNDS[clamp(r, 1, 5) - 1].n);
    }
    else if (f.ph === 'break' && FF.ph === 'play') {
      music.set(0);
      sfx.clear();
      P.req = (P.req || 0) + 50;
      ffHeal();
      banner('ROUND ' + FF.round + ' COMPLETE: REQ LEVEL ' + (+f.rl || 1));
    }
  }
  // where the latest squad dropped in
  if (+f.sq > FF.sq && f.ph === 'play') {
    FF.sq = +f.sq;
    FF.zi = clamp(+f.zi || 0, 0, FF_ZONES.length - 1);
    FF.znAt = T;
    if (T - FF.annT > 8 && f.zn) {
      FF.annT = T;
      banner('ENEMIES INBOUND: ' + String(f.zn).slice(0, 24));
    }
  }
  vehClient(f.v);
  FF.round = r;
  FF.ph = String(f.ph || 'break');
  FF.t = +f.t || 0;
  FF.rl = clamp(+f.rl || 1, 1, 4);
  if (Array.isArray(f.gens))
    FF.gens.forEach((g, i) => {
      const hp = clamp(+f.gens[i] || 0, 0, g.max);
      if (hp < g.hp)
        g.flash = .1;
      g.hp = hp;
    });
  if (FF.ph === 'win' || FF.ph === 'lose')
    ffEnd(FF.ph === 'win', String(f.why || '').slice(0, 60));
}
