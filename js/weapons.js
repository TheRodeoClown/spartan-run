/*
 * weapons.js: Weapon table, viewmodels, firing, needler, rockets, grenades, melee and pickups.
 * Classic script (no modules): all files share one global scope, so load order in index.html matters.
 */

const W = {
  ar: { n: 'MA40 Assault Rifle', dmg: 8, rate: .09, mag: 32, rt: 1.3, sp: .012, pel: 1, hs: 1.5, mbs: 1, kick: .004 },
  br: { n: 'BR55 Battle Rifle', dmg: 13, rate: .42, mag: 36, rt: 1.5, sp: .004, pel: 1, hs: 2.2, mbs: 1, kick: .006, burst: 3 },
  sw: { n: 'Energy Sword', ty: 'e', dmg: 0, rate: .5, mag: 100, rt: 1, mbs: 0, kick: 0 },
  mg: { n: 'M6D Magnum', dmg: 30, rate: .34, mag: 12, rt: 1.1, sp: .004, pel: 1, hs: 2.5, mbs: .4, kick: .016 },
  sg: { n: 'M90 Shotgun', dmg: 6, rate: .8, mag: 8, rt: 2.2, sp: .075, pel: 9, hs: 1.3, mbs: .3, kick: .03 },
  sn: { n: 'S2 AM Sniper Rifle', dmg: 80, rate: 1, mag: 4, rt: 2.4, sp: .0005, pel: 1, hs: 3, mbs: .2, kick: .04, pierce: 1 },
  pr: { n: 'Type-25 Plasma Rifle', dmg: 6, rate: .07, mag: 60, rt: 1.6, sp: .02, pel: 1, hs: 1.2, mbs: 1.5, kick: .002, ty: 'e', col: 0x7dff9a },
  rk: { n: 'M41 Rocket Launcher', dmg: 100, rate: 1.1, mag: 2, rt: 2.6, rocket: 1, mbs: .1, kick: .035 },
  nd: { n: 'Type-33 Needler', dmg: 4, rate: .11, mag: 24, rt: 1.5, sp: .03, pel: 1, hs: 1, mbs: 1, kick: .003, needle: 1, ty: 'e', col: 0xff5fd0 }
};
// Reserve ammo per weapon: [starting reserve, max reserve]. Rockets are scarce.
const RES = { ar: [96, 224], br: [72, 180], mg: [36, 72], sg: [16, 40], sn: [8, 20], pr: [120, 240], rk: [2, 6], nd: [48, 120], sw: [0, 0] };
Object.keys(RES).forEach(k => {
  W[k].rs = RES[k][0];
  W[k].rx = RES[k][1];
});
// Weapon boons say whether the gun is energy or kinetic
BOONS.forEach(b => {
  if (b.w && W[b.w])
    b.d += W[b.w].ty === 'e' ? ' | ENERGY: +80% vs shields, -30% vs health' : ' | KINETIC: +25% vs health, -25% vs shields';
});
const rxOf = w => Math.round(W[w].rx * (P.resMul || 1));
let drops = [];
let rockets = [];
let needles = [];
let debris = [];
let slashes = [];
let zoomOn = false;
let swapT = 0;
let lw = 0;

// Player scaling has diminishing returns so late-run builds can't melt everything: weapon damage tops out
// near x1.8, fire rate near +65%, melee near x3 (the sword's x3 is on top), grenades near x2.2.
const soft = (m, cap) => m <= 1 ? m : 1 + (cap - 1) * (1 - Math.exp(-(m - 1) / (cap - 1)));
const dmgMul = () => soft(P.dmg / 8, 1.8);
const nadeM = () => soft(P.nadeMul, 2.2);
const meleeM = () => soft(P.meleeMul, 3);

function wst() {
  const w = W[P.wpn];
  return Object.assign({}, w, { dmg: w.dmg * dmgMul(), rate: w.rate / soft(.09 / P.rate, 1.65), rt: w.rt * P.reloadT / 1.3, sp: (w.sp || 0) * (P.acc || 1) });
}

function recalcMag() {
  const w = W[P.wpn];
  P.magMax = Math.max(1, Math.round(w.mag + (P.mb || 0) * w.mbs));
}

function setW(p, k, sl) {
  p.sa[p.cur] = p.ammo;
  const i = sl != null ? sl : (p.slots[1] ? p.cur : 1);
  p.slots[i] = k;
  p.cur = i;
  p.wpn = k;
  recalcMag();
  p.ammo = p.magMax;
  p.sa[i] = p.ammo;
  p.sr[i] = W[k].rs;
  p.reload = 0;
  p.bl = 0;
  p.cd = .3;
  setGun(k);
  swapT = .3;
}

function swapTo(i) {
  if (state !== 'play' || i === P.cur || !P.slots[i])
    return;
  P.sa[P.cur] = P.ammo;
  P.cur = i;
  P.wpn = P.slots[i];
  recalcMag();
  P.ammo = P.sa[i];
  P.reload = 0;
  P.bl = 0;
  P.cd = .35;
  setGun(P.wpn);
  swapT = .3;
  sfx.swap();
  if (P.ammo <= 0)
    startReload();
}
const gun = new THREE.Group();
cam.add(gun);
scene.add(cam);
gun.position.set(.26, -.24, -.55);
// Sword glow light: always present (a constant light count avoids shader recompiles), lit only while the blade is out.
const swLight = new THREE.PointLight(0x5fc8ff, 0, 6);
swLight.position.set(.3, -.1, -.8);
cam.add(swLight);
// Energy spent per sword swing (the sword's battery is its 100-point magazine).
const SWING_COST = 10;

// Energy Sword model (player and Sword Elites): ribbed hilt, guard with glowing vents, and two curved
// plasma blades made of a white-hot core plus two additive glow layers. Blades point along -z.
function makeSword() {
  const h = new THREE.Group();
  const blades = new THREE.Group();
  const dark = new THREE.MeshPhongMaterial({ color: 0x2a2e38, shininess: 80, specular: 0x6688aa });
  const trim = new THREE.MeshPhongMaterial({ color: 0x8a93a8, shininess: 100, specular: 0xffffff });
  const vent = new THREE.MeshBasicMaterial({ color: 0x7fe0ff });
  const core = new THREE.MeshBasicMaterial({ color: 0xf2fdff, side: THREE.DoubleSide });
  const gl = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const g1 = gl(0x6fd0ff, .55);
  const g2 = gl(0x2a7dff, .25);
  const add = (geo, m, x, y, z) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    h.add(o);
    return o;
  };
  add(new THREE.CylinderGeometry(.022, .026, .2, 10), dark, 0, 0, .06).rotation.x = Math.PI / 2;
  [0, .04, .08, .12].forEach(z => add(new THREE.TorusGeometry(.026, .006, 6, 12), trim, 0, 0, z));
  add(new THREE.SphereGeometry(.03, 10, 8), trim, 0, 0, .17);
  add(new THREE.BoxGeometry(.2, .035, .06), dark, 0, 0, -.06);
  [-1, 1].forEach(s => {
    add(new THREE.BoxGeometry(.05, .04, .08), trim, s * .09, 0, -.07).rotation.y = s * .4;
    add(new THREE.BoxGeometry(.04, .01, .03), vent, s * .07, .02, -.06);
  });
  const sh = new THREE.Shape();
  sh.moveTo(0, 0);
  sh.lineTo(.035, 0);
  sh.quadraticCurveTo(.1, .36, .012, .78);
  sh.quadraticCurveTo(.045, .36, 0, 0);
  const geo = new THREE.ShapeGeometry(sh, 12);
  [-1, 1].forEach(s => {
    const b = new THREE.Group();
    b.position.set(s * .075, 0, -.08);
    b.rotation.x = -Math.PI / 2;
    b.scale.x = s;
    blades.add(b);
    [[core, 1, 1], [g1, 1.6, 1.06], [g2, 2.6, 1.12]].forEach(([m, wx, ly]) => {
      const o = new THREE.Mesh(geo, m);
      o.scale.set(wx, ly, 1);
      o.position.x = -.0175 * (wx - 1);
      b.add(o);
    });
  });
  h.add(blades);
  return { h, blades, g1, g2 };
}

function setGun(k) {
  while (gun.children.length)
    gun.remove(gun.children[0]);
  gun.userData.sw = null;
  if (k === 'sw') {
    const s = makeSword();
    s.h.rotation.set(.5, 0, .15);
    gun.add(s.h);
    gun.userData.sw = s;
    return;
  }
  const add = (w, h, d, x, y, z, c) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: c }));
    m.position.set(x, y, z);
    gun.add(m);
  };
  const c = { ar: 0x5a6a4a, br: 0x4d5a40, mg: 0x666a70, sg: 0x5a4a3a, sn: 0x40454d, pr: 0x6b3fa0, rk: 0x6a5a3a, nd: 0xc0408a }[k];
  if (k === 'mg') {
    add(.05, .07, .22, 0, 0, -.05, c);
    add(.04, .1, .05, 0, -.07, .04, 0x333333);
  }
  else if (k === 'pr') {
    add(.08, .09, .4, 0, 0, -.1, c);
    add(.03, .03, .3, 0, .07, -.15, 0x7dff9a);
  }
  else if (k === 'rk') {
    add(.13, .13, .7, 0, .02, -.15, c);
    add(.09, .09, .1, 0, .02, -.55, 0x222222);
  }
  else if (k === 'sn') {
    add(.05, .07, .75, 0, 0, -.2, c);
    add(.04, .04, .25, 0, .08, -.1, 0x111111);
  }
  else if (k === 'nd') {
    add(.07, .09, .38, 0, 0, -.1, c);
    add(.03, .05, .2, 0, .07, -.12, 0xff7be0);
  }
  else if (k === 'sg') {
    add(.06, .07, .55, 0, 0, -.15, c);
    add(.08, .05, .2, 0, -.05, -.1, 0x3a2a1a);
  }
  else {
    add(.06, .09, .5, 0, 0, -.1, c);
    add(.04, .12, .06, 0, -.09, .02, 0x222222);
    add(.03, .03, .2, 0, .07, -.2, 0x222222);
  }
}
setGun('ar');

// Looking through the sniper scope: the gun model is hidden and the scope overlay shown.
const scoped = () => P && state === 'play' && zoomOn && P.wpn === 'sn' && cam.fov < 40;

function animGun(dt) {
  gun.visible = state !== 'title' && !scoped();
  // Sword: pulsing glow, blades off when the battery is too low to swing
  const S = gun.userData.sw;
  swLight.intensity = 0;
  if (S && P) {
    const on = P.ammo >= SWING_COST;
    S.blades.visible = on;
    S.g1.opacity = .5 + .12 * Math.sin(T * 31);
    S.g2.opacity = .22 + .08 * Math.sin(T * 17);
    if (on && gun.visible)
      swLight.intensity = 1.1;
  }
  let x = .26;
  let y = -.24;
  let rx = 0;
  let ry = 0;
  let rz = 0;
  if (P && state === 'play') {
    if (swapT > 0) {
      swapT = Math.max(0, swapT - dt);
      y -= .45 * swapT / .3;
      rx -= .6 * swapT / .3;
    }
    if (P.reload > 0) {
      const u = 1 - P.reload / wst().rt;
      const d = Math.sin(Math.PI * u);
      const k = P.wpn;
      y -= .16 * d;
      rx += .45 * d;
      rz -= .35 * d;
      if (k === 'sg') {
        rx = .3 + .12 * Math.sin(u * Math.PI * 10);
        y = -.34;
        rz = -.2;
      }
      else if (k === 'rk') {
        rz = -1.0 * d;
        x -= .1 * d;
      }
      else if (k === 'sn') {
        ry = .5 * Math.sin(u * Math.PI * 2);
        x += .1 * Math.sin(u * Math.PI * 2);
      }
      else if (k === 'pr') {
        x += Math.sin(u * 60) * .006 * d;
        rx = .2 * d;
      }
      else if (k === 'nd') {
        rz = -.8 * Math.sin(u * Math.PI * 2);
      }
      else if (k === 'mg') {
        rx = .7 * d;
        y -= .05 * d;
      }
    }
    // Melee swing: the sword slashes right to left; guns do a short butt-stroke
    if (P.swing > 0) {
      P.swing -= dt;
      const sw = P.wpn === 'sw';
      const u = 1 - Math.max(0, P.swing) / (sw ? .32 : .22);
      const s = Math.sin(Math.PI * u);
      if (sw) {
        ry = -.9 + 1.8 * u;
        rz = -.7;
        x = .3 - .4 * u;
        y = -.2 + .06 * s;
      }
      else {
        rx -= .6 * s;
        y += .06 * s;
        x -= .08 * s;
      }
    }
  }
  const a = Math.min(1, dt * 20);
  gun.position.x += (x - gun.position.x) * a;
  gun.position.y += (y - gun.position.y) * a;
  gun.position.z += (-.55 - gun.position.z) * Math.min(dt * 18, 1);
  gun.rotation.x += (rx - gun.rotation.x) * a;
  gun.rotation.y += (ry - gun.rotation.y) * a;
  gun.rotation.z += (rz - gun.rotation.z) * a;
  debris.forEach(d => {
    d.v.y -= 12 * dt;
    d.m.position.addScaledVector(d.v, dt);
    d.m.rotation.x += dt * 6;
    if (d.m.position.y < .06) {
      d.m.position.y = .06;
      d.v.set(0, 0, 0);
    }
    d.life -= dt;
    if (d.life <= 0)
      scene.remove(d.m);
  });
  debris = debris.filter(d => d.life > 0);
}

function dropMag() {
  const m = new THREE.Mesh(new THREE.BoxGeometry(.05, .12, .07), new THREE.MeshLambertMaterial({ color: 0x2a2a2a }));
  const f = fwd();
  const r = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  m.position.copy(cam.position).addScaledVector(f, .5).addScaledVector(r, .25);
  m.position.y -= .3;
  scene.add(m);
  debris.push({ m, v: new THREE.Vector3(R(-.5, .5) + r.x * .8, .5, R(-.5, .5) + r.z * .8), life: 1.2 });
}

function fireNeedle(w, o, right) {
  const f = new THREE.Vector3(R(-w.sp, w.sp), R(-w.sp, w.sp), -1).applyQuaternion(cam.quaternion).normalize();
  const m = new THREE.Mesh(new THREE.BoxGeometry(.03, .03, .35), new THREE.MeshBasicMaterial({ color: 0xff5fd0 }));
  m.position.copy(o).addScaledVector(f, .9).addScaledVector(right, .2);
  m.position.y -= .2;
  m.lookAt(m.position.clone().add(f));
  scene.add(m);
  needles.push({ m, v: f.multiplyScalar(36), life: 2.5, dmg: w.dmg });
}

function updNeedles(dt) {
  needles.forEach(n => {
    const p = n.m.position;
    const sp = n.v.length();
    let be = null;
    let bd = 1e9;
    enemies.forEach(e => {
      if (e.dead)
        return;
      const dx = e.x - p.x;
      const dy = 1.1 * e.sc - p.y;
      const dz = e.z - p.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < 14 && (dx * n.v.x + dy * n.v.y + dz * n.v.z) / (d * sp) > .85 && d < bd) {
        bd = d;
        be = e;
      }
    });
    if (be)
      n.v.lerp(new THREE.Vector3(be.x - p.x, 1.1 * be.sc - p.y, be.z - p.z).normalize().multiplyScalar(sp), Math.min(1, dt * 4));
    p.addScaledVector(n.v, dt);
    n.m.lookAt(p.clone().add(n.v));
    n.life -= dt;
    for (const e of enemies) {
      if (e.dead)
        continue;
      if (Math.hypot(e.x - p.x, 1.1 * e.sc - p.y, e.z - p.z) < .8 * e.sc) {
        dmgE(e, n.dmg, false, 'e');
        hitT = .08;
        hitCol = '#ff8ae0';
        e.nd = (e.nd || 0) + 1;
        e.ndl = e.ndl || [];
        n.m.position.set(R(-.3, .3), R(.7, 1.5), R(-.2, .2));
        n.m.rotation.set(R(0, 3), R(0, 3), 0);
        e.g.add(n.m);
        e.ndl.push(n.m);
        n.hooked = true;
        n.life = -1;
        if (e.nd >= 7 && !e.fuse)
          e.fuse = .7;
        break;
      }
    }
    if (!n.hooked && (n.life <= 0 || p.y < .05 || outArena(p) || inPillar(p, 0))) {
      n.life = -1;
      scene.remove(n.m);
    }
  });
  needles = needles.filter(n => n.life > 0);
  enemies.forEach(e => {
    if (e.fuse > 0 && !e.dead) {
      e.fuse -= dt;
      e.mat.emissive.setHex(Math.floor(T * 20) % 2 ? 0xff3fd0 : 0);
      if (e.fuse <= 0) {
        e.ndl.forEach(m => e.g.remove(m));
        e.nd = 0;
        e.fuse = 0;
        explode(e.x, 1.1 * e.sc, e.z, 4, 70 * dmgMul(), 10, 'e');
      }
    }
  });
}

// Drops: grenade (green orb), ammo (olive box, refills every gun except rockets),
// rocket (rare, only while you carry the launcher).
function mkDrop(k, x, z) {
  const g = new THREE.Group();
  const B = c => new THREE.MeshBasicMaterial({ color: c });
  if (k === 'nade')
    g.add(new THREE.Mesh(new THREE.SphereGeometry(.2, 10, 8), B(0x7dff6a)), new THREE.Mesh(new THREE.TorusGeometry(.32, .03, 6, 16), B(0xd8ff9a)));
  else if (k === 'swe')
    g.add(new THREE.Mesh(new THREE.OctahedronGeometry(.18), B(0xe8fbff)), new THREE.Mesh(new THREE.TorusGeometry(.34, .035, 6, 20), new THREE.MeshBasicMaterial({ color: 0x5fc8ff, transparent: true, opacity: .8, blending: THREE.AdditiveBlending })));
  else if (k === 'ammo')
    g.add(new THREE.Mesh(new THREE.BoxGeometry(.5, .28, .32), new THREE.MeshLambertMaterial({ color: 0x56653a })), new THREE.Mesh(new THREE.BoxGeometry(.52, .07, .34), B(0xffd24a)));
  else {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, .7, 10), B(0xff6a3a));
    r.rotation.z = Math.PI / 2;
    g.add(r, new THREE.Mesh(new THREE.TorusGeometry(.42, .04, 6, 20), B(0xffb070)));
  }
  g.position.set(x + R(-.5, .5), .6, z + R(-.5, .5));
  scene.add(g);
  drops.push({ k, m: g, x: g.position.x, z: g.position.z, life: 25 });
}

function dropMaybe(e) {
  const b = e.boss;
  // Sword Elites rarely drop anything: an energy cell if you carry the sword, otherwise an ammo box.
  if (e.t === 'selite') {
    if (Math.random() < .2)
      mkDrop(P.slots.includes('sw') ? 'swe' : 'ammo', e.x, e.z);
    return;
  }
  if (b || Math.random() < ({ grunt: .25, jackal: .2, elite: .35, hunter: 1 }[e.t] || 0))
    mkDrop('nade', e.x, e.z);
  if (b || Math.random() < ({ grunt: .5, kgrunt: .3, jackal: .45, elite: .55, hunter: 1 }[e.t] || 0))
    mkDrop('ammo', e.x, e.z);
  if (P.slots.includes('rk') && Math.random() < (b ? 1 : { elite: .06, hunter: .25 }[e.t] || 0))
    mkDrop('rk', e.x, e.z);
}

// Does pickup kind k refill weapon w? 'ammo' feeds every gun but the launcher and sword, 'rk' the launcher,
// 'swe' (energy cell) the sword. Sword energy lives in the magazine (P.ammo while held, P.sa[slot] otherwise).
const ammoFor = (k, w) => k === 'swe' ? w === 'sw' : w && w !== 'sw' && (k === 'rk') === (w === 'rk');
const swE = i => i === P.cur ? P.ammo : P.sa[i];
// Pickups give 15% more than a magazine's worth.
const DROP_AMMO = 1.15;

function ammoRoom(k) {
  return P.slots.some((w, i) => ammoFor(k, w) && (k === 'swe' ? swE(i) < W.sw.mag : P.sr[i] < rxOf(w)));
}

function grabAmmo(k) {
  P.slots.forEach((w, i) => {
    if (!ammoFor(k, w))
      return;
    if (k === 'swe') {
      const v = Math.min(W.sw.mag, swE(i) + Math.round(50 * DROP_AMMO));
      if (i === P.cur)
        P.ammo = v;
      else
        P.sa[i] = v;
    }
    else
      P.sr[i] = Math.min(rxOf(w), P.sr[i] + Math.round((k === 'rk' ? 2 : Math.max(4, W[w].mag)) * DROP_AMMO * (P.scav || 1)));
  });
  if (P.ammo <= 0)
    startReload();
}

function updDrops(dt) {
  drops.forEach(d => {
    d.life -= dt;
    d.m.position.y = .6 + Math.sin(T * 3 + d.x) * .12;
    d.m.rotation.y += dt * 2;
    d.m.visible = d.life > 5 || Math.floor(T * 8) % 2 === 0;
    if (d.life > 0 && Math.hypot(P.x - d.x, P.z - d.z) < 1.3) {
      if (d.k === 'nade') {
        if (P.nades < P.nadeMax) {
          P.nades++;
          d.life = 0;
          sfx.grab();
        }
      }
      else if (ammoRoom(d.k)) {
        grabAmmo(d.k);
        d.life = 0;
        sfx.grab();
      }
    }
    if (d.life <= 0)
      scene.remove(d.m);
  });
  drops = drops.filter(d => d.life > 0);
}

// ty: damage type dealt to enemies (see DMGT); foe: set off by an enemy, so on the co-op host it also hits the other players
function explode(x, y, z, rad, dm, selfD, ty, foe) {
  enemies.forEach(e => {
    const d = Math.hypot(e.x - x, e.z - z, e.sc - y);
    if (d < rad)
      dmgE(e, dm * (1 - d / rad * .5), false, ty);
  });
  if (Math.hypot(P.x - x, 1.6 + P.y - y, P.z - z) < rad)
    hurt(selfD);
  if (foe && NET.host)
    netRemotes().forEach(r => {
      if (Math.hypot(r.x - x, 1.6 + r.y - y, r.z - z) < rad)
        netOut(r, selfD);
    });
  netFx('ex', [x, y, z, rad]);
  flashFx(x, y, z, rad, 0xffb040);
  sfx.boom();
}

function updRockets(dt) {
  rockets.forEach(r => {
    const p = r.m.position;
    p.addScaledVector(r.v, dt);
    r.life -= dt;
    if (r.life <= 0 || p.y < .1 || outArena(p) || inPillar(p, 0) || enemies.some(e => !e.dead && Math.hypot(e.x - p.x, e.sc * 1.1 - p.y, e.z - p.z) < .9 * e.sc)) {
      r.life = -1;
      explode(p.x, p.y, p.z, 6 * Math.sqrt(nadeM()), W.rk.dmg * dmgMul(), 20, 'k');
      scene.remove(r.m);
    }
  });
  rockets = rockets.filter(r => r.life > 0);
}

function fire() {
  const w = wst();
  const o = cam.position;
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  P.ammo--;
  P.cd = w.rate;
  pitch += w.kick;
  gun.position.z = -.46;
  sfx.shot(P.wpn);
  if (w.rocket) {
    const f = fwd();
    const m = new THREE.Mesh(new THREE.SphereGeometry(.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffa040 }));
    m.scale.set(1, 1, 3);
    m.position.copy(o).addScaledVector(f, .9).addScaledVector(right, .2);
    m.position.y -= .2;
    m.lookAt(m.position.clone().add(f));
    scene.add(m);
    rockets.push({ m, v: f.multiplyScalar(30), life: 4 });
  }
  else if (w.needle) {
    fireNeedle(w, o, right);
  }
  else
    for (let i = 0; i < w.pel; i++) {
      const d = new THREE.Vector3(R(-w.sp, w.sp), R(-w.sp, w.sp), -1).applyQuaternion(cam.quaternion).normalize();
      const hits = [];
      enemies.forEach(e => {
        if (e.dead)
          return;
        const dx = e.x - o.x;
        const dy = 1.1 * e.sc - o.y;
        const dz = e.z - o.z;
        const t = dx * d.x + dy * d.y + dz * d.z;
        if (t > 0 && dx * dx + dy * dy + dz * dz - t * t < (.8 * e.sc) ** 2)
          hits.push({ e, t });
      });
      hits.sort((a, b) => a.t - b.t);
      const wt = wallT(o, d);
      let end = Math.min(wt, 60);
      if (!w.pierce && hits.length && hits[0].t < wt)
        end = hits[0].t;
      hits.slice(0, w.pierce ? 2 : 1).forEach(h => {
        if (h.t < wt) {
          const head = o.y + d.y * h.t > 1.5 * h.e.sc;
          const cp = critHit(h.e, o, d);
          dmgE(h.e, w.dmg * (cp ? CRIT_MUL : head ? w.hs * (P.hsMul || 1) : 1), !!cp, w.ty || 'k');
          hitT = .12;
          hitCol = cp ? '#ff6a2a' : head ? '#ffd24a' : '#fff';
          if (cp) {
            if (i === 0)
              sfx.crit();
            flashFx(cp.x, cp.y, cp.z, .5, 0xffb040);
          }
          else if (i === 0)
            sfx.tick(head);
        }
      });
      const s = o.clone().addScaledVector(right, .25).addScaledVector(d, .6);
      s.y -= .2;
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([s, o.clone().addScaledVector(d, end)]), new THREE.LineBasicMaterial({ color: w.col || 0xffe9a0 }));
      scene.add(l);
      tracers.push({ m: l, life: .05 });
      // Other players see the first tracer of each shot
      if (i === 0)
        netFx('fx', [s.x, s.y, s.z, o.x + d.x * end, o.y + d.y * end, o.z + d.z * end, w.col || 0xffe9a0]);
    }
  if (P.ammo <= 0)
    startReload();
}

function startReload() {
  if (P.reload <= 0 && P.ammo < P.magMax && P.sr[P.cur] > 0) {
    P.reload = wst().rt;
    sfx.reload(P.wpn);
    if ('ar,br,mg,nd'.includes(P.wpn))
      dropMag();
  }
}

function throwNade() {
  if (P.nades <= 0 || state !== 'play')
    return;
  P.nades--;
  sfx.throw();
  const f = fwd();
  const m = new THREE.Mesh(new THREE.SphereGeometry(.15, 10, 8), new THREE.MeshBasicMaterial({ color: 0x6fbf4a }));
  m.position.copy(cam.position).addScaledVector(f, .8);
  scene.add(m);
  nades.push({ m, v: f.clone().multiplyScalar(15).add(new THREE.Vector3(0, 4, 0)), fuse: 1.5 });
}

const DASH = 5.5;

function jump() {
  if (state !== 'play' || P.y > 0)
    return;
  P.vy = 7;
  sfx.jump();
}

// Thruster: Shift + A/D dashes sideways.
function thrust() {
  if (state !== 'play' || !P.thrust || P.tcd > 0 || P.dash > 0)
    return;
  const d = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  if (!d)
    return;
  P.dash = .18;
  P.dashDir = d;
  P.tcd = 2.5;
  sfx.dash();
  flashFx(cam.position.x, 1.2 + P.y, cam.position.z, .5, 0x8ce6ff);
}

function melee() {
  if (P.mcd > 0 || state !== 'play')
    return;
  const sw = P.wpn === 'sw' && P.ammo >= SWING_COST;
  P.mcd = sw ? .5 : .7;
  P.swing = sw ? .32 : .22;
  if (sw)
    sfx.sword();
  else
    sfx.melee();
  if (sw) {
    P.ammo -= SWING_COST;
    // Slash trail: a horizontal arc of light sweeping in front of you
    const arc = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.6, 32, 1, Math.PI / 2 - .9, 1.8), new THREE.MeshBasicMaterial({ color: 0x7fe0ff, transparent: true, opacity: .6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    arc.position.set(P.x, 1.45 + P.y, P.z);
    arc.rotation.order = 'YXZ';
    arc.rotation.set(-Math.PI / 2, yaw, 0);
    scene.add(arc);
    slashes.push({ m: arc, life: .25 });
  }
  const f = fwd();
  if (sw) {
    // Lunge: close the gap to the nearest enemy in front, within 6m
    let best = null;
    let bd = 6;
    enemies.forEach(e => {
      const dx = e.x - P.x;
      const dz = e.z - P.z;
      const d = Math.hypot(dx, dz);
      if (d < bd && d > 2.2 && (dx * f.x + dz * f.z) / d > .75) {
        bd = d;
        best = e;
      }
    });
    if (best) {
      const k = (bd - 1.8) / bd;
      P.x = clamp(P.x + (best.x - P.x) * k, -A + 1, A - 1);
      P.z = clamp(P.z + (best.z - P.z) * k, -A + 1, A - 1);
      pushOut(P, .5);
      cam.position.set(P.x, 1.6 + P.y, P.z);
    }
  }
  enemies.forEach(e => {
    const dx = e.x - P.x;
    const dz = e.z - P.z;
    const d = Math.hypot(dx, dz);
    const rc = sw ? 4.2 : 2.8;
    if (d < rc + e.sc * .4 && (dx * f.x + dz * f.z) / d > (sw ? .3 : .5)) {
      dmgE(e, 45 * meleeM() * (sw ? 3 : 1), false, sw ? 'e' : 'k');
      e.x += dx / d * 1.8;
      e.z += dz / d * 1.8;
    }
  });
  flashFx(cam.position.x + f.x * 1.2, 1.2, cam.position.z + f.z * 1.2, .7, 0x8ce6ff);
}
