/*
 * hall.js: the walk between rooms. Classic script (no modules): all files share one global scope, so load order in
 * index.html matters (after levels.js and graphics.js).
 *
 * A room's hallway is part of it: when the room is cleared and its exit gate opens, the hallway is built on behind the
 * gate, out past the north wall, and you can see down it through the gate. Walk through the gate, pick your boon,
 * carry on down the same hallway, and through its far door the next room starts; you come into that room through an
 * open doorway in its south wall, the last stretch of the hallway you just walked still behind you. The hallway takes
 * the room's own lighting and fog, so it reads as one level. In co-op you're marked ready at the far door (the next
 * room starts when the whole squad is through). A new mission after a boss still loads straight in.
 *
 * Every hallway is generated: a winding path of two to four straight runs joined by 90-degree turns (it never doubles
 * back), each a different length, the whole corridor a random width and height, laid out on a 2m grid. Its look is one
 * of six styles after Halo's corridors and levels, chosen to suit the level:
 *   unsc   - a UNSC ship corridor (Pillar of Autumn): blue-grey panelled walls with hazard bands, frames across the
 *            corridor, warm light panels overhead, pipes
 *   cov    - a Covenant ship (Truth and Reconciliation): tall purple walls leaning in at the top, glowing blue light
 *            slits and floor strips, hexagonal deck, arched ribs
 *   fore   - a Forerunner passage (The Silent Cartographer, The Library): tall grey metal, dark recessed panels, cyan
 *            light lines, angled buttresses
 *   flood  - a Forerunner hall overrun by the Flood (343 Guilty Spark): dim green light, flesh growths everywhere
 *   canyon - an open-air path between boulder walls under the sky (Halo, Blood Gulch), grass, sand or snow
 *   bunker - a UNSC outpost tunnel: concrete, hanging lamps, hazard stripes, supply crates
 * The layout is seeded from the level and room, so a co-op squad all walk the same hallway.
 */

// HALL: the walk in progress (on, done = what happens at the far door, exit = where that door is)
const HALL = { on: false, exit: null, done: null, field: null, centre: null };
// HALLWAY: the hallway attached to the current room (on, inside(x, z), and the room's own size before the arena grew)
const HALLWAY = { on: false, inside: () => false, IN: 0, OCT: 0 };
const HALL_STYLES = { cc: ['cov'], fr: ['fore'], sn: ['fore', 'canyon'], fl: ['flood'], ob: ['canyon', 'bunker', 'unsc'], ds: ['canyon', 'bunker'] };

// The gate opened: build the room's hallway behind it (everyone, host and guests)
function attachHall() {
  if (HALLWAY.on || !L || L.ff || NET.mode === 'vs')
    return;
  buildHall(L, 'attach');
}

// After the boon pick: carry on down the hallway (built when the gate opened)
function enterHall(done) {
  attachHall();
  HALL.on = true;
  HALL.done = done;
  state = 'play';
  NET.menu = 0;
  ov.style.display = 'none';
  ov.style.background = '';
  ov.style.justifyContent = '';
  lock();
  banner('PROCEED TO THE NEXT AREA');
}

// Every frame (from update): reached the far door?
function hallTick() {
  if (!HALL.on || state !== 'play' || !HALL.exit)
    return false;
  const dd = Math.hypot(P.x - HALL.exit.x, P.z - HALL.exit.z);
  // the far door slides open as you come up to it
  if (dd < 10 && HALL.door && HALL.door.target < 1)
    doorOpen(HALL.door, true);
  if (dd > 2.6)
    return false;
  const d = HALL.done;
  HALL.on = false;
  sfx.room();
  d();
  return true;
}

// Keep you inside the room or the hallway (the arena grows to hold the hallway, so its own walls no longer do it):
// slide along whichever way still works
function hallKeep(ox, oz) {
  if (!HALLWAY.on)
    return;
  const ok = (x, z) => HALLWAY.inside(x, z) || (Math.abs(x) < HALLWAY.IN - .6 && Math.abs(z) < HALLWAY.IN - .6 && Math.abs(x) + Math.abs(z) < HALLWAY.OCT - 1);
  if (ok(P.x, P.z))
    return;
  if (ok(P.x, oz))
    P.z = oz;
  else if (ok(ox, P.z))
    P.x = ox;
  else {
    P.x = ox;
    P.z = oz;
  }
}

// mode 'attach': the hallway out of this room, behind its exit gate (walkable). mode 'stub': the last stretch of the
// previous room's hallway, behind the south doorway you came in by (just to look at)
function buildHall(lv, mode) {
  const stub = mode === 'stub';
  const rm = stub ? lroom - 1 : lroom;
  // the layout and look are seeded from the level and room (the same for a whole co-op squad)
  let sd = 1;
  for (const ch of lv.id + ':' + rm)
    sd = (sd * 31 + ch.charCodeAt(0)) % 2147483647;
  sd = sd || 7;
  const rnd = () => (sd = sd * 16807 % 2147483647) / 2147483647;
  // stir it well (rooms next to each other have nearly the same seed)
  for (let k = 0; k < 8; k++)
    sd = (sd * 48271 + 11) % 2147483647 || 7;
  const pickOf = a => a[rnd() * a.length | 0];
  const style = pickOf(HALL_STYLES[lv.sty] || ['unsc', 'canyon']);
  const outdoor = style === 'canyon';

  /* ---- the path: on a grid of C-metre cells, runs north, east or west (never back south, so it can't cross) ---- */
  const C = 2;
  const half = style === 'fore' || style === 'cov' ? (rnd() < .5 ? 2 : 1) : outdoor ? 2 : 1;   // corridor width 2*half+1 cells
  const H = { unsc: 4.6, cov: 6.5, fore: 7 + rnd() * 2, flood: 6, canyon: 0, bunker: 4 }[style];
  const cells = new Set();
  const key = (i, j) => i + ',' + j;
  // a stub runs south (the grid is mirrored), so it reaches away from the room behind you
  const flip = stub ? -1 : 1;
  const mark = (ci, cj) => {
    for (let a = -half; a <= half; a++)
      for (let b = -half; b <= half; b++)
        cells.add(key(ci + a, (cj + b) * flip));
  };
  const DIRS = { N: [0, -1], E: [1, 0], W: [-1, 0] };
  const centre = [];
  let ci = 0;
  let cj = 0;
  let dir = 'N';
  const runs = stub ? 1 : 2 + (rnd() * 3 | 0);
  for (let r = 0; r < runs; r++) {
    const len = stub ? 4 : 4 + (rnd() * 8 | 0);
    for (let k = 0; k < len; k++) {
      mark(ci, cj);
      centre.push([ci, cj * flip, dir]);
      ci += DIRS[dir][0];
      cj += DIRS[dir][1];
    }
    if (r < runs - 1)
      dir = dir === 'N' ? (rnd() < .5 ? 'E' : 'W') : 'N';
  }
  mark(ci, cj);
  centre.push([ci, cj * flip, dir]);
  const endDir = dir;
  const ei = ci;
  const ej = cj * flip;
  const edge = (half + .5) * C;
  // the hallway's back edge meets the room's wall: z0 shifts the whole grid into place
  const z0 = stub ? IN - 1 + edge : -IN + 1 - edge;
  // the level's scenery outside the walls (trees, rocks, drifts) where the hallway runs is cleared away
  {
    const bb = new THREE.Box3();
    const sz = new THREE.Vector3();
    const near = (x0, x1, z0b, z1b) => {
      for (const k of cells) {
        const [i, j] = k.split(',').map(Number);
        const cx = i * C;
        const cz = j * C + z0;
        if (x1 > cx - C / 2 - 1.5 && x0 < cx + C / 2 + 1.5 && z1b > cz - C / 2 - 1.5 && z0b < cz + C / 2 + 1.5)
          return true;
      }
      return false;
    };
    envG.children.slice().forEach(o => {
      if (!o.isMesh || !o.geometry)
        return;
      bb.setFromObject(o);
      bb.getSize(sz);
      const cx = (bb.min.x + bb.max.x) / 2;
      const cz = (bb.min.z + bb.max.z) / 2;
      if (sz.x > 12 || sz.z > 12 || (Math.abs(cx) < IN + .6 && Math.abs(cz) < IN + .6))
        return;
      if (near(bb.min.x, bb.max.x, bb.min.z, bb.max.z))
        envG.remove(o);
    });
  }
  const hallG = new THREE.Group();
  hallG.position.set(0, .02, z0);
  envG.add(hallG);

  /* ---- building helpers: static pieces merge into one mesh per material ---- */
  const merged = new Map();
  const _o = new THREE.Object3D();
  const put = (geo, m, x, y, z, rx, ry, rz, sx, sy, sz) => {
    _o.position.set(x, y, z);
    _o.rotation.set(rx || 0, ry || 0, rz || 0);
    _o.scale.set(sx || 1, sy || sx || 1, sz || sx || 1);
    _o.updateMatrix();
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.applyMatrix4(_o.matrix);
    if (!merged.has(m))
      merged.set(m, []);
    merged.get(m).push(g);
  };
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const add = (geo, m, x, y, z) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    hallG.add(o);
    return o;
  };
  const Ph = (k, c, s, shine, map) => mat('hall' + k, () => {
    const m = new THREE.MeshPhongMaterial({ color: c, shininess: s, specular: 0x707a88 });
    if (map)
      m.map = ctex('hall' + map[0] + map[1] + 'x' + map[2], 256, 256, map[1], map[2], DR[map[0]]);
    return shine ? gfxShiny(m, shine) : m;
  });
  const glowM = c => mat('hallGlow' + c, () => new THREE.MeshBasicMaterial({ color: c }));

  /* ---- walls: every edge between a corridor cell and outside, merged into straight runs ---- */
  const walls = [];   // {x, z, len, ax ('x' = runs along x), nx, nz (pointing into the corridor)}
  const vEdges = {};
  const hEdges = {};
  cells.forEach(k => {
    const [i, j] = k.split(',').map(Number);
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([di, dj]) => {
      if (cells.has(key(i + di, j + dj)))
        return;
      if (di) {
        const kk = (i + di * .5) + '|' + -di;
        (vEdges[kk] = vEdges[kk] || []).push(j);
      }
      else {
        const kk = (j + dj * .5) + '|' + -dj;
        (hEdges[kk] = hEdges[kk] || []).push(i);
      }
    });
  });
  const runsOf = list => {
    list.sort((a, b) => a - b);
    const out = [];
    let s = list[0];
    let p = list[0];
    for (let n = 1; n <= list.length; n++) {
      if (n < list.length && list[n] === p + 1) {
        p = list[n];
        continue;
      }
      out.push([s, p]);
      s = p = list[n];
    }
    return out;
  };
  Object.keys(vEdges).forEach(k => {
    const [line, n] = k.split('|').map(Number);
    runsOf(vEdges[k]).forEach(([a, b]) => walls.push({ x: line * C, z: (a + b) / 2 * C, len: (b - a + 1) * C, ax: 'z', nx: n, nz: 0 }));
  });
  Object.keys(hEdges).forEach(k => {
    const [line, n] = k.split('|').map(Number);
    // the back of the hallway, where it meets the room, stays open (the gate, or the doorway you came in by)
    if (line * C * flip === edge)
      return;
    runsOf(hEdges[k]).forEach(([a, b]) => walls.push({ x: (a + b) / 2 * C, z: line * C, len: (b - a + 1) * C, ax: 'x', nx: 0, nz: n }));
  });
  // colliders (world coordinates): a thin slab along every wall
  if (!stub)
    walls.forEach(w => pillars.push({ x: w.x, z: w.z + z0, hw: w.ax === 'x' ? w.len / 2 : .25, hd: w.ax === 'z' ? w.len / 2 : .25, h: 12 }));
  // a point along a wall: t metres from its centre, `o` metres in from its face, at height y
  const onWall = (w, t, o, y) => [w.x + (w.ax === 'x' ? t : 0) + w.nx * o, y, w.z + (w.ax === 'z' ? t : 0) + w.nz * o];
  const wallBox = (w, thick, h, y, m, o, lenK) => put(B(w.ax === 'x' ? w.len * (lenK || 1) : thick, h, w.ax === 'z' ? w.len * (lenK || 1) : thick), m, w.x + w.nx * (o || 0), y, w.z + w.nz * (o || 0));
  const eachCell = f => cells.forEach(k => {
    const [i, j] = k.split(',').map(Number);
    f(i * C, j * C);
  });
  // across the corridor at a centreline cell: the frame's span and orientation
  const across = (i, j, d) => ({ x: i * C, z: j * C, span: (half * 2 + 1) * C, alongX: d !== 'N' });

  /* ---- the styles ---- */
  if (style === 'unsc' || style === 'bunker') {
    const bunker = style === 'bunker';
    const wallM = bunker ? Ph('bkW', 0x8a8a82, 8, 0, ['panel', 1, 1]) : Ph('usW', 0x8c96a2, 40, .08, ['panel', 1, 1]);
    const dark = Ph('usD', 0x3c4249, 40, .1);
    const hz = Ph('usHz', 0xffffff, 20, 0, ['hazard', 4, 1]);
    const floorM = bunker ? Ph('bkF', 0x6c6a64, 6, 0, ['gravel', 4, 4]) : Ph('usF', 0x4a5058, 50, .08, ['panel', 2, 2]);
    eachCell((x, z) => {
      put(B(C, .2, C), floorM, x, -.1, z);
      put(B(C, .3, C), bunker ? wallM : dark, x, H + .15, z);
    });
    walls.forEach(w => {
      wallBox(w, .3, H, H / 2, wallM);
      wallBox(w, .06, .45, .45, hz, .17);
      wallBox(w, .1, .35, H - .5, dark, .2);
      // pipes along the upper wall
      if (!bunker && w.len >= 6)
        [H - 1.1, H - 1.45].forEach(y => put(new THREE.CylinderGeometry(.09, .09, w.len, 8), Ph('usPipe', 0x9aa0a6, 60, .15), ...onWall(w, 0, .35, y), w.ax === 'x' ? 0 : Math.PI / 2, 0, w.ax === 'x' ? Math.PI / 2 : 0));
    });
    centre.forEach(([i, j, d], n) => {
      const a = across(i, j, d);
      if (n % 2 === 0) {
        // frames across the corridor and a light panel between them
        put(B(a.alongX ? .45 : a.span, .45, a.alongX ? a.span : .45), dark, a.x, H - .25, a.z);
        put(B(a.alongX ? .4 : 1.6, .06, a.alongX ? 1.6 : .4), glowM(bunker ? 0xffd890 : 0xfff2d8), a.x, H - .02, a.z);
      }
      if (bunker && n % 3 === 1) {
        add(new THREE.CylinderGeometry(.02, .02, .8, 4), dark, a.x, H - .4, a.z);
        add(new THREE.SphereGeometry(.18, 10, 8), glowM(0xffd070), a.x, H - .85, a.z);
      }
    });
    if (bunker)
      walls.forEach(w => {
        if (w.len >= 6 && rnd() < .5) {
          const p = onWall(w, (rnd() - .5) * (w.len - 3), .75, .45);
          put(B(.9, .9, .9), mat('cont0x6a5a3a', () => new THREE.MeshLambertMaterial({ color: 0x6a5a3a })), p[0], .45, p[2], 0, rnd(), 0);
        }
      });
  }
  else if (style === 'cov') {
    const wallM = Ph('cvW', 0x46306c, 110, .28);
    const deep = Ph('cvD', 0x241838, 90, .2);
    const floorM = mat('hallCvF', () => floorMat('cc'));
    eachCell((x, z) => {
      put(B(C, .2, C), floorM, x, -.1, z);
      put(B(C, .3, C), deep, x, H + .15, z);
    });
    walls.forEach(w => {
      wallBox(w, .3, H * .62, H * .31, wallM);
      // the upper wall leans inward over the corridor (the Covenant's tapering halls)
      const lean = w.ax === 'x' ? [w.nz * -.42, 0, 0] : [0, 0, w.nx * .42];
      put(B(w.ax === 'x' ? w.len : .3, H * .45, w.ax === 'z' ? w.len : .3), wallM, ...onWall(w, 0, .45, H * .8), ...lean);
      wallBox(w, .05, .07, .14, glowM(0x6fb8ff), .17);
      wallBox(w, .05, .05, H * .62, glowM(0xb48cff), .17);
      // vertical light slits
      for (let t = -w.len / 2 + 2; t < w.len / 2 - 1; t += 4)
        put(B(w.ax === 'x' ? .14 : .05, 1.6, w.ax === 'z' ? .14 : .05), glowM(0x8fc8ff), ...onWall(w, t, .17, 2.2));
    });
    centre.forEach(([i, j, d], n) => {
      if (n % 3)
        return;
      const a = across(i, j, d);
      // arched ribs: two curved halves meeting overhead
      [-1, 1].forEach(s => {
        const off = s * (a.span / 2 - .6);
        put(B(.5, H * .8, .5), deep, a.x + (a.alongX ? 0 : off), H * .4, a.z + (a.alongX ? off : 0), a.alongX ? -s * .25 : 0, 0, a.alongX ? 0 : s * .25);
      });
      put(B(a.alongX ? .3 : a.span * .5, .3, a.alongX ? a.span * .5 : .3), glowM(0xb48cff), a.x, H - .1, a.z);
    });
  }
  else if (style === 'fore' || style === 'flood') {
    const flood = style === 'flood';
    const glowC = flood ? 0xa8d860 : 0x40e8ff;
    const wallM = Ph(flood ? 'flW' : 'fnW', flood ? 0x5c6058 : 0x8a9298, 60, .14);
    const dark = Ph(flood ? 'flD' : 'fnD', flood ? 0x2c3028 : 0x3e464c, 50, .12);
    eachCell((x, z) => {
      put(B(C, .2, C), Ph(flood ? 'flF' : 'fnF', flood ? 0x4a4e44 : 0x6e767c, 30, .1), x, -.1, z);
      put(B(C, .3, C), dark, x, H + .15, z);
    });
    walls.forEach(w => {
      wallBox(w, .3, H, H / 2, wallM);
      wallBox(w, .05, .06, 1.2, glowM(glowC), .17);
      wallBox(w, .05, .08, .05, glowM(glowC), .17);
      for (let t = -w.len / 2 + 2; t < w.len / 2 - 1; t += 4) {
        // a dark recessed panel framed by light lines, and an angled buttress between panels
        put(B(w.ax === 'x' ? 2.2 : .06, H * .55, w.ax === 'z' ? 2.2 : .06), dark, ...onWall(w, t, .17, H * .55));
        [-1.15, 1.15].forEach(o => put(B(w.ax === 'x' ? .06 : .05, H * .55, w.ax === 'z' ? .06 : .05), glowM(glowC), ...onWall(w, t + o, .19, H * .55)));
        put(B(w.ax === 'x' ? .5 : .8, H * .9, w.ax === 'z' ? .5 : .8), dark, ...onWall(w, t + 2, .45, H * .45), ...(w.ax === 'x' ? [w.nz * -.12, 0, 0] : [0, 0, w.nx * .12]));
      }
    });
    centre.forEach(([i, j, d], n) => {
      const a = across(i, j, d);
      put(B(a.alongX ? C + .02 : .12, .05, a.alongX ? .12 : C + .02), glowM(glowC), a.x, H - .02, a.z);
      if (n % 4 === 0)
        put(B(a.alongX ? .7 : a.span, .7, a.alongX ? a.span : .7), dark, a.x, H - .35, a.z);
    });
    if (flood) {
      // Flood growth over walls, floor and ceiling, a few tendrils hanging down
      const F = floodMats();
      walls.forEach(w => {
        for (let t = -w.len / 2 + 1; t < w.len / 2; t += 1.6 + rnd() * 2) {
          if (rnd() < .45)
            continue;
          const s = .4 + rnd() * .9;
          put(new THREE.SphereGeometry(1, 10, 8), rnd() < .7 ? F.flesh : F.rot, ...onWall(w, t, .2, rnd() * H), 0, rnd() * 3, 0, s * .7, s, s * .8);
        }
      });
      centre.forEach(([i, j]) => {
        if (rnd() < .35)
          put(new THREE.SphereGeometry(1, 10, 8), F.flesh, i * C + (rnd() - .5) * 3, rnd() < .5 ? .1 : H - .2, j * C + (rnd() - .5) * 3, 0, rnd() * 3, 0, .6 + rnd() * .6, .3 + rnd() * .3, .6 + rnd() * .5);
        if (rnd() < .2)
          put(new THREE.CylinderGeometry(.04, .09, 2.2, 6), F.rot, i * C + (rnd() - .5) * 3, H - 1.1, j * C + (rnd() - .5) * 3);
      });
    }
  }
  else {
    // canyon: boulder walls under the open sky, the ground of the level, grass, sand or snow
    const rockM = mat('hallRock' + lv.sty, () => new THREE.MeshPhongMaterial({ color: lv.sty === 'sn' ? 0xb8c4cc : lv.sty === 'ds' ? 0x9a7650 : 0x6a6458, flatShading: true, shininess: 6 }));
    walls.forEach(w => {
      for (let t = -w.len / 2; t <= w.len / 2; t += 2.2) {
        const r = 1.6 + rnd() * 1.8;
        put(new THREE.DodecahedronGeometry(r), rockM, ...onWall(w, t + rnd() - .5, -r * .55, r * .6), rnd() * 3, rnd() * 3, 0, 1, 1.3 + rnd() * 1.1, 1);
        if (rnd() < .35) {
          const r2 = 2.5 + rnd() * 2.5;
          put(new THREE.DodecahedronGeometry(r2), rockM, ...onWall(w, t, -r2 - 1.5, r2 * 1.4), rnd() * 3, rnd() * 3, 0, 1, 1.6, 1);
        }
      }
    });
    const tuft = lv.sty === 'ob' ? 0x5a7a3a : lv.sty === 'sn' ? 0xe8f0f6 : 0xb08a5a;
    eachCell((x, z) => {
      if (rnd() < .35)
        put(new THREE.ConeGeometry(.12 + rnd() * .1, .3 + rnd() * .4, 4), mat('hallTuft' + tuft, () => new THREE.MeshLambertMaterial({ color: tuft })), x + (rnd() - .5) * C, .15, z + (rnd() - .5) * C);
      if (rnd() < .12) {
        const o = .2 + rnd() * .35;
        put(new THREE.DodecahedronGeometry(o), rockM, x + (rnd() - .5) * C, o * .4, z + (rnd() - .5) * C, rnd() * 3, rnd() * 3, 0);
      }
    });
  }

  // outdoors the path needs its own ground (it runs out past the room's floor)
  if (outdoor) {
    const gm = mat('hallGround' + lv.sty, () => floorMat(lv.sty));
    eachCell((x, z) => put(B(C, .2, C), gm, x, -.1, z));
  }

  /* ---- the door at the far end (open ahead of you; sealed at the end of a stub) ---- */
  const frameM = mat('gateFrame', () => new THREE.MeshPhongMaterial({ color: 0x30363d, shininess: 40, specular: 0x556070 }));
  const door = (x, z, alongX) => {
    const d = makeDoor(false, 0xff4030);
    d.g.position.set(x, 0, z);
    d.g.rotation.y = alongX ? Math.PI / 2 : 0;
    hallG.add(d.g);
    return d;
  };
  const [dx, dz] = DIRS[endDir];
  const ex = ei * C + dx * (edge - .4);
  const ez = ej * C + dz * (edge - .4) * flip;
  if (stub)
    door(ex, ez, endDir !== 'N');
  else {
    HALL.door = door(ex, ez, endDir !== 'N');
    HALL.field = HALL.door.light;
    HALL.exit = { x: ex - dx * .6, z: ez - dz * .6 + z0 };
    HALL.centre = centre.map(([i, j]) => [i * C, j * C + z0]);
    // chevrons on the floor pointing the way, every few cells
    centre.forEach(([i, j, d], n) => {
      if (n % 3 !== 1)
        return;
      const c = add(new THREE.RingGeometry(.5, .8, 3, 1, Math.PI / 2 - 1, 2), new THREE.MeshBasicMaterial({ color: 0x40ffa0, transparent: true, opacity: .35, side: THREE.DoubleSide, depthWrite: false }), i * C, .04, j * C);
      c.rotation.set(-Math.PI / 2, 0, d === 'N' ? 0 : d === 'E' ? -Math.PI / 2 : Math.PI / 2);
    });
  }

  // merge the static pieces
  merged.forEach((gs, m) => {
    let n = 0;
    gs.forEach(g => n += g.attributes.position.count);
    const pos = new Float32Array(n * 3);
    const nor = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    let o = 0;
    gs.forEach(g => {
      pos.set(g.attributes.position.array, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      if (g.attributes.uv)
        uv.set(g.attributes.uv.array, o * 2);
      o += g.attributes.position.count;
      g.dispose();
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const mesh = new THREE.Mesh(g, m);
    mesh.receiveShadow = true;
    mesh.castShadow = !m.isMeshBasicMaterial && !m.transparent;
    hallG.add(mesh);
  });
  HALL.style = style;
  if (stub)
    return;

  /* ---- an attached hallway: open the room up to it ---- */
  const inside = (x, z) => {
    const i = Math.round(x / C);
    const j = Math.round((z - z0) / C);
    return cells.has(key(i, j));
  };
  // a doorway through the room's north wall behind the gate, so you can see down the hallway through it (cut before
  // the arena grows, while IN is still the room's own size)
  cutWall(-1);
  // the room's wall either side of the gate stays solid where the hallway is wider than the gate
  const wide = edge + 1;
  [-1, 1].forEach(s => pillars.push({ x: s * (2.3 + (wide - 2.3) / 2), z: -IN, hw: (wide - 2.3) / 2, hd: .5, h: 12 }));
  Object.assign(HALLWAY, { on: true, inside, IN, OCT });
  // the arena grows to hold the hallway (hallKeep keeps you in the room or the hallway)
  let ext = A;
  cells.forEach(k => {
    const [i, j] = k.split(',').map(Number);
    ext = Math.max(ext, Math.abs(i * C) + 4, Math.abs(j * C + z0) + 4);
  });
  if (ext > A)
    setArena(ext, ext);
  // the ground under the hallway is flat (outdoor rooms' hills outside the walls are pressed down beneath it)
  if (groundFn) {
    const g0 = groundFn;
    groundFn = (x, z) => inside(x, z) ? 0 : g0(x, z);
    envG.traverse(o => {
      if (!o.isMesh || !o.geometry || o.geometry.type !== 'PlaneGeometry' || !o.material.vertexColors)
        return;
      const p = o.geometry.attributes.position;
      for (let v = 0; v < p.count; v++) {
        const x = p.getX(v) + o.position.x;
        const z = p.getZ(v) + o.position.z;
        if (inside(x, z) || inside(x + 2, z) || inside(x - 2, z) || inside(x, z + 2) || inside(x, z - 2))
          p.setY(v, Math.min(p.getY(v), -.3));
      }
      p.needsUpdate = true;
      o.geometry.computeVertexNormals();
    });
  }
  if (gate)
    gate.see = true;
  const prev = envTick;
  envTick = dt => {
    if (prev)
      prev(dt);
    if (HALL.field)
      HALL.field.material.opacity = .35 + .2 * Math.sin(T * 5);
  };
}

// The open doorway you came in through, in the south wall behind you as a room starts, with the end of the hallway
// you walked beyond it
function addEntry() {
  const d = makeDoor(true, 0x40ffa0);
  d.g.position.set(0, groundH(0, IN - .5), IN - .5);
  envG.add(d.g);
  if (L && !L.ff && lroom > 1) {
    cutWall(1);
    buildHall(L, 'stub');
  }
}

// Open a doorway (4.4m wide, 4.3m high) through the room's north (s = -1) or south (s = 1) wall at x = 0: wall boxes
// across it are rebuilt either side of the gap and above it, and small wall dressing in the way is removed
function cutWall(s) {
  const z = s * IN;
  const hole = new THREE.Box3(new THREE.Vector3(-2.2, .05, z - 1.6), new THREE.Vector3(2.2, 4.3, z + 1.6));
  const bb = new THREE.Box3();
  const sz = new THREE.Vector3();
  envG.children.slice().forEach(o => {
    if (!o.isMesh || !o.geometry)
      return;
    bb.setFromObject(o);
    if (!bb.intersectsBox(hole))
      return;
    bb.getSize(sz);
    if (o.geometry.type === 'BoxGeometry' && sz.x > 5 && sz.z < 3) {
      // a wall running across: rebuild it either side of the gap, and above it
      const yc = (bb.min.y + bb.max.y) / 2;
      const zc = (bb.min.z + bb.max.z) / 2;
      const part = (x0, x1, y0, y1) => {
        if (x1 - x0 < .05 || y1 - y0 < .05)
          return;
        const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, sz.z), o.material);
        m.position.set((x0 + x1) / 2, (y0 + y1) / 2, zc);
        m.receiveShadow = true;
        envG.add(m);
      };
      part(bb.min.x, -2.2, bb.min.y, bb.max.y);
      part(2.2, bb.max.x, bb.min.y, bb.max.y);
      part(-2.2, 2.2, Math.max(4.3, bb.min.y), bb.max.y);
      envG.remove(o);
      return yc;
    }
    if (o.geometry.type === 'PlaneGeometry' && sz.x > 5 && sz.z < 3) {
      // a flat panel across the wall (the Covenant cruiser's space window): keep the parts either side of the gap
      const inv = new THREE.Matrix4().copy(o.matrixWorld).invert();
      const lx = x => new THREE.Vector3(x, (bb.min.y + bb.max.y) / 2, (bb.min.z + bb.max.z) / 2).applyMatrix4(inv).x;
      const W = o.geometry.parameters.width;
      [[bb.min.x - 1, -2.2], [2.2, bb.max.x + 1]].forEach(([x0, x1]) => {
        let a = lx(x0);
        let b = lx(x1);
        if (a > b)
          [a, b] = [b, a];
        a = Math.max(a, -W / 2);
        b = Math.min(b, W / 2);
        if (b - a < .05)
          return;
        const g = o.geometry.clone();
        const p = g.attributes.position;
        const uv = g.attributes.uv;
        for (let v = 0; v < p.count; v++) {
          const x = Math.min(b, Math.max(a, p.getX(v)));
          p.setX(v, x);
          uv.setX(v, x / W + .5);
        }
        const m = new THREE.Mesh(g, o.material);
        m.position.copy(o.position);
        m.quaternion.copy(o.quaternion);
        m.scale.copy(o.scale);
        envG.add(m);
      });
      envG.remove(o);
      return;
    }
    // smaller things on the wall (boulders, panels, lights) in the way go
    if (sz.x < 7 && sz.y < 9 && sz.z < 7)
      envG.remove(o);
  });
}

/* ---------- Sliding doors ---------- */
// A door after Halo's: an armoured frame, two heavy panels that part sideways (each with a hazard band and a glowing
// seam on its inner edge) and a status light over it, red while it's locked, green when it opens. d.t runs from 0
// (shut) to 1 (open), easing toward d.target (doorsTick).
const DOORS = [];
function makeDoor(open, col) {
  const g = new THREE.Group();
  const frameM = mat('gateFrame', () => new THREE.MeshPhongMaterial({ color: 0x30363d, shininess: 40, specular: 0x556070 }));
  const panelM = mat('doorPanel', () => gfxShiny(new THREE.MeshPhongMaterial({ color: 0x5c6670, shininess: 70, specular: 0x8a96a4, map: ctex('doorPanelTex', 256, 256, 1, 1, DR.panel) }), .12));
  const darkM = mat('doorDark', () => new THREE.MeshPhongMaterial({ color: 0x23272c, shininess: 30 }));
  const hazM = mat('doorHaz', () => new THREE.MeshLambertMaterial({ map: ctex('doorHazTex', 128, 32, 2, 1, DR.hazard) }));
  const box = (w, h, d, m, x, y, z, par) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    o.position.set(x, y, z);
    (par || g).add(o);
    return o;
  };
  [-2.4, 2.4].forEach(x => box(.6, 4.4, .9, frameM, x, 2.2, 0));
  box(5.4, .6, .9, frameM, 0, 4.4, 0);
  const lightM = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 1 });
  const light = box(1.6, .16, 1, lightM, 0, 4.82, 0);
  const seamM = new THREE.MeshBasicMaterial({ color: col });
  const panels = [-1, 1].map(s => {
    const p = new THREE.Group();
    box(2.1, 4.1, .28, panelM, 0, 2.05, 0, p);
    box(2.12, .3, .3, hazM, 0, 1.1, 0, p);
    box(2.12, .1, .3, darkM, 0, 3.3, 0, p);
    box(.3, 4.1, .32, darkM, s * .9, 2.05, 0, p);
    box(.05, 3.4, .33, seamM, -s * 1.03, 2.05, 0, p);
    g.add(p);
    return p;
  });
  const d = { g, panels, light, seamM, t: open ? 1 : 0, target: open ? 1 : 0 };
  doorSet(d);
  DOORS.push(d);
  return d;
}

function doorSet(d) {
  d.panels.forEach((p, i) => p.position.x = (i ? 1 : -1) * (1.05 + d.t * 2.15));
}

// Open (or shut) a door, and set its status light
function doorOpen(d, open) {
  if (!d)
    return;
  if (open && d.target < 1 && Math.hypot(d.g.getWorldPosition(new THREE.Vector3()).x - P.x, d.g.getWorldPosition(new THREE.Vector3()).z - P.z) < 40)
    sfx.recharge();
  d.target = open ? 1 : 0;
  const c = open ? 0x40ffa0 : 0xff4030;
  d.light.material.color.setHex(c);
  d.seamM.color.setHex(c);
}

// Every frame: the doors slide (doors no longer in the scene are forgotten)
function doorsTick(dt) {
  for (let i = DOORS.length - 1; i >= 0; i--) {
    const d = DOORS[i];
    let o = d.g;
    while (o && o !== scene)
      o = o.parent;
    if (!o) {
      DOORS.splice(i, 1);
      continue;
    }
    if (Math.abs(d.target - d.t) > .001) {
      d.t += (d.target - d.t) * Math.min(1, dt * 2.6);
      doorSet(d);
    }
  }
}