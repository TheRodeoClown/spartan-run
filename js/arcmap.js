/*
 * arcmap.js: "Arc Facility", the Warzone Firefight map: a UNSC excavation complex sprawling across a rocky quarry,
 * after the industrial Halo 5 Warzone maps. Classic script (no modules): all files share one global scope.
 *
 * The quarry floor curls up into cliffs at an irregular edge (arcEdge), and rock ridges, a mesa and the excavation pit
 * break it into lanes. Directions follow the compass (compass.js): north is +z, east is -x. The team base (building 01)
 * sits in the south half with a generator on each flank. Around it: a comms array (south-west), a fuel depot
 * (south-east), a hangar and the mesa (east), a Covenant outpost (north-east), a container yard and the drill rig in its
 * flooded pit (middle), a watchtower joined to a silo by a skybridge (north), and building 02 (west). Most of it can be climbed: stairs, rooftops, catwalks, tank tops, containers and lookouts are
 * walkable decks (see decks / floorH in core.js); colliders are boxes in `pillars`. Moving parts (radar dishes, drill,
 * crane, sweeping floodlights, beacons, steam, dust) run in envTick.
 */

const ARC = { id: 'arc', n: 'Arc Facility', rooms: 0, A: 112, cut: 80, fog: 0x3c4652, fogN: 70, fogF: 300, sky: [0x26303e, 0x6a7482, 0x30343a], hemi: [0xc0ccdc, 0x3a3630, .95], sun: [0xffe2c4, .8, -6, 10, 4], trim: 0xffa040, sty: 'arc', lay: [] };

// How far the quarry floor runs from the centre in direction a (radians, atan2(z, x)): longer north-south, wobbling
function arcEdge(a) {
  return Math.min(106, 96 - 8 * Math.cos(2 * a) + 6 * Math.sin(3 * a + .7) + 4 * Math.sin(5 * a + 2.1) + 2.5 * Math.sin(9 * a + .4));
}
// How far you can go: short of the edge, where the cliffs start to climb behind a line of boulders
const arcLimit = a => arcEdge(a) - 10;
// [x, z, height, radius] mounds and knolls across the floor
const ARC_MOUNDS = [[30, -18, 4, 9], [-20, -20, 1.4, 7], [20, 6, 1.2, 6], [-14, 30, 1.6, 8], [48, 24, 1.8, 8], [-26, 72, 1.5, 7], [14, -76, 1.8, 8], [-20, -78, 1.6, 8], [62, -28, 1.5, 6], [70, 30, 1.6, 7]];
// level ground under buildings: [centre x, centre z, half-width, half-depth]
const ARC_PADS = [[0, -42, 18, 14], [55, -6, 11, 12], [34, -60, 18, 13], [-38, -56, 15, 12], [-52, -18, 10, 17], [24, 58, 26, 8], [-44, 54, 9, 13], [-6, 40, 15, 9]];
// rock ridges: [ax, az, bx, bz, height at a, height at b, half-width of the top, width of the slopes]
// (gentle slopes you can walk up; the last one is the steep-sided path up the mesa)
const ARC_RIDGES = [[-36, -6, -20, -16, 3, 3, 2, 5], [24, 26, 42, 14, 3.2, 2.6, 2, 5], [-24, 62, -10, 70, 2.6, 2.6, 2, 5], [0, -76, 12, -70, 2.5, 2.5, 2, 5], [-40, 20, -24, 30, 9, 0, 2.5, 3.5]];
// the mesa (east): [x, z, radius of the top, height]; its sides are too steep to walk up
const ARC_MESA = [-52, 18, 12, 9];

function arcRidge(x, z, [ax, az, bx, bz, ha, hb, w, f]) {
  const dx = bx - ax;
  const dz = bz - az;
  const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
  const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
  return (ha + (hb - ha) * t) * smooth01((w + f - d) / f);
}

function groundArc(x, z) {
  let h = .25 * Math.sin(x * .19 + 1) * Math.cos(z * .23) + .15 * Math.sin(x * .41 - z * .37);
  for (const [mx, mz, mh, r] of ARC_MOUNDS)
    h += mh * Math.exp(-((x - mx) ** 2 + (z - mz) ** 2) / (r * r));
  // the excavation pit: a wide, shallow basin with a smooth floor 0.5m down (flooded knee deep: see arcBuild)
  const pw = smooth01((15 - Math.hypot(x - 6, z - 12)) / 6);
  h = h * (1 - pw) - .5 * pw;
  for (const [px, pz, hw, hd] of ARC_PADS) {
    const d = Math.max(Math.abs(x - px) - hw, Math.abs(z - pz) - hd);
    h *= smooth01(d / 6);
  }
  // the mesa and the ridges
  let rk = ARC_MESA[3] * smooth01((ARC_MESA[2] + 5 - Math.hypot(x - ARC_MESA[0], z - ARC_MESA[1])) / 5);
  for (const r of ARC_RIDGES)
    rk = Math.max(rk, arcRidge(x, z, r));
  h += rk;
  // the quarry walls: the floor curls up into rocky cliffs at the edge
  const r = Math.hypot(x, z);
  const e = arcEdge(Math.atan2(z, x));
  const c = smooth01((r - e + 12) / 12);
  if (c > 0)
    h += 26 * c + 8 * smooth01((r - e) / 20) + c * (2.5 * Math.sin(x * .31 + z * .17) * Math.cos(z * .27 - x * .11) + 1.2 * Math.sin(x * .73 + z * .61));
  return h;
}

// Textures: quarry gravel, industrial wall panels, ridged container steel (white, tinted by the material), the 01 / 02
// building signs, hazard stripes
Object.assign(DR, {
  gravel: (g, w, h) => {
    g.fillStyle = '#58544e';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 14; i++) {
      g.fillStyle = Math.random() < .5 ? 'rgba(30,28,26,.25)' : 'rgba(120,114,104,.18)';
      g.beginPath();
      g.ellipse(Math.random() * w, Math.random() * h, R(15, 60), R(10, 40), R(0, 3), 0, 7);
      g.fill();
    }
    for (let i = 0; i < 1500; i++) {
      const v = R(50, 150) | 0;
      g.fillStyle = 'rgba(' + v + ',' + (v - 4) + ',' + (v - 10) + ',.7)';
      g.fillRect(Math.random() * w, Math.random() * h, R(1, 3.5), R(1, 3));
    }
    speck(g, w, h, 2500, .12);
  },
  panel: (g, w, h) => {
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) {
        g.fillStyle = 'hsl(210,5%,' + R(40, 47) + '%)';
        g.fillRect(i * w / 4, j * h / 4, w / 4, h / 4);
      }
    g.strokeStyle = 'rgba(20,24,28,.7)';
    g.lineWidth = 3;
    for (let i = 0; i <= 4; i++) {
      g.beginPath();
      g.moveTo(i * w / 4, 0);
      g.lineTo(i * w / 4, h);
      g.moveTo(0, i * h / 4);
      g.lineTo(w, i * h / 4);
      g.stroke();
    }
    g.fillStyle = 'rgba(0,0,0,.4)';
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++)
        [[8, 8], [w / 4 - 8, 8], [8, h / 4 - 8], [w / 4 - 8, h / 4 - 8]].forEach(([a, b]) => g.fillRect(i * w / 4 + a - 2, j * h / 4 + b - 2, 4, 4));
    const gr = g.createLinearGradient(0, h * .6, 0, h);
    gr.addColorStop(0, 'rgba(40,34,26,0)');
    gr.addColorStop(1, 'rgba(40,34,26,.45)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    speck(g, w, h, 2000, .1);
  },
  cont: (g, w, h) => {
    g.fillStyle = '#e8e8e8';
    g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) {
      g.fillStyle = 'rgba(0,0,0,.22)';
      g.fillRect(x, 0, 6, h);
      g.fillStyle = 'rgba(255,255,255,.25)';
      g.fillRect(x + 6, 0, 2, h);
    }
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.fillRect(0, 0, w, 10);
    g.fillRect(0, h - 10, w, 10);
    speck(g, w, h, 2500, .15);
  },
  sign01: (g, w, h) => {
    g.fillStyle = '#c8401e';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#f4f0e8';
    g.font = 'bold ' + (h * .62 | 0) + 'px monospace';
    g.textAlign = 'center';
    g.fillText('01', w / 2, h * .68);
    g.font = (h * .1 | 0) + 'px monospace';
    g.fillText('ARC SECTOR', w / 2, h * .9);
  },
  sign02: (g, w, h) => {
    g.fillStyle = '#2a5a8a';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#f4f0e8';
    g.font = 'bold ' + (h * .62 | 0) + 'px monospace';
    g.textAlign = 'center';
    g.fillText('02', w / 2, h * .68);
    g.font = (h * .1 | 0) + 'px monospace';
    g.fillText('EXCAVATION', w / 2, h * .9);
  },
  hazard: (g, w, h) => {
    g.fillStyle = '#d8a828';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1c1c1c';
    for (let x = -h; x < w + h; x += 24) {
      g.beginPath();
      g.moveTo(x, h);
      g.lineTo(x + 12, h);
      g.lineTo(x + 12 + h, 0);
      g.lineTo(x + h, 0);
      g.fill();
    }
  }
});

function arcBuild({ add, G, B, hills, ground }) {
  let sd = 424242;
  const rnd = () => (sd = sd * 16807 % 2147483647) / 2147483647;
  const RR = (a, b) => a + rnd() * (b - a);
  const tex = (k, w, h, rx, ry, draw, extra) => mat(k + rx + 'x' + ry, () => new THREE.MeshLambertMaterial(Object.assign({ map: ctex(k + rx + 'x' + ry, w, h, rx, ry, draw) }, extra || {})));
  const rockM = mat('arcRock', () => new THREE.MeshPhongMaterial({ color: 0x4a4a4c, flatShading: true, shininess: 6 }));
  const rockD = mat('arcRockD', () => new THREE.MeshPhongMaterial({ color: 0x343436, flatShading: true, shininess: 4 }));
  const steel = mat('arcSteel', () => new THREE.MeshPhongMaterial({ color: 0x5c6268, shininess: 60, specular: 0x666a70 }));
  const dark = mat('arcDark', () => new THREE.MeshPhongMaterial({ color: 0x2a2e33, shininess: 40 }));
  const orange = mat('arcOrange', () => new THREE.MeshPhongMaterial({ color: 0xd06a22, shininess: 40 }));
  const conc = mat('arcConc', () => new THREE.MeshLambertMaterial({ color: 0x6a6a66 }));
  const grate = mat('arcGrate', () => new THREE.MeshPhongMaterial({ color: 0x3c4148, shininess: 50 }));
  const railM = mat('arcRail', () => new THREE.MeshPhongMaterial({ color: 0xc89a2a, shininess: 40 }));
  const cov = mat('arcCov', () => new THREE.MeshPhongMaterial({ color: 0x5a3a8a, shininess: 100, specular: 0xb08aff }));
  const covD = mat('arcCovD', () => new THREE.MeshPhongMaterial({ color: 0x34245a, shininess: 90, specular: 0x8a6acc }));
  const lampM = G(0xffd9a0);
  const panel = tex('panel', 256, 256, 2, 2, DR.panel);
  const hazard = tex('hazard', 128, 32, 4, 1, DR.hazard);
  const sign1 = tex('sign01', 256, 160, 1, 1, DR.sign01);
  const sign2 = tex('sign02', 256, 160, 1, 1, DR.sign02);
  const cont = c => mat('cont' + c, () => new THREE.MeshLambertMaterial({ map: ctex('cont', 128, 64, 3, 1, DR.cont), color: c }));
  const crateM = cont(0x6a5a3a);
  const lights = [];   // blinking beacons
  const spins = [];    // [object, axis, speed]
  const sweeps = [];   // floodlight heads that sweep back and forth: [head, phase, base angle]
  const vents = [];    // steam vent positions

  // Static pieces are merged into one mesh per material at the end (far fewer draw calls)
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
  const flush = () => merged.forEach((gs, m) => {
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
    envG.add(new THREE.Mesh(g, m));
  });

  /* ---- Building blocks: everything solid is a v box in `pillars`; everything you can stand on is a deck ---- */
  // A collider from y0 (null: the ground) up to h
  const col = (x, z, hw, hd, h, y0) => pillars.push({ v: 1, x, z, hw, hd, h, y0: y0 == null ? null : y0 });
  const deck = (x, z, hw, hd, h) => decks.push({ x, z, hw, hd, ax: 'x', h0: h, h1: h });
  // A solid block on the ground (or on y0), h tall, that you can stand on
  const solid = (x, z, hw, hd, h, m, y0, mesh) => {
    const gy = y0 == null ? groundH(x, z) : y0;
    col(x, z, hw, hd, gy + h, y0 == null ? null : gy);
    deck(x, z, hw, hd, gy + h);
    if (mesh !== false)
      return add(B(hw * 2, h, hd * 2), m, x, gy + h / 2, z);
  };
  // A raised floor (roof, catwalk, platform): walk on top at h, or underneath it
  const slab = (x, z, hw, hd, h, m, th) => {
    th = th || .4;
    col(x, z, hw, hd, h, h - th);
    deck(x, z, hw, hd, h);
    put(B(hw * 2, th, hd * 2), m, x, h - th / 2, z);
  };
  // A safety rail along an edge at floor height y: you can't walk off, but you can jump it and shoot through it
  const rail = (x, z, hw, hd, y) => {
    pillars.push({ v: 1, nb: 1, x, z, hw: Math.max(hw, .08), hd: Math.max(hd, .08), y0: y, h: y + 1 });
    const X = hw >= hd;
    const L = Math.max(hw, hd) * 2;
    [1, .5].forEach(k => put(B(X ? L : .07, .07, X ? .07 : L), railM, x, y + k, z));
    const n = Math.max(1, Math.round(L / 1.6));
    for (let i = 0; i <= n; i++) {
      const t = (i / n - .5) * L;
      put(B(.07, 1, .07), railM, x + (X ? t : 0), y + .5, z + (X ? 0 : t));
    }
  };
  // Legs under a raised floor whose underside is at `top`
  const posts = (x, z, hw, hd, top, m) => {
    const xs = hw > 4 ? [-1, 0, 1] : [-1, 1];
    const zs = hd > 4 ? [-1, 0, 1] : [-1, 1];
    xs.forEach(sx => zs.forEach(sz => {
      if (!sx && !sz)
        return;
      const px = x + sx * (hw - .25);
      const pz = z + sz * (hd - .25);
      const g = groundH(px, pz) - .3;
      put(B(.3, top - g, .3), m || dark, px, (top + g) / 2, pz);
      col(px, pz, .18, .18, top - .5);
    }));
  };
  // Stairs along ax ('x' or 'z') from a (height ha) up or down to b (height hb), centred on c across, w wide: solid
  // steps down to the ground, a smooth deck to walk on, side rails. Under the high end it's solid, so you can't walk under.
  const stairs = (ax, c, a, b, w, ha, hb, m) => {
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
      put(B(X ? sl + .01 : w, top - g, X ? w : sl + .01), m || conc, sx, (top + g) / 2, sz);
      if (top - groundH(sx, sz) > 1.6)
        col(sx, sz, X ? sl / 2 : w / 2, X ? w / 2 : sl / 2, top - .8);
    }
    const ang = Math.atan2(hb - ha, b - a);
    const sL = Math.hypot(b - a, hb - ha);
    [-1, 1].forEach(k => {
      const ro = c + k * (w / 2 - .05);
      if (X)
        put(B(sL, .07, .07), railM, mid, (ha + hb) / 2 + 1, ro, 0, 0, ang);
      else
        put(B(.07, .07, sL), railM, ro, (ha + hb) / 2 + 1, mid, -ang, 0, 0);
      for (let i = 0; i <= 4; i++) {
        const pu = a + (b - a) * i / 4;
        const ph = ha + (hb - ha) * i / 4;
        put(B(.07, 1, .07), railM, X ? pu : ro, ph + .5, X ? ro : pu);
      }
    });
  };
  // A lookout: a platform at height h on legs with rails round it and stairs (L long) up to the side named by `side`
  // ('-x', '+x', '-z', '+z'); `open` names other sides with a gap in the rail (where a bridge joins)
  const lookout = (x, z, hw, hd, h, side, L, open) => {
    slab(x, z, hw, hd, h, grate, .35);
    posts(x, z, hw, hd, h - .35);
    const gap = 2.8;
    [['-x', x - hw, z], ['+x', x + hw, z], ['-z', x, z - hd], ['+z', x, z + hd]].forEach(([s, rx, rz]) => {
      const X = s[1] === 'z';
      const half = X ? hw : hd;
      if (s !== side && !(open || []).includes(s))
        return rail(rx, rz, X ? half : .05, X ? .05 : half, h);
      const seg = (half - gap / 2) / 2;
      if (seg > .15)
        [-1, 1].forEach(k => rail(rx + (X ? k * (gap / 2 + seg) : 0), rz + (X ? 0 : k * (gap / 2 + seg)), X ? seg : .05, X ? .05 : seg, h));
    });
    if (!side)
      return;
    const ax = side[1];
    const sg = side[0] === '-' ? -1 : 1;
    const edge = ax === 'x' ? x + sg * hw : z + sg * hd;
    const foot = edge + sg * L;
    stairs(ax, ax === 'x' ? z : x, foot, edge, 2.6, groundH(ax === 'x' ? foot : x, ax === 'x' ? z : foot), h);
    // a sniper perch, up the stairs
    const fo = foot + sg * 1.5;
    const up = edge - sg * .8;
    addPerch(ax === 'x' ? [[fo, z], [up, z]] : [[x, fo], [x, up]], [[x + hw * .6, z + hd * .6], [x - hw * .6, z - hd * .6]]);
  };
  const container = (x, z, ax, c, top) => {
    const hw = ax === 'x' ? 3.05 : 1.2;
    const hd = ax === 'x' ? 1.2 : 3.05;
    const g = groundH(x, z);
    const h = g + 2.6 * (top ? 2 : 1);
    col(x, z, hw, hd, h);
    deck(x, z, hw, hd, h);
    add(B(hw * 2, 2.6, hd * 2), cont(c), x, g + 1.3, z);
    if (top)
      add(B(hw * 2, 2.6, hd * 2), cont(top), x, g + 3.9, z).rotation.y = .03;
  };
  // A stack of n crates (each one a step you can jump onto)
  const crate = (x, z, n, ry) => {
    const g = groundH(x, z);
    solid(x, z, .45, .45, .9 * n, null, null, false);
    for (let i = 0; i < n; i++)
      put(B(.9, .9, .9), crateM, x, g + .45 + .9 * i, z, 0, (ry || 0) + i * .25, 0);
  };
  const barrier = (x, z, ax) => {
    const hw = ax === 'x' ? 2 : .5;
    const hd = ax === 'x' ? .5 : 2;
    const g = groundH(x, z);
    solid(x, z, hw, hd, 1.15, null, null, false);
    put(B(hw * 2, 1.15, hd * 2), mat('arcBarrier', () => new THREE.MeshLambertMaterial({ color: 0x8a8a84 })), x, g + .575, z);
    add(B(hw * 2 + .02, .2, hd * 2 + .02), hazard, x, g + .95, z);
  };
  const rock = (x, z, s, m) => {
    const g = groundH(x, z);
    col(x, z, s * .7, s * .7, g + s * 1.2);
    put(new THREE.DodecahedronGeometry(s), m || (rnd() < .5 ? rockM : rockD), x, g + s * .35, z, RR(-.3, .3), rnd() * 3, 0, 1, .85, 1);
  };
  // floodlight tower with a sweeping beam
  const flood = (x, z) => {
    const g = groundH(x, z);
    solid(x, z, .35, .35, 9, dark);
    const head = new THREE.Group();
    head.position.set(x, g + 9.2, z);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.2, .6), lampM);
    face.position.z = .41;
    const beam = new THREE.Mesh(new THREE.ConeGeometry(4, 16, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: .08, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    beam.rotation.x = -Math.PI / 2;
    beam.position.z = 8;
    const aim = new THREE.Group();
    aim.rotation.x = .55;
    aim.add(new THREE.Mesh(new THREE.BoxGeometry(1.4, .8, .8), steel), face, beam);
    head.add(aim);
    envG.add(head);
    sweeps.push([head, sweeps.length * 1.7, Math.atan2(-x, -z)]);
  };
  const beacon = (x, y, z, c) => {
    const b = add(new THREE.SphereGeometry(.35, 10, 8), new THREE.MeshBasicMaterial({ color: c || 0xff3020 }), x, y, z);
    lights.push(b);
  };
  const dish = (x, y, z, r, sp) => {
    const d = new THREE.Group();
    d.position.set(x, y, z);
    const dm = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3), steel);
    dm.rotation.x = Math.PI / 2 + .5;
    dm.position.y = r * .8;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(.3, .5, r * .8, 8), dark);
    stem.position.y = r * .4;
    d.add(stem, dm);
    envG.add(d);
    spins.push([d, 'y', sp]);
  };

  // Sky, distant ring, far hills
  const band = ringBand(1800, 150, 0xc8d0e0, .3);
  band.rotation.z = Math.PI / 2;
  band.position.set(-400, 1760, -900);
  envG.add(band);
  ground(mat('gravelBig', () => new THREE.MeshLambertMaterial({ map: ctex('gravelBig', 256, 256, 160, 160, DR.gravel) })), -8);
  // far mountains: far enough out (and narrow enough) that none reaches inside the cliffs
  hills(40, 260, 420, 50, 110, 0x3c3e42);

  // Terrain mesh: gravel on the floor, darker rock where it's steep (cliffs, the mesa's sides)
  groundFn = meshGround(groundArc, A, 150);
  edgeFn = arcLimit;
  floor.visible = false;
  const tg = new THREE.PlaneGeometry(A * 2, A * 2, 150, 150);
  tg.rotateX(-Math.PI / 2);
  const tp = tg.attributes.position;
  const colr = [];
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i);
    const z = tp.getZ(i);
    const h = groundH(x, z);
    tp.setY(i, h);
    const sl = Math.hypot(groundArc(x + .8, z) - groundArc(x - .8, z), groundArc(x, z + .8) - groundArc(x, z - .8)) / 1.6;
    const k = Math.min(1.1, .84 + Math.min(h, 4) * .03 + .08 * Math.sin(x * .3 + z * .17) * Math.cos(z * .21 - x * .13));
    // rock colour only where it's too steep to walk (cliffs, the mesa's sides), not on the walkable ridges
    const rk = smooth01((sl - 1) / .6);
    const q = .55 + .1 * Math.sin(x * .7 + z * .9);
    colr.push(k + (q - k) * rk, k * .98 + (q - k * .98) * rk, k * .95 + (q * 1.02 - k * .95) * rk);
  }
  tg.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  tg.computeVertexNormals();
  envG.add(new THREE.Mesh(tg, mat('arcGround', () => new THREE.MeshLambertMaterial({ map: ctex('gravel', 256, 256, 30, 30, DR.gravel), vertexColors: true }))));

  // ---- The flooded excavation pit: knee deep at the deepest (wading slows you: see waterFn in core.js) ----
  let pitLow = 99;
  for (let a = 0; a < 6.28; a += .5)
    for (let r = 0; r < 4; r += 1)
      pitLow = Math.min(pitLow, groundH(6 + Math.cos(a) * r, 12 + Math.sin(a) * r));
  const pool = pitLow + .42;
  waterFn = (x, z) => (x - 6) ** 2 + (z - 12) ** 2 < 15 * 15 && groundH(x, z) < pool ? pool : null;
  const pw = add(new THREE.CircleGeometry(15, 48), mat('arcWater', () => new THREE.MeshPhongMaterial({ color: 0x1e4a58, emissive: 0x061a20, shininess: 120, specular: 0x9ac8e0, transparent: true, opacity: .72 })), 6, pool, 12);
  pw.rotation.x = -Math.PI / 2;

  // ---- The quarry walls: boulders along the foot of the cliffs, bigger ones up the cliffs, rock spires beyond ----
  for (let a = 0; a < 6.283;) {
    const e = arcEdge(a);
    const s = RR(4.5, 8);
    const r = e - 4 + RR(-1.5, 1.5);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const g = groundH(x, z);
    put(new THREE.DodecahedronGeometry(s), rnd() < .5 ? rockM : rockD, x, g + s * .3, z, RR(-.25, .25), rnd() * 3, RR(-.25, .25), 1, RR(1.1, 1.6), 1);
    col(x, z, s * .6, s * .6, g + s * 1.6);
    const s2 = RR(6, 11);
    const r2 = e + RR(3, 10);
    put(new THREE.DodecahedronGeometry(s2), rnd() < .5 ? rockM : rockD, Math.cos(a + .03) * r2, groundH(Math.cos(a + .03) * r2, Math.sin(a + .03) * r2) + s2 * .1, Math.sin(a + .03) * r2, RR(-.3, .3), rnd() * 3, 0, 1, RR(.9, 1.5), 1);
    if (rnd() < .35) {
      const r3 = e + RR(14, 26);
      const s3 = RR(4, 7);
      const x3 = Math.cos(a) * r3;
      const z3 = Math.sin(a) * r3;
      put(new THREE.DodecahedronGeometry(s3), rockD, x3, groundH(x3, z3) + s3 * 1.2, z3, RR(-.2, .2), rnd() * 3, 0, 1, RR(2.2, 3.2), 1);
    }
    a += s * 1.15 / e;
  }

  // ---- The mesa (east): boulders round its rim, cover on top; the ridge on its east side is the way up ----
  const [mx, mz, mr, mh] = ARC_MESA;
  for (let a = 0; a < 6.283; a += .36) {
    if (Math.abs(Math.atan2(Math.sin(a - .4), Math.cos(a - .4))) < .45)
      continue;
    const r = mr + RR(1.5, 3.5);
    const x = mx + Math.cos(a) * r;
    const z = mz + Math.sin(a) * r;
    const s = RR(2, 3.6);
    put(new THREE.DodecahedronGeometry(s), rnd() < .5 ? rockM : rockD, x, groundH(x, z), z, RR(-.3, .3), rnd() * 3, 0, 1, RR(1, 1.5), 1);
  }
  [[-56, 12, 1.6], [-48, 24, 1.4], [-58, 22, 1.2]].forEach(([x, z, s]) => rock(x, z, s));
  barrier(-50, 14, 'z');

  // ---- Building 01: the team base. Doors north, west and east; the REQ station inside; stairs up the back to a
  // walkable roof with a parapet round it ----
  const rt = 7.6;
  [[0, -51, 14, .4], [-9.5, -33, 4.5, .4], [9.5, -33, 4.5, .4], [-14, -47.5, .4, 3.5], [-14, -36.5, .4, 3.5], [14, -47.5, .4, 3.5], [14, -36.5, .4, 3.5]]
    .forEach(([x, z, hw, hd]) => solid(x, z, hw, hd, rt, panel, 0));
  // lintels over the doors
  [-14, 14].forEach(x => {
    col(x, -42, .4, 2, rt, 3.6);
    add(B(.8, rt - 3.6, 4), panel, x, (rt + 3.6) / 2, -42);
  });
  col(0, -33, 5, .4, rt, 5);
  add(B(10, rt - 5, .8), panel, 0, (rt + 5) / 2, -33);
  slab(0, -42, 14.4, 9.4, rt, dark, .6);
  add(B(28.6, .06, 18.6), conc, 0, rt + .03, -42);
  // parapet (open at the south-west corner, where the stairs come up)
  const parapet = (x, z, hw, hd) => {
    col(x, z, hw, hd, rt + .9, rt);
    put(B(hw * 2, .9, hd * 2), conc, x, rt + .45, z);
  };
  parapet(0, -32.85, 14.4, .25);
  parapet(-14.15, -42, .25, 9.4);
  parapet(14.15, -42, .25, 9.4);
  parapet(4.7, -51.15, 9.7, .25);
  stairs('x', -52.9, 12, -6, 3, 0, rt);
  slab(-10.2, -52.9, 4.2, 1.5, rt, grate, .4);
  posts(-10.2, -52.9, 4.2, 1.5, rt - .4);
  rail(-10.2, -54.4, 4.2, .05, rt);
  rail(-14.4, -52.9, .05, 1.5, rt);
  // the main door: frame, hazard stripe and lights; 01 signs and stripes on the front face
  [-5.2, 5.2].forEach(x => add(B(.5, 5, .6), orange, x, 2.5, -32.4));
  add(B(10.6, .5, .6), dark, 0, 5.1, -32.4);
  add(B(10, .3, .1), hazard, 0, 4.7, -32.1);
  [-3, 0, 3].forEach(x => add(B(.8, .15, .3), lampM, x, 5.5, -32.2));
  [-9.5, 9.5].forEach(x => {
    add(new THREE.PlaneGeometry(3.4, 2.1), sign1, x, 5.4, -32.55);
    add(B(9, .25, .05), orange, x, 2.2, -32.56);
  });
  // inside: lights, lockers and racks along the back wall, crates by the door
  [[-7, -38], [7, -38], [-7, -46], [7, -46]].forEach(([x, z]) => add(B(2.4, .1, .8), lampM, x, rt - .7, z));
  const bl = new THREE.PointLight(0xffd0a0, .9, 30);
  bl.position.set(0, 5.5, -42);
  envG.add(bl);
  [-10, -6, 6, 10].forEach(x => put(B(2.6, 2.4, .6), dark, x, 1.2, -50.3));
  [[-11.5, -36], [11.5, -36]].forEach(([x, z]) => crate(x, z, 1, .3));
  // roof: fans, the radar dish, an antenna with a beacon
  [-9, 9].forEach(x => {
    solid(x, -46, 1.5, 1.5, 1.4, dark, rt);
    const fan = add(new THREE.CylinderGeometry(1.2, 1.2, .1, 6), steel, x, rt + 1.48, -46);
    spins.push([fan, 'y', 5]);
  });
  solid(-2, -46, .6, .6, .8, dark, rt);
  dish(-2, rt + .8, -46, 2, .6);
  put(new THREE.CylinderGeometry(.12, .2, 8, 6), steel, 10, rt + 4, -36);
  beacon(10, rt + 8.2, -36);
  // storage tanks beside the base
  [[-18.5, -48], [18.5, -48]].forEach(([x, z]) => {
    solid(x, z, 2, 2, 6, null, 0, false);
    add(new THREE.CylinderGeometry(2.3, 2.3, 6, 16), steel, x, 3, z);
    add(new THREE.CylinderGeometry(2.4, 2.4, .3, 16), dark, x, 6.1, z);
    add(new THREE.CylinderGeometry(2.35, 2.35, .4, 16), orange, x, 3.4, z);
  });
  // cover round the generators (the generators themselves are built by the firefight mode)
  [[-27, -31.5, 'x'], [-33.5, -38, 'z'], [27, -31.5, 'x'], [33.5, -38, 'z'], [-8, -24, 'x'], [8, -24, 'x']].forEach(([x, z, ax]) => barrier(x, z, ax));
  [[-21, -42], [21, -42]].forEach(([x, z]) => crate(x, z, 2, .5));

  // ---- Comms array (south-west): a lookout, a bunker you can climb, a lattice mast with a turning dish ----
  lookout(44, -56, 3, 3, 9, '-x', 13);
  solid(26, -68, 5, 3.5, 3.6, panel);
  stairs('z', 26, -58, -64.5, 2.6, groundH(26, -58), groundH(26, -68) + 3.6);
  rail(26, -71.5, 5, .05, groundH(26, -68) + 3.6);
  put(new THREE.CylinderGeometry(.1, .1, 5, 6), steel, 29, groundH(29, -69) + 6, -69);
  beacon(29, groundH(29, -69) + 8.6, -69);
  {
    const x = 40;
    const z = -64;
    const g = groundH(x, z);
    col(x, z, 1.6, 1.6, g + 22);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => put(B(.25, 22.4, .25), dark, x + sx * 1.0, g + 11, z + sz * 1.0, sz * .045, 0, -sx * .045));
    for (let y = 2; y < 22; y += 3) {
      const w = 3.2 - y * .09;
      [[0, -1], [0, 1]].forEach(([, s]) => put(B(w, .12, .12), steel, x, g + y, z + s * w / 2));
      [[-1, 0], [1, 0]].forEach(([s]) => put(B(.12, .12, w), steel, x + s * w / 2, g + y, z));
    }
    dish(x, g + 22, z, 2.6, .35);
    beacon(x, g + 25.5, z);
  }

  // ---- Fuel depot (south-east): three tanks joined by catwalks across their tops, stairs up the north side ----
  const tank = (x, z) => {
    const g = groundH(x, z);
    solid(x, z, 2.2, 2.2, 5, null, null, false);
    add(new THREE.CylinderGeometry(3, 3, 5, 20), mat('arcTank', () => new THREE.MeshPhongMaterial({ color: 0xb8b4a8, shininess: 30 })), x, g + 2.5, z);
    add(new THREE.CylinderGeometry(3.05, 3.05, .4, 20), orange, x, g + 1.6, z);
    add(new THREE.CylinderGeometry(3.1, 3.1, .15, 20), dark, x, g + 5, z);
    vents.push([x + 1.5, g + 5.2, z + 1]);
  };
  tank(-44, -50);
  tank(-44, -61);
  tank(-28, -61);
  const tt = groundH(-44, -50) + 5;
  slab(-44, -55.5, 1.2, 3.5, tt, grate, .25);
  slab(-36, -61, 6.1, 1.2, tt, grate, .25);
  [-1, 1].forEach(s => {
    rail(-44 + s * 1.2, -55.5, .05, 3.1, tt);
    rail(-36, -61 + s * 1.2, 5.6, .05, tt);
  });
  stairs('z', -44, -38, -47.8, 2.4, groundH(-44, -38), tt);
  // pipes between the tanks (low enough to hop)
  [[-46.6, -55.5, .5, 3], [-36, -63.6, 6, .5]].forEach(([x, z, hw, hd]) => {
    const g = groundH(x, z);
    col(x, z, hw, hd, g + 1.3);
    const p = add(new THREE.CylinderGeometry(.45, .45, Math.max(hw, hd) * 2, 10), steel, x, g + .8, z);
    if (hw > hd)
      p.rotation.z = Math.PI / 2;
    else
      p.rotation.x = Math.PI / 2;
  });
  crate(-34, -54, 1);
  crate(-33, -55.2, 2, .4);

  // ---- Hangar (east): an arched hall open at both ends with a side door, and a mezzanine inside; a lookout outside ----
  const hx = -52;
  const hz = -18;
  solid(-59, hz, .4, 15, 5, panel, 0);
  solid(-45, -27, .4, 6, 5, panel, 0);
  solid(-45, -9, .4, 6, 5, panel, 0);
  col(-45, -18, .4, 3, 5, 3.8);
  add(B(.8, 1.2, 6), panel, -45, 4.4, -18);
  const arch = add(new THREE.CylinderGeometry(7.3, 7.3, 30, 24, 1, true, Math.PI / 2, Math.PI), mat('arcHangar', () => new THREE.MeshPhongMaterial({ color: 0x6a7076, shininess: 40, side: THREE.DoubleSide })), hx, 5, hz);
  arch.rotation.x = Math.PI / 2;
  for (let z = hz - 14.5; z <= hz + 14.6; z += 4.8) {
    const rib = add(new THREE.TorusGeometry(7.35, .18, 6, 24, Math.PI), dark, hx, 5, z);
    rib.rotation.z = 0;
  }
  add(new THREE.PlaneGeometry(10, 1.2), hazard, hx, 4.3, hz - 15.02).rotation.y = Math.PI;
  slab(-56.5, -14, 2.1, 10, 4.5, grate, .3);
  posts(-56.5, -14, 2.1, 10, 4.2);
  rail(-54.4, -14, .05, 10, 4.5);
  rail(-56.5, -4, 2.1, .05, 4.5);
  stairs('z', -56.5, -31, -24, 2.4, 0, 4.5);
  const hl = new THREE.PointLight(0xffe0b0, .7, 28);
  hl.position.set(hx, 8, hz);
  envG.add(hl);
  [[-50, -24, 'x', 0x7a7e82, 0]].forEach(a => container(...a));
  crate(-48.5, -12, 2);
  crate(-49.5, -11, 1, .5);
  lookout(-40, -30, 2.5, 2.5, 8, '+z', 12);

  // ---- Building 02 (west): a walkable roof with a crane on it, stairs up the outside; pipelines heading west ----
  const ex = 58;
  const ez = -8;
  const r2 = 8.6;
  [[64, ez, .4, 8], [ex, 0, 6, .4], [ex, -16, 6, .4], [52, -13.5, .4, 2.5], [52, -2.5, .4, 2.5]].forEach(([x, z, hw, hd]) => solid(x, z, hw, hd, r2, panel, 0));
  col(52, -8, .4, 3, r2, 4);
  add(B(.8, r2 - 4, 6), panel, 52, (r2 + 4) / 2, -8);
  slab(ex, ez, 6.4, 8.4, r2, dark, .6);
  rail(ex, 0.4, 6.4, .05, r2);
  rail(ex, -16.4, 6.4, .05, r2);
  rail(64.4, ez, .05, 8.4, r2);
  slab(50.5, -6, 1.3, 4, r2, grate, .3);
  posts(50.5, -6, 1.3, 4, r2 - .3);
  rail(49.2, -6, .05, 4, r2);
  rail(50.5, -10, 1.3, .05, r2);
  stairs('z', 50.5, 13, -2, 2.6, groundH(50.5, 13), r2);
  add(new THREE.PlaneGeometry(3.2, 2), sign2, 51.55, 6.2, -12.5).rotation.y = -Math.PI / 2;
  add(B(.1, .3, 5), hazard, 51.55, 4.3, -8);
  const crane = new THREE.Group();
  crane.position.set(ex + 2, r2, ez + 3);
  const mast = new THREE.Mesh(new THREE.BoxGeometry(.8, 6, .8), orange);
  mast.position.y = 3;
  const jib = new THREE.Mesh(new THREE.BoxGeometry(14, .7, .7), orange);
  jib.position.set(-4, 6, 0);
  const cable = new THREE.Mesh(new THREE.BoxGeometry(.06, 4, .06), dark);
  cable.position.set(-10, 4, 0);
  const load = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 1.2), cont(0x3a6a9a));
  load.position.set(-10, 1.6, 0);
  crane.add(mast, jib, cable, load);
  envG.add(crane);
  col(ex + 2, ez + 3, .5, .5, r2 + 6, r2);
  const pl2 = new THREE.PointLight(0xffc890, .6, 24);
  pl2.position.set(ex, 5, ez);
  envG.add(pl2);
  [[30, 38], [41, 47.5]].forEach(([x0, x1]) => {
    const cx = (x0 + x1) / 2;
    const len = x1 - x0;
    col(cx, -4, len / 2, 1.1, groundH(cx, -4) + 1.5);
    [-3.4, -4.6].forEach(z => {
      const p = add(new THREE.CylinderGeometry(.5, .5, len, 10), steel, cx, groundH(cx, z) + .8, z);
      p.rotation.z = Math.PI / 2;
    });
    for (let x = x0 + 1; x < x1; x += 3)
      put(B(.3, 1, 2.2), dark, x, groundH(x, -4) + .4, -4);
    vents.push([x0 + 1, groundH(x0 + 1, -3.4) + 1.3, -3.4], [x1 - 1, groundH(x1 - 1, -4.6) + 1.3, -4.6]);
  });

  // ---- North: the watchtower (stairs up from the west) and a skybridge across to the silo ----
  const tw = 12;
  lookout(26, 58, 3.5, 3.5, tw, '-x', 17, ['+x']);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => put(B(.2, 3, .2), dark, 26 + sx * 3.3, tw + 1.5, 58 + sz * 3.3));
  put(B(7.6, .3, 7.6), dark, 26, tw + 3.1, 58);
  slab(34.25, 58, 4.75, 1.2, tw, grate, .3);
  rail(34.25, 56.8, 4.75, .05, tw);
  rail(34.25, 59.2, 4.75, .05, tw);
  put(new THREE.CylinderGeometry(.35, .35, 9.5, 8), steel, 34.25, tw - .7, 59.6, 0, 0, Math.PI / 2);
  const sx = 46;
  const sz = 56;
  const sg = groundH(sx, sz) - 1;
  solid(sx, sz, 6.6, 6.6, 23, null, sg, false);
  add(new THREE.CylinderGeometry(7, 7.4, 20, 24), mat('arcSilo', () => new THREE.MeshPhongMaterial({ color: 0xb8b8b0, shininess: 30 })), sx, sg + 10, sz);
  add(new THREE.SphereGeometry(7, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), steel, sx, sg + 20, sz);
  [5, 16].forEach(y => add(new THREE.TorusGeometry(7.6, .18, 6, 32), dark, sx, sg + y, sz).rotation.x = Math.PI / 2);
  add(new THREE.TorusGeometry(7.5, .5, 6, 32), grate, sx, tw - .2, sz).rotation.x = Math.PI / 2;
  add(B(.2, 2.4, 1.8), dark, sx - 7.05, tw + 1.2, sz + 2);
  beacon(sx - 7.2, tw + 2.7, sz + 2, 0x30ff60);
  add(new THREE.PlaneGeometry(4, 2.5), sign1, sx - 3, sg + 8, sz - 6.95).rotation.y = Math.PI + .4;
  beacon(sx, sg + 27.6, sz);
  put(new THREE.CylinderGeometry(.1, .1, 1.2, 6), dark, sx, sg + 27, sz);
  flood(18, 66);

  // ---- Covenant outpost (north-east): a raised platform with a glowing ramp, spires and a drop beacon ----
  const cx = -44;
  const cz = 58;
  const cg = groundH(cx, cz);
  solid(cx, cz, 6, 6, 4, covD);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => add(B(1.2, 4.2, 1.2), cov, cx + a * 5.6, cg + 2.1, cz + b * 5.6).rotation.y = Math.PI / 4);
  add(B(12.2, .12, .3), G(0xb48cff), cx, cg + 3.9, cz - 6.05);
  stairs('z', cx, 45, 52, 3, groundH(cx, 45), cg + 4, cov);
  [[cx - 4, cz + 4], [cx + 4, cz + 4]].forEach(([x, z]) => {
    col(x, z, .8, .8, cg + 18, cg + 4);
    add(new THREE.ConeGeometry(1.2, 14, 6), cov, x, cg + 11, z);
    add(new THREE.OctahedronGeometry(.6), G(0xc89aff), x, cg + 18.6, z);
  });
  // Covenant cover on the platform: low curved shields
  [[cx - 2.5, cz - 3, 'x'], [cx + 3, cz, 'z']].forEach(([x, z, ax]) => {
    col(x, z, ax === 'x' ? 1.6 : .3, ax === 'x' ? .3 : 1.6, cg + 5.2, cg + 4);
    add(new THREE.BoxGeometry(ax === 'x' ? 3.2 : .4, 1.2, ax === 'x' ? .4 : 3.2), cov, x, cg + 4.6, z);
  });
  solid(cx, cz + 1.5, .9, .9, 2.4, cov, cg + 4);
  add(new THREE.OctahedronGeometry(.9), G(0xc89aff), cx, cg + 7.6, cz + 1.5);
  const ring = add(new THREE.RingGeometry(4.5, 5, 48), new THREE.MeshBasicMaterial({ color: 0xb48cff, transparent: true, opacity: .4, side: THREE.DoubleSide, depthWrite: false }), -40, groundH(-40, 72) + .08, 72);
  ring.rotation.x = -Math.PI / 2;
  const cl = new THREE.PointLight(0xb48cff, .8, 26);
  cl.position.set(cx, cg + 7, cz);
  envG.add(cl);

  // ---- The flooded excavation basin: the drill rig with a scaffold deck round it ----
  const dx = 6;
  const dz = 12;
  const dg = groundH(dx, dz);
  [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]].forEach(([ox, oz]) => {
    put(B(.35, 13, .35), orange, dx + ox * .8, dg + 6.5, dz + oz * .8, oz * -.06, 0, ox * .06);
  });
  col(dx, dz, 1.6, 1.6, dg + 13);
  put(B(4.4, .5, 4.4), dark, dx, dg + 13, dz);
  put(B(3, 1.6, 3), steel, dx, dg + 14, dz);
  const bit = add(new THREE.CylinderGeometry(.5, .5, 8, 8), steel, dx, dg + 4, dz);
  put(new THREE.ConeGeometry(.6, 1.4, 8), dark, dx, dg + .5, dz, Math.PI, 0, 0);
  spins.push([bit, 'y', 6]);
  beacon(dx, dg + 15.1, dz, 0xffa020);
  vents.push([dx + 2, dg + .4, dz + 1], [dx - 2, dg + .4, dz - 1]);
  lookout(dx, dz, 4.5, 4.5, dg + 6.5, '-x', 12);
  const pl3 = new THREE.PointLight(0xfff0d0, .7, 40);
  pl3.position.set(dx, dg + 12, dz);
  envG.add(pl3);

  // ---- Container yard (north of the middle): a stacked fort with stairs to the top; crates to climb the rest ----
  container(-8, 40, 'x', 0x2f5a8a, 0xb05a28);
  container(-1.5, 44.5, 'z', 0x8a2a24, 0);
  container(4, 38.5, 'x', 0x7a7e82, 0);
  container(-8, 46, 'x', 0x5a6a3a, 0);
  stairs('x', 40, -20, -11.05, 2.4, groundH(-20, 40), groundH(-8, 40) + 5.2);
  crate(.2, 44.5, 2);
  crate(1.2, 44.5, 1, .4);
  crate(7.4, 40.4, 1);
  rail(-8, 38.8, 3.05, .05, groundH(-8, 40) + 5.2);

  // ---- The rock arch, ridge-top cover, rock clusters ----
  const a0 = new THREE.Vector3(-32, 0, 4);
  const a1 = new THREE.Vector3(-14, 0, 20);
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const p = a0.clone().lerp(a1, t);
    const s = 2.6 + Math.sin(Math.PI * t) * .4 + rnd() * .6;
    put(new THREE.DodecahedronGeometry(s), i % 2 ? rockD : rockM, p.x + RR(-.6, .6), groundH(p.x, p.z) + Math.sin(Math.PI * t) * 13 + 1, p.z + RR(-.6, .6), rnd() * 3, rnd() * 3, 0);
  }
  [a0, a1].forEach(p => {
    col(p.x, p.z, 2.6, 2.6, groundH(p.x, p.z) + 6);
    put(new THREE.DodecahedronGeometry(3.6), rockM, p.x, groundH(p.x, p.z) + 2, p.z, 0, rnd() * 3, 0, 1, 1.4, 1);
  });
  [[-30, -9, 1.2], [-24, -13, 1.4], [30, 22, 1.3], [38, 16, 1.1], [-18, 65, 1.2], [6, -73, 1.3]].forEach(([x, z, s]) => rock(x, z, s));
  const free = (x, z, m) => !pillars.some(q => Math.abs(x - q.x) < (q.hw || 1.5) + m && Math.abs(z - q.z) < (q.hd || 1.5) + m)
    && !decks.some(d => Math.abs(x - d.x) < d.hw + m && Math.abs(z - d.z) < d.hd + m)
    && Math.hypot(x, z) < arcLimit(Math.atan2(z, x)) - 3
    && !(Math.abs(x) < 16 && z > -54 && z < -30);
  [[-8, -8], [36, -26], [-46, 6], [52, 40], [-12, 56], [32, 40], [-30, -72], [50, -42], [70, -20], [-14, 76], [20, -82], [-62, -40], [62, 52], [-66, 40]].forEach(([cx, cz]) => {
    const n = 2 + (rnd() * 3 | 0);
    for (let i = 0; i < n; i++) {
      const x = cx + RR(-3, 3);
      const z = cz + RR(-3, 3);
      const s = RR(1.4, 3);
      if (free(x, z, s * .7 + .3))
        rock(x, z, s);
    }
  });

  // ---- Cargo, barriers, crates and barrels across the floor; floodlights ----
  [[-6, -20, 'x', 0xb05a28, 0x2f5a8a], [12, -12, 'z', 0x2f5a8a, 0], [-22, 0, 'z', 0x7a7e82, 0x8a2a24], [22, 2, 'x', 0x8a2a24, 0], [36, 4, 'z', 0x7a7e82, 0],
    [-30, -24, 'x', 0x8a2a24, 0xb05a28], [44, 36, 'x', 0xb05a28, 0], [-34, 40, 'x', 0x2f5a8a, 0], [16, -24, 'z', 0x5a6a3a, 0], [-10, -66, 'x', 0x2f5a8a, 0],
    [14, -60, 'z', 0x7a7e82, 0x2f5a8a], [56, 14, 'z', 0x8a2a24, 0], [10, 70, 'x', 0xb05a28, 0], [-20, -36, 'z', 0x7a7e82, 0], [62, -34, 'x', 0x2f5a8a, 0]]
    .forEach(a => container(...a));
  // crate steps up the single containers
  [[13.7, -12, 2], [14.7, -12.2, 1], [22, 3.7, 2], [22.2, 4.7, 1], [37.7, 4, 2], [38.7, 4.2, 1], [44, 37.7, 2], [44.2, 38.7, 1], [-34, 41.7, 2], [-33.8, 42.7, 1],
    [-10, -64.3, 2], [-9.8, -63.3, 1], [57.7, 14, 2], [58.7, 14.2, 1], [-18.3, -36, 2], [-17.3, -36.2, 1]].forEach(([x, z, n]) => crate(x, z, n, n * .3));
  [[-20, 52, 'x'], [16, 46, 'x'], [40, 8, 'z'], [6, 30, 'x'], [-4, 62, 'x'], [46, -30, 'z'], [-52, -40, 'x'], [62, -20, 'x'], [-14, -64, 'x'], [24, -72, 'x'], [-60, 0, 'z'], [70, 12, 'z'], [0, 84, 'x']]
    .forEach(([x, z, ax]) => barrier(x, z, ax));
  for (let i = 0; i < 60; i++) {
    const x = RR(-70, 80);
    const z = RR(-90, 88);
    if (!free(x, z, 1.5))
      continue;
    if (rnd() < .5)
      crate(x, z, rnd() < .3 ? 2 : 1, rnd() * 3);
    else {
      const g = groundH(x, z);
      solid(x, z, .35, .35, 1, null, null, false);
      put(new THREE.CylinderGeometry(.35, .35, 1, 10), rnd() < .5 ? orange : steel, x, g + .5, z);
    }
  }
  [[-16, -22], [18, -20], [-26, 46], [20, 30], [-2, 66], [62, 22], [-62, 4], [38, -40], [-40, -46], [0, -70]].forEach(([x, z]) => flood(x, z));

  // ---- Sniper perches (ai.js): the way up from the ground, then the spots ----
  addPerch([[14.5, -52.9], [-7, -52.9], [-10, -50.6], [-12.4, -48], [-12.4, -43]], [[-9, -40], [9, -38], [0, -35]]);
  addPerch([[50.5, 14.5], [50.5, -2.5], [50.5, -7], [53.5, -7]], [[58, -3], [60, -13]]);
  addPerch([[-21.5, 40], [-10.5, 40]], [[-7, 40.2]]);
  addPerch([[-44, 43.5], [-44, 52.8]], [[-49.2, 53.6], [-41, 54]]);
  addPerch([[-22, 31], [-40, 20], [-46, 19]], [[-52, 23], [-56, 16], [-48, 12]]);
  addPerch([[-44, -36.5], [-44, -48.5]], [[-44, -50]]);
  addPerch([[-44, -36.5], [-44, -48.5], [-44, -58.5], [-44, -61], [-31, -61]], [[-28, -61]]);
  addPerch([[26, -57], [26, -65]], [[24, -68], [28.5, -68.5]]);

  // ---- Steam and drifting dust ----
  const steamN = 50 * vents.length;
  const sgeo = new THREE.BufferGeometry();
  const sp = new Float32Array(steamN * 3);
  const sl = new Float32Array(steamN);
  for (let i = 0; i < steamN; i++) {
    const v = vents[i % vents.length];
    sp[i * 3] = v[0];
    sp[i * 3 + 1] = v[1] + R(0, 4);
    sp[i * 3 + 2] = v[2];
    sl[i] = R(0, 1);
  }
  sgeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  envG.add(new THREE.Points(sgeo, new THREE.PointsMaterial({ map: ctex('glow', 128, 128, 1, 1, DR.glow), color: 0xd8dde4, size: 1.1, transparent: true, opacity: .22, depthWrite: false })));
  const dgeo = new THREE.BufferGeometry();
  const dp = new Float32Array(900 * 3);
  for (let i = 0; i < 900; i++) {
    dp[i * 3] = R(-90, 90);
    dp[i * 3 + 1] = R(.5, 12);
    dp[i * 3 + 2] = R(-95, 95);
  }
  dgeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  envG.add(new THREE.Points(dgeo, new THREE.PointsMaterial({ color: 0xb8b0a0, size: .1, transparent: true, opacity: .6, depthWrite: false })));

  flush();

  envTick = dt => {
    spins.forEach(([o, ax, s]) => o.rotation[ax] += s * dt);
    lights.forEach((l, i) => l.visible = Math.floor(T * 1.6 + i * .5) % 2 === 0);
    sweeps.forEach(([h, ph, base]) => h.rotation.y = base + Math.sin(T * .35 + ph) * .9);
    crane.rotation.y = Math.sin(T * .12) * 1.1;
    ring.material.opacity = .25 + .2 * Math.sin(T * 3);
    // the pond shimmers
    pw.material.emissive.setHSL(.54, .55, .05 + .015 * Math.sin(T * 1.3));
    pw.material.opacity = .7 + .04 * Math.sin(T * .9);
    for (let i = 0; i < steamN; i++) {
      const v = vents[i % vents.length];
      sl[i] += dt * .35;
      if (sl[i] > 1)
        sl[i] = 0;
      sp[i * 3] = v[0] + Math.sin(i + T) * .4 * sl[i] + sl[i] * 1.5;
      sp[i * 3 + 1] = v[1] + sl[i] * 5;
      sp[i * 3 + 2] = v[2] + Math.cos(i * 1.3 + T) * .4 * sl[i];
    }
    sgeo.attributes.position.needsUpdate = true;
    for (let i = 0; i < 2700; i += 3) {
      dp[i] += 1.2 * dt;
      if (dp[i] > 90)
        dp[i] = -90;
    }
    dgeo.attributes.position.needsUpdate = true;
  };
}
