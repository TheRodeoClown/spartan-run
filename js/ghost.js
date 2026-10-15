/*
 * ghost.js: Ghosts, the Covenant hover bikes of Firefight. Classic script (no modules): all files share one global
 * scope, so load order in index.html matters (after firefight.js, before main.js).
 *
 * The team's Ghost: one waits on the pad in front of the base from round 1, and a new one is delivered each round if
 * it was destroyed. E gets in and out. Driving: the mouse steers (it turns toward where you look), W/S throttle, A/D
 * strafe, Shift boosts (a meter; no firing while boosting), hold fire for the twin plasma cannons; ram enemies at
 * speed to splatter them. The Ghost soaks most of the damage aimed at its driver and blows up when it runs out.
 * In co-op the host owns the seat: a guest asks for it (vq in its presence), the host grants it (VEH.drv, sent in
 * w.ff.v), the driver steers it locally and reports where it is and how hurt it is.
 *
 * Enemy Ghosts (from round 3, one per round) are an enemy type ('ghost' in ET): they circle-strafe with plasma
 * cannons and every so often boost straight in to ram you (ghostAI, called from main.js).
 */

// The model, shared by both: faces +z, base at y 0 (the hull hovers about 0.8m up at the scale it's spawned at, 1.6)
function ghostMesh(hullM) {
  const g = new THREE.Group();
  const dark = mcache('ghDark', () => new THREE.MeshPhongMaterial({ color: 0x2a2440, shininess: 80 }));
  const glowB = mcache('ghGlow', () => new THREE.MeshBasicMaterial({ color: 0x8ad8ff }));
  const field = mcache('ghField', () => new THREE.MeshBasicMaterial({ color: 0x6fb8ff, transparent: true, opacity: .35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  const part = (geo, m, x, y, z, r, s) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    if (r)
      o.rotation.set(r[0], r[1], r[2]);
    if (s)
      o.scale.set(s[0], s[1], s[2]);
    g.add(o);
    return o;
  };
  const S = new THREE.SphereGeometry(.5, 16, 10);
  // hull, with the seat and a low windscreen
  part(S, hullM, 0, .85, 0, null, [1.1, .55, 2.2]);
  part(S, dark, 0, 1.1, -.45, null, [.7, .4, .9]);
  part(new THREE.BoxGeometry(.5, .25, .08), glowB, 0, 1.08, .55, [-.5, 0, 0]);
  // the swept side wings, each with a glow strip and a plasma cannon under its tip
  [-1, 1].forEach(s => {
    part(S, hullM, s * .95, .8, .35, [0, s * -.25, 0], [.55, .45, 2.1]);
    part(new THREE.BoxGeometry(.08, .1, 1.2), glowB, s * 1.21, .8, .5, [0, s * -.25, 0]);
    part(new THREE.CylinderGeometry(.07, .07, .6, 8), dark, s * .8, .62, 1.35, [Math.PI / 2, 0, 0]);
    part(new THREE.SphereGeometry(.06, 8, 6), glowB, s * .8, .62, 1.66);
  });
  // tail fin and the anti-gravity glow underneath
  part(new THREE.BoxGeometry(.06, .45, .6), dark, 0, 1.12, -1.05, [-.4, 0, 0]);
  part(new THREE.CircleGeometry(1.1, 20), field, 0, .3, .1, [-Math.PI / 2, 0, 0]);
  return g;
}

/* ---------- The team's Ghost ---------- */

const VEH = { on: false, g: null, x: 0, z: 0, y: 0, yw: Math.PI, hp: 400, max: 400, drv: null, vx: 0, vz: 0, cd: 0, side: 1, boost: 1 };
const VEH_PAD = [0, -26]; // in front of the base's main door

// A clean slate (every page, when the match is set up): no Ghost until the host delivers one
function vehReset() {
  Object.assign(VEH, { on: false, drv: null, vx: 0, vz: 0, hp: VEH.max, boost: 1 });
  P.veh = 0;
  NET.vq = 0;
  const hull = new THREE.MeshPhongMaterial({ color: 0x4a62a8, shininess: 70, specular: 0x8a9acc });
  VEH.g = ghostMesh(hull);
  VEH.g.scale.setScalar(1.6);
  VEH.g.visible = false;
  envG.add(VEH.g);
}

// Host: a fresh Ghost on the pad (at the start, and each round if the last one was destroyed)
function vehDeliver() {
  if (VEH.on)
    return;
  Object.assign(VEH, { on: true, drv: null, x: VEH_PAD[0], z: VEH_PAD[1], yw: Math.PI, hp: VEH.max, vx: 0, vz: 0, boost: 1 });
  VEH.y = groundH(VEH.x, VEH.z);
  VEH.g.visible = true;
  VEH.g.position.set(VEH.x, VEH.y - .55, VEH.z);
  VEH.g.rotation.set(0, VEH.yw + Math.PI, 0);
  flashFx(VEH.x, VEH.y + 1, VEH.z, 2.5, 0x8ad8ff);
  banner('GHOST AVAILABLE AT THE BASE');
}

const vehNear = () => VEH.on && !VEH.drv && !P.veh && !NET.down && Math.hypot(P.x - VEH.x, P.z - VEH.z) < 3.4 && Math.abs(P.y - VEH.y) < 2.5;
const vehMe = () => NET.me || 'me';

// E: get out, or get in (the host takes the seat straight away; a guest asks the host)
function vehUse() {
  if (!FF.on || state !== 'play')
    return false;
  if (P.veh) {
    vehExit();
    return true;
  }
  if (!vehNear())
    return false;
  if (NET.mode === 'coop' && !NET.host)
    NET.vq = 1;
  else {
    VEH.drv = vehMe();
    vehEnter();
  }
  return true;
}

function vehEnter() {
  P.veh = 1;
  NET.vq = 1;
  P.x = VEH.x;
  P.z = VEH.z;
  P.y = VEH.y;
  P.vy = 0;
  P.reload = 0;
  P.bl = 0;
  VEH.vx = VEH.vz = 0;
  yaw = VEH.yw;
  down = false;
  sfx.recharge();
  banner('GHOST: SHIFT TO BOOST | E TO GET OUT');
}

// Out the side, onto clear ground; the Ghost stays parked where it is
function vehExit() {
  P.veh = 0;
  NET.vq = 0;
  if (NET.host || NET.mode !== 'coop')
    VEH.drv = null;
  VEH.vx = VEH.vz = 0;
  P.x = VEH.x + Math.cos(VEH.yw) * 2.4;
  P.z = VEH.z - Math.sin(VEH.yw) * 2.4;
  pushOut(P, .5);
  P.y = floorH(P.x, P.z, VEH.y + .5);
  P.vy = 0;
}

// Damage aimed at the driver: the Ghost takes three quarters of it; returns what gets through to you
function vehHit(d) {
  VEH.hp -= d * .75;
  if (VEH.hp > 0)
    return d * .25;
  // it blows up under you
  const x = VEH.x;
  const z = VEH.z;
  VEH.hp = 0;
  VEH.on = false;
  vehExit();
  explode(x, VEH.y + 1, z, 5, 60, 0, 'k');
  banner('GHOST DESTROYED');
  return d * .25 + 25;
}

// Driving, every frame you're in the seat (instead of walking and shooting)
function vehDrive(dt, f, s) {
  if (NET.down || !VEH.on) {
    if (P.veh)
      vehExit();
    return;
  }
  const V = VEH;
  // boost: a meter that empties in 2s of boosting and refills in 4s
  const wantB = (keys.ShiftLeft || keys.ShiftRight) && f > 0;
  const bo = wantB && V.boost > 0;
  V.boost = clamp(V.boost + (bo ? -dt * .5 : dt * .25), 0, 1);
  const top = bo ? 24 : 14;
  // it turns toward where you look
  V.yw += clamp(Math.atan2(Math.sin(yaw - V.yw), Math.cos(yaw - V.yw)), -2.6 * dt, 2.6 * dt);
  const fx = -Math.sin(V.yw);
  const fz = -Math.cos(V.yw);
  const rx = Math.cos(V.yw);
  const rz = -Math.sin(V.yw);
  const k = f < 0 ? .45 : 1;
  const wx = (fx * f * k + rx * s * .55) * top;
  const wz = (fz * f * k + rz * s * .55) * top;
  const acc = Math.min(1, dt * (bo ? 2.4 : 1.7));
  V.vx += (wx - V.vx) * acc;
  V.vz += (wz - V.vz) * acc;
  const ox = P.x;
  const oz = P.z;
  P.x = clamp(P.x + V.vx * dt, -A + 1, A - 1);
  P.z = clamp(P.z + V.vz * dt, -A + 1, A - 1);
  pushOut(P, 1.3);
  // too steep to climb (cliffs, the mesas' sides): stop
  if (groundH(P.x, P.z) - P.y > Math.max(.08, Math.hypot(P.x - ox, P.z - oz) * 1.2) && floorH(P.x, P.z, P.y) <= groundH(P.x, P.z) + .01) {
    P.x = ox;
    P.z = oz;
  }
  // hitting something solid kills your speed
  const moved = Math.hypot(P.x - ox, P.z - oz);
  const meant = Math.hypot(V.vx, V.vz) * dt;
  if (meant > .01 && moved < meant * .5) {
    V.vx *= .4;
    V.vz *= .4;
  }
  // hover over the ground (and anything it climbs onto); off an edge it drops
  const gy = floorH(P.x, P.z, P.y);
  P.y = gy > P.y ? gy : Math.max(gy, P.y - 14 * dt);
  P.vy = 0;
  P.gnd = 1;
  // splatter: running into enemies at speed
  const sp = Math.hypot(V.vx, V.vz);
  if (sp > 8)
    enemies.forEach(e => {
      if (e.dead || T < (e.ramT || 0) || Math.hypot(e.x - P.x, e.z - P.z) > 1.7 + .5 * e.sc || Math.abs((e.y || 0) - P.y) > 2.5)
        return;
      e.ramT = T + .6;
      dmgE(e, sp * (e.boss ? 2 : 5), false, 'k');
      if (!e.net) {
        e.x += V.vx * .12;
        e.z += V.vz * .12;
      }
      V.vx *= .55;
      V.vz *= .55;
      hitT = .15;
      hitCol = '#ffd24a';
      sfx.melee();
      flashFx(e.x, (e.y || 0) + 1, e.z, 1.2, 0x8ad8ff);
    });
  // the cannons (not while boosting)
  V.cd -= dt;
  if (down && !bo && V.cd <= 0 && !NET.menu) {
    V.cd = .11;
    vehShoot();
  }
  // your shields still recharge
  if (T - P.last > P.shDelay && P.sh < P.maxSh)
    P.sh = Math.min(P.maxSh, P.sh + P.maxSh / 1.5 * dt * (P.shRate || 1));
  V.x = P.x;
  V.z = P.z;
  V.y = P.y;
  // chase camera: behind and above, looking where you aim (pulled in so it doesn't go through the cliffs)
  let cd = 6.5;
  const cx = (dd) => P.x + Math.sin(yaw) * dd;
  const cz = (dd) => P.z + Math.cos(yaw) * dd;
  while (cd > 2 && groundH(cx(cd), cz(cd)) > P.y + 2.4)
    cd -= .5;
  cam.position.set(cx(cd), P.y + 2.9 - Math.sin(pitch) * 2, cz(cd));
  cam.rotation.set(pitch - .1, yaw, 0);
  // lean into turns and strafes
  const lean = clamp((V.vx * rx + V.vz * rz) / top, -1, 1);
  V.g.visible = true;
  V.g.position.set(P.x, P.y - .55 + Math.sin(T * 2.2) * .04, P.z);
  V.g.rotation.set(-.05 * (bo ? 1 : 0), V.yw + Math.PI, lean * .22, 'YXZ');
}

// One plasma bolt from alternate cannons, aimed at the crosshair (the ray starts level with the Ghost, not the camera)
function vehShoot() {
  const V = VEH;
  const d = new THREE.Vector3(R(-.01, .01), R(-.01, .01), -1).applyQuaternion(cam.quaternion).normalize();
  const c = cam.position;
  const t0 = Math.max(0, (V.x - c.x) * d.x + (V.y + 1.2 - c.y) * d.y + (V.z - c.z) * d.z);
  const o = c.clone().addScaledVector(d, t0);
  let best = null;
  let bt = 1e9;
  enemies.forEach(e => {
    if (e.dead)
      return;
    const dx = e.x - o.x;
    const dy = 1.1 * e.sc + (e.y || 0) - o.y;
    const dz = e.z - o.z;
    const t = dx * d.x + dy * d.y + dz * d.z;
    if (t > 0 && t < bt && dx * dx + dy * dy + dz * dz - t * t < (.8 * e.sc) ** 2) {
      bt = t;
      best = e;
    }
  });
  const wt = wallT(o, d);
  const end = Math.min(best ? Math.min(bt, wt) : wt, 80);
  if (best && bt < wt) {
    dmgE(best, 9 * dmgMul(), false, 'e');
    hitT = .1;
    hitCol = '#8ad8ff';
  }
  // the bolt leaves the cannon under the wing tip
  V.side = -V.side;
  const rx = Math.cos(V.yw);
  const rz = -Math.sin(V.yw);
  const s = new THREE.Vector3(V.x + rx * V.side * 1.3 - Math.sin(V.yw) * 2.4, V.y + .45, V.z + rz * V.side * 1.3 - Math.cos(V.yw) * 2.4);
  const e2 = o.clone().addScaledVector(d, end);
  const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([s, e2]), new THREE.LineBasicMaterial({ color: 0x8ad8ff }));
  scene.add(l);
  tracers.push({ m: l, life: .07 });
  flashFx(e2.x, e2.y, e2.z, .35, 0x8ad8ff);
  netFx('fx', [s.x, s.y, s.z, e2.x, e2.y, e2.z, 0x8ad8ff]);
  sfx.shot('pr');
}

// Every page, every frame: the host hands out the seat and follows a guest driver; everyone draws the Ghost
function vehTick(dt) {
  if (!FF.on || !VEH.g)
    return;
  const V = VEH;
  if ((NET.host || NET.mode !== 'coop') && V.on) {
    if (!V.drv) {
      const r = Object.values(NET.rp).find(q => q.vq && q.live && !q.dn && Math.hypot(q.tx - V.x, q.tz - V.z) < 4.5);
      if (r)
        V.drv = r.peer;
    }
    else if (V.drv !== vehMe()) {
      const r = NET.rp[V.drv];
      if (!r || !r.live || r.dn || !r.vq) {
        // they got out (or left, or went down): park it where they left it
        if (r && isFinite(r.vxp)) {
          V.x = r.vxp;
          V.z = r.vzp;
        }
        V.drv = null;
      }
      else {
        V.x = r.tx;
        V.z = r.tz;
        V.y = r.ty;
        V.yw = r.vy;
        if (r.vh >= 0)
          V.hp = r.vh;
        if (r.vh === 0) {
          V.on = false;
          V.drv = null;
        }
      }
    }
    else if (!P.veh)
      V.drv = null;
  }
  V.g.visible = V.on;
  if (!V.on || P.veh)
    return;
  // parked, or someone else is driving it
  if (!V.drv)
    V.y = floorH(V.x, V.z, V.y + .5);
  V.g.position.set(V.x, V.y - .55 + Math.sin(T * 2.2) * .04, V.z);
  V.g.rotation.set(0, V.yw + Math.PI, 0, 'YXZ');
}

// Guest: the Ghost as the host reports it, [on, x, z, yaw, health, driver]
function vehClient(v) {
  if (!Array.isArray(v))
    return;
  const on = !!v[0];
  const drv = typeof v[5] === 'string' && v[5] ? v[5] : null;
  if (P.veh && (drv !== NET.me || !on)) {
    // the seat was lost (destroyed, or someone else got it first)
    VEH.drv = drv;
    vehExit();
  }
  VEH.on = on || !!P.veh;
  VEH.drv = drv;
  if (!P.veh && on) {
    VEH.x = clamp(+v[1] || 0, -A, A);
    VEH.z = clamp(+v[2] || 0, -A, A);
    VEH.yw = +v[3] || 0;
    VEH.hp = clamp(+v[4] || 0, 0, VEH.max);
    if (drv && drv !== NET.me) {
      const r = NET.rp[drv];
      VEH.y = r ? r.ty : VEH.y;
    }
  }
  if (on && drv === NET.me && NET.vq && !P.veh)
    vehEnter();
  if (!on || (drv && drv !== NET.me))
    NET.vq = P.veh ? 1 : 0;
}

/* ---------- Enemy Ghosts ---------- */

// Called from main.js in place of the usual movement: circle-strafe at range, and every 6-9s boost in to ram
function ghostAI(e, tg, dt, d, nx, nz) {
  e.rcd = (e.rcd == null ? R(4, 7) : e.rcd) - dt;
  let wx;
  let wz;
  if (e.ram > 0) {
    e.ram -= dt;
    wx = nx * e.sp * 2.4;
    wz = nz * e.sp * 2.4;
    if (d < 2.6 + e.sc * .4 && !e.rammed) {
      e.rammed = 1;
      hitP(tg, e.bd * 7);
      if (tg.gen !== true)
        knockP(tg, nx * 18, nz * 18);
      sfx.melee();
      flashFx(tg.x, (tg.y || 0) + 1, tg.z, 1.2, 0x8ad8ff);
      e.ram = Math.min(e.ram, .25);
    }
  }
  else {
    const rr = clamp((d - e.pref) / 6, -1, 1);
    wx = (-nz * e.dir + nx * rr) * e.sp;
    wz = (nx * e.dir + nz * rr) * e.sp;
    if (e.rcd <= 0 && d < 32) {
      e.ram = 1.6;
      e.rcd = R(6, 9);
      e.rammed = 0;
      sfx.dash();
    }
  }
  const k = Math.min(1, dt * 2.5);
  e.vx = (e.vx || 0) + (wx - (e.vx || 0)) * k;
  e.vz = (e.vz || 0) + (wz - (e.vz || 0)) * k;
  e.x += e.vx * dt;
  e.z += e.vz * dt;
  // no shooting while it rams
  e.aiFire = !(e.ram > 0);
}
