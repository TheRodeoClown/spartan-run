/*
 * warthog.js: the M12 Warthog (Firefight), bought at a REQ station. Classic script (no modules): all files share one
 * global scope, so load order in index.html matters (after ghost.js, before main.js).
 *
 * Three seats: the driver (drives; the mouse steers, W/S throttle and reverse; it slides in hard turns), the
 * passenger (shoots their own weapons from the seat) and the gunner (the chaingun turret in the back). E next to it
 * takes the nearest free seat; E again gets out. At speed it splatters enemies. It soaks most of the damage aimed at
 * the people in it (less for the exposed gunner) and blows up when it runs out; then another can be bought.
 * In co-op the host owns it: it hands out the seats (a guest asks with hq in its presence), follows the driver's
 * reports (hx, hz, hy, hyw), takes everyone's damage to it (hd, a running total) and publishes it all in w.ff.h.
 */

const HOG = { on: false, g: null, x: 0, z: 0, y: 0, yw: Math.PI, hp: 900, max: 900, seats: [null, null, null], vx: 0, vz: 0, cd: 0, spin: 0, tx: 0, tz: 0, pt: 0, rl: 0 };
const HOG_PAD = [-14, -28]; // where it's delivered: beside the base's main door
// seats in the model's own frame (it faces +z): driver (left), passenger (right), gunner (the turret)
const HOG_SEATS = [[.55, .3, .15], [-.55, .3, .15], [0, .75, -1.75]];
const HOG_NAMES = ['DRIVER', 'PASSENGER', 'GUNNER'];

function hogMesh() {
  const g = new THREE.Group();
  const olive = mcache('hogOlive', () => new THREE.MeshPhongMaterial({ color: 0x56643c, shininess: 30, specular: 0x444a3a }));
  const dark = mcache('hogDark', () => new THREE.MeshPhongMaterial({ color: 0x262826, shininess: 20 }));
  const metal = mcache('hogMetal', () => new THREE.MeshPhongMaterial({ color: 0x70767a, shininess: 70 }));
  const tire = mcache('hogTire', () => new THREE.MeshLambertMaterial({ color: 0x1c1c1c }));
  const lamp = mcache('hogLamp', () => new THREE.MeshBasicMaterial({ color: 0xfff2c8 }));
  const box = (w, h, d, m, x, y, z, rx, ry, rz, parent) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    o.position.set(x, y, z);
    o.rotation.set(rx || 0, ry || 0, rz || 0);
    (parent || g).add(o);
    return o;
  };
  const cyl = (rt, rb, h, m, x, y, z, rx, rz, parent, n) => {
    const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, n || 14), m);
    o.position.set(x, y, z);
    o.rotation.set(rx || 0, 0, rz || 0);
    (parent || g).add(o);
    return o;
  };
  // chassis, sloped hood, bumper and grille with headlights
  box(2.3, .45, 4.4, olive, 0, .95, 0);
  box(2.1, .3, 1.6, olive, 0, 1.28, 1.35, -.14);
  box(2.4, .5, .3, dark, 0, .85, 2.3);
  [-.5, -.25, 0, .25, .5].forEach(x => box(.08, .35, .05, metal, x, .95, 2.47));
  [-.85, .85].forEach(x => box(.3, .18, .06, lamp, x, 1.05, 2.47));
  // the open cabin: floor, seats, dash, windshield frame and a roll bar
  box(2, .1, 1.6, dark, 0, 1.2, .1);
  [.55, -.55].forEach(x => {
    box(.6, .3, .6, dark, x, 1.35, .05);
    box(.6, .7, .15, dark, x, 1.65, -.25, -.15);
  });
  box(2, .3, .3, dark, 0, 1.45, .85);
  box(.35, .25, .1, metal, .55, 1.62, .78, -.6);
  [-1, 1].forEach(s => box(.08, .75, .08, metal, s * 1, 1.8, .95, -.3));
  box(2.1, .08, .08, metal, 0, 2.15, 1.05);
  [-1, 1].forEach(s => box(.1, .9, .1, metal, s * .95, 1.75, -.55));
  box(2, .1, .1, metal, 0, 2.2, -.55);
  // the bed behind the cabin
  box(2.2, .35, 1.7, olive, 0, 1.25, -1.45);
  // wheels under big fenders (the front two steer)
  const wheels = [];
  [[1.25, 1.5], [-1.25, 1.5], [1.25, -1.5], [-1.25, -1.5]].forEach(([x, z]) => {
    box(.65, .22, 1.35, olive, x * 1.02, 1.42, z);
    const pv = new THREE.Group();
    pv.position.set(x, .58, z);
    g.add(pv);
    const w = new THREE.Group();
    pv.add(w);
    cyl(.58, .58, .5, tire, 0, 0, 0, 0, Math.PI / 2, w, 16);
    cyl(.3, .3, .52, metal, 0, 0, 0, 0, Math.PI / 2, w, 8);
    // tread blocks so the spin shows
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * 6.283;
      box(.52, .12, .14, dark, 0, Math.cos(a) * .58, Math.sin(a) * .58, a, 0, 0, w);
    }
    wheels.push({ pv, w, front: z > 0 });
  });
  // the chaingun turret: a pedestal, a head that turns, three barrels that spin, and a gun shield
  const tp = new THREE.Group();
  tp.position.set(0, 1.4, -1.75);
  g.add(tp);
  cyl(.15, .22, .7, metal, 0, .35, 0, 0, 0, tp);
  const head = new THREE.Group();
  head.position.y = .8;
  tp.add(head);
  box(.36, .32, .9, dark, 0, .05, .25, 0, 0, 0, head);
  [-1, 1].forEach(s => box(.06, .45, .5, olive, s * .32, .15, .45, 0, s * .35, 0, head));
  box(.2, .2, .3, dark, 0, -.05, -.35, 0, 0, 0, head);
  const barrels = new THREE.Group();
  barrels.position.set(0, .05, .9);
  head.add(barrels);
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * 6.283;
    cyl(.045, .045, .9, metal, Math.cos(a) * .08, Math.sin(a) * .08, .35, Math.PI / 2, 0, barrels, 8);
  }
  return { g, head, barrels, wheels };
}

// Seat s in the world (feet height for the person sitting in it)
function hogSeatPos(s) {
  const [lx, ly, lz] = HOG_SEATS[s];
  const t = HOG.yw + Math.PI;
  return { x: HOG.x + lx * Math.cos(t) + lz * Math.sin(t), y: HOG.y + ly, z: HOG.z - lx * Math.sin(t) + lz * Math.cos(t) };
}

function hogReset() {
  Object.assign(HOG, { on: false, seats: [null, null, null], vx: 0, vz: 0, hp: HOG.max });
  P.hog = 0;
  NET.hq = 0;
  NET.hd = 0;
  NET.hb = NET.hb || 0;
  const m = hogMesh();
  HOG.g = m.g;
  gfxCaster(HOG.g);
  HOG.head = m.head;
  HOG.barrels = m.barrels;
  HOG.wheels = m.wheels;
  HOG.g.visible = false;
  envG.add(HOG.g);
}

// Host: drop a new Warthog on the pad
function hogDeliver() {
  if (HOG.on)
    return;
  Object.assign(HOG, { on: true, seats: [null, null, null], x: HOG_PAD[0], z: HOG_PAD[1], yw: Math.PI, hp: HOG.max, vx: 0, vz: 0, pt: 0, rl: 0 });
  HOG.y = groundH(HOG.x, HOG.z);
  HOG.tx = HOG.x;
  HOG.tz = HOG.z;
  flashFx(HOG.x, HOG.y + 1, HOG.z, 3, 0x9bc45a);
  banner('WARTHOG DELIVERED BY THE BASE');
}

// REQ station: buy one (if there isn't one already)
function hogBuy() {
  if (HOG.on) {
    banner('YOUR WARTHOG IS STILL OUT THERE');
    return false;
  }
  if (NET.mode === 'coop' && !NET.host)
    NET.hb = (NET.hb || 0) + 1;
  else
    hogDeliver();
  return true;
}

const hogMeId = () => NET.me || 'me';
const hogNear = () => HOG.on && !P.hog && !P.veh && !NET.down && Math.hypot(P.x - HOG.x, P.z - HOG.z) < 4.5 && Math.abs(P.y - HOG.y) < 3;

// The seat nearest where you stand (driver's side, passenger's side, or the gun in the back), if it's free: -1 if not
function hogPick() {
  let best = -1;
  let bd = 1e9;
  HOG_SEATS.forEach((q, s) => {
    const p = hogSeatPos(s);
    const d = Math.hypot(p.x - P.x, p.z - P.z);
    if (d < bd) {
      bd = d;
      best = s;
    }
  });
  return HOG.seats[best] ? -1 : best;
}

// E: get out, or take the seat on the side you walked up to
function hogUse() {
  if (!FF.on || state !== 'play')
    return false;
  if (P.hog) {
    hogExit();
    return true;
  }
  if (!hogNear())
    return false;
  const best = hogPick();
  if (best < 0) {
    banner('THAT SEAT IS TAKEN');
    return true;
  }

  if (NET.mode === 'coop' && !NET.host)
    NET.hq = best + 1;
  else {
    HOG.seats[best] = hogMeId();
    hogSit(best);
  }
  return true;
}

function hogSit(s) {
  P.hog = s + 1;
  NET.hq = s + 1;
  P.vy = 0;
  P.dash = 0;
  P.bl = 0;
  down = false;
  if (s === 0)
    yaw = HOG.yw;
  sfx.recharge();
  banner('WARTHOG ' + HOG_NAMES[s] + (s === 0 ? ': W/S DRIVE, MOUSE STEERS' : s === 2 ? ': HOLD FIRE FOR THE CHAINGUN' : ': SHOOT FROM THE SEAT') + ' | E TO GET OUT');
}

// Out beside your seat, onto clear ground
function hogExit() {
  const s = P.hog - 1;
  if (s < 0)
    return;
  const p = hogSeatPos(s);
  P.hog = 0;
  NET.hq = 0;
  if (NET.host || NET.mode !== 'coop')
    HOG.seats[s] = null;
  if (s === 0)
    HOG.vx = HOG.vz = 0;
  const t = HOG.yw + Math.PI;
  const side = s === 2 ? [0, -2.4] : [s === 0 ? 2.2 : -2.2, 0];
  P.x = p.x + side[0] * Math.cos(t) + side[1] * Math.sin(t);
  P.z = p.z - side[0] * Math.sin(t) + side[1] * Math.cos(t);
  pushOut(P, .5);
  P.y = floorH(P.x, P.z, HOG.y + 1);
  P.vy = 0;
}

// Damage aimed at someone in it: the Warthog takes most of it (less for the gunner); returns what gets through
function hogHit(d) {
  const k = P.hog === 3 ? .5 : .8;
  const a = d * k;
  if (NET.host || NET.mode !== 'coop') {
    HOG.hp -= a;
    if (HOG.hp <= 0)
      hogBoom();
  }
  else
    NET.hd = (NET.hd || 0) + a;
  return d - a;
}

// Host: it blows up; everyone in it is thrown out
function hogBoom() {
  const x = HOG.x;
  const y = HOG.y;
  const z = HOG.z;
  HOG.hp = 0;
  HOG.on = false;
  HOG.seats = [null, null, null];
  if (P.hog)
    hogExit();
  explode(x, y + 1, z, 6, 80, 30, 'k', true);
  banner('WARTHOG DESTROYED');
}

// Driving (seat 1): it steers toward where you look, faster the faster it goes; W/S throttle and reverse; it slides
function hogDrive(dt, f) {
  const H = HOG;
  const hx = -Math.sin(H.yw);
  const hz = -Math.cos(H.yw);
  const rx = Math.cos(H.yw);
  const rz = -Math.sin(H.yw);
  let fw = H.vx * hx + H.vz * hz;
  let lat = H.vx * rx + H.vz * rz;
  const turn = 1.7 * clamp(Math.abs(fw) / 6, .2, 1) * (fw < -.5 ? -1 : 1);
  const want = Math.atan2(Math.sin(yaw - H.yw), Math.cos(yaw - H.yw));
  H.yw += clamp(want * (fw < -.5 ? -1 : 1), -Math.abs(turn) * dt, Math.abs(turn) * dt) * (fw < -.5 ? -1 : 1);
  if (f > 0)
    fw = Math.min(20, fw + 15 * dt);
  else if (f < 0)
    fw = Math.max(-9, fw - (fw > 0 ? 24 : 12) * dt);
  else
    fw *= 1 - Math.min(1, 1.1 * dt);
  // grip: sideways sliding dies away (slower at speed, so it drifts through hard turns)
  lat *= 1 - Math.min(1, (6 - Math.min(4, Math.abs(fw) / 6)) * dt);
  const nx = -Math.sin(H.yw);
  const nz = -Math.cos(H.yw);
  H.vx = nx * fw + Math.cos(H.yw) * lat;
  H.vz = nz * fw - Math.sin(H.yw) * lat;
  const o = { x: H.x, z: H.z, y: H.y };
  const ox = o.x;
  const oz = o.z;
  o.x = clamp(o.x + H.vx * dt, -A + 2, A - 2);
  o.z = clamp(o.z + H.vz * dt, -A + 2, A - 2);
  pushOut(o, 1.9);
  if (groundH(o.x, o.z) - H.y > Math.max(.1, Math.hypot(o.x - ox, o.z - oz) * 1.1) && floorH(o.x, o.z, H.y) <= groundH(o.x, o.z) + .01) {
    o.x = ox;
    o.z = oz;
  }
  const moved = Math.hypot(o.x - ox, o.z - oz);
  const meant = Math.hypot(H.vx, H.vz) * dt;
  if (meant > .01 && moved < meant * .5) {
    H.vx *= .3;
    H.vz *= .3;
    if (meant / dt > 9)
      sfx.melee();
  }
  H.x = o.x;
  H.z = o.z;
  const gy = floorH(H.x, H.z, H.y);
  H.y = gy > H.y ? gy : Math.max(gy, H.y - 16 * dt);
  // splatter
  const sp = Math.hypot(H.vx, H.vz);
  if (sp > 7)
    enemies.forEach(e => {
      if (e.dead || T < (e.ramT || 0) || Math.hypot(e.x - H.x, e.z - H.z) > 2.4 + .5 * e.sc || Math.abs((e.y || 0) - H.y) > 2.5)
        return;
      e.ramT = T + .6;
      dmgE(e, sp * (e.boss ? 2.5 : 7), false, 'k');
      if (!e.net) {
        e.x += H.vx * .15;
        e.z += H.vz * .15;
      }
      H.vx *= .7;
      H.vz *= .7;
      hitT = .15;
      hitCol = '#ffd24a';
      sfx.melee();
    });
}

// The chaingun (seat 3): spins up while you hold fire, then a fast stream at the crosshair
function hogGun(dt) {
  const H = HOG;
  H.spin = clamp(H.spin + (down && !NET.menu ? dt * 2.5 : -dt * 1.5), 0, 1);
  H.cd -= dt;
  if (!down || NET.menu || H.spin < .4 || H.cd > 0)
    return;
  H.cd = .065;
  const d = new THREE.Vector3(R(-.015, .015), R(-.015, .015), -1).applyQuaternion(cam.quaternion).normalize();
  const tp = hogSeatPos(2);
  const c = cam.position;
  const t0 = Math.max(0, (tp.x - c.x) * d.x + (tp.y + 1.6 - c.y) * d.y + (tp.z - c.z) * d.z);
  const o = c.clone().addScaledVector(d, t0);
  let best = null;
  let bt = 1e9;
  enemies.forEach(e => {
    if (e.dead)
      return;
    const b = bodyRay(e, o, d);
    if (b.t > 0 && b.t < bt && b.off < bodyR(e) + .15) {
      bt = b.t;
      best = e;
    }
  });
  const wt = wallT(o, d);
  const end = Math.min(best ? Math.min(bt, wt) : wt, 90);
  if (best && bt < wt) {
    dmgE(best, 10 * dmgMul(), false, 'k');
    hitT = .08;
    hitCol = '#fff';
  }
  const s = new THREE.Vector3(tp.x - Math.sin(yaw) * 1.2, tp.y + 1.25, tp.z - Math.cos(yaw) * 1.2);
  const e2 = o.clone().addScaledVector(d, end);
  const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([s, e2]), new THREE.LineBasicMaterial({ color: 0xffe9a0 }));
  scene.add(l);
  tracers.push({ m: l, life: .05 });
  netFx('fx', [s.x, s.y, s.z, e2.x, e2.y, e2.z, 0xffe9a0]);
  sfx.shot('ar');
}

// You in a seat, every frame (instead of walking): drive, ride and shoot, or work the turret
function hogRide(dt, frz, f, s, m, sy, cy) {
  if (NET.down || !HOG.on) {
    if (P.hog)
      hogExit();
    return;
  }
  const seat = P.hog - 1;
  if (seat === 0)
    hogDrive(dt, frz ? 0 : f);
  else if (seat === 1)
    // the passenger shoots, reloads and swaps as usual; the seat carries them
    playerMove(dt, frz, 0, 0, 1, sy, cy);
  else
    hogGun(dt);
  // your shields recharge (the passenger's already did in playerMove)
  if (seat !== 1 && T - P.last > P.shDelay && P.sh < P.maxSh)
    P.sh = Math.min(P.maxSh, P.sh + P.maxSh / 1.5 * dt * (P.shRate || 1));
  hogPose(dt);
  const p = hogSeatPos(seat);
  P.x = p.x;
  P.z = p.z;
  P.y = p.y;
  P.vy = 0;
  P.gnd = 1;
  if (seat === 1) {
    cam.position.set(P.x, P.y + 1.6, P.z);
    cam.rotation.set(pitch, yaw, 0);
  }
  else {
    // third person: behind the Warthog (the driver) or behind the turret (the gunner), looking where you aim
    const back = seat === 0 ? 8 : 4.5;
    const up = seat === 0 ? 3.4 : 2.6;
    const bx = seat === 0 ? HOG.x : p.x;
    const bz = seat === 0 ? HOG.z : p.z;
    let dd = back;
    while (dd > 2 && groundH(bx + Math.sin(yaw) * dd, bz + Math.cos(yaw) * dd) > HOG.y + up - .5)
      dd -= .5;
    cam.position.set(bx + Math.sin(yaw) * dd, HOG.y + up - Math.sin(pitch) * 2, bz + Math.cos(yaw) * dd);
    cam.rotation.set(pitch - .1, yaw, 0);
  }
}

// Place and animate the model: tilt to the ground under it, roll the wheels, steer the front ones, aim the turret
function hogPose(dt) {
  const H = HOG;
  const t = H.yw + Math.PI;
  const fx = Math.sin(t);
  const fz = Math.cos(t);
  const gf = floorH(H.x + fx * 1.6, H.z + fz * 1.6, H.y + .8);
  const gb = floorH(H.x - fx * 1.6, H.z - fz * 1.6, H.y + .8);
  const gl = floorH(H.x + fz * 1.2, H.z - fx * 1.2, H.y + .8);
  const gr = floorH(H.x - fz * 1.2, H.z + fx * 1.2, H.y + .8);
  const k = Math.min(1, dt * 8);
  H.pt += (Math.atan2(gb - gf, 3.2) - H.pt) * k;
  H.rl += (Math.atan2(gl - gr, 2.4) * -1 - H.rl) * k;
  H.g.visible = true;
  H.g.position.set(H.x, H.y, H.z);
  H.g.rotation.set(H.pt, t, H.rl, 'YXZ');
  const sp = H.vx * -Math.sin(H.yw) + H.vz * -Math.cos(H.yw);
  H.wheels.forEach(w => {
    w.w.rotation.x += sp * dt / .58;
    if (w.front)
      w.pv.rotation.y = clamp(Math.atan2(Math.sin(yaw - H.yw), Math.cos(yaw - H.yw)), -.5, .5) * (P.hog === 1 ? 1 : 0);
  });
  // the turret follows its gunner's aim
  const gid = H.seats[2];
  const gy = gid === hogMeId() && P.hog === 3 ? yaw : gid && NET.rp[gid] ? NET.rp[gid].yw : H.yw;
  H.head.rotation.y = gy - t + Math.PI;
  H.barrels.rotation.z += (gid ? (P.hog === 3 ? H.spin * 30 : 6) : 0) * dt;
}

// Every page, every frame: the host hands out seats, follows a guest driver and counts the damage guests report;
// everyone draws it (smoothly, between reports)
function hogTick(dt) {
  if (!FF.on || !HOG.g)
    return;
  const H = HOG;
  const host = NET.host || NET.mode !== 'coop';
  if (host) {
    Object.values(NET.rp).forEach(r => {
      // purchases from guests (a counter that goes up by one per purchase)
      if (r.hbSeen == null)
        r.hbSeen = r.hb || 0;
      if ((r.hb || 0) > r.hbSeen) {
        r.hbSeen = r.hb;
        hogDeliver();
      }
      if (r.hdSeen == null)
        r.hdSeen = r.hd || 0;
      if (H.on && (r.hd || 0) > r.hdSeen) {
        H.hp -= Math.min(300, r.hd - r.hdSeen);
        r.hdSeen = r.hd;
      }
    });
    if (H.on) {
      H.seats.forEach((id, s) => {
        if (!id || id === hogMeId())
          return;
        const r = NET.rp[id];
        if (!r || !r.live || r.dn || r.hq !== s + 1) {
          H.seats[s] = null;
          if (s === 0)
            H.vx = H.vz = 0;
        }
      });
      Object.values(NET.rp).forEach(r => {
        if (r.hq && r.live && !r.dn && !H.seats.includes(r.peer) && !H.seats[r.hq - 1] && Math.hypot(r.tx - H.x, r.tz - H.z) < 6)
          H.seats[r.hq - 1] = r.peer;
      });
      if (H.seats.includes(hogMeId()) && !P.hog)
        H.seats[H.seats.indexOf(hogMeId())] = null;
      const dr = H.seats[0];
      if (dr && dr !== hogMeId() && NET.rp[dr] && isFinite(NET.rp[dr].hx)) {
        const r = NET.rp[dr];
        H.tx = r.hx;
        H.tz = r.hz;
        H.y = r.hy;
        H.yw = r.hyw;
      }
      if (H.hp <= 0)
        hogBoom();
    }
  }
  if (!H.on) {
    H.g.visible = false;
    return;
  }
  if (P.hog === 1)
    return;
  // not driving it myself: glide toward the reported position
  if (!H.seats[0] && host) {
    H.tx = H.x;
    H.tz = H.z;
  }
  const k = Math.min(1, dt * 12);
  if (Math.hypot(H.tx - H.x, H.tz - H.z) > 8) {
    H.x = H.tx;
    H.z = H.tz;
  }
  else {
    H.x += (H.tx - H.x) * k;
    H.z += (H.tz - H.z) * k;
  }
  if (!H.seats[0])
    H.y = floorH(H.x, H.z, H.y + .8);
  if (!P.hog)
    hogPose(dt);
}

// Guest: the Warthog as the host reports it: [on, x, z, yaw, health, driver, passenger, gunner, y]
function hogClient(h) {
  if (!Array.isArray(h))
    return;
  const on = !!h[0];
  const seats = [5, 6, 7].map(i => typeof h[i] === 'string' && h[i] ? h[i] : null);
  const me = hogMeId();
  if (P.hog && (!on || seats[P.hog - 1] !== me)) {
    if (!on)
      hurt(20);
    hogExit();
  }
  HOG.on = on;
  HOG.seats = seats;
  HOG.hp = clamp(+h[4] || 0, 0, HOG.max);
  if (on && P.hog !== 1) {
    HOG.tx = clamp(+h[1] || 0, -A, A);
    HOG.tz = clamp(+h[2] || 0, -A, A);
    HOG.yw = +h[3] || 0;
    if (seats[0])
      HOG.y = clamp(+h[8] || 0, -5, 40);
  }
  if (on && NET.hq && !P.hog) {
    const s = NET.hq - 1;
    if (seats[s] === me)
      hogSit(s);
    else if (seats[s]) {
      NET.hq = 0;
      banner('THAT SEAT WAS TAKEN');
    }
  }
}

// The prompt under the crosshair: what E would do where you stand
function usePrompt() {
  if (P.veh || P.hog)
    return '';
  if (vehNear())
    return 'E  DRIVE THE GHOST';
  if (hogNear()) {
    const s = hogPick();
    return s < 0 ? 'THAT SEAT IS TAKEN' : 'E  ENTER AS ' + HOG_NAMES[s];
  }
  if (ffNear())
    return 'E  REQ STATION';
  return '';
}