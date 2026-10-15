/*
 * ai.js: enemy tactics, shared by every mode (missions, co-op, Firefight). Classic script (no modules): all files share
 * one global scope, so load order in index.html matters (after enemies.js, before main.js).
 *
 * Ranged enemies fight from cover: each picks a spot behind something solid between it and its target, hides there,
 * steps out past the edge (or stands up, behind low cover) to fire when it can see the target, then ducks back; when
 * it's flanked, or the target gets far away or right on top of it, it picks new cover. Jackal Snipers climb to high
 * ground with a clear line of sight: rooftops and towers the map lists in `perches` (reached by their stairs), or
 * the highest open ground nearby. Melee and suicide enemies, Hunters, fliers and bosses keep their own moves (main.js
 * and bosses.js). Every non-boss holds fire until it can actually see its target.
 */

// Can a shot get from a to b? (cover, walls and hills in the way; rails don't count)
function aiSees(ax, ay, az, bx, by, bz) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const L = Math.hypot(dx, dy, dz);
  if (L < .1)
    return true;
  const ux = dx / L;
  const uy = dy / L;
  const uz = dz / L;
  const x0 = Math.min(ax, bx);
  const x1 = Math.max(ax, bx);
  const z0 = Math.min(az, bz);
  const z1 = Math.max(az, bz);
  for (const b of pillars) {
    if (b.nb)
      continue;
    const hw = b.hw || 1.5;
    const hd = b.hd || 1.5;
    if (b.x + hw < x0 || b.x - hw > x1 || b.z + hd < z0 || b.z - hd > z1)
      continue;
    // the target's own box (a generator) doesn't hide it
    if (Math.abs(bx - b.x) < hw + .2 && Math.abs(bz - b.z) < hd + .2)
      continue;
    if (rayBox(ax, az, ux, uz, b, ay, uy) < L - .3)
      return false;
  }
  if (groundFn)
    for (let s = .6; s < L - .3; s += .8)
      if (ay + uy * s < groundFn(ax + ux * s, az + uz * s))
        return false;
  return true;
}

// Line of sight from an enemy's muzzle to its target's chest, re-checked 4 times a second
function aiCanFire(e, tg) {
  if (e.boss)
    return true;
  if (T >= (e.losAt || 0) || e.losTg !== tg) {
    e.losAt = T + .25;
    e.losTg = tg;
    e.los = aiSees(e.x, e.y + (e.sniper ? 1.6 : 1.4) * e.sc, e.z, tg.x, (tg.y || 0) + 1.3, tg.z);
  }
  return e.los;
}

const aiInside = (x, z) => !outArena({ x, y: 0, z }) && !(edgeFn && Math.hypot(x, z) > edgeFn(Math.atan2(z, x)) - 1) && Math.abs(x) < A - 1.5 && Math.abs(z) < A - 1.5;

// Walk toward (x, z); true once there
function aiStep(e, x, z, dt, k) {
  const dx = x - e.x;
  const dz = z - e.z;
  const d = Math.hypot(dx, dz);
  if (d < .3)
    return true;
  const s = Math.min(d, e.sp * (k || 1) * dt);
  e.x += dx / d * s;
  e.z += dz / d * s;
  return false;
}

// Cover spots near e on the far side of each box from the target. Each comes with a peek spot: the same place behind
// low cover (stand up to shoot), or just past the nearer end of the face for tall cover.
function aiCoverSpots(e, tg) {
  const out = [];
  for (const q of pillars) {
    if (q.nb)
      continue;
    if ((q.x - e.x) ** 2 + (q.z - e.z) ** 2 > 26 * 26)
      continue;
    const hw = q.hw || 1.5;
    const hd = q.hd || 1.5;
    if (hw > 16 || hd > 16)
      continue;
    const g = groundH(q.x, q.z);
    if (q.y0 != null && q.y0 > g + .5)
      continue;
    const top = (q.h || 3.5) - g;
    if (top < 1)
      continue;
    const low = top < 1.9;
    const dx = q.x - tg.x;
    const dz = q.z - tg.z;
    const xf = Math.abs(dx) / hw > Math.abs(dz) / hd;
    const along = xf ? hd : hw;
    const c0 = xf ? q.z : q.x;
    const base = xf ? q.x + (Math.sign(dx) || 1) * (hw + .8) : q.z + (Math.sign(dz) || 1) * (hd + .8);
    const us = along > 2.2 ? [c0 - along + .7, clamp(xf ? e.z : e.x, c0 - along + .7, c0 + along - .7), c0 + along - .7] : [c0];
    for (const u of us) {
      const x = xf ? base : u;
      const z = xf ? u : base;
      const ends = low ? [null] : u === c0 ? [c0 - along - .9, c0 + along + .9] : [u < c0 ? c0 - along - .9 : c0 + along + .9];
      for (const end of ends) {
        if (end != null && Math.abs(end - u) > 3.6)
          continue;
        const px = end == null || !xf ? (end == null ? x : end) : x;
        const pz = end == null || xf ? (end == null ? z : end) : z;
        out.push({ x, z, px, pz, low });
      }
    }
  }
  return out;
}

function aiPickCover(e, tg) {
  const ty = (tg.y || 0) + 1.3;
  const d0 = Math.hypot(e.x - tg.x, e.z - tg.z);
  const want = clamp(e.pref || 12, 7, 18);
  const taken = enemies.filter(o => o !== e && !o.dead && o.ai && o.ai.c).map(o => o.ai.c);
  const cs = aiCoverSpots(e, tg).filter(c => aiInside(c.x, c.z) && aiInside(c.px, c.pz) && !taken.some(t => Math.hypot(t.x - c.x, t.z - c.z) < 2.2));
  cs.forEach(c => {
    const dT = Math.hypot(c.x - tg.x, c.z - tg.z);
    c.s = -Math.abs(dT - want) * .6 - Math.hypot(c.x - e.x, c.z - e.z) * .5 - (dT < 5 ? 20 : 0) - (dT > d0 + 8 ? 4 : 0);
  });
  cs.sort((a, b) => b.s - a.s);
  for (const c of cs.slice(0, 8)) {
    const g = groundH(c.x, c.z);
    const pg = groundH(c.px, c.pz);
    if (inPillar({ x: c.x, y: g + .1, z: c.z }, .55) || inPillar({ x: c.px, y: pg + .1, z: c.pz }, .55))
      continue;
    // hidden behind it, but can see the target from the peek spot
    if (aiSees(c.x, g + (c.low ? .9 : 1.5), c.z, tg.x, ty, tg.z))
      continue;
    if (!aiSees(c.px, pg + 1.4 * e.sc, c.pz, tg.x, ty, tg.z))
      continue;
    return c;
  }
  return null;
}

// Sniper spots: listed perches (with the way up) and open ground at range, highest and clearest first
function aiPickPerch(e, tg) {
  const ty = (tg.y || 0) + 1.3;
  const want = e.pref || 22;
  const cs = [];
  const taken = enemies.filter(o => o !== e && !o.dead && o.ai && o.ai.p).map(o => o.ai.p);
  perches.forEach(p => {
    if (taken.some(t => t.x === p.x && t.z === p.z))
      return;
    const dT = Math.hypot(p.x - tg.x, p.z - tg.z);
    const f = p.path[0];
    const travel = Math.hypot(f[0] - e.x, f[1] - e.z) + p.len;
    if (dT < 10 || dT > 50 || travel > 65)
      return;
    cs.push(Object.assign({}, p, { s: p.y * 1.3 - travel * .2 - Math.abs(dT - want) * .15 + 3 }));
  });
  for (let i = 0; i < 18; i++) {
    const a = R(0, 6.28);
    const r = R(want * .7, want * 1.4);
    const x = tg.x + Math.cos(a) * r;
    const z = tg.z + Math.sin(a) * r;
    if (!aiInside(x, z))
      continue;
    const g = groundH(x, z);
    const travel = Math.hypot(x - e.x, z - e.z);
    if (travel > 35 || inPillar({ x, y: g + .1, z }, .6))
      continue;
    cs.push({ x, z, y: g, path: [[x, z]], len: 0, s: g * 1.3 - travel * .2 - Math.abs(r - want) * .15 });
  }
  cs.sort((a, b) => b.s - a.s);
  for (const p of cs.slice(0, 10))
    if (aiSees(p.x, p.y + 1.6 * e.sc, p.z, tg.x, ty, tg.z))
      return p;
  return null;
}

function aiSniper(e, tg, dt, d) {
  const a = e.ai || (e.ai = { st: 'pick', t: R(0, .5) });
  a.t -= dt;
  if (a.st === 'pick') {
    e.aiFire = true;
    if (a.t > 0)
      return false;
    const p = aiPickPerch(e, tg);
    if (!p) {
      a.t = R(2, 4);
      return false;
    }
    // leaving a perch: back down the way it came first
    Object.assign(a, { st: 'go', p, path: (a.back || []).concat(p.path.map(w => w.slice())), best: 1e9, stuck: 0, t: 40, blind: 0 });
    a.back = null;
  }
  if (a.st === 'go') {
    e.aiFire = false;
    const w = a.path[0];
    if (!w) {
      a.st = 'hold';
      a.t = R(15, 25);
      a.back = a.p.path.slice(0, -1).reverse();
      return true;
    }
    const dist = Math.hypot(w[0] - e.x, w[1] - e.z);
    if (dist < .5) {
      a.path.shift();
      a.best = 1e9;
      a.stuck = 0;
    }
    else {
      aiStep(e, w[0], w[1], dt, 1.1);
      if (dist < a.best - .2) {
        a.best = dist;
        a.stuck = 0;
      }
      else if ((a.stuck += dt) > 2 || a.t <= 0) {
        a.st = 'pick';
        a.t = R(.5, 1.5);
        a.p = null;
        a.back = null;
      }
    }
    return true;
  }
  // holding a perch: shoot from here; move on if the view stays blocked, the target is out of range, or after a while
  e.aiFire = true;
  a.chk = (a.chk || 0) - dt;
  if (a.chk <= 0) {
    a.chk = .5;
    a.blind = aiSees(e.x, e.y + 1.6 * e.sc, e.z, tg.x, (tg.y || 0) + 1.3, tg.z) ? 0 : a.blind + .5;
  }
  if (a.blind > 2 || d > 52 || d < 5 || a.t <= 0) {
    a.st = 'pick';
    a.t = R(.3, .8);
    a.p = null;
  }
  return true;
}

// Tactics for one enemy this frame. Returns true when it moved the enemy itself (main.js skips its own movement);
// sets e.aiFire (false = hold fire, e.g. while hiding) and e.crouch (sinks it behind low cover).
function aiUpdate(e, tg, dt, d, panic) {
  e.aiFire = true;
  if (e.boss || e.melee || e.kami || e.fly || e.veh || panic || e.t === 'hunter' || ET[e.t].model === 'hunter') {
    e.crouch = 0;
    return false;
  }
  if (e.sniper) {
    e.crouch = 0;
    return aiSniper(e, tg, dt, d);
  }
  const a = e.ai || (e.ai = { st: 'pick', t: R(0, .6), nf: 0 });
  a.t -= dt;
  let crouch = 0;
  if (a.nf > 0) {
    // no cover to be had: fight in the open for a moment
    a.nf -= dt;
    e.crouch = 0;
    return false;
  }
  if (a.st === 'pick') {
    if (a.t > 0) {
      e.crouch = 0;
      return false;
    }
    const c = aiPickCover(e, tg);
    if (!c) {
      a.nf = R(1.5, 3);
      a.c = null;
      e.crouch = 0;
      return false;
    }
    Object.assign(a, { st: 'go', c, t: 8, best: 1e9, stuck: 0, chk: 1 });
  }
  const c = a.c;
  // once a second: flanked (the cover no longer hides it), or the target ran off or closed right in
  a.chk -= dt;
  if (a.chk <= 0 && a.st !== 'go') {
    a.chk = 1;
    if (d > (e.pref || 12) * 2.4 || d < 3.5 || aiSees(c.x, groundH(c.x, c.z) + (c.low ? .9 : 1.5), c.z, tg.x, (tg.y || 0) + 1.3, tg.z)) {
      a.st = 'pick';
      a.t = 0;
    }
  }
  if (a.st === 'go') {
    // running to cover: it can still shoot if it sees the target
    const dist = Math.hypot(c.x - e.x, c.z - e.z);
    if (dist < .45) {
      a.st = 'hide';
      a.t = R(.6, 1.4);
    }
    else {
      aiStep(e, c.x, c.z, dt, 1.15);
      if (dist < a.best - .3) {
        a.best = dist;
        a.stuck = 0;
      }
      else if ((a.stuck += dt) > 1.5 || a.t <= 0) {
        a.st = 'pick';
        a.c = null;
        a.nf = R(1, 2);
      }
    }
  }
  else if (a.st === 'hide') {
    e.aiFire = false;
    aiStep(e, c.x, c.z, dt);
    crouch = c.low ? .55 * e.sc : 0;
    if (a.t <= 0) {
      a.st = 'peek';
      a.t = R(1.3, 2.5);
      e.cd = Math.min(e.cd, R(.25, .6));
    }
  }
  else if (a.st === 'peek') {
    const there = aiStep(e, c.px, c.pz, dt);
    e.aiFire = there || Math.hypot(c.px - e.x, c.pz - e.z) < .6;
    // duck back early when hit
    if (e.flash > 0 && a.t > .35)
      a.t = .35;
    if (a.t <= 0) {
      a.st = 'hide';
      a.t = R(1, 2.2);
    }
  }
  e.crouch = (e.crouch || 0) + (crouch - (e.crouch || 0)) * Math.min(1, dt * 8);
  return true;
}
