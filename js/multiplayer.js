/*
 * multiplayer.js: Online co-op and versus (Blood Gulch), peer to peer.
 * Classic script (no modules): all files share one global scope, so load order in index.html matters.
 *
 * Transport: PeerJS (WebRTC data channels). The host's browser is the hub: every guest connects straight to it,
 * and the free public PeerJS server is only used so the browsers can find each other (by join code).
 *
 * State travels as "presence": each page keeps one object describing itself and sends it ~20 times a second.
 * - p: every player's Spartan (position, health, recent shots, cumulative damage dealt, kill tally...)
 * - w: the host's world (mode, phase, and in co-op the enemies, enemy shots, boss hazards and damage dealt to guests)
 * Guests send their presence to the host; the host sends everyone a snapshot of all presences.
 * Everything is absolute state, so a lost or late update is simply replaced by the next one.
 *
 * Co-op: the host runs the enemies; guests see "ghost" copies and report the damage they deal as running totals per
 * enemy, and the host reports the damage enemies deal to each guest the same way.
 * Versus (free-for-all slayer): no AI; each page owns its Spartan, the others are hittable avatars, and the victim
 * applies the damage it was dealt and keeps its own death tally (kl: killer -> count), which everyone sums into scores.
 */

const MAXP = 4;
const WIN_KILLS = 15;
const MATCH_TIME = 300; // versus: 5 minutes or 15 kills, whichever comes first
// Versus loadouts: pick a primary and a secondary; power weapons only spawn on the map
const VS_PRIM = ['ar', 'br', 'sg', 'nd'];
const VS_SEC = ['mg', 'pr'];
const ETK = Object.keys(ET);
const COLS = ['#5ec8f2', '#e5534b', '#9bc45a', '#ffd060', '#c48cff', '#ff9a3c'];
const PEER_PREFIX = 'spartanrun-v1-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// mode: null (solo) | 'coop' | 'vs'; host: this page runs the world; client: a co-op guest;
// down: out of the fight (co-op: until the next room; versus: respawning); menu: the in-match menu is open.
const NET = {
  mode: null, host: false, client: false, down: 0, menu: 0, eid: 0, r: null, code: '', me: null, nick: '', col: COLS[0],
  rp: {}, seen: {}, cm: {}, cmT: {}, out: {}, outSeen: null, kl: {}, klPrev: {}, ghosts: {}, shp: [], hzp: [], pks: [],
  fxl: [], exl: [], fxSeq: 0, seenFx: {}, rd: 0, ep: 0, vep: -1, sendT: 0, uiT: 0, uiK: '', started: false, w: null,
  phase: 'lobby', lg: false, resp: 0, la: null, laT: -9, tab: 0, next: 'r', waitT: 0, win: '', paid: 0, ui: null,
  joinT: 0, joined: 0, hostGone: 0, modeKnown: 0,
  kb: {}, kbSeq: 0, kbSeen: null,
  lo: { p: 'ar', s: 'mg' }, mt: MATCH_TIME, tl: MATCH_TIME, pw: [], pwId: 0, pwT: 20, pwm: {}, mycl: []
};
try {
  NET.nick = (localStorage.getItem('spartan_nick') || '').slice(0, 20);
  const c = localStorage.getItem('spartan_col');
  if (COLS.includes(c))
    NET.col = c;
  const lo = JSON.parse(localStorage.getItem('spartan_vsload') || '{}');
  if (VS_PRIM.includes(lo.p))
    NET.lo.p = lo.p;
  if (VS_SEC.includes(lo.s))
    NET.lo.s = lo.s;
}
catch (e) { }
if (!NET.nick)
  NET.nick = 'Spartan-' + (100 + Math.random() * 900 | 0);
// Extra co-op players (used to scale enemy numbers and toughness)
NET.others = () => NET.host && NET.mode === 'coop' ? Object.keys(NET.rp).length : 0;

const r1 = v => Math.round(v * 10) / 10;
const r2 = v => Math.round(v * 100) / 100;
const pid = p => 'p' + String(p).replace(/[^A-Za-z0-9]/g, '').slice(0, 48);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
const nm = id => id === NET.me ? 'You' : NET.rp[id] ? NET.rp[id].n : 'Spartan';

const nmsg = document.createElement('div');
nmsg.style.cssText = 'position:absolute;left:0;right:0;top:34%;text-align:center;font-size:24px;color:#e6eadf;text-shadow:0 0 8px #000;display:none';
$('hud').appendChild(nmsg);
const sb = document.createElement('div');
sb.style.cssText = 'position:absolute;left:50%;top:14%;transform:translateX(-50%);background:rgba(8,10,6,.85);border:1px solid #3a4533;border-radius:6px;padding:10px 16px;font-size:14px;display:none';
$('hud').appendChild(sb);

/* ---------- Transport (PeerJS) ----------
   Both kinds of room offer the same three calls the game uses:
   peers(): everyone, you first ({peer, sameTab, presence}); presence(o): merge into and send your state; leave(). */

const PEER_OPTS = { debug: 0 };

function newCode() {
  let s = '';
  for (let i = 0; i < 6; i++)
    s += CODE_CHARS[Math.random() * CODE_CHARS.length | 0];
  return s;
}

function p2pHost(code) {
  return new Promise((resolve, reject) => {
    const peer = new Peer(PEER_PREFIX + code, PEER_OPTS);
    const mine = {};
    const clients = {}; // peer id -> { conn, presence }
    let me = null;
    let opened = false;
    const room = {
      peers() {
        return [{ peer: me, sameTab: true, presence: mine }].concat(Object.keys(clients).map(id => ({ peer: id, sameTab: false, presence: clients[id].presence })));
      },
      presence(o) {
        Object.assign(mine, o);
        // Everyone gets everyone's latest state
        const snap = [[me, mine]].concat(Object.keys(clients).map(id => [id, clients[id].presence]));
        Object.values(clients).forEach(c => {
          if (c.conn.open)
            try {
              c.conn.send({ snap });
            }
            catch (e) { }
        });
        return Promise.resolve();
      },
      leave() {
        peer.destroy();
        return Promise.resolve();
      }
    };
    peer.on('open', id => {
      me = id;
      opened = true;
      resolve(room);
    });
    peer.on('error', err => {
      if (!opened)
        reject(err);
    });
    peer.on('connection', conn => {
      conn.on('open', () => {
        if (Object.keys(clients).length >= MAXP - 1) {
          conn.send({ full: 1 });
          setTimeout(() => conn.close(), 500);
          return;
        }
        clients[conn.peer] = { conn, presence: {} };
      });
      conn.on('data', d => {
        const c = clients[conn.peer];
        if (c && d && typeof d === 'object' && d.pr && typeof d.pr === 'object')
          c.presence = d.pr;
      });
      const gone = () => delete clients[conn.peer];
      conn.on('close', gone);
      conn.on('error', gone);
    });
  });
}

function p2pJoin(code) {
  return new Promise((resolve, reject) => {
    const peer = new Peer(PEER_OPTS);
    const mine = {};
    let me = null;
    let conn = null;
    let snap = [];
    const room = {
      full: false,
      peers() {
        return [{ peer: me, sameTab: true, presence: mine }].concat(snap.filter(s => Array.isArray(s) && s[0] !== me).map(([id, p]) => ({ peer: id, sameTab: false, presence: p && typeof p === 'object' ? p : {} })));
      },
      presence(o) {
        Object.assign(mine, o);
        if (conn && conn.open)
          try {
            conn.send({ pr: mine });
          }
          catch (e) { }
        return Promise.resolve();
      },
      leave() {
        peer.destroy();
        return Promise.resolve();
      }
    };
    const timer = setTimeout(() => reject({ type: 'timeout' }), 15000);
    peer.on('open', id => {
      me = id;
      conn = peer.connect(PEER_PREFIX + code, { reliable: true, serialization: 'json' });
      conn.on('open', () => {
        clearTimeout(timer);
        resolve(room);
      });
      conn.on('data', d => {
        if (!d || typeof d !== 'object')
          return;
        if (d.full)
          room.full = true;
        else if (Array.isArray(d.snap))
          snap = d.snap.slice(0, MAXP + 2);
      });
      // Host gone: the world disappears from the snapshot and netTick notices
      conn.on('close', () => snap = []);
    });
    peer.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/* ---------- Who enemies (on the co-op host) can chase and hurt ---------- */

function netRemotes() {
  return Object.values(NET.rp).filter(r => r.live && !r.dn);
}

function netTargets() {
  if (!NET.host || NET.mode !== 'coop')
    return [P];
  const a = netRemotes();
  if (!NET.down)
    a.push(P);
  return a.length ? a : [P];
}

// The nearest player, re-picked every half second
function netTarget(e) {
  if (!NET.host || NET.mode !== 'coop')
    return P;
  if (e.tgT > T && e.tgO)
    return e.tgO;
  e.tgT = T + .5;
  let b = P;
  let bd = 1e9;
  netTargets().forEach(q => {
    const d = Math.hypot(q.x - e.x, q.z - e.z);
    if (d < bd) {
      bd = d;
      b = q;
    }
  });
  return e.tgO = b;
}

// Enemy damage to a player: you directly, or a guest (reported to them)
// Shove a player (you directly, or a co-op guest through the world update)
function knockP(q, vx, vz) {
  if (q === P) {
    P.kbx = vx;
    P.kbz = vz;
    P.vy = Math.max(P.vy || 0, 4.5);
  }
  else if (q && q.peer && NET.host)
    NET.kb[q.peer] = [++NET.kbSeq, r1(vx), r1(vz)];
}

function hitP(q, d) {
  if (q === P)
    hurt(d);
  else if (q && q.peer)
    netOut(q, d);
}

function netOut(r, d) {
  if (NET.host && d > 0)
    NET.out[r.peer] = r1((NET.out[r.peer] || 0) + d);
}

// Damage this page dealt to something it doesn't own (a co-op ghost or a versus opponent): add it to the running total
function netHit(e, d, ty) {
  const k = (e.pl ? e.pl + '_' : 'e' + e.id) + (ty || 'n');
  NET.cm[k] = r1((NET.cm[k] || 0) + d);
  NET.cmT[k] = T;
}

// Shots and explosions everyone should see: the last 3 of each ride along in presence, numbered
function netFx(kind, a) {
  if (!NET.r || !NET.started)
    return;
  const l = kind === 'fx' ? NET.fxl : NET.exl;
  l.push([++NET.fxSeq].concat(a.map(r2)));
  if (l.length > 3)
    l.shift();
}

/* ---------- Other players' Spartans ---------- */

// Armor in their colour, gold visor and a name tag. Faces +z with feet at y=0 (like the enemy models), legs on hip pivots.
function makeSpartan(col, name) {
  const g = new THREE.Group();
  const mat = new THREE.MeshPhongMaterial({ color: new THREE.Color(col), shininess: 60, specular: 0x555566 });
  const dark = new THREE.MeshPhongMaterial({ color: 0x2c3036, shininess: 40 });
  const visor = new THREE.MeshPhongMaterial({ color: 0xffb030, emissive: 0x402000, shininess: 120, specular: 0xffffff });
  const bx = (p, w, h, d, m, x, y, z) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    o.position.set(x, y, z);
    p.add(o);
    return o;
  };
  const leg = s => {
    const pv = new THREE.Group();
    pv.position.set(s * .16, .95, 0);
    g.add(pv);
    bx(pv, .22, .48, .26, mat, 0, -.22, 0);
    bx(pv, .2, .5, .24, dark, 0, -.64, .02);
    bx(pv, .24, .14, .34, mat, 0, -.88, .05);
    return pv;
  };
  const legs = [leg(-1), leg(1)];
  bx(g, .5, .22, .3, dark, 0, 1.02, 0);
  bx(g, .66, .56, .4, mat, 0, 1.38, 0);
  bx(g, .46, .3, .1, dark, 0, 1.4, .21);
  bx(g, .4, .34, .2, dark, 0, 1.38, -.27);
  [-1, 1].forEach(s => {
    bx(g, .26, .2, .38, mat, s * .42, 1.58, 0);
    bx(g, .16, .42, .18, dark, s * .42, 1.28, .06);
    bx(g, .15, .12, .4, dark, s * .3, 1.14, .3);
  });
  bx(g, .1, .14, .8, new THREE.MeshPhongMaterial({ color: 0x3d4448 }), .12, 1.2, .52);
  const hd = new THREE.Mesh(new THREE.SphereGeometry(.2, 14, 10), mat);
  hd.scale.set(1, 1.1, 1.05);
  hd.position.set(0, 1.82, 0);
  g.add(hd);
  const vz = new THREE.Mesh(new THREE.SphereGeometry(.2, 14, 8, Math.PI / 2 - .9, 1.8, 1.15, .65), visor);
  vz.position.set(0, 1.82, .02);
  vz.scale.set(1.06, 1.12, 1.12);
  g.add(vz);
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(0,0,0,.45)';
  x.fillRect(0, 8, 256, 48);
  x.font = 'bold 38px system-ui,sans-serif';
  x.textAlign = 'center';
  x.fillStyle = col;
  x.fillText(name, 128, 46);
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  tag.scale.set(2.4, .6, 1);
  tag.position.y = 2.45;
  g.add(tag);
  const aura = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
  aura.visible = false;
  g.add(aura);
  return { g, mat, aura, legs, arm: null };
}

/* ---------- Reading other players (untrusted: everything is type-checked and clamped) ---------- */

function netRead(r, q) {
  const n = (v, d) => typeof v === 'number' && isFinite(v) ? v : d;
  const o = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  r.n = String(q.n || 'Spartan').slice(0, 20);
  r.c = /^#[0-9a-fA-F]{6}$/.test(q.c) ? q.c : '#9bc45a';
  r.live = !!q.live;
  r.rd = n(q.rd, 0);
  r.ep = n(q.ep, 0);
  r.tx = clamp(n(q.x, r.tx || 0), -200, 200);
  r.tz = clamp(n(q.z, r.tz || 0), -200, 200);
  r.ty = clamp(n(q.y, 0), -5, 40);
  r.yw = n(q.yw, 0);
  r.hp = n(q.hp, 0);
  r.sh = n(q.sh, 0);
  r.dn = !!q.dn;
  r.w = typeof q.w === 'string' ? q.w : 'ar';
  r.cm = o(q.cm);
  r.kl = o(q.kl);
  r.fx = Array.isArray(q.fx) ? q.fx.slice(0, 4) : [];
  r.ex = Array.isArray(q.ex) ? q.ex.slice(0, 4) : [];
  r.cl = Array.isArray(q.cl) ? q.cl.slice(0, 10).map(Number) : [];
  r.gt = n(q.gt, 0);
  if (r.isNew) {
    // First sight: whatever it reported before now is history
    r.isNew = 0;
    r.x = r.tx;
    r.z = r.tz;
    Object.keys(r.cm).forEach(k => NET.seen[r.peer + '/' + k] = n(r.cm[k], 0));
    NET.seenFx[r.peer] = Math.max(0, ...r.fx.concat(r.ex).map(f => Array.isArray(f) ? n(f[0], 0) : 0));
    NET.klPrev[r.peer] = Object.assign({}, r.kl);
  }
}

function netDrop(r) {
  if (!r.av)
    return;
  scene.remove(r.av.g);
  const i = enemies.indexOf(r.av);
  if (i >= 0)
    enemies.splice(i, 1);
}

// Their tracers and explosions (only ones numbered after the last we showed)
function netFxIn(r) {
  const s = NET.seenFx[r.peer] || 0;
  let mx = s;
  r.fx.forEach(f => {
    if (!Array.isArray(f) || !(f[0] > s) || f.length < 8)
      return;
    mx = Math.max(mx, f[0]);
    const a = new THREE.Vector3(+f[1], +f[2], +f[3]);
    const b = new THREE.Vector3(+f[4], +f[5], +f[6]);
    if (![a.x, a.y, a.z, b.x, b.y, b.z].every(isFinite))
      return;
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: +f[7] || 0xffe9a0 }));
    scene.add(l);
    tracers.push({ m: l, life: .06 });
    if (Math.hypot(a.x - P.x, a.z - P.z) < 35)
      sfx.shot(r.w);
  });
  r.ex.forEach(f => {
    if (!Array.isArray(f) || !(f[0] > s) || f.length < 5)
      return;
    mx = Math.max(mx, f[0]);
    if (![f[1], f[2], f[3], f[4]].every(isFinite))
      return;
    flashFx(+f[1], +f[2], +f[3], clamp(+f[4], .5, 10), 0xffb040);
    sfx.boom();
  });
  NET.seenFx[r.peer] = mx;
}

// Other players' Spartans, smoothed toward their reported position; in versus they're also targets (in `enemies`)
function netAvatars(dt) {
  const inGame = state === 'play' || state === 'pick' || state === 'wait' || state === 'over';
  Object.values(NET.rp).forEach(r => {
    const show = NET.started && inGame && r.live && !r.dn;
    if (!r.av) {
      if (!show)
        return;
      r.av = Object.assign({ t: 'spartan', net: 1, pl: NET.mode === 'vs' ? r.peer : null, x: r.tx, z: r.tz, y: 0, sc: 1, hp: 40, sh: 60, maxhp: 40, maxsh: 60, armor: 0, crits: null, px: r.tx, pz: r.tz, ph: 0, gs: 0, flash: 0, dead: false, id: -1 }, makeSpartan(r.c, r.n));
      scene.add(r.av.g);
    }
    const e = r.av;
    e.g.visible = show;
    if (NET.mode === 'vs') {
      const i = enemies.indexOf(e);
      if (show && i < 0)
        enemies.push(e);
      if (!show && i >= 0)
        enemies.splice(i, 1);
    }
    if (!show)
      return;
    const k = Math.min(1, dt * 12);
    if (Math.hypot(r.tx - e.x, r.tz - e.z) > 6) {
      e.x = e.px = r.tx;
      e.z = e.pz = r.tz;
    }
    else {
      e.x += (r.tx - e.x) * k;
      e.z += (r.tz - e.z) * k;
    }
    e.y += (r.ty - e.y) * k;
    r.x = e.x;
    r.z = e.z;
    r.y = e.y;
    e.hp = r.hp;
    e.sh = r.sh;
    const da = ((r.yw + Math.PI - e.g.rotation.y) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
    e.g.rotation.y += da * k;
    walkAnim(e, dt);
    e.flash -= dt;
    e.mat.emissive.setHex(e.flash > 0 ? 0x777777 : 0);
  });
}

/* ---------- Co-op host: the world it publishes, and the damage guests report ---------- */

const HZT = { RingGeometry: 1, CylinderGeometry: 2, SphereGeometry: 3, BoxGeometry: 4 };

// Boss hazards as plain shapes: [type, 3 size params, position, rotation, scale, colour, opacity, z offset]
function netHzOut() {
  const a = [];
  hz.forEach(h => h.ms.forEach(m => {
    if (a.length >= 14 || !m.visible || !m.parent)
      return;
    const g = m.geometry;
    const ty = HZT[g.type];
    const p = g.parameters || {};
    if (!ty)
      return;
    if (g.userData.oz == null) {
      g.computeBoundingBox();
      g.userData.oz = r2((g.boundingBox.min.z + g.boundingBox.max.z) / 2);
    }
    const ps = ty === 1 ? [p.innerRadius, p.outerRadius, 0] : ty === 2 ? [p.radiusTop, p.radiusBottom, p.height] : ty === 3 ? [p.radius, 0, 0] : [p.width, p.height, p.depth];
    a.push([ty, ...ps.map(r2), r1(m.position.x), r2(m.position.y), r1(m.position.z), r2(m.rotation.x), r2(m.rotation.y), r2(m.rotation.z), r2(m.scale.x), r2(m.scale.y), r2(m.scale.z), m.material.color.getHex(), r2(m.material.opacity), g.userData.oz]);
  }));
  return a;
}

function netWorld() {
  const w = { md: NET.mode, lg: NET.lg ? 1 : 0, s: NET.phase, ep: NET.ep };
  if (NET.mode === 'vs')
    Object.assign(w, { win: NET.win || '', tl: Math.max(0, Math.ceil(NET.mt)), pw: NET.pw.map(q => [q.id, q.k, q.x, q.z]) });
  else if (NET.started)
    Object.assign(w, {
      kb: NET.kb, lv: L ? L.id : '', rm: room, lr: lroom, bk: L ? L.boss : '', bN: L ? L.bossN || 1 : 1, bnm: L && L.bn || '', bt: Math.round(bossTotal), out: NET.out,
      // [id, type, x, z, facing, hp, shield, flags (1 flash, 2 primed, 4 invulnerable, 8 cloaked, 16/32 shield bash, 64 camo revealed), sword angle, flier height]
      en: enemies.filter(e => !e.dead && !e.net).slice(0, 40).map(e => {
        const a = [e.id, ETK.indexOf(e.t), r1(e.x), r1(e.z), r2(e.g.rotation.y), Math.round(e.hp), Math.round(e.sh), (e.flash > 0 ? 1 : 0) | (e.kf > 0 ? 2 : 0) | (e.inv > T ? 4 : 0) | (e.g.visible ? 0 : 8) | ((e.lean || 0) > 0 ? 16 : (e.lean || 0) < 0 ? 32 : 0) | (e.camoRev > 0 ? 64 : 0)];
        // sword angle, then (fliers) height above the ground
        a.push(e.sw ? r2(e.sw.rotation.x) : 0);
        if (e.fly)
          a.push(r1(e.y - groundH(e.x, e.z)));
        return a;
      }),
      sh: shots.slice(0, 40).map(b => [r1(b.m.position.x), r1(b.m.position.y), r1(b.m.position.z), b.m.material.color.getHex()]),
      hz: netHzOut()
    });
  return w;
}

function netHostDamage() {
  Object.values(NET.rp).forEach(r => Object.keys(r.cm).forEach(k => {
    const m = /^e(\d+)([ekn])$/.exec(k);
    if (!m)
      return;
    const v = +r.cm[k] || 0;
    const sk = r.peer + '/' + k;
    const pv = NET.seen[sk] || 0;
    NET.seen[sk] = v;
    if (v <= pv || v - pv > 3000)
      return;
    const e = enemies.find(o => o.id === +m[1] && !o.dead);
    // Armor was already applied by the shooter, so it goes in as a "crit" (armor-free) hit
    if (e) {
      NET.applying = 1;
      dmgE(e, v - pv, true, m[2]);
      NET.applying = 0;
    }
  }));
}

function coopHost(dt) {
  if (!NET.started || state !== 'play')
    return;
  netHostDamage();
  // A guest walked into the open exit gate: everyone picks a boon, then moves on
  if (gate && gate.open && Object.values(NET.rp).some(r => r.gt === room)) {
    startPick();
    return;
  }
  if (NET.down && !netRemotes().length) {
    NET.phase = 'o';
    netOver();
  }
}

// Between rooms: start the next one when every guest has picked (or after 45s)
function netHostIdle(dt) {
  if (state !== 'wait')
    return;
  NET.waitT += dt;
  netWaitMsg();
  if (NET.waitT > 45 || Object.values(NET.rp).filter(r => r.live).every(r => r.rd >= room)) {
    if (NET.next === 'm')
      nextMission();
    else
      nextRoom();
  }
}

/* ---------- Co-op guest: mirror the host's world ---------- */

function netGhosts(w, dt) {
  const live = {};
  (Array.isArray(w.en) ? w.en : []).slice(0, 40).forEach(a => {
    if (!Array.isArray(a))
      return;
    const [id, ti, x, z, ry, hp, sh, fl, swr, alt] = a.map(Number);
    const t = ETK[ti];
    if (!t || ![id, x, z].every(isFinite))
      return;
    live[id] = 1;
    let e = NET.ghosts[id];
    if (!e) {
      spawn(t, clamp(x, -A, A), clamp(z, -A, A));
      e = enemies[enemies.length - 1];
      e.net = 1;
      e.id = id;
      e.tx = e.x;
      e.tz = e.z;
      e.g.rotation.y = ry || 0;
      NET.ghosts[id] = e;
    }
    e.tx = clamp(x, -A, A);
    e.tz = clamp(z, -A, A);
    e.ry = ry || 0;
    e.hp = hp || 0;
    e.sh = sh || 0;
    e.fl = fl | 0;
    e.swr = swr;
    e.alt = isFinite(alt) ? clamp(alt, 0, 12) : 0;
  });
  Object.keys(NET.ghosts).forEach(id => {
    if (live[id])
      return;
    const e = NET.ghosts[id];
    delete NET.ghosts[id];
    if (e.dead)
      return;
    e.dead = true;
    scene.remove(e.g);
    // You helped kill it: your own credit and drops
    if (['k', 'e', 'n'].some(t => NET.cm['e' + id + t])) {
      kills++;
      sfx.kill(e.t);
      earn(e.boss ? 0 : 1);
      dropMaybe(e);
    }
  });
  enemies = enemies.filter(e => !e.dead);
  Object.values(NET.ghosts).forEach(e => {
    const k = Math.min(1, dt * 12);
    if (Math.hypot(e.tx - e.x, e.tz - e.z) > 8) {
      e.x = e.tx;
      e.z = e.tz;
    }
    else {
      e.x += (e.tx - e.x) * k;
      e.z += (e.tz - e.z) * k;
    }
    const da = ((e.ry - e.g.rotation.y) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
    e.g.rotation.y += da * Math.min(1, dt * 15);
    e.y = groundH(e.x, e.z) + (e.alt || 0);
    if (e.fly)
      flapWings(e);
    if (e.g.userData.pulse)
      e.g.scale.setScalar(e.sc * (1 + .05 * Math.sin(T * 6 + e.ph)));
    walkAnim(e, dt);
    e.flash -= dt;
    e.mat.emissive.setHex(e.flash > 0 || e.fl & 1 ? 0xffffff : 0);
    e.aura.visible = e.sh > 0 || !!(e.fl & 4);
    e.aura.material.color.setHex(e.fl & 4 ? 0xffd040 : 0x78dcff);
    e.aura.material.opacity = e.fl & 4 ? .45 : .1 + .3 * e.sh / (e.maxsh || 1);
    e.g.visible = !(e.fl & 8);
    if (e.camo)
      camoLook(e, !!(e.fl & 64) || e.flash > 0);
    e.g.rotation.x += ((e.fl & 16 ? .38 : e.fl & 32 ? -.25 : 0) - e.g.rotation.x) * Math.min(1, dt * 14);
    if (e.kg)
      e.kg.visible = !(e.fl & 2) || Math.floor(T * 16) % 2 === 0;
    if (e.sw && isFinite(e.swr))
      e.sw.rotation.x = e.swr;
    if (e.crits)
      e.crits.forEach(c => c.h.scale.setScalar(1 + .25 * Math.sin(T * 8)));
  });
}

function netClearGhosts() {
  Object.values(NET.ghosts).forEach(e => {
    e.dead = true;
    scene.remove(e.g);
  });
  NET.ghosts = {};
  NET.cm = {};
  NET.cmT = {};
  enemies = enemies.filter(e => !e.dead);
}

function netShotsIn(list) {
  list = Array.isArray(list) ? list.slice(0, 60) : [];
  let n = 0;
  list.forEach(a => {
    if (!Array.isArray(a) || ![a[0], a[1], a[2]].every(isFinite))
      return;
    let m = NET.shp[n];
    if (!m) {
      m = new THREE.Mesh(new THREE.SphereGeometry(.13, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      scene.add(m);
      NET.shp[n] = m;
    }
    m.visible = true;
    m.position.set(+a[0], +a[1], +a[2]);
    m.material.color.setHex(+a[3] || 0x7fe0ff);
    n++;
  });
  for (let i = n; i < NET.shp.length; i++)
    NET.shp[i].visible = false;
}

function netHzIn(list) {
  list = Array.isArray(list) ? list.slice(0, 20) : [];
  let n = 0;
  list.forEach(a => {
    if (!Array.isArray(a) || a.length < 16)
      return;
    const v = a.map(Number);
    if (!v.every(isFinite))
      return;
    const [ty, p0, p1, p2, x, y, z, rx, ry, rz, sx, sy, sz, col, op, oz] = v;
    if (ty < 1 || ty > 4 || Math.max(p0, p1, p2) > 120)
      return;
    const sig = [ty, p0, p1, p2, oz].join();
    let m = NET.hzp[n];
    if (!m || m.userData.sig !== sig) {
      const mt = m ? m.material : new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
      if (m) {
        scene.remove(m);
        m.geometry.dispose();
      }
      const g = ty === 1 ? new THREE.RingGeometry(Math.max(0, p0), Math.max(.02, p1), 48)
        : ty === 2 ? new THREE.CylinderGeometry(p0, p1, p2, 24, 1, true)
          : ty === 3 ? new THREE.SphereGeometry(p0, 10, 8)
            : new THREE.BoxGeometry(p0, p1, p2);
      if (oz)
        g.translate(0, 0, oz);
      m = new THREE.Mesh(g, mt);
      m.userData.sig = sig;
      scene.add(m);
      NET.hzp[n] = m;
    }
    m.visible = true;
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.scale.set(sx, sy, sz);
    m.material.color.setHex(col);
    m.material.opacity = clamp(op, 0, 1);
    n++;
  });
  for (let i = n; i < NET.hzp.length; i++)
    NET.hzp[i].visible = false;
}

// Follow the host into its current room (and level)
function clientEnter(w) {
  const lv = LV.find(l => l.id === w.lv);
  if (!lv)
    return;
  netClearGhosts();
  clearHz();
  // Every room is rebuilt the same way the host built it (same layout and ground from the level and room number)
  const newMission = !L || L.id !== lv.id;
  if (newMission || +w.lr !== lroom) {
    L = Object.assign({}, lv, { boss: ET[w.bk] && ET[w.bk].bn ? w.bk : lv.boss, bossN: +w.bN || 1, bn: w.bnm ? String(w.bnm).slice(0, 40) : undefined, lay0: lv.lay });
    lroom = +w.lr;
    L.lay = roomLayout(L, lroom);
    L.seed = L.id + lroom;
    buildLevel(L);
    if (newMission)
      refillAmmo();
    P.x = R(-3, 3);
    P.z = A * .64;
    P.y = groundH(P.x, P.z);
    P.vy = 0;
    P.dash = 0;
    yaw = 0;
    pitch = 0;
  }
  addGate(lroom <= L.rooms);
  L.cleared = false;
  NET.gt = 0;
  room = +w.rm;
  lroom = +w.lr;
  state = 'play';
  NET.phase = 'p';
  NET.menu = 0;
  NET.rd = 0;
  if (NET.down)
    netRevive();
  ov.style.display = 'none';
  ov.style.background = '';
  ov.style.justifyContent = '';
  sfx.room();
  music.set(1);
  P.nades = Math.min(P.nadeMax, P.nades + 1);
  P.hp = Math.min(P.maxHp, P.hp + 6);
  banner(lroom > L.rooms ? 'BOSS: ' + (L.bn || ET[L.boss].bn) : L.n + ' - ROOM ' + lroom + '/' + L.rooms);
  lock();
}

function coopClient(w, dt) {
  if (w.s === 'lobby') {
    if (NET.ui !== 'room')
      netWaitRoom();
    return;
  }
  if (!NET.started) {
    NET.started = true;
    NET.ui = null;
    newRun(!!w.lg, true);
    if (w.s !== 'p') {
      // Joined between rooms: count as ready and come in with the next one
      NET.rd = +w.rm || 0;
      state = 'wait';
      netWaitMsg();
    }
  }
  if (w.s === 'o') {
    if (state !== 'over')
      netOver();
    return;
  }
  if (w.s === 'v') {
    if (state !== 'over')
      netFinish();
    return;
  }
  // Ghosts first, so kills in the room's final update still count
  if (state === 'play')
    netGhosts(w, dt);
  if ((w.s === 'p' || w.s === 'g') && (+w.rm !== room || !L || L.id !== w.lv)) {
    clientEnter(w);
    // Joined while the exit was already open
    if (w.s === 'g') {
      L.cleared = true;
      setGateOpen();
    }
  }
  else if (w.s === 'g' && state === 'play' && +w.rm === room && !L.cleared) {
    // Room cleared on the host: the exit opens here too
    netClearGhosts();
    L.cleared = true;
    earn(8 + lroom * 2);
    music.set(0);
    sfx.clear();
    setGateOpen();
    banner('ROOM CLEAR: HEAD THROUGH THE EXIT');
  }
  else if (w.s === 'k' && state === 'play' && +w.rm === room) {
    // Someone went through the exit: boon time
    netClearGhosts();
    if (!L.cleared) {
      L.cleared = true;
      earn(8 + lroom * 2);
    }
    startPick();
  }
  else if (w.s === 'L' && state === 'play' && +w.rm === room) {
    netClearGhosts();
    bossDown();
  }
  if (isFinite(+w.bt) && +w.bt > 0)
    bossTotal = +w.bt;
  if (state === 'play') {
    netShotsIn(w.sh);
    netHzIn(w.hz);
  }
  else {
    netShotsIn([]);
    netHzIn([]);
  }
  if (state === 'wait')
    netWaitMsg();
  // A Hunter's shield bash shoved me (numbered, so each one applies once)
  const kb = w.kb && typeof w.kb === 'object' ? w.kb[NET.me] : null;
  if (Array.isArray(kb) && isFinite(+kb[0])) {
    if (NET.kbSeen != null && +kb[0] > NET.kbSeen && state === 'play' && !NET.down) {
      P.kbx = clamp(+kb[1] || 0, -20, 20);
      P.kbz = clamp(+kb[2] || 0, -20, 20);
      P.vy = Math.max(P.vy || 0, 4.5);
    }
    NET.kbSeen = +kb[0];
  }
  // Damage the host's enemies dealt to me (a running total)
  const v = +((w.out && typeof w.out === 'object' ? w.out : {})[NET.me]) || 0;
  if (NET.outSeen == null || v < NET.outSeen)
    NET.outSeen = v;
  else if (v > NET.outSeen) {
    const d = v - NET.outSeen;
    NET.outSeen = v;
    if (state === 'play' && !NET.down && d < 500)
      hurt(d);
  }
}

/* ---------- Picks, being down, the end ---------- */

function netAfterPick() {
  NET.next = P.pending ? 'm' : 'r';
  P.pending = 0;
  NET.rd = room;
  NET.waitT = 0;
  state = 'wait';
  NET.uiK = '';
  netWaitMsg();
}

function netWaitMsg() {
  const h = '<h2>WAITING FOR SQUAD</h2>' + netBoard(true) + '<div style="color:#99a28f;font-size:13px">The next room starts when everyone has picked' + (NET.host ? ' (or after 45s)' : '') + '</div>';
  if (h !== NET.uiK) {
    NET.uiK = h;
    ov.style.display = 'flex';
    ov.innerHTML = h;
  }
}

function netDown() {
  P.hp = 0;
  P.sh = 0;
  NET.down = 1;
  down = false;
  zoomOn = false;
  P.bl = 0;
  sfx.dead();
  if (NET.mode === 'vs') {
    NET.resp = 3;
    // Whoever hit you in the last 6s gets the kill
    const k = NET.la && T - NET.laT < 6 ? NET.la : null;
    if (k) {
      NET.kl[k] = (NET.kl[k] || 0) + 1;
      banner('KILLED BY ' + nm(k).toUpperCase());
    }
    else
      banner('YOU DIED');
  }
  else
    banner('YOU ARE DOWN');
}

function netRevive() {
  NET.down = 0;
  P.hp = P.maxHp;
  P.sh = P.maxSh;
}

// Typed damage from another player (versus): the same shield/health rules enemies get
function netHurtTy(d, ty, att) {
  if (state !== 'play' || NET.down)
    return;
  P.last = T;
  vig = .7;
  sfx.hit(P.sh > 0);
  const M = DMGT[ty] || DMGT.n;
  if (P.sh > 0) {
    const s = d * M.sh;
    if (s < P.sh)
      P.sh -= s;
    else {
      const left = (s - P.sh) / M.sh;
      P.sh = 0;
      P.hp -= left * M.hp;
    }
  }
  else
    P.hp -= d * M.hp;
  NET.la = att;
  NET.laT = T;
  if (P.hp <= 0)
    netDown();
}

function netBank(bonus) {
  if (!P)
    return;
  S.cr += Math.round(P.cr + (bonus || 0));
  P.cr = 0;
  save();
  if (NET.mode === 'coop' && room > best) {
    best = room;
    try {
      localStorage.setItem('spartan_fps_best', best);
    }
    catch (e) { }
  }
}

function endScreen(h, sub) {
  const bd = netBoard();
  state = 'over';
  NET.down = 0;
  NET.menu = 0;
  down = false;
  document.exitPointerLock && document.exitPointerLock();
  ov.style.display = 'flex';
  ov.style.background = '';
  ov.style.justifyContent = '';
  ov.innerHTML = h + '<div>' + sub + '</div>' + bd + '<div class="cards"><button class="card" style="text-align:center" onclick="netLeave()"><b>BACK TO TITLE</b></button></div>';
}

function netOver() {
  const c = P ? P.cr : 0;
  netBank();
  sfx.dead();
  music.set(-1);
  endScreen('<h2 style="color:#e5534b">SQUAD WIPED OUT</h2>', 'Reached room ' + room + ' | ' + kills + ' kills | +' + c + ' credits banked');
}

function netFinish() {
  const b = Math.round(250 * DIFF.cr);
  const c = (P ? P.cr : 0) + b;
  netBank(b);
  sfx.clear();
  music.set(2);
  endScreen('<h2>ALL MISSIONS COMPLETE</h2>', 'Your squad cleared every mission' + (NET.lg ? ' on LEGENDARY' : '') + '. +' + c + ' credits banked');
}

/* ---------- Versus: Blood Gulch ---------- */

const BG = { id: 'bg', n: 'Blood Gulch', rooms: 0, A: 80, cut: 34, fog: 0xa8c4d8, fogN: 70, fogF: 340, sky: [0x3a78c8, 0xcfe0ea, 0x8a9a78], hemi: [0xdcecff, 0x4f6a3a, .95], sun: [0xfff2d8, .95, 8, 12, 3], trim: 0xffffff, sty: 'bg', lay: [] };
// Weapon/ammo pickups [kind, x, z] (each player has their own copies; they come back after 25-45s)
// Grenade and ammo pickups [kind, x, z] (each player has their own copies; they come back after 25s)
const VSP = [['ammo', 0, -61], ['ammo', 0, 61], ['nade', -10, 0], ['nade', 10, 0], ['nade', -44, -46], ['nade', 44, 46], ['ammo', -44, 46], ['ammo', 44, -46], ['ammo', 0, -24], ['ammo', 0, 24],
  ['nade', -24, -30], ['nade', 24, 30], ['ammo', 24, -30], ['ammo', -24, 30]];
// Where sniper rifles and rocket launchers can appear during a match (hilltops, the ridges, the middle)
const VS_PW_SPOTS = [[0, 0], [-19, -15], [19, 15], [-32, 24], [32, -24], [-47, 0], [47, 0], [0, -32], [0, 32], [-10, 36], [10, -36], [-40, -6], [40, 6]];
const VSPAWN = [[0, -50], [-12, -61], [12, -61], [0, 50], [-12, 61], [12, 61], [-46, -22], [46, 22], [-46, 22], [46, -22], [-30, 8], [30, -8]];
const PKC = { sn: 0x8fa0b0, rk: 0xff6a3a, sg: 0xc08850, sw: 0x7fe0ff, pr: 0x7dff9a, nd: 0xff5fd0, br: 0x9bc45a, nade: 0x7dff6a, ammo: 0xd8c070 };

// Blood Gulch terrain, after the classic Halo map: a long box canyon with each base on a low rise at either end, rolling
// hills through the middle, a raised ridge along each side wall for snipers, and a creek winding down the gulch.
// Heights in metres; groundBG is also the collision ground (see groundH in core.js).
const BG_HILLS = [ // [x, z, height, radius]
  [0, 0, 2.2, 8], [-19, -15, 4.2, 10], [19, 15, 4.2, 10], [-32, 24, 3.4, 9], [32, -24, 3.4, 9],
  [-30, -44, 2.6, 7], [30, 44, 2.6, 7], [-10, 36, 2.8, 7], [10, -36, 2.8, 7], [-40, -6, 2.6, 7], [40, 6, 2.6, 7],
  [24, -8, 1.8, 6], [-24, 8, 1.8, 6], [-8, -48, 1.6, 6], [8, 48, 1.6, 6]
];
const BG_RIDGES = [[-47, -40, -47, 40, 4.5, 6], [47, -40, 47, 40, 4.5, 6]]; // [x1, z1, x2, z2, height, half-width]
// Side cliffs that make the gulch long and narrow (112m wide, 160m long); they meet the angled corner walls
const BG_CLIFF_X = 56;
// Rock outcrops to hide behind (axis-aligned so the colliders match): [x, z, half-width, half-depth, height]
const BG_ROCKS = [[-14, -26, 4, 1.4, 2.6], [14, 26, 4, 1.4, 2.6], [-38, 10, 1.4, 4.5, 2.8], [38, -10, 1.4, 4.5, 2.8], [6, -12, 3, 1.2, 2.2], [-6, 12, 3, 1.2, 2.2],
  [-28, -30, 1.3, 3, 2.4], [28, 30, 1.3, 3, 2.4], [-40, 38, 3, 1.4, 2.6], [40, -38, 3, 1.4, 2.6], [-18, 50, 2.5, 1.2, 2.2], [18, -50, 2.5, 1.2, 2.2]];
const creekX = z => 9 * Math.sin(z * .045) + z * .2;
const smoothstep = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);

function groundBG(x, z) {
  // gentle unevenness everywhere
  let h = .35 * Math.sin(x * .21) * Math.cos(z * .17) + .25 * Math.sin(x * .07 + z * .11);
  for (const [hx, hz, hh, r] of BG_HILLS) {
    const d2 = ((x - hx) ** 2 + (z - hz) ** 2) / (r * r);
    if (d2 < 6)
      h += hh * Math.exp(-d2 * 1.5);
  }
  for (const [x1, z1, x2, z2, hh, r] of BG_RIDGES) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const t = clamp(((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz), 0, 1);
    const d2 = ((x - x1 - dx * t) ** 2 + (z - z1 - dz * t) ** 2) / (r * r);
    if (d2 < 6)
      h += hh * Math.exp(-d2 * 1.5);
  }
  // the canyon floor curls up into the cliffs and the far ends
  h += 3 * smoothstep((Math.abs(x) - 44) / 12) + 3 * smoothstep((Math.abs(z) - 66) / 12);
  // creek bed
  const dc = Math.abs(x - creekX(z));
  if (dc < 8 && Math.abs(z) < 76)
    h -= 1.2 * Math.exp(-dc * dc / 5);
  // flat low rises under the bases
  for (const bz of [-60, 60]) {
    const w = 1 - smoothstep((Math.hypot(x, z - bz) - 11) / 7);
    h = h * (1 - w) + 1.2 * w;
  }
  return h;
}

// The map (called from buildLevel with its helpers). Cover uses a seeded random so every player gets the same layout.
function bgBuild({ add, M, G, B, WL, walls, wallH, spots, onW, hills, ground, pines }) {
  let sd = 1234567;
  const rnd = () => (sd = sd * 16807 % 2147483647) / 2147483647;
  const RR = (a, b) => a + rnd() * (b - a);
  const rockM = new THREE.MeshPhongMaterial({ color: 0x7d7262, flatShading: true, shininess: 4 });
  const rockD = new THREE.MeshPhongMaterial({ color: 0x5f574b, flatShading: true, shininess: 4 });
  const band = ringBand(1800, 150, 0xf2f8ff, .55);
  band.rotation.z = Math.PI / 2;
  band.position.set(0, 1760, 0);
  envG.add(band);
  ground(M(0x4a6a32));
  hills(36, 175, 330, 30, 60, 0x6d7458);
  pines(46, 92, 160);
  // Terrain: a displaced grid replaces the flat floor, and becomes the ground everything stands on
  groundFn = groundBG;
  floor.visible = false;
  const tg = new THREE.PlaneGeometry(A * 2, A * 2, 128, 128);
  tg.rotateX(-Math.PI / 2);
  const tp = tg.attributes.position;
  for (let i = 0; i < tp.count; i++)
    tp.setY(i, groundBG(tp.getX(i), tp.getZ(i)));
  tg.computeVertexNormals();
  envG.add(new THREE.Mesh(tg, floorMat('bg')));
  // Creek: a ribbon of water sitting in the creek bed
  const wp = [];
  const wi = [];
  for (let i = 0; i <= 120; i++) {
    const z = -76 + i * 152 / 120;
    const cx = creekX(z);
    const y = groundBG(cx, z) + .45;
    wp.push(cx - 1.7, y, z, cx + 1.7, y, z);
    if (i) {
      const a = (i - 1) * 2;
      wi.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
  wg.setIndex(wi);
  wg.computeVertexNormals();
  envG.add(new THREE.Mesh(wg, new THREE.MeshPhongMaterial({ color: 0x3f7fa8, shininess: 90, specular: 0x99ccff, transparent: true, opacity: .85, side: THREE.DoubleSide })));
  // Canyon walls with jagged boulders along the rim and at the foot
  walls(12, rockM, 16);
  WL.forEach(wl => {
    const h = wallH(wl, 12, 16);
    spots(wl, 7).forEach(t => {
      const s = R(2.5, 5);
      onW(wl, t + R(-2, 2), h + R(-1, 1), new THREE.DodecahedronGeometry(s), rockD, -1.5).rotation.set(R(0, 3), R(0, 3), 0);
    });
    spots(wl, 9).forEach(t => {
      const s = R(1.5, 3);
      onW(wl, t + R(-3, 3), 3 + s * .4, new THREE.DodecahedronGeometry(s), rockM, -s * .7).scale.y = .6;
    });
  });
  // Bases on their rises. s: -1 red base at -z, +1 blue at +z; doorways face the centre and both sides
  const base = (zc, s, col) => {
    const by = 1.2;
    const wm = M(0x6b7178);
    const dk = M(0x3b4046);
    const gl = G(col);
    [[0, zc + s * 5, 7, .3], [-4.5, zc - s * 5, 2.5, .3], [4.5, zc - s * 5, 2.5, .3], [-7, zc - 3.25, .3, 1.75], [-7, zc + 3.25, .3, 1.75], [7, zc - 3.25, .3, 1.75], [7, zc + 3.25, .3, 1.75]]
      .forEach(([x, z, hw, hd]) => {
        pillars.push({ x, z, hw, hd, h: by + 5 });
        add(B(hw * 2, 5, hd * 2), wm, x, by + 2.5, z);
      });
    add(B(15.6, 1.6, 11.6), dk, 0, by - .83, zc); // foundation, so the base never floats where the ground dips
    add(B(15, .6, 11), dk, 0, by + 5.3, zc);
    add(B(15.2, .25, .4), gl, 0, by + 5, zc - s * 5.4);
    add(B(4, .15, .4), gl, 0, by + 4.6, zc - s * 5.1);
    add(B(3, .1, 3), gl, 0, by + .05, zc).rotation.y = Math.PI / 4;
    const pl = new THREE.PointLight(col, .8, 18);
    pl.position.set(0, by + 4, zc);
    envG.add(pl);
  };
  base(-60, -1, 0xff4a3a);
  base(60, 1, 0x4a9aff);
  // The long side cliffs: a solid collider each, faced with big boulders
  [-1, 1].forEach(s => {
    pillars.push({ x: s * (BG_CLIFF_X + 1.5), z: 0, hw: 1.5, hd: 58, h: 40 });
    add(B(5, 16, 118), rockM, s * (BG_CLIFF_X + 3), 8, 0);
    for (let z = -56; z <= 56; z += 5) {
      const k = RR(4.5, 7.5);
      const o = add(new THREE.DodecahedronGeometry(k), rockM, s * (BG_CLIFF_X + k * .55), RR(2, 9), z + RR(-1.5, 1.5));
      o.rotation.set(rnd() * 3, rnd() * 3, 0);
      o.scale.y = RR(.9, 1.4);
      if (rnd() < .6)
        add(new THREE.DodecahedronGeometry(k * .6), rockD, s * (BG_CLIFF_X + k * .7), RR(12, 16), z + RR(-2, 2)).rotation.set(rnd() * 3, rnd() * 3, 0);
    }
  });
  // Rock outcrops: a big faceted rock with a smaller one leaning on it
  BG_ROCKS.forEach(([x, z, hw, hd, h]) => {
    const g0 = Math.min(groundBG(x - hw, z - hd), groundBG(x + hw, z + hd), groundBG(x - hw, z + hd), groundBG(x + hw, z - hd));
    pillars.push({ x, z, hw, hd, h: g0 + h });
    const o = add(new THREE.DodecahedronGeometry(1), rockM, x, g0 + h * .35, z);
    o.scale.set(hw * 1.15, h * .75, hd * 1.15);
    const o2 = add(new THREE.DodecahedronGeometry(1), rockD, x + hw * .4, g0 + h * .75, z - hd * .3);
    o2.scale.set(hw * .55, h * .45, hd * .6);
    o2.rotation.y = rnd() * 3;
  });
  // Scattered boulders and pines, kept clear of the bases, outcrops, pickups and spawn points
  const avoid = [[0, -60, 11], [0, 60, 11], ...VSP.map(([k, x, z]) => [x, z, 3]), ...VSPAWN.map(([x, z]) => [x, z, 3]), ...VS_PW_SPOTS.map(([x, z]) => [x, z, 3]), ...BG_ROCKS.map(([x, z, hw, hd]) => [x, z, Math.max(hw, hd) + 1])];
  let n = 0;
  let tries = 0;
  while (n < 28 && tries++ < 800) {
    const x = RR(-50, 50);
    const z = RR(-74, 74);
    const s = RR(1.2, 3);
    if (Math.abs(x) + Math.abs(z) > 100 || avoid.some(([ax, az, r]) => Math.hypot(x - ax, z - az) < r + s + 1.5))
      continue;
    n++;
    const g = groundBG(x, z);
    pillars.push({ x, z, hw: s * .75, hd: s * .75, h: g + s * 1.2 });
    const o = add(new THREE.DodecahedronGeometry(s), rockM, x, g + s * .3, z);
    o.scale.y = .8;
    o.rotation.y = rnd() * 3;
    avoid.push([x, z, s]);
  }
  n = 0;
  tries = 0;
  const tk = M(0x4a3626);
  const lf = new THREE.MeshPhongMaterial({ color: 0x2e5a2a, flatShading: true, shininess: 4 });
  while (n < 16 && tries++ < 800) {
    const x = RR(-50, 50);
    const z = RR(-50, 50);
    const s = RR(1, 1.5);
    if (avoid.some(([ax, az, r]) => Math.hypot(x - ax, z - az) < r + 3))
      continue;
    n++;
    const g = groundBG(x, z);
    pillars.push({ x, z, hw: .45 * s, hd: .45 * s, h: g + 9 });
    add(new THREE.CylinderGeometry(.25 * s, .35 * s, 3 * s, 7), tk, x, g + 1.5 * s, z);
    for (let j = 0; j < 3; j++)
      add(new THREE.ConeGeometry((2.2 - j * .55) * s, 2.8 * s, 8), lf, x, g + (3 + j * 1.5) * s, z);
    avoid.push([x, z, 2]);
  }
}

// A floating pickup: the item, a ring and a light beam (taller and brighter for power weapons)
function pickupMesh(k, x, z, big) {
  const g = new THREE.Group();
  const c = PKC[k];
  const geo = k === 'nade' ? new THREE.SphereGeometry(.22, 10, 8) : k === 'ammo' ? new THREE.BoxGeometry(.5, .3, .34) : new THREE.BoxGeometry(.14, .18, k === 'rk' ? 1.1 : .8);
  g.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: .3 })));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(big ? .7 : .5, .035, 6, 24), new THREE.MeshBasicMaterial({ color: c }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -.45;
  g.add(ring);
  const bh = big ? 30 : 6;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(big ? .12 : .06, big ? .12 : .06, bh, 6, 1, true), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: big ? .4 : .25, depthWrite: false }));
  beam.position.y = bh / 2 - .5;
  g.add(beam);
  g.userData.gy = groundH(x, z);
  g.position.set(x, g.userData.gy + .8, z);
  scene.add(g);
  return g;
}

function vsPickupsBuild() {
  NET.pks.forEach(p => scene.remove(p.m));
  NET.pks = VSP.map(([k, x, z]) => {
    const m = pickupMesh(k, x, z);
    return { k, x, z, gy: m.userData.gy, m, t: 0 };
  });
}

function vsPickups(dt) {
  NET.pks.forEach(p => {
    if (p.t > 0) {
      p.t -= dt;
      p.m.visible = false;
      return;
    }
    p.m.visible = true;
    p.m.rotation.y += dt * 1.5;
    p.m.position.y = p.gy + .8 + Math.sin(T * 2 + p.x) * .1;
    if (NET.down || Math.hypot(P.x - p.x, P.z - p.z) > 1.5)
      return;
    let ok = false;
    if (p.k === 'nade') {
      if (P.nades < P.nadeMax) {
        P.nades = Math.min(P.nadeMax, P.nades + 2);
        ok = true;
      }
    }
    else if (p.k === 'ammo') {
      if (ammoRoom('ammo')) {
        grabAmmo('ammo');
        ok = true;
      }
    }
    else {
      const i = P.slots.indexOf(p.k);
      if (i < 0) {
        // A new weapon replaces the one in your hands
        setW(P, p.k);
        banner(W[p.k].n.toUpperCase());
        ok = true;
      }
      else if (p.k === 'sw' ? swE(i) < W.sw.mag : P.sr[i] < rxOf(p.k)) {
        // Already carrying it: top it up
        if (p.k === 'sw') {
          if (i === P.cur)
            P.ammo = W.sw.mag;
          else
            P.sa[i] = W.sw.mag;
        }
        else
          P.sr[i] = rxOf(p.k);
        ok = true;
      }
    }
    if (ok) {
      p.t = p.k === 'rk' || p.k === 'sn' || p.k === 'sw' ? 45 : 25;
      sfx.grab();
    }
  });
}

// (Re)spawn at the spawn point farthest from everyone else, with base stats and your chosen loadout
function vsRespawn() {
  const opp = netRemotes();
  let best = VSPAWN[0];
  let bd = -1;
  VSPAWN.forEach(s => {
    const d = opp.length ? Math.min(...opp.map(r => Math.hypot(r.x - s[0], r.z - s[1]))) : Math.random() * 99;
    if (d > bd) {
      bd = d;
      best = s;
    }
  });
  const a = NET.lo.p;
  const b = NET.lo.s;
  P = { x: best[0], z: best[1], hp: 40, maxHp: 40, sh: 60, maxSh: 60, shDelay: 3, last: -99, speed: 6, dmg: 8, rate: .09, cd: 0, magMax: W[a].mag, ammo: W[a].mag, reload: 0, wpn: a, slots: [a, b], sa: [W[a].mag, W[b].mag], sr: [W[a].rs, W[b].rs], cur: 0, mb: 0, reloadT: 1.3, nades: 2, nadeMax: 4, nadeMul: 1, mcd: 0, meleeMul: 1, boons: [], done: [], cr: P ? P.cr : 0, revive: 0, y: 0, vy: 0, thrust: true, tcd: 0, dash: 0, dashF: 0, dashS: 0 };
  P.y = groundH(P.x, P.z);
  setGun(a);
  // Face the middle of the map
  yaw = Math.atan2(best[0], best[1]);
  pitch = 0;
  NET.down = 0;
  NET.la = null;
  state = 'play';
}

function vsStart() {
  NET.started = true;
  NET.ui = null;
  NET.menu = 0;
  audio.init();
  clearHz();
  [enemies, shots, nades, drops, rockets, needles].forEach(a => a.forEach(o => {
    if (!o.pl)
      scene.remove(o.g || o.m);
  }));
  enemies = enemies.filter(e => e.pl);
  shots = [];
  nades = [];
  drops = [];
  rockets = [];
  needles = [];
  decor.forEach(g => scene.remove(g));
  LEGEND = false;
  DIFF = DIFFS.normal;
  L = BG;
  buildLevel(BG);
  vsPickupsBuild();
  // Power weapons: forget the last match's; the host starts a fresh spawn timer
  Object.values(NET.pwm).forEach(q => scene.remove(q.m));
  NET.pwm = {};
  NET.mycl = [];
  NET.pwSync = 0;
  if (NET.host) {
    NET.pw = [];
    NET.pwT = 20;
    NET.mt = MATCH_TIME;
  }
  room = 0;
  kills = 0;
  vsRespawn();
  ov.style.display = 'none';
  ov.style.background = '';
  ov.style.justifyContent = '';
  music.set(1);
  sfx.room();
  banner('BLOOD GULCH: ' + WIN_KILLS + ' KILLS OR 5 MINUTES');
  lock();
}

// Damage the others dealt to me (running totals keyed by my id)
function netVsDamage() {
  Object.values(NET.rp).forEach(r => ['k', 'e', 'n'].forEach(ty => {
    const k = NET.me + '_' + ty;
    const v = +r.cm[k] || 0;
    const sk = r.peer + '/' + k;
    const pv = NET.seen[sk] || 0;
    NET.seen[sk] = v;
    if (v > pv && v - pv < 500 && state === 'play' && !NET.down)
      netHurtTy(v - pv, ty, r.peer);
  }));
}

// A player's score: the kills credited to them in everyone's death tallies (this match only)
function netScore(id) {
  let s = 0;
  const add = (kl, ep) => {
    if (ep === NET.ep && kl)
      s += +kl[id] || 0;
  };
  add(NET.kl, NET.ep);
  Object.values(NET.rp).forEach(r => add(r.kl, r.ep));
  return s;
}

function netKillFeed() {
  [[NET.me, NET.kl, NET.ep]].concat(Object.values(NET.rp).map(r => [r.peer, r.kl, r.ep])).forEach(([v, kl, ep]) => {
    const pv = NET.klPrev[v] || {};
    if (ep === NET.ep && v !== NET.me)
      Object.keys(kl).forEach(k => {
        if ((+kl[k] || 0) > (+pv[k] || 0)) {
          if (k === NET.me) {
            kills++;
            P.cr += 10;
            sfx.kill('elite');
            banner('YOU KILLED ' + nm(v).toUpperCase());
          }
          else
            banner(nm(k).toUpperCase() + ' KILLED ' + nm(v).toUpperCase());
        }
      });
    NET.klPrev[v] = Object.assign({}, kl);
  });
}

function vsOver(w) {
  if (w.win === NET.me && NET.paid !== NET.ep) {
    NET.paid = NET.ep;
    P.cr += 60;
  }
  const title = w.win === 'tie' ? 'DRAW!' : w.win === NET.me ? 'YOU WIN!' : esc(nm(w.win)).toUpperCase() + ' WINS';
  endScreen('<h2>' + title + '</h2>', +w.tl > 0 ? 'First to ' + WIN_KILLS + ' kills' : 'Time! Most kills after 5 minutes');
  music.set(2);
  if (NET.host)
    ov.querySelector('.cards').insertAdjacentHTML('afterbegin', '<button class="card" style="text-align:center" onclick="vsAgain()"><b>PLAY AGAIN</b><small>New match, same lobby</small></button>');
  else
    ov.querySelector('.cards').insertAdjacentHTML('beforebegin', '<div style="color:#99a28f">Waiting for the host to start another match...</div>');
}

function vsAgain() {
  if (!NET.host)
    return;
  NET.ep++;
  NET.phase = 'p';
  NET.win = '';
  NET.mt = MATCH_TIME;
}

function vsTick(w, dt) {
  if (w.s === 'lobby') {
    if (NET.ui !== 'room')
      netWaitRoom();
    return;
  }
  // A new match (epoch): fresh tallies and a respawn
  const ep = +w.ep || 0;
  if (ep !== NET.vep) {
    NET.vep = NET.ep = ep;
    NET.kl = {};
    NET.klPrev = {};
    NET.cm = {};
    NET.started = false;
  }
  if (!NET.started)
    vsStart();
  if (w.s === 'o') {
    if (state !== 'over')
      vsOver(w);
    return;
  }
  netVsDamage();
  netKillFeed();
  NET.tl = isFinite(+w.tl) ? +w.tl : NET.tl;
  if (NET.host && NET.phase === 'p') {
    // 15 kills wins at once; when time runs out the leader wins (a shared lead is a draw)
    NET.mt -= dt;
    const ps = netParts().map(p => ({ id: p.id, s: netScore(p.id) })).sort((a, b) => b.s - a.s);
    if (ps[0].s >= WIN_KILLS || NET.mt <= 0) {
      NET.phase = 'o';
      NET.win = ps[1] && ps[1].s === ps[0].s ? 'tie' : ps[0].id;
    }
    vsPowerHost(dt);
  }
  vsPowerSync(w);
  if (state === 'play') {
    if (NET.down) {
      NET.resp -= dt;
      if (NET.resp <= 0)
        vsRespawn();
    }
    vsPickups(dt);
  }
}

/* ---------- Versus: loadouts and power weapons ---------- */

// Loadout picker (versus lobby and Esc menu); a change applies from your next spawn
function loadoutHTML() {
  return '<div id="mplo">' + loadoutInner() + '</div>';
}

function loadoutInner() {
  const row = (label, list, slot) => '<div style="display:flex;gap:6px;align-items:center;justify-content:center;flex-wrap:wrap"><span style="color:#99a28f;font-size:13px;width:76px;text-align:right">' + label + '</span>'
    + list.map(k => '<button class="card" style="width:auto;padding:5px 10px;text-align:center;' + (NET.lo[slot] === k ? 'border-color:#9bc45a;color:#c8f08a' : '') + '" onclick="netLoad(\'' + slot + '\',\'' + k + '\')">' + W[k].n.replace(/^\S+ /, '') + '</button>').join('') + '</div>';
  return '<div style="display:flex;flex-direction:column;gap:6px"><div style="font-size:13px;color:#99a28f">LOADOUT (used from your next spawn)</div>' + row('Primary', VS_PRIM, 'p') + row('Secondary', VS_SEC, 's') + '</div>';
}

function netLoad(slot, k) {
  if (!(slot === 'p' ? VS_PRIM : VS_SEC).includes(k))
    return;
  NET.lo[slot] = k;
  try {
    localStorage.setItem('spartan_vsload', JSON.stringify(NET.lo));
  }
  catch (e) { }
  const el = $('mplo');
  if (el)
    el.innerHTML = loadoutInner();
}

// Power weapons: the host spawns a sniper rifle or rocket launcher every 35-55s (at most 2 on the map) at a random
// spot. They're shared: whoever reaches one first takes it (their presence lists it in `cl`) and it's gone for everyone.
const PW_NAME = { sn: 'SNIPER RIFLE', rk: 'ROCKET LAUNCHER' };

function vsPowerHost(dt) {
  const taken = NET.mycl.concat(...Object.values(NET.rp).map(r => r.cl));
  NET.pw = NET.pw.filter(q => !taken.includes(q.id));
  NET.pwT -= dt;
  if (NET.pwT <= 0) {
    NET.pwT = R(35, 55);
    if (NET.pw.length < 2) {
      const free = VS_PW_SPOTS.filter(([x, z]) => !NET.pw.some(q => q.x === x && q.z === z));
      const [x, z] = free[Math.random() * free.length | 0];
      NET.pw.push({ id: ++NET.pwId, k: Math.random() < .5 ? 'sn' : 'rk', x, z });
    }
  }
}

// Everyone: show the host's list of power weapons, announce new ones, and pick them up
function vsPowerSync(w) {
  const live = {};
  (Array.isArray(w.pw) ? w.pw.slice(0, 4) : []).forEach(a => {
    if (!Array.isArray(a) || !isFinite(+a[0]))
      return;
    const id = +a[0];
    const k = a[1] === 'rk' ? 'rk' : 'sn';
    const x = clamp(+a[2] || 0, -A, A);
    const z = clamp(+a[3] || 0, -A, A);
    live[id] = 1;
    if (!NET.pwm[id]) {
      NET.pwm[id] = { k, x, z, m: pickupMesh(k, x, z, true) };
      if (NET.pwSync && !NET.mycl.includes(id)) {
        banner(PW_NAME[k] + ' HAS SPAWNED');
        sfx.recharge();
      }
    }
  });
  NET.pwSync = 1;
  Object.keys(NET.pwm).forEach(id => {
    if (!live[id]) {
      scene.remove(NET.pwm[id].m);
      delete NET.pwm[id];
    }
  });
  Object.keys(NET.pwm).forEach(key => {
    const q = NET.pwm[key];
    const id = +key;
    const mine = NET.mycl.includes(id);
    q.m.visible = !mine;
    q.m.rotation.y = T * 1.5;
    q.m.position.y = q.m.userData.gy + .8 + Math.sin(T * 2) * .12;
    if (mine || NET.down || state !== 'play' || Math.hypot(P.x - q.x, P.z - q.z) > 1.6)
      return;
    const i = P.slots.indexOf(q.k);
    // Already carrying one with full ammo: leave it for someone else
    if (i >= 0 && P.sr[i] >= rxOf(q.k))
      return;
    if (i < 0)
      setW(P, q.k);
    else
      P.sr[i] = rxOf(q.k);
    NET.mycl.push(id);
    if (NET.mycl.length > 10)
      NET.mycl.shift();
    banner(W[q.k].n.toUpperCase());
    sfx.grab();
  });
}

/* ---------- Scoreboard and HUD text ---------- */

function netParts() {
  return [{ id: NET.me, n: NET.nick, c: NET.col, me: 1, dn: NET.down, live: NET.started }].concat(Object.values(NET.rp).map(r => ({ id: r.peer, n: r.n, c: r.c, dn: r.dn, live: r.live, rd: r.rd })));
}

// wait: show who is still picking a boon
function netBoard(wait) {
  const ps = netParts();
  if (NET.mode === 'vs' && NET.started) {
    ps.forEach(p => p.s = netScore(p.id));
    ps.sort((a, b) => b.s - a.s);
  }
  return '<div style="min-width:260px;text-align:left">' + ps.map(p => '<div style="display:flex;justify-content:space-between;gap:24px;padding:3px 0;border-bottom:1px solid #2f372a"><span style="color:' + p.c + '">' + esc(p.n) + (p.me ? ' (you)' : '') + '</span><span>'
    + (!NET.started ? 'in lobby' : NET.mode === 'vs' ? p.s + ' kills' : wait ? (p.me || p.rd >= room ? 'READY' : 'picking...') : !p.live ? 'joining' : p.dn ? 'DOWN' : 'IN THE FIGHT')
    + '</span></div>').join('') + '</div>';
}

function netRoomText() {
  if (NET.mode === 'vs') {
    let top = 0;
    netParts().forEach(p => top = Math.max(top, netScore(p.id)));
    const tl = Math.max(0, NET.tl | 0);
    return 'BLOOD GULCH | ' + (tl / 60 | 0) + ':' + String(tl % 60).padStart(2, '0') + ' | You ' + netScore(NET.me) + ' | Lead ' + top + ' (first to ' + WIN_KILLS + ') | Tab: scores';
  }
  const ps = netParts();
  return (NET.lg ? 'LEGENDARY | ' : '') + (L ? L.n + ' | ' + (lroom > L.rooms ? 'BOSS' : 'Room ' + lroom + '/' + L.rooms) : '') + ' | Squad ' + ps.filter(p => !p.dn).length + '/' + ps.length + '  Kills ' + kills;
}

/* ---------- Lobby: hosting, joining by code, leaving ---------- */

const inviteLink = code => location.origin + location.pathname + '?join=' + code;

function netNick(v) {
  NET.nick = String(v).slice(0, 20) || 'Spartan';
  try {
    localStorage.setItem('spartan_nick', NET.nick);
  }
  catch (e) { }
}

function netCol(c) {
  if (!COLS.includes(c))
    return;
  NET.col = c;
  try {
    localStorage.setItem('spartan_col', c);
  }
  catch (e) { }
  mpMenu($('mpc') ? $('mpc').value : '');
}

function mpMenu(prefill) {
  audio.init();
  state = 'menu';
  NET.ui = 'lobby';
  ov.style.display = 'flex';
  ov.style.background = 'linear-gradient(rgba(8,10,6,.35),rgba(8,10,6,.93))';
  ov.style.justifyContent = 'flex-start';
  if (!window.Peer) {
    ov.innerHTML = '<h2>MULTIPLAYER</h2><div style="max-width:460px;color:#c9cfbf">The multiplayer library couldn\'t load. Check your connection (or an ad/script blocker) and reload the page.</div><button class="card" style="text-align:center;width:auto" onclick="startTitle()">BACK</button>';
    return;
  }
  const code = String(prefill || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  ov.innerHTML = '<h2>MULTIPLAYER</h2>'
    + '<div class="set" style="grid-template-columns:auto 230px"><label for="mpn">Name</label><input id="mpn" maxlength="20" value="' + esc(NET.nick) + '" oninput="netNick(this.value)" style="font:inherit;padding:4px 8px;background:#12150f;color:#e6eadf;border:1px solid #3a4533;border-radius:4px"><label>Colour</label><div>'
    + COLS.map(c => '<button aria-label="Colour ' + c + '" onclick="netCol(\'' + c + '\')" style="width:26px;height:26px;margin:2px;border-radius:50%;cursor:pointer;background:' + c + ';border:3px solid ' + (c === NET.col ? '#fff' : 'transparent') + '"></button>').join('') + '</div></div>'
    + '<div class="cards sm"><button class="card" style="text-align:center" onclick="netHost(\'coop\',false)"><b>HOST CO-OP</b><small>Up to 4 Spartans clear the missions together</small></button>'
    + '<button class="card" style="text-align:center;border-color:#c9a227" onclick="netHost(\'coop\',true)"><b style="color:#ffd060">HOST CO-OP LEGENDARY</b><small>Tougher squads, 1.5x credits</small></button>'
    + '<button class="card" style="text-align:center;border-color:#e5534b" onclick="netHost(\'vs\',false)"><b style="color:#ff8a80">HOST VERSUS</b><small>Free-for-all on Blood Gulch, first to ' + WIN_KILLS + ' kills</small></button></div>'
    + '<div style="color:#99a28f;font-size:13px">JOIN A FRIEND\'S GAME</div>'
    + '<div style="display:flex;gap:8px"><input id="mpc" maxlength="6" placeholder="CODE" value="' + code + '" style="font:inherit;font-size:20px;letter-spacing:.2em;width:140px;text-align:center;text-transform:uppercase;padding:6px;background:#12150f;color:#e6eadf;border:1px solid #3a4533;border-radius:4px" onkeydown="if(event.key===\'Enter\')netJoin(this.value)"><button class="card" style="text-align:center;width:auto;' + (code ? 'border-color:#9bc45a' : '') + '" onclick="netJoin($(\'mpc\').value)"><b>JOIN</b></button></div>'
    + '<button class="card" style="text-align:center;width:auto" onclick="startTitle()">BACK</button>';
}

function netReset() {
  netCleanup();
  Object.assign(NET, { mode: null, host: false, client: false, down: 0, menu: 0, started: false, ui: null, me: null, phase: 'lobby', ep: 0, vep: -1, win: '', paid: 0, rd: 0, joinT: 0, joined: 0, hostGone: 0, outSeen: null, kb: {}, kbSeen: null, uiK: '', w: null, next: 'r', modeKnown: 0 });
}

const peerErr = e => {
  const t = e && e.type;
  return t === 'peer-unavailable' ? 'No game found with that code. Check it, and that the host is still in the lobby.'
    : t === 'unavailable-id' ? 'That game code is taken; please try hosting again.'
      : t === 'timeout' ? 'Couldn\'t connect to that game (timed out). A strict network or firewall can block direct connections.'
        : 'Couldn\'t connect (' + (t || 'network error') + ').';
};

// The public PeerJS server occasionally drops a connection attempt: try again a couple of times
const transient = e => ['network', 'server-error', 'socket-error', 'socket-closed'].includes(e && e.type);
async function withRetry(fn) {
  for (let i = 0; ; i++)
    try {
      return await fn();
    }
    catch (e) {
      if (i >= 2 || !transient(e))
        throw e;
      await new Promise(r => setTimeout(r, 800));
    }
}

async function netHost(mode, lg) {
  netReset();
  Object.assign(NET, { mode, host: true, client: false, lg: !!lg, code: newCode(), phase: 'lobby', ep: 1, modeKnown: 1 });
  ov.innerHTML = '<h2>OPENING GAME...</h2>';
  try {
    NET.r = await withRetry(() => p2pHost(NET.code = newCode()));
  }
  catch (e) {
    netLeave(peerErr(e));
    return;
  }
  netWaitRoom();
}

async function netJoin(code) {
  code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 6) {
    banner('ENTER THE 6-CHARACTER CODE');
    return;
  }
  netReset();
  // The real mode arrives with the host's first update
  Object.assign(NET, { mode: 'coop', host: false, client: true, code });
  ov.innerHTML = '<h2>JOINING ' + code + '...</h2>';
  try {
    NET.r = await withRetry(() => p2pJoin(code));
  }
  catch (e) {
    netLeave(peerErr(e));
    return;
  }
  netWaitRoom();
}

function netWaitRoom() {
  state = 'menu';
  NET.ui = 'room';
  NET.uiK = '';
  netRoomUI();
}

function netRoomUI() {
  if (NET.ui !== 'room')
    return;
  const title = !NET.modeKnown ? 'CONNECTING...' : NET.mode === 'vs' ? 'VERSUS: BLOOD GULCH' : 'CO-OP' + (NET.lg ? ' LEGENDARY' : '');
  const h = '<h2>' + title + '</h2>'
    + (NET.host ? '<div>Game code <b style="font-size:26px;letter-spacing:.2em;color:#9bc45a">' + NET.code + '</b></div><div class="cards sm"><button class="card" style="text-align:center" onclick="netCopy()"><b id="mpcopy">COPY INVITE LINK</b><small>Friends open it and press Join</small></button></div>' : '')
    + '<div style="color:#99a28f">' + (NET.host ? 'Waiting for players. Start when your squad is in' + (NET.mode === 'vs' ? ' (others can also join mid-match).' : '.') : NET.joined ? 'Waiting for the host to start...' : 'Connecting to the host...') + '</div>' + netBoard() + (NET.mode === 'vs' && NET.modeKnown ? loadoutHTML() : '')
    + '<div class="cards">' + (NET.host ? '<button class="card" style="text-align:center" onclick="netStart()"><b>START</b><small>' + (1 + Object.keys(NET.rp).length) + '/' + MAXP + ' players</small></button>' : '')
    + '<button class="card" style="text-align:center" onclick="netLeave()"><b>LEAVE</b></button></div>';
  if (h !== NET.uiK) {
    NET.uiK = h;
    ov.style.display = 'flex';
    ov.style.justifyContent = 'center';
    ov.innerHTML = h;
  }
}

function netCopy() {
  const link = inviteLink(NET.code);
  const done = ok => {
    const b = $('mpcopy');
    if (b)
      b.textContent = ok ? 'COPIED!' : link;
  };
  try {
    navigator.clipboard.writeText(link).then(() => done(true), () => done(false));
  }
  catch (e) {
    done(false);
  }
}

function netStart() {
  if (!NET.host || NET.ui !== 'room')
    return;
  NET.ui = null;
  NET.phase = 'p';
  if (NET.mode === 'coop') {
    NET.started = true;
    newRun(NET.lg);
  }
  // Versus starts on the next tick (vsTick sees the phase change)
}

function netCleanup() {
  Object.values(NET.rp).forEach(netDrop);
  Object.values(NET.ghosts).forEach(e => scene.remove(e.g));
  NET.shp.concat(NET.hzp).forEach(m => scene.remove(m));
  NET.pks.forEach(p => scene.remove(p.m));
  Object.assign(NET, { rp: {}, seen: {}, seenFx: {}, cm: {}, cmT: {}, out: {}, kl: {}, klPrev: {}, ghosts: {}, shp: [], hzp: [], pks: [], fxl: [], exl: [] });
  nmsg.style.display = sb.style.display = 'none';
}

function netLeave(msg) {
  const r = NET.r;
  NET.r = null;
  try {
    if (r)
      r.leave();
  }
  catch (e) { }
  if (NET.started)
    netBank();
  netReset();
  document.exitPointerLock && document.exitPointerLock();
  clearHz();
  [enemies, shots, nades, drops, rockets, needles].forEach(a => a.forEach(o => scene.remove(o.g || o.m)));
  enemies = [];
  shots = [];
  nades = [];
  drops = [];
  rockets = [];
  needles = [];
  L = null;
  startTitle();
  if (msg)
    ov.insertAdjacentHTML('afterbegin', '<div style="color:#ffd060;max-width:480px">' + esc(msg) + '</div>');
}

// Esc in a match: a menu over the running game (nobody else's game pauses)
function netMenu() {
  if (NET.menu) {
    if (performance.now() - NET.menuAt > 300)
      netResume();
    return;
  }
  NET.menu = 1;
  NET.menuAt = performance.now();
  down = false;
  zoomOn = false;
  document.exitPointerLock && document.exitPointerLock();
  netMenuScreen();
}

function netMenuScreen() {
  ov.style.display = 'flex';
  ov.style.background = 'rgba(8,10,6,.55)';
  ov.style.justifyContent = '';
  ov.innerHTML = '<h2>MENU</h2><div style="color:#99a28f;font-size:13px">The match keeps running while this is open</div>' + (NET.mode === 'vs' ? loadoutHTML() : '') + settingsHTML()
    + '<div class="cards"><button class="card" style="text-align:center" onclick="netResume()"><b>RESUME</b></button><button class="card" style="text-align:center" onclick="showControls(\'netMenuScreen\')"><b>CONTROLS</b><small>Keys and mouse</small></button><button class="card" style="text-align:center" onclick="netLeave()"><b>LEAVE GAME</b><small>Credits earned so far are kept</small></button></div>';
}

function netResume() {
  if (!NET.menu)
    return;
  NET.menu = 0;
  ov.style.display = 'none';
  ov.style.background = '';
  lock();
}

/* ---------- Every frame ---------- */

function netSend(dt) {
  NET.sendT -= dt;
  if (NET.sendT > 0)
    return;
  NET.sendT = .05;
  const live = NET.started && P && (state === 'play' || state === 'pick' || state === 'wait');
  const p = { n: NET.nick.slice(0, 20), c: NET.col, live: live ? 1 : 0, rd: NET.rd, ep: NET.ep };
  // Forget totals for enemies that are long gone
  if (NET.mode === 'coop')
    Object.keys(NET.cm).forEach(k => {
      if (!NET.ghosts[k.slice(1, -1)] && T - (NET.cmT[k] || 0) > 3) {
        delete NET.cm[k];
        delete NET.cmT[k];
      }
    });
  if (live)
    Object.assign(p, { gt: NET.gt || 0, cl: NET.mycl, x: r1(P.x), y: r1(P.y), z: r1(P.z), yw: r2(yaw), hp: Math.round(P.hp), sh: Math.round(P.sh), w: P.wpn, dn: NET.down ? 1 : 0, fx: NET.fxl, ex: NET.exl, cm: NET.cm, kl: NET.kl });
  const o = { p };
  if (NET.host)
    o.w = NET.w;
  NET.r.presence(o);
}

function netTick(dt) {
  if (!NET.r)
    return;
  if (NET.r.full) {
    netLeave('That game is full (' + MAXP + ' players).');
    return;
  }
  const ps = NET.r.peers();
  if (!NET.me && ps[0] && ps[0].peer)
    NET.me = pid(ps[0].peer);
  let hw = null;
  const ids = {};
  ps.forEach(p => {
    if (p.sameTab)
      return;
    const pr = p.presence || {};
    const id = pid(p.peer);
    if (!hw && pr.w && typeof pr.w === 'object')
      hw = pr.w;
    if (!pr.p || typeof pr.p !== 'object')
      return;
    ids[id] = 1;
    netRead(NET.rp[id] || (NET.rp[id] = { peer: id, x: 0, y: 0, z: 0, yw: 0, isNew: 1 }), pr.p);
  });
  Object.keys(NET.rp).forEach(id => {
    if (!ids[id]) {
      netDrop(NET.rp[id]);
      delete NET.rp[id];
    }
  });
  if (NET.host) {
    NET.w = netWorld();
    hw = NET.w;
  }
  else {
    NET.joinT += dt;
    if (hw) {
      NET.joined = 1;
      NET.hostGone = 0;
      if (!NET.modeKnown) {
        NET.modeKnown = 1;
        NET.mode = hw.md === 'vs' ? 'vs' : 'coop';
        NET.client = NET.mode === 'coop';
        NET.lg = !!hw.lg;
      }
    }
    else {
      NET.hostGone += dt;
      if (NET.joined ? NET.hostGone > 5 : NET.joinT > 15) {
        netLeave(NET.joined ? 'The host left the game.' : 'Could not reach that game.');
        return;
      }
    }
  }
  if (hw && NET.me) {
    if (NET.mode === 'coop') {
      if (NET.host)
        coopHost(dt);
      else
        coopClient(hw, dt);
    }
    else
      vsTick(hw, dt);
  }
  if (!NET.r)
    return;
  if (NET.started && P)
    Object.values(NET.rp).forEach(netFxIn);
  netAvatars(dt);
  if (NET.ui === 'room') {
    NET.uiT -= dt;
    if (NET.uiT <= 0) {
      NET.uiT = .5;
      netRoomUI();
    }
  }
  const msg = NET.started && NET.down && state === 'play' ? (NET.mode === 'vs' ? 'RESPAWNING IN ' + Math.max(1, Math.ceil(NET.resp)) + '<br><small>Esc to change your loadout</small>' : 'YOU ARE DOWN<br><small>You redeploy when your squad clears the room</small>') : '';
  nmsg.style.display = msg ? 'block' : 'none';
  if (msg && nmsg.innerHTML !== msg)
    nmsg.innerHTML = msg;
  sb.style.display = NET.tab && NET.started && state === 'play' ? 'block' : 'none';
  if (sb.style.display === 'block')
    sb.innerHTML = netBoard();
  netSend(dt);
}

// An invite link (?join=CODE) opens the multiplayer menu with the code filled in
(() => {
  const m = /[?&]join=([A-Za-z0-9]{6})/.exec(location.search);
  if (m)
    addEventListener('load', () => setTimeout(() => mpMenu(m[1]), 50));
})();
