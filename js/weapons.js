/*
 * weapons.js: Weapon table, viewmodels, firing, needler, rockets, grenades, melee and pickups.
 * Classic script (no modules): all files share one global scope, so load order in index.html matters.
 */

const W = {
  ar: { n: 'MA40 Assault Rifle', dmg: 7, rate: .09, mag: 32, rt: 1.3, sp: .012, pel: 1, hs: 1.5, mbs: 1, kick: .004 },
  br: { n: 'BR55 Battle Rifle', dmg: 13, rate: .42, mag: 36, rt: 1.5, sp: .004, pel: 1, hs: 2.2, mbs: 1, kick: .006, burst: 3 },
  sw: { n: 'Energy Sword', ty: 'e', dmg: 0, rate: .5, mag: 100, rt: 1, mbs: 0, kick: 0 },
  mg: { n: 'M6D Magnum', dmg: 30, rate: .34, mag: 12, rt: 1.1, sp: .004, pel: 1, hs: 2.5, mbs: .4, kick: .016 },
  sg: { n: 'M90 Shotgun', dmg: 6, rate: .8, mag: 8, rt: 2.2, sp: .075, pel: 9, hs: 1.3, mbs: .3, kick: .03 },
  sn: { n: 'S2 AM Sniper Rifle', dmg: 80, rate: 1, mag: 4, rt: 2.4, sp: .0005, pel: 1, hs: 3, mbs: .2, kick: .04, pierce: 1 },
  pr: { n: 'Type-25 Plasma Rifle', dmg: 6, rate: .07, mag: 60, rt: 1.6, sp: .02, pel: 1, hs: 1.2, mbs: 1.5, kick: .002, ty: 'e', col: 0x7dff9a },
  rk: { n: 'M41 Rocket Launcher', dmg: 100, rate: 1.1, mag: 2, rt: 2.6, rocket: 1, mbs: .1, kick: .035 },
  nd: { n: 'Type-33 Needler', dmg: 4, rate: .11, mag: 24, rt: 1.5, sp: .03, pel: 1, hs: 1, mbs: 1, kick: .003, needle: 1, ty: 'e', col: 0xff5fd0 },
  // Type-51 Carbine: hits leave a stacking radiation burn (rad; see radiate / burnTick)
  cb: { n: 'Type-51 Carbine', dmg: 15, rate: .22, mag: 18, rt: 1.6, sp: .003, pel: 1, hs: 2.4, mbs: .6, kick: .007, col: 0x7dff6a, rad: 1 },
  // Spartan Laser: hold to charge, then a beam through everything in a line (charge, beam; see playerMove)
  sl: { n: 'Spartan Laser', dmg: 240, rate: 1.1, mag: 5, rt: 2.8, sp: 0, pel: 1, hs: 1, mbs: .2, kick: .05, pierce: 99, charge: .8, beam: 1, ty: 'e', col: 0xff3a2a }
};
// Reserve ammo per weapon: [starting reserve, max reserve]. Rockets are scarce.
const RES = { ar: [96, 224], br: [72, 180], mg: [36, 72], sg: [16, 40], sn: [8, 20], pr: [120, 240], rk: [2, 6], nd: [48, 120], sw: [0, 0], cb: [54, 126], sl: [5, 10] };
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
// (Last Stand: +50% while you're below 30% health)
const dmgMul = () => soft(P.dmg / 8, 1.8) * (P.lastStand && P.hp < P.maxHp * .3 ? 1.5 : 1);
const nadeM = () => soft(P.nadeMul, 2.2);
const meleeM = () => soft(P.meleeMul, 3);

// Weapon variants: from the second mission on, boon screens can offer a special version of a gun you carry (one per gun type).
// mod: stat changes applied in wst(); the other effects are hooked into fire(), updRockets(), updNeedles() and melee().
const VARIANTS = {
  ar: { n: 'MA40 Shredder', d: 'Rounds punch through one enemy into the next', mod: { pierce: 1 } },
  br: { n: 'BR55 Recon', d: 'Headshots restore 8 shield' },
  mg: { n: 'M6D Executioner', d: 'Kills detonate in a small blast' },
  sg: { n: 'M90 Breacher', d: '+4 pellets and a 25% tighter spread', mod: { pel: 13, spMul: .75 } },
  sn: { n: 'S2 Railgun', d: 'Pierces every enemy in a line' , mod: { pierce: 99 } },
  pr: { n: 'Type-25 Storm', d: 'Hits arc lightning to another enemy within 6m (50% damage)' },
  rk: { n: 'M41 Hunter-Killer', d: 'Rockets home in on enemies ahead; 30% bigger blast' },
  nd: { n: 'Type-33 Hive', d: 'Supercombines at 5 needles instead of 7' },
  sw: { n: 'Prophet\'s Bane', d: 'Swings cost half the energy; the lunge reaches 50% farther' }
};
// Is the held weapon the variant? / display name for a weapon you carry
const hasVar = k => !!(P && P.vr && P.vr[k] && P.wpn === k);
const wName = k => P && P.vr && P.vr[k] ? VARIANTS[k].n : W[k].n;

function wst() {
  const w = W[P.wpn];
  const v = (P.vr && P.vr[P.wpn] && VARIANTS[P.wpn].mod) || {};
  return Object.assign({}, w, { dmg: w.dmg * dmgMul(), rate: w.rate / soft(.09 / P.rate, 1.65), rt: w.rt * P.reloadT / 1.3, sp: (w.sp || 0) * (P.acc || 1) * (v.spMul || 1) }, v.pierce ? { pierce: v.pierce } : {}, v.pel ? { pel: v.pel } : {});
}

// Storm variant: lightning jumps from a hit enemy to the nearest other one
function arc(e, dmg) {
  let b = null;
  let bd = 6;
  enemies.forEach(o => {
    if (o === e || o.dead)
      return;
    const d = Math.hypot(o.x - e.x, o.z - e.z);
    if (d < bd) {
      bd = d;
      b = o;
    }
  });
  if (!b)
    return;
  dmgE(b, dmg, false, 'e');
  const y0 = (e.y || 0) + 1.1 * e.sc;
  const y1 = (b.y || 0) + 1.1 * b.sc;
  const pts = [new THREE.Vector3(e.x, y0, e.z), new THREE.Vector3((e.x + b.x) / 2 + R(-.4, .4), (y0 + y1) / 2 + R(-.3, .5), (e.z + b.z) / 2 + R(-.4, .4)), new THREE.Vector3(b.x, y1, b.z)];
  const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x9ff8ff }));
  scene.add(l);
  tracers.push({ m: l, life: .12 });
}

// Type-51 Carbine: radiation that keeps hurting for 3s after a hit, stacking up to 4 hits (burnTick deals it)
function radiate(e) {
  e.burn = e.burn || { dps: 0, t: 0, acc: 0 };
  e.burn.dps = Math.min(12, e.burn.dps + 3);
  e.burn.t = 3;
}

function burnTick(dt) {
  enemies.forEach(e => {
    const b = e.burn;
    if (!b || e.dead)
      return;
    b.t -= dt;
    b.acc += dt;
    if (b.acc >= .5) {
      b.acc = 0;
      dmgE(e, b.dps * .5 * dmgMul(), false, 'k');
      flashFx(e.x, (e.y || 0) + 1.2 * e.sc, e.z, .4 * e.sc, 0x7dff6a);
    }
    if (b.t <= 0)
      e.burn = null;
  });
}

// Ricochet Rounds: the round glances off into the nearest other enemy within 8m
function ricochet(e, dmg) {
  let b = null;
  let bd = 8;
  enemies.forEach(o => {
    if (o === e || o.dead)
      return;
    const d = Math.hypot(o.x - e.x, o.z - e.z);
    if (d < bd) {
      bd = d;
      b = o;
    }
  });
  if (!b)
    return;
  dmgE(b, dmg, false, 'k');
  const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(e.x, (e.y || 0) + 1.1 * e.sc, e.z), new THREE.Vector3(b.x, (b.y || 0) + 1.1 * b.sc, b.z)]), new THREE.LineBasicMaterial({ color: 0xffd060 }));
  scene.add(l);
  tracers.push({ m: l, life: .1 });
}

// Spartan Laser beam: a red-hot core inside a wide glow, from the muzzle to where it stops
function laserBeam(a, b) {
  const d = b.clone().sub(a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, d.length(), 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xff5a3a, transparent: true, opacity: .75, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.position.copy(a).addScaledVector(d, .5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

/* ---------- Aiming ---------- */
// Each body is a capsule from its feet to the top of its head (wider for Hunters and Ghosts), so a shot hits whenever
// the crosshair is on the model. bodyRay: how far along the ray (o, d: unit) it passes closest to the body, and how far
// off it passes.
const bodyR = e => (e.veh ? 1.1 : e.t === 'hunter' || ET[e.t] && ET[e.t].model === 'hunter' ? .62 : .42) * e.sc;
function bodyRay(e, o, d) {
  const y0 = (e.y || 0) + .2 * e.sc;
  const y1 = (e.y || 0) + (e.veh ? 1.5 : 1.85) * e.sc;
  const hh = d.x * d.x + d.z * d.z;
  if (hh > 1e-6) {
    // nearest approach to the body's centreline, if that's between its feet and head
    const t = ((e.x - o.x) * d.x + (e.z - o.z) * d.z) / hh;
    const y = o.y + d.y * t;
    if (y >= y0 && y <= y1)
      return { t, off: Math.hypot(o.x + d.x * t - e.x, o.z + d.z * t - e.z) };
  }
  // otherwise, nearest approach to the end it's past (above the head or below the feet)
  const cy = o.y + d.y * (((e.x - o.x) * d.x + (e.z - o.z) * d.z) / (hh || 1)) > y1 ? y1 : y0;
  const t = (e.x - o.x) * d.x + (cy - o.y) * d.y + (e.z - o.z) * d.z;
  return { t, off: Math.hypot(o.x + d.x * t - e.x, o.y + d.y * t - cy, o.z + d.z * t - e.z) };
}
// Bullet magnetism (like Halo's aim assist): a shot that just misses the edge of a body still connects, a little more
// at range. Not for shotgun pellets.
const magnet = (w, t) => w.pel > 1 ? 0 : .1 + .005 * Math.min(t, 60);
// How far each weapon is effective (the reticle turns red on an enemy within it)
const AIM_RNG = { ar: 40, br: 65, mg: 45, sg: 12, sn: 130, pr: 30, rk: 60, nd: 25, cb: 70, sl: 110, sw: 5 };

// Is the crosshair on an enemy in range (and not behind a wall)? For the red reticle.
function aimOnTarget() {
  if (!P || state !== 'play')
    return false;
  const o = cam.position;
  const d = fwd();
  const rng = P.veh ? 60 : P.hog === 3 ? 70 : AIM_RNG[P.wpn] || 40;
  let bt = 1e9;
  enemies.forEach(e => {
    if (e.dead || e.camo)
      return;
    const b = bodyRay(e, o, d);
    if (b.t > 0 && b.t < rng && b.t < bt && b.off < bodyR(e))
      bt = b.t;
  });
  return bt < 1e9 && bt < wallT(o, d);
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
// Sword energy per swing (halved by the Prophet's Bane variant)
const swingCost = () => P && P.vr && P.vr.sw ? SWING_COST / 2 : SWING_COST;

// Energy Sword model (player and Sword Elites), after the Covenant blade: an armoured hilt with a wide emitter housing,
// and from each end a long crescent of plasma that flares outward, then sweeps back in to a forward point, plus a short
// rear prong. Each blade is a white-hot core inside two additive glow layers. Blades point along -z.
function makeSword() {
  const h = new THREE.Group();
  const blades = new THREE.Group();
  const dark = new THREE.MeshPhongMaterial({ color: 0x2b2f3d, shininess: 90, specular: 0x7a88aa });
  const plate = new THREE.MeshPhongMaterial({ color: 0x5d6578, shininess: 110, specular: 0xffffff });
  const vent = new THREE.MeshBasicMaterial({ color: 0x8fe8ff });
  const core = new THREE.MeshBasicMaterial({ color: 0xf4feff, side: THREE.DoubleSide });
  const gl = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const g1 = gl(0x6fd8ff, .55);
  const g2 = gl(0x2a7dff, .25);
  const add = (geo, m, x, y, z, rx, ry, rz) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.rotation.set(rx || 0, ry || 0, rz || 0);
    h.add(o);
    return o;
  };
  // grip (held in the fist), wrapped in raised bands, with a pommel
  add(new THREE.CylinderGeometry(.021, .024, .17, 10), dark, 0, -.012, .07, Math.PI / 2);
  [.02, .055, .09, .125].forEach(z => add(new THREE.TorusGeometry(.025, .005, 6, 14), plate, 0, -.012, z));
  add(new THREE.SphereGeometry(.028, 10, 8), plate, 0, -.012, .16);
  // emitter housing: a wide, shallow armoured shell across the front of the grip
  const shell = add(new THREE.SphereGeometry(.07, 14, 10), dark, 0, 0, -.03);
  shell.scale.set(1.5, .42, .9);
  add(new THREE.BoxGeometry(.15, .016, .05), plate, 0, .022, -.03);
  [-1, 1].forEach(s => {
    // housing arms reaching out to the emitters, the emitters themselves, and their glowing vents
    add(new THREE.BoxGeometry(.04, .028, .05), dark, s * .08, 0, -.05, 0, s * .4);
    add(new THREE.SphereGeometry(.02, 10, 8), plate, s * .095, 0, -.07);
    add(new THREE.BoxGeometry(.035, .008, .014), vent, s * .06, .026, -.03, 0, s * .25);
    add(new THREE.BoxGeometry(.01, .01, .01), vent, s * .095, .011, -.086);
  });
  // blade outline for the right-hand blade (x outward, y forward): flares out, then curves in to the point
  const sh = new THREE.Shape();
  sh.moveTo(0, 0);
  // the two blades curve back in so their points meet in front of the hilt (the blade sits .092 off centre)
  sh.lineTo(.034, 0);
  sh.bezierCurveTo(.1, .33, .07, 1.05, -.09, 1.5);
  sh.bezierCurveTo(.012, .96, .03, .33, 0, 0);
  const geo = new THREE.ShapeGeometry(sh, 16);
  // short rear prong
  const rp = new THREE.Shape();
  rp.moveTo(0, 0);
  rp.lineTo(.04, 0);
  rp.quadraticCurveTo(.07, -.12, .05, -.2);
  rp.quadraticCurveTo(.03, -.1, 0, 0);
  const rgeo = new THREE.ShapeGeometry(rp, 8);
  [-1, 1].forEach(s => {
    const b = new THREE.Group();
    b.position.set(s * .092, 0, -.085);
    b.rotation.x = -Math.PI / 2;
    b.scale.x = s;
    blades.add(b);
    [[core, 1, 1], [g1, 1.35, 1.03], [g2, 1.8, 1.05]].forEach(([m, wx, ly]) => {
      const o = new THREE.Mesh(geo, m);
      o.scale.set(wx, ly, 1);
      o.position.x = -.017 * (wx - 1);
      b.add(o);
      const r = new THREE.Mesh(rgeo, m);
      r.scale.set(wx, ly, 1);
      r.position.set(-.02 * (wx - 1), .05, 0);
      b.add(r);
    });
  });
  h.add(blades);
  return { h, blades, g1, g2 };
}

// Sword slash trail: a glowing arc that sweeps right to left across your view during the swing (attached to the
// camera), a bright core inside a wide cyan glow, trailing behind the blade and fading out.
let swTrail = null;
function swordTrail() {
  if (swTrail)
    cam.remove(swTrail.grp);
  const grp = new THREE.Group();
  grp.position.set(0, -.42, -.35);
  grp.rotation.z = -.55;
  const mk = (c, o) => {
    const m = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2 + 1.05;
    grp.add(m);
    return m;
  };
  swTrail = { grp, glow: mk(0x5fd0ff, .5), core: mk(0xeafcff, .9), t: 0 };
  cam.add(grp);
}

// Called every frame from animGun: grow the arc behind the sweeping blade, then fade it
function updTrail(dt) {
  const s = swTrail;
  if (!s)
    return;
  s.t += dt;
  const sweep = Math.max(0, Math.min(1, (s.t - .05) / .2));
  const ease = 1 - Math.pow(1 - sweep, 3);
  const a0 = .35;
  const lead = a0 + ease * 2.45;
  const tail = Math.max(a0, lead - 1.3);
  const fade = Math.max(0, 1 - Math.max(0, s.t - .25) / .15);
  [[s.glow, .62, 1.05, .32], [s.core, .82, .87, .85]].forEach(([m, r0, r1, o]) => {
    m.geometry.dispose();
    m.geometry = new THREE.RingGeometry(r0, r1, 32, 1, tail, Math.max(.01, lead - tail));
    m.material.opacity = o * fade * (sweep > 0 ? 1 : 0);
  });
  if (s.t > .42) {
    cam.remove(s.grp);
    s.glow.geometry.dispose();
    s.core.geometry.dispose();
    swTrail = null;
  }
}

function setGun(k) {
  while (gun.children.length)
    gun.remove(gun.children[0]);
  gun.userData.sw = null;
  if (k === 'sw') {
    const s = makeSword();
    // held low on the right, blades angled forward and up across the view
    s.h.rotation.set(.32, .1, .42);
    s.h.position.set(0, -.04, -.12);
    s.h.scale.setScalar(.8);
    gun.add(s.h);
    gun.userData.sw = s;
    return;
  }
  buildGun(k);
}

setGun('ar');

// Looking through the sniper scope: the gun model is hidden and the scope overlay shown.
const scoped = () => P && state === 'play' && zoomOn && P.wpn === 'sn' && cam.fov < 40;

function animGun(dt) {
  gun.visible = state !== 'title' && !scoped() && !(P && (P.veh || P.hog === 1 || P.hog === 3));
  // Sword: pulsing glow, blades off when the battery is too low to swing
  const S = gun.userData.sw;
  swLight.intensity = 0;
  updTrail(dt);
  gunTick();
  if (S && P) {
    const on = P.ammo >= swingCost();
    S.blades.visible = on;
    // brighter while swinging
    const hot = P.swing > 0 && P.wpn === 'sw';
    S.g1.opacity = (hot ? .85 : .5) + .12 * Math.sin(T * 31);
    S.g2.opacity = (hot ? .45 : .22) + .08 * Math.sin(T * 17);
    if (on && gun.visible)
      swLight.intensity = hot ? 2.6 : 1.1;
  }
  let x = .26;
  let y = -.24;
  let rx = 0;
  let ry = 0;
  let rz = 0;
  if (P && state === 'play') {
    // Sprinting: gun tilted down and across
    if (P.spr) {
      y -= .1;
      rx -= .55;
      ry += .5;
    }
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
        // a quick wind-up up and to the right, then a fast eased diagonal slash down to the left
        if (u < .2) {
          const w = u / .2;
          ry = -.6 - .5 * w;
          rx = -.3 * w;
          rz = -.7 - .2 * w;
          x = .32 + .06 * w;
          y = -.12 + .06 * w;
        }
        else {
          const e = 1 - Math.pow(1 - (u - .2) / .8, 3);
          ry = -1.1 + 2.4 * e;
          rx = -.3 + .75 * e;
          rz = -.9 + .5 * e;
          x = .38 - .62 * e;
          y = -.06 - .22 * e;
        }
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
      const dy = 1.1 * e.sc + (e.y || 0) - p.y;
      const dz = e.z - p.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < 14 && (dx * n.v.x + dy * n.v.y + dz * n.v.z) / (d * sp) > .85 && d < bd) {
        bd = d;
        be = e;
      }
    });
    if (be)
      n.v.lerp(new THREE.Vector3(be.x - p.x, 1.1 * be.sc + (be.y || 0) - p.y, be.z - p.z).normalize().multiplyScalar(sp), Math.min(1, dt * 4));
    p.addScaledVector(n.v, dt);
    n.m.lookAt(p.clone().add(n.v));
    n.life -= dt;
    for (const e of enemies) {
      if (e.dead)
        continue;
      if (Math.hypot(e.x - p.x, 1.1 * e.sc + (e.y || 0) - p.y, e.z - p.z) < .8 * e.sc) {
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
        if (e.nd >= (hasVar('nd') ? 5 : 7) && !e.fuse)
          e.fuse = .7;
        break;
      }
    }
    if (!n.hooked && (n.life <= 0 || p.y < floorH(p.x, p.z, p.y - .7) + .05 || outArena(p) || inPillar(p, 0))) {
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
  x += R(-.5, .5);
  z += R(-.5, .5);
  g.position.set(x, groundH(x, z) + .6, z);
  scene.add(g);
  drops.push({ k, m: g, x: g.position.x, z: g.position.z, life: 25 });
}

function dropMaybe(e) {
  const b = e.boss;
  // Sword Elites rarely drop anything: an energy cell if you carry the sword, otherwise an ammo box.
  if (e.t === 'selite' || e.t === 'celite') {
    if (Math.random() < .2)
      mkDrop(P.slots.includes('sw') ? 'swe' : 'ammo', e.x, e.z);
    return;
  }
  if (b || Math.random() < ({ grunt: .25, jackal: .2, jmajor: .3, jsniper: .2, skimmer: .2, elite: .35, fcomb: .2, hunter: 1 }[e.t] || 0))
    mkDrop('nade', e.x, e.z);
  if (b || Math.random() < ({ grunt: .5, kgrunt: .3, jackal: .45, jmajor: .55, jsniper: .5, skimmer: .4, elite: .55, fcomb: .5, fcarr: .3, finf: .05, hunter: 1 }[e.t] || 0))
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
    d.m.position.y = groundH(d.x, d.z) + .6 + Math.sin(T * 3 + d.x) * .12;
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
    const d = Math.hypot(e.x - x, e.z - z, e.sc + (e.y || 0) - y);
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
    // Hunter-Killer variant: steer toward the nearest enemy ahead
    if (r.home) {
      let b = null;
      let bd = 25;
      enemies.forEach(e => {
        if (e.dead)
          return;
        const dx = e.x - p.x;
        const dz = e.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d < bd && (dx * r.v.x + dz * r.v.z) / (d * r.v.length()) > .5) {
          bd = d;
          b = e;
        }
      });
      if (b) {
        const s = r.v.length();
        r.v.lerp(new THREE.Vector3(b.x - p.x, (b.y || 0) + 1.1 * b.sc - p.y, b.z - p.z).normalize().multiplyScalar(s), Math.min(1, dt * 3)).setLength(s);
        r.m.lookAt(p.clone().add(r.v));
      }
    }
    p.addScaledVector(r.v, dt);
    r.life -= dt;
    if (r.life <= 0 || p.y < floorH(p.x, p.z, p.y - .7) + .1 || outArena(p) || inPillar(p, 0) || enemies.some(e => !e.dead && Math.hypot(e.x - p.x, e.sc * 1.1 + (e.y || 0) - p.y, e.z - p.z) < .9 * e.sc)) {
      r.life = -1;
      explode(p.x, p.y, p.z, 6 * Math.sqrt(nadeM()) * (r.home ? 1.3 : 1), W.rk.dmg * dmgMul(), 20, 'k');
      scene.remove(r.m);
    }
  });
  rockets = rockets.filter(r => r.life > 0);
}

function fire() {
  const w = wst();
  const o = cam.position;
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  // Infinity Magazine (legendary): some shots are free
  if (!(P.infMag && Math.random() < P.infMag))
    P.ammo--;
  P.cd = w.rate;
  // recoil kicks the view up, then settles back (see playerMove)
  pitch += w.kick;
  P.kk = (P.kk || 0) + w.kick;
  P.lastShot = T;
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
    rockets.push({ m, v: f.multiplyScalar(30), life: 4, home: hasVar('rk') });
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
        // e.y: standing height (players on the versus map's hills)
        const b = bodyRay(e, o, d);
        if (b.t > 0 && b.off < bodyR(e) + magnet(w, b.t))
          hits.push({ e, t: b.t });
      });
      hits.sort((a, b) => a.t - b.t);
      const wt = wallT(o, d);
      let end = Math.min(wt, 60);
      if (!w.pierce && hits.length && hits[0].t < wt)
        end = hits[0].t;
      hits.slice(0, w.pierce ? 1 + w.pierce : 1).forEach(h => {
        if (h.t < wt) {
          const head = o.y + d.y * h.t > 1.5 * h.e.sc + (h.e.y || 0);
          const cp = critHit(h.e, o, d);
          dmgE(h.e, w.dmg * (cp ? CRIT_MUL : head ? w.hs * (P.hsMul || 1) : 1), !!cp, w.ty || 'k');
          hitT = .12;
          hitCol = cp ? '#ff6a2a' : head ? '#ffd24a' : '#fff';
          // Variant effects
          if (head && hasVar('br'))
            P.sh = Math.min(P.maxSh, P.sh + 8);
          if (hasVar('mg') && h.e.dead && !h.e.net)
            explode(h.e.x, (h.e.y || 0) + 1, h.e.z, 3.5, 45 * dmgMul(), 0, 'k');
          if (hasVar('pr'))
            arc(h.e, w.dmg * .5);
          if (w.rad)
            radiate(h.e);
          if (P.rico && Math.random() < P.rico)
            ricochet(h.e, w.dmg * .6);
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
      const l = w.beam ? laserBeam(s, o.clone().addScaledVector(d, end)) : new THREE.Line(new THREE.BufferGeometry().setFromPoints([s, o.clone().addScaledVector(d, end)]), new THREE.LineBasicMaterial({ color: w.col || 0xffe9a0 }));
      scene.add(l);
      tracers.push({ m: l, life: w.beam ? .3 : .05 });
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
  if (state !== 'play' || P.hog || P.veh || P.y > floorH(P.x, P.z, P.y) + .05)
    return;
  P.vy = 7;
  sfx.jump();
}

// Thruster: Shift + a direction (WASD) boosts that way.
function thrust() {
  if (state !== 'play' || P.hog || P.veh || !P.thrust || P.tcd > 0 || P.dash > 0)
    return;
  // The boost goes the way you're moving: WASD in any combination (in versus, Shift + W is sprint instead)
  const f = (keys.KeyW && NET.mode !== 'vs' ? 1 : 0) - (keys.KeyS ? 1 : 0);
  const s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  if (!f && !s)
    return;
  const m = Math.hypot(f, s);
  P.dash = .18;
  P.dashF = f / m;
  P.dashS = s / m;
  P.tcd = 2.5 * (P.tcdMul || 1);
  if (P.camo)
    P.camoT = T + 2;
  sfx.dash();
  flashFx(cam.position.x, 1.2 + P.y, cam.position.z, .5, 0x8ce6ff);
}

function melee() {
  if (P.mcd > 0 || state !== 'play' || P.hog || P.veh)
    return;
  const sw = P.wpn === 'sw' && P.ammo >= swingCost();
  P.mcd = sw ? .5 : .7;
  P.swing = sw ? .32 : .22;
  P.lastMelee = T;
  if (sw)
    sfx.sword();
  else
    sfx.melee();
  if (sw) {
    P.ammo -= swingCost();
    // Slash trail sweeping across your view (see swordTrail)
    swordTrail();
  }
  const f = fwd();
  if (sw) {
    // Lunge: close the gap to the nearest enemy in front, within 6m
    let best = null;
    let bd = hasVar('sw') ? 9 : 6;
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
  if (!sw)
    flashFx(cam.position.x + f.x * 1.2, 1.2, cam.position.z + f.z * 1.2, .7, 0x8ce6ff);
}
