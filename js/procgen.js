/*
 * procgen.js: procedurally generated mission rooms. Classic script (no modules): all files share one global scope, so
 * load order in index.html matters (after levels.js).
 *
 * Every room of a mission, the first room and the boss arena included, is generated fresh each run from a seed: the
 * level, the run's seed (L.rs, picked when the mission starts and sent to co-op players, so a squad all fight in the
 * same rooms) and the room number. A room gets:
 * - its own size (smaller skirmish rooms up to big arenas; the boss arena is always large) and corner shape;
 * - a cover layout in one of several patterns (scattered, a ring, lanes, clusters, a staggered grid), each block drawn
 *   in the level's own style by buildLevel;
 * - its own rolling ground on the outdoor levels (missionGround is seeded per room);
 * - up to two climbable structures, built in the level's colours: a lookout tower with stairs, a raised walkway with
 *   stairs at both ends, or a bunker with stairs up onto its roof. They give the room height, and the tops are sniper
 *   perches for Jackal Snipers.
 * Your way in (south), the exit gate's lane (north) and your start point are always kept clear.
 */

// Generate room lr of mission lv: { A, cut, lay (cover, in the 22m units buildLevel scales by K), st (structures),
// pat (the cover pattern) }
function roomGen(lv, lr) {
  let sd = 1;
  for (const c of lv.id + ':' + (lv.rs || 0) + ':' + lr)
    sd = (sd * 31 + c.charCodeAt(0)) % 2147483647;
  for (let i = 0; i < 8; i++)
    sd = (sd * 48271 + 11) % 2147483647;
  sd = sd || 7;
  const rnd = () => (sd = sd * 16807 % 2147483647) / 2147483647;
  const boss = lr > lv.rooms;
  const a = Math.round(boss ? 32 + rnd() * 4 : lr <= 1 ? 27 + rnd() * 4 : 25 + rnd() * 11);
  const cut = Math.round(a * (.24 + rnd() * .2) * 10) / 10;
  const in0 = a - .5;
  const oct = in0 + cut;
  // inside the octagon with a margin m
  const inside = (x, z, m) => Math.abs(x) < in0 - m && Math.abs(z) < in0 - m && Math.abs(x) + Math.abs(z) < oct - m * 1.42;
  // the kept-clear lanes: your start, the exit gate's lane north, the doorway you came in by south
  const lane = (x, z, m) => Math.hypot(x, z - a * .64) < 5 + m || (Math.abs(x) < 3.6 + m && z < -in0 + 8 + m) || (Math.abs(x) < 3 + m && z > in0 - 6 - m);

  /* ---- structures ---- */
  const st = [];
  const want = boss ? 1 + (rnd() < .5 ? 1 : 0) : rnd() * 3 | 0;
  const hit = (b, x, z, m) => x > b[0] - m && x < b[1] + m && z > b[2] - m && z < b[3] + m;
  for (let t = 0; st.length < want && t < 80; t++) {
    const kind = ['tower', 'walk', 'bunker'][rnd() * 3 | 0];
    const ang = rnd() * 6.283;
    const r = a * (.28 + rnd() * .36);
    const x = Math.round(Math.cos(ang) * r);
    const z = Math.round(Math.sin(ang) * r);
    // stairs come down on the side facing the middle of the room
    const side = Math.abs(x) > Math.abs(z) ? (x > 0 ? '-x' : '+x') : (z > 0 ? '-z' : '+z');
    let s;
    if (kind === 'walk') {
      const h = 2.4 + rnd() * .8;
      s = { kind, x, z, ax: Math.abs(x) > Math.abs(z) ? 'z' : 'x', len: 7 + Math.round(rnd() * 6), w: 2.6, h, L: h / .42 };
      const ext = s.len / 2 + s.L;
      s.box = s.ax === 'x' ? [x - ext, x + ext, z - 1.3, z + 1.3] : [x - 1.3, x + 1.3, z - ext, z + ext];
    }
    else {
      const tw = kind === 'tower';
      const h = tw ? 2.8 + rnd() * 1.2 : 2.2 + rnd() * .7;
      s = { kind, x, z, hw: tw ? 2.2 : 2.2 + rnd() * 1.4, hd: tw ? 2.2 : 2 + rnd(), h, side, L: h / .42 };
      s.box = [x - s.hw, x + s.hw, z - s.hd, z + s.hd];
      const k = { '-x': 0, '+x': 1, '-z': 2, '+z': 3 }[side];
      s.box[k] += (k % 2 ? 1 : -1) * s.L;
    }
    const b = s.box;
    let ok = st.every(o => !(b[0] < o.box[1] + 3 && b[1] > o.box[0] - 3 && b[2] < o.box[3] + 3 && b[3] > o.box[2] - 3));
    for (let px = b[0]; ok && px <= b[1] + .01; px += 1)
      for (let pz = b[2]; ok && pz <= b[3] + .01; pz += 1)
        if (!inside(px, pz, 1.5) || lane(px, pz, 1))
          ok = false;
    if (ok)
      st.push(s);
  }

  /* ---- cover ---- */
  const pat = ['scatter', 'ring', 'lanes', 'clusters', 'grid'][rnd() * 5 | 0];
  const cand = [];
  const R2 = (lo, hi) => lo + rnd() * (hi - lo);
  if (pat === 'ring') {
    const rr = a * R2(.3, .48);
    const n = 5 + (rnd() * 4 | 0);
    const ph = rnd() * 6.283;
    for (let i = 0; i < n; i++)
      cand.push([Math.cos(ph + i / n * 6.283) * rr, Math.sin(ph + i / n * 6.283) * rr]);
    if (rnd() < .6)
      cand.push([R2(-2, 2), R2(-2, 2)]);
    for (let i = 0; i < 3; i++)
      cand.push([R2(-in0, in0), R2(-in0, in0)]);
  }
  else if (pat === 'lanes') {
    const sx = a * R2(.2, .42);
    const step = R2(6, 8.5);
    [-sx, sx].concat(rnd() < .5 ? [0] : []).forEach(x => {
      for (let z = -in0 + 6 + R2(0, 3); z < in0 - 4; z += step)
        cand.push([x + R2(-1.5, 1.5), z]);
    });
  }
  else if (pat === 'clusters') {
    const n = 3 + (rnd() * 2 | 0);
    for (let i = 0; i < n; i++) {
      const cx = R2(-in0 * .7, in0 * .7);
      const cz = R2(-in0 * .7, in0 * .7);
      const m = 2 + (rnd() * 2 | 0);
      for (let j = 0; j < m; j++) {
        const an = rnd() * 6.283;
        cand.push([cx + Math.cos(an) * 4.8 * (j ? 1 : 0), cz + Math.sin(an) * 4.8 * (j ? 1 : 0)]);
      }
    }
  }
  else if (pat === 'grid') {
    const g = R2(8, 10.5);
    const ox = R2(0, g);
    const oz = R2(0, g);
    for (let x = -in0 + ox; x < in0; x += g)
      for (let z = -in0 + oz, row = 0; z < in0; z += g, row++)
        if (rnd() < .62)
          cand.push([x + (row % 2 ? g / 2 : 0), z]);
  }
  else
    for (let i = 0; i < 40; i++)
      cand.push([R2(-in0, in0), R2(-in0, in0)]);
  const lay = [];
  const target = boss ? 6 + (rnd() * 3 | 0) : 5 + (rnd() * 5 | 0);
  const tryAt = (x, z) => {
    if (!inside(x, z, 3) || lane(x, z, 1.6) || st.some(s => hit(s.box, x, z, 2.8)) || lay.some(([u, v]) => Math.hypot(u - x, v - z) < 4.6))
      return;
    lay.push([x, z]);
  };
  for (const [x, z] of cand)
    if (lay.length < target + (pat === 'scatter' ? 0 : 2))
      tryAt(x, z);
  // a pattern that mostly fell in the lanes or on structures is topped up with scattered blocks
  for (let i = 0; lay.length < Math.min(target, 5) && i < 200; i++)
    tryAt(R2(-in0, in0), R2(-in0, in0));
  return { A: a, cut, lay: lay.map(([x, z]) => [x / K, z / K]), st, pat };
}

// Set up mission L for room lr (before buildLevel)
function applyRoomGen(L, lr) {
  const g = roomGen(L, lr);
  L.A = g.A;
  L.cut = g.cut;
  L.lay = g.lay;
  L.st = g.st;
  L.seed = L.id + ':' + (L.rs || 0) + ':' + lr;
}

// How far (x, z) is outside a structure's footprint (0 inside); missionGround flattens the ground under them
function stDist(s, x, z) {
  const b = s.box;
  return Math.hypot(Math.max(b[0] - x, 0, x - b[1]), Math.max(b[2] - z, 0, z - b[3]));
}

// Each level's structure colours: [walls, frame, deck]
const ST_COL = {
  ob: [0x7a7f86, 0x3a4048, 0x5a6068],
  cc: [0x4a2c78, 0x1c1030, 0x3a2460],
  fr: [0x9aa3a8, 0x4a5258, 0x7f878d],
  ds: [0xb89a70, 0x6a5a44, 0x9c8260],
  sn: [0xa8b8c8, 0x4f5c6a, 0x8e9eae],
  fl: [0x5c6058, 0x2c3028, 0x4a4e44]
};

// Build the room's structures (from buildLevel, after the ground): everything solid is a v box in `pillars`, everything
// you can stand on a deck, the tops are sniper perches
function procStructures(lv, add) {
  const C = ST_COL[lv.sty] || ST_COL.ob;
  const P3 = (c, s) => mat('st' + c + s, () => new THREE.MeshPhongMaterial({ color: c, shininess: s, specular: 0x556070, flatShading: true }));
  const wallM = P3(C[0], 30);
  const frameM = P3(C[1], 40);
  const deckM = P3(C[2], 20);
  const trimM = mat('stTrim' + lv.trim, () => new THREE.MeshBasicMaterial({ color: lv.trim }));
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const col = (x, z, hw, hd, h, y0) => pillars.push({ v: 1, x, z, hw, hd, h, y0: y0 == null ? null : y0 });
  const deck = (x, z, hw, hd, h) => decks.push({ x, z, hw, hd, ax: 'x', h0: h, h1: h });
  // a raised floor: walk on top at h, or underneath
  const slab = (x, z, hw, hd, h) => {
    col(x, z, hw, hd, h, h - .35);
    deck(x, z, hw, hd, h);
    add(B(hw * 2, .35, hd * 2), deckM, x, h - .175, z);
    [[0, -hd], [0, hd]].forEach(([, oz]) => add(B(hw * 2, .05, .05), trimM, x, h - .1, z + oz));
    [[-hw, 0], [hw, 0]].forEach(([ox]) => add(B(.05, .05, hd * 2), trimM, x + ox, h - .1, z));
  };
  // legs under a raised floor
  const posts = (x, z, hw, hd, top) => [-1, 1].forEach(sx => [-1, 1].forEach(sz => {
    const px = x + sx * (hw - .25);
    const pz = z + sz * (hd - .25);
    const g = groundH(px, pz) - .3;
    add(B(.35, top - g, .35), frameM, px, (top + g) / 2, pz);
    col(px, pz, .2, .2, top - .5);
  }));
  // a rail along an edge at floor height y (you can't walk off; you can jump it and shoot through it)
  const rail = (x, z, hw, hd, y) => {
    pillars.push({ v: 1, nb: 1, x, z, hw: Math.max(hw, .08), hd: Math.max(hd, .08), y0: y, h: y + 1 });
    const X = hw >= hd;
    const L = Math.max(hw, hd) * 2;
    add(B(X ? L : .08, .08, X ? .08 : L), frameM, x, y + 1, z);
    for (let i = 0, n = Math.max(1, Math.round(L / 1.8)); i <= n; i++) {
      const t = (i / n - .5) * L;
      add(B(.08, 1, .08), frameM, x + (X ? t : 0), y + .5, z + (X ? 0 : t));
    }
  };
  // stairs along ax from a (height ha) to b (height hb), centred on c across, w wide
  const stairs = (ax, c, a, b, w, ha, hb) => {
    const X = ax === 'x';
    const len = Math.abs(b - a);
    const mid = (a + b) / 2;
    decks.push({ x: X ? mid : c, z: X ? c : mid, hw: X ? len / 2 : w / 2, hd: X ? w / 2 : len / 2, ax, h0: a < b ? ha : hb, h1: a < b ? hb : ha });
    const n = Math.max(2, Math.round(Math.abs(hb - ha) / .32));
    const sl = len / n;
    for (let i = 0; i < n; i++) {
      const u = a + (b - a) * (i + .5) / n;
      const top = ha + (hb - ha) * (hb > ha ? i + 1 : i) / n;
      const sx = X ? u : c;
      const sz = X ? c : u;
      const g = groundH(sx, sz) - .3;
      if (top - g < .05)
        continue;
      add(B(X ? sl + .01 : w, top - g, X ? w : sl + .01), i % 2 ? wallM : deckM, sx, (top + g) / 2, sz);
      if (top - groundH(sx, sz) > 1.6)
        col(sx, sz, X ? sl / 2 : w / 2, X ? w / 2 : sl / 2, top - .8);
    }
  };
  // rails round a platform, open where the stairs (or a walkway's ends) come up
  const railsRound = (x, z, hw, hd, h, open) => [['-x', x - hw, z], ['+x', x + hw, z], ['-z', x, z - hd], ['+z', x, z + hd]].forEach(([s, rx, rz]) => {
    const X = s[1] === 'z';
    const half = X ? hw : hd;
    if (!open.includes(s))
      return rail(rx, rz, X ? half : .05, X ? .05 : half, h);
    const seg = (half - 1.5) / 2;
    if (seg > .15)
      [-1, 1].forEach(k => rail(rx + (X ? k * (1.5 + seg) : 0), rz + (X ? 0 : k * (1.5 + seg)), X ? seg : .05, X ? .05 : seg, h));
  });
  // stairs coming down from a platform's side to the ground, and a perch up them
  const stairsDown = (x, z, hw, hd, h, side, L) => {
    const ax = side[1];
    const sg = side[0] === '-' ? -1 : 1;
    const edge = ax === 'x' ? x + sg * hw : z + sg * hd;
    const foot = edge + sg * L;
    stairs(ax, ax === 'x' ? z : x, foot, edge, 2.6, groundH(ax === 'x' ? foot : x, ax === 'x' ? z : foot), h);
    const fo = foot + sg * 1.5;
    const up = edge - sg * .8;
    addPerch(ax === 'x' ? [[fo, z], [up, z]] : [[x, fo], [x, up]], [[x + hw * .55, z + hd * .55], [x - hw * .55, z - hd * .55]]);
  };
  (lv.st || []).forEach(s => {
    const gy = groundH(s.x, s.z);
    if (s.kind === 'tower') {
      // a lookout: a platform on legs, rails round it, a glowing beacon on a corner post
      const h = gy + s.h;
      slab(s.x, s.z, s.hw, s.hd, h);
      posts(s.x, s.z, s.hw, s.hd, h - .35);
      railsRound(s.x, s.z, s.hw, s.hd, h, [s.side]);
      add(B(.2, 1.6, .2), frameM, s.x + s.hw - .1, h + .8, s.z + s.hd - .1);
      add(B(.3, .3, .3), trimM, s.x + s.hw - .1, h + 1.7, s.z + s.hd - .1);
      stairsDown(s.x, s.z, s.hw, s.hd, h, s.side, s.L);
    }
    else if (s.kind === 'bunker') {
      // a solid block you can climb onto: panelled walls, a dark band with a glowing slit, a low wall round the roof
      const h = gy + s.h;
      col(s.x, s.z, s.hw, s.hd, h);
      deck(s.x, s.z, s.hw, s.hd, h);
      add(B(s.hw * 2, h - gy + .3, s.hd * 2), wallM, s.x, (h + gy - .3) / 2, s.z);
      add(B(s.hw * 2 + .1, .3, s.hd * 2 + .1), frameM, s.x, h - .15, s.z);
      add(B(s.hw * 2 + .12, .06, s.hd * 2 + .12), trimM, s.x, gy + s.h * .55, s.z);
      railsRound(s.x, s.z, s.hw, s.hd, h, [s.side]);
      stairsDown(s.x, s.z, s.hw, s.hd, h, s.side, s.L);
    }
    else {
      // a raised walkway: a long deck on legs with rails along its sides and stairs down from both ends
      const X = s.ax === 'x';
      const hw = X ? s.len / 2 : s.w / 2;
      const hd = X ? s.w / 2 : s.len / 2;
      const h = gy + s.h;
      slab(s.x, s.z, hw, hd, h);
      posts(s.x, s.z, hw, hd, h - .35);
      const ends = X ? ['-x', '+x'] : ['-z', '+z'];
      railsRound(s.x, s.z, hw, hd, h, ends);
      ends.forEach(e => stairsDown(s.x, s.z, hw, hd, h, e, s.L));
    }
  });
}
