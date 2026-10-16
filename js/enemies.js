/*
 * enemies.js: Enemy models, spawning, damage and shared combat helpers.
 * Classic script (no modules): all files share one global scope, so load order in index.html matters.
 */

// Enemy models are built from shared, cached geometries and materials; only the main armor material is per-enemy,
// since it gets tinted and flashes. Models face +z with feet at y = 0; proportions keep head heights (headshots) and
// boss weak points (CRITS in data.js) in place.
const GC = {};
const MC = {};
const gcache = (k, f) => GC[k] || (GC[k] = f());
const mcache = (k, f) => MC[k] || (MC[k] = f());

// Shared Flood materials: pale flesh, rotting tissue, glowing pustules
// Flood materials: wet pink-tan flesh, red-brown veins and rot, pale infection-form skin, dark horn (claws, spines),
// pustules and gore
const floodMats = () => ({
  flesh: mcache('fflesh', () => surf(rimify(new THREE.MeshPhongMaterial({ color: 0xc8907a, emissive: 0x1a0a06, shininess: 45, specular: 0x6a4a40 }), .18), 'flesh', .025)),
  rot: mcache('frot', () => surf(rimify(new THREE.MeshPhongMaterial({ color: 0x7a3e30, shininess: 30, specular: 0x4a2a20 }), .15), 'flesh', .02)),
  pale: mcache('fpale', () => surf(rimify(new THREE.MeshPhongMaterial({ color: 0xe2c4a8, emissive: 0x140a04, shininess: 50, specular: 0x7a6050 }), .2), 'skin', .02)),
  horn: mcache('fhorn', () => new THREE.MeshPhongMaterial({ color: 0x2e221c, shininess: 70, specular: 0x8a7a70 })),
  pus: mcache('fpus', () => new THREE.MeshPhongMaterial({ color: 0xf0d890, emissive: 0x403010, shininess: 80 })),
  blood: mcache('fblood', () => new THREE.MeshPhongMaterial({ color: 0x8a1a14, emissive: 0x200000, shininess: 60 }))
});

// Skimmer thruster jets: a fast flicker
function flapWings(e) {
  const j = e.g.userData.jets;
  if (j)
    j.forEach((c, i) => c.scale.set(1, .85 + .3 * Math.abs(Math.sin(T * 37 + i * 1.7)), 1));
}

// CE-style surface detail for enemies: armour plating (panel seams, rivets, wear), mottled skin, veined Flood flesh.
// Each texture is both the colour map (light grey, so the material's colour still shows through) and a bump map, so
// the light catches the seams and folds.
const ETEX = {};
function etex(k) {
  if (ETEX[k])
    return ETEX[k];
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  let sd = k.length * 977 + 13;
  const rnd = () => (sd = sd * 16807 % 2147483647) / 2147483647;
  g.fillStyle = '#e4e4e4';
  g.fillRect(0, 0, 256, 256);
  if (k === 'armor') {
    for (let i = 0; i < 14; i++) {
      const x = rnd() * 256;
      const y = rnd() * 256;
      const w = 30 + rnd() * 90;
      const h = 20 + rnd() * 70;
      g.strokeStyle = 'rgba(40,40,50,.55)';
      g.lineWidth = 2;
      g.strokeRect(x, y, w, h);
      g.strokeStyle = 'rgba(255,255,255,.5)';
      g.lineWidth = 1;
      g.strokeRect(x + 1.5, y + 1.5, w, h);
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = 'rgba(60,60,70,.6)';
      g.beginPath();
      g.arc(rnd() * 256, rnd() * 256, 1.6, 0, 7);
      g.fill();
    }
    for (let i = 0; i < 60; i++) {
      g.strokeStyle = 'rgba(255,255,255,' + (.1 + rnd() * .2) + ')';
      g.lineWidth = .6;
      const x = rnd() * 256;
      const y = rnd() * 256;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + rnd() * 16 - 8, y + rnd() * 16 - 8);
      g.stroke();
    }
  }
  else if (k === 'skin') {
    for (let i = 0; i < 220; i++) {
      g.fillStyle = 'rgba(70,60,50,' + (.05 + rnd() * .12) + ')';
      g.beginPath();
      g.ellipse(rnd() * 256, rnd() * 256, 3 + rnd() * 12, 2 + rnd() * 8, rnd() * 3, 0, 7);
      g.fill();
    }
    for (let i = 0; i < 50; i++) {
      g.strokeStyle = 'rgba(60,50,40,.18)';
      g.lineWidth = 1;
      const x = rnd() * 256;
      const y = rnd() * 256;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + rnd() * 20 - 10, y + rnd() * 10, x + rnd() * 30 - 15, y + rnd() * 16 - 8);
      g.stroke();
    }
  }
  else {
    for (let i = 0; i < 160; i++) {
      const x = rnd() * 256;
      const y = rnd() * 256;
      const r = 3 + rnd() * 10;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,240,220,.35)');
      gr.addColorStop(1, 'rgba(255,240,220,0)');
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 26; i++) {
      let x = rnd() * 256;
      let y = rnd() * 256;
      g.strokeStyle = 'rgba(110,20,20,.45)';
      g.lineWidth = 1 + rnd() * 1.5;
      g.beginPath();
      g.moveTo(x, y);
      for (let j = 0; j < 12; j++) {
        x += rnd() * 16 - 8;
        y += rnd() * 16 - 8;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  speck(g, 256, 256, 1800, .12);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return ETEX[k] = t;
}
const surf = (m, k, bump) => {
  m.map = etex(k);
  m.bumpMap = etex(k);
  m.bumpScale = bump;
  return m;
};

// Stylized rim light for enemy materials: a cool glow along the edges of every shape as it turns away from you (in
// the spirit of Halo Infinite's crisp silhouettes). k = strength.
function rimify(m, k) {
  m.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <output_fragment>',
      'outgoingLight += vec3(.62, .78, 1.) * ' + k.toFixed(2) + ' * pow(1. - clamp(dot(normal, geometry.viewDir), 0., 1.), 2.6);\n#include <output_fragment>');
  };
  m.customProgramCacheKey = () => 'rim' + k.toFixed(2);
  return m;
}

// The low-poly look for a built model: whole spheres become faceted icosahedra, part-spheres, tubes, cones and rings
// drop to a handful of sides, and every lit material is flat-shaded. Swapped geometries are cached (models share
// them). `skip`: a part left as it is.
const LOWPOLY = {};
function lowPoly(g, skip) {
  const swap = geo => {
    const p = geo.parameters;
    if (!p)
      return geo;
    const k = geo.uuid;
    if (LOWPOLY[k])
      return LOWPOLY[k];
    let n = geo;
    if (geo.type === 'SphereGeometry')
      n = p.phiLength >= 6.28 && p.thetaLength >= 3.14
        ? new THREE.IcosahedronGeometry(p.radius, 1)
        : new THREE.SphereGeometry(p.radius, 8, 4, p.phiStart, p.phiLength, p.thetaStart, p.thetaLength);
    else if (geo.type === 'CylinderGeometry' && p.radialSegments > 8)
      n = new THREE.CylinderGeometry(p.radiusTop, p.radiusBottom, p.height, 8, 1, p.openEnded);
    else if (geo.type === 'ConeGeometry' && p.radialSegments > 6)
      n = new THREE.ConeGeometry(p.radius, p.height, 6, 1, p.openEnded);
    else if (geo.type === 'TorusGeometry' && (p.radialSegments > 4 || p.tubularSegments > 10))
      n = new THREE.TorusGeometry(p.radius, p.tube, 4, Math.min(p.tubularSegments, 10), p.arc);
    return LOWPOLY[k] = n;
  };
  const walk = o => {
    if (o === skip)
      return;
    if (o.isMesh) {
      o.geometry = swap(o.geometry);
      const m = o.material;
      if (m && !m.isMeshBasicMaterial && !m.flatShading) {
        m.flatShading = true;
        m.needsUpdate = true;
      }
    }
    o.children.forEach(walk);
  };
  walk(g);
}

function buildEnemy(t) {
  const g = new THREE.Group();
  // The group new parts go into: the model root, or a limb pivot while rig() runs
  let tg = g;
  // skin and flesh: soft, armour and metal: glossy; all with the rim light
  const L = c => mcache('l' + c, () => surf(rimify(new THREE.MeshPhongMaterial({ color: c, shininess: 12, specular: 0x222222 }), .3), 'skin', .015));
  const Ph = (c, s) => mcache('p' + c + s, () => { const m = surf(rimify(new THREE.MeshPhongMaterial({ color: c, shininess: s, specular: 0x777788 }), .35), 'armor', .01); return s >= 80 ? gfxShiny(m, .16) : m; });
  const glow = c => mcache('g' + c, () => new THREE.MeshBasicMaterial({ color: c }));
  // armour reflects the level (CE's chrome-shiny Covenant armour)
  const armor = c => gfxShiny(surf(rimify(new THREE.MeshPhongMaterial({ color: c, shininess: 60, specular: 0x6a6a78 }), .45), 'armor', .022), .2);
  const B = (w, h, d) => gcache('b' + [w, h, d], () => new THREE.BoxGeometry(w, h, d));
  const S = () => gcache('s2', () => new THREE.SphereGeometry(.5, 20, 14));
  const Hemi = () => gcache('h2', () => new THREE.SphereGeometry(.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2));
  const Cy = (a, b, h, n) => gcache('c' + [a, b, h, n], () => new THREE.CylinderGeometry(a, b, h, n || 10));
  const Co = (r, h, n) => gcache('k' + [r, h, n], () => new THREE.ConeGeometry(r, h, n || 8));
  const UC = gcache('uc', () => new THREE.CylinderGeometry(1, 1, 1, 8));
  const P3 = (geo, m, x, y, z, s, r) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    if (s)
      o.scale.set(s[0], s[1], s[2]);
    if (r)
      o.rotation.set(r[0], r[1], r[2]);
    tg.add(o);
    return o;
  };
  // rig: parts built inside fn hang from a pivot at (px, py, pz) (hip or shoulder) so they can swing;
  // fn still uses model coordinates (the inner group cancels the pivot offset)
  const rig = (px, py, pz, fn) => {
    const pv = new THREE.Group();
    const inner = new THREE.Group();
    pv.position.set(px, py, pz);
    inner.position.set(-px, -py, -pz);
    pv.add(inner);
    g.add(pv);
    const prev = tg;
    tg = inner;
    fn();
    tg = prev;
    return pv;
  };
  // ball: sphere with diameters sx, sy, sz; dome: half-sphere
  const ball = (m, x, y, z, sx, sy, sz, r) => P3(S(), m, x, y, z, [sx, sy == null ? sx : sy, sz == null ? sx : sz], r);
  const dome = (m, x, y, z, sx, sy, sz, r) => P3(Hemi(), m, x, y, z, [sx, sy, sz], r);
  const UP = new THREE.Vector3(0, 1, 0);
  // limb: tapered tube segments through the given points, with a rounded joint at each bend
  const limb = (pts, r, m) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = new THREE.Vector3(...pts[i]);
      const b = new THREE.Vector3(...pts[i + 1]);
      const d = b.clone().sub(a);
      const rr = r * (1 - i * .12);
      const o = new THREE.Mesh(UC, m);
      o.scale.set(rr, d.length(), rr);
      o.position.copy(a).addScaledVector(d, .5);
      o.quaternion.setFromUnitVectors(UP, d.normalize());
      tg.add(o);
      ball(m, b.x, b.y, b.z, rr * 2.1);
    }
  };
  // Low-poly building blocks: a flat-shaded material (k 'a' armour or 's' skin), a faceted ball, a six-sided tube
  // from a to b tapering r0 -> r1, and three claws from a point, pointing along (dx, dy, dz)
  const flat = (k, c, s) => mcache('gf' + k + c, () => surf(rimify(new THREE.MeshPhongMaterial({ color: c, shininess: s, specular: 0x333344, flatShading: true }), .3), k === 'a' ? 'armor' : 'skin', .015));
  const Ico = () => gcache('ico1', () => new THREE.IcosahedronGeometry(.5, 1));
  const gem = (m, x, y, z, sx, sy, sz, r) => P3(Ico(), m, x, y, z, [sx, sy == null ? sx : sy, sz == null ? sx : sz], r);
  const seg = (a, b, r0, r1, m) => {
    const A3 = new THREE.Vector3(...a);
    const d = new THREE.Vector3(...b).sub(A3);
    const o = new THREE.Mesh(gcache('t6' + r0 + ',' + r1, () => new THREE.CylinderGeometry(r1, r0, 1, 6)), m);
    o.scale.set(1, d.length(), 1);
    o.position.copy(A3).addScaledVector(d, .5);
    o.quaternion.setFromUnitVectors(UP, d.normalize());
    tg.add(o);
    return o;
  };
  const claws = (m, x, y, z, dx, dy, dz, len) => [-1, 0, 1].forEach(i => {
    const c = new THREE.Mesh(Co(.035, len, 4), m);
    c.position.set(x + i * .07, y, z);
    c.quaternion.setFromUnitVectors(UP, new THREE.Vector3(dx + i * .25, dy, dz).normalize());
    c.translateY(len / 2);
    tg.add(c);
  });
  let mat;
  let sw = null;
  let kg = null;
  let legs = null; // [left, right] hip pivots
  let arm = null; // free (non-weapon) arm's shoulder pivot
  // Variants reuse a base body: the Sword Elite carries an energy sword,
  // the suicide Grunt holds two lit plasma grenades.
  const sel = t === 'selite';
  const kam = t === 'kgrunt';
  // Jackal variants: the Sniper (beam rifle, no shield) and the Major (gold armour, orange shield)
  const jsn = t === 'jsniper';
  const jmj = t === 'jmajor';
  if (jsn || jmj)
    t = 'jackal';
  if (sel)
    t = 'elite';
  if (kam)
    t = 'grunt';
  const swordAt = (x, y, z, s) => {
    sw = new THREE.Group();
    sw.position.set(x, y, z);
    const m = makeSword();
    m.h.rotation.y = Math.PI;
    m.h.scale.setScalar(s);
    sw.add(m.h);
    sw.rotation.x = .2;
    g.add(sw);
  };
  if (t === 'grunt') {
    // Low-poly Halo CE Grunt, all flat-shaded facets: squat bowed legs on big clawed feet, long heavy arms hanging to
    // the knees, blue-grey scaly hide, a chunky armour vest with big shoulder pads and an emblem on the chest (orange
    // for minors, red for majors, CE's ranks), the head sunk low between the shoulders in a pointed hood with a tan face
    // and breather mask, and the pyramid methane tank peaking up behind it
    const gMaj = !kam && Math.random() < .25;
    mat = armor(gMaj ? 0xc8302a : 0xe8943a);
    mat.flatShading = true;
    if (gMaj)
      g.userData.rank = 1;
    const skin = flat('s', 0x56628a, 8);
    const hood = flat('s', 0x3a4564, 12);
    const face = flat('s', 0xc4a48e, 8);
    const bone = flat('s', 0xd8d0b4, 20);
    const grey = flat('a', 0x6e727a, 40);
    const dark = flat('a', 0x24262c, 30);
    const tankM = flat('a', 0x56668e, 70);
    const gl = glow(0x9fe8ff);
    // bowed legs: thick thigh out to the knee, shin down to a wide clawed foot
    legs = [-1, 1].map(s => rig(s * .2, .56, -.02, () => {
      seg([s * .2, .56, -.02], [s * .34, .3, .1], .12, .1, skin);
      gem(skin, s * .34, .3, .1, .2);
      seg([s * .34, .3, .1], [s * .3, .1, .02], .1, .08, skin);
      gem(skin, s * .3, .07, .07, .3, .13, .34);
      claws(bone, s * .3, .05, .2, 0, -.15, 1, .14);
      P3(Co(.03, .1, 4), bone, s * .3, .05, -.1, null, [-Math.PI / 2, 0, 0]);
    }));
    // belly under the vest, a dark loincloth belt
    gem(skin, 0, .74, .02, .66, .48, .54);
    P3(B(.5, .12, .38), dark, 0, .55, 0);
    P3(B(.2, .22, .04), dark, 0, .44, .17, null, [.15, 0, 0]);
    // the vest: a six-sided shell, a sloped chest plate with a seam and an emblem, big shoulder pads
    P3(Cy(.37, .31, .48, 6), mat, 0, 1.0, .02, [1, 1, .82], [.15, Math.PI / 6, 0]);
    P3(B(.52, .34, .08), mat, 0, 1.0, .3, null, [-.15, 0, 0]);
    P3(B(.03, .34, .02), dark, -.04, .99, .345, null, [-.15, 0, 0]);
    P3(Cy(.07, .07, .025, 8), grey, .13, 1.03, .345, null, [Math.PI / 2 - .15, 0, 0]);
    P3(Cy(.035, .035, .03, 5), dark, .13, 1.03, .35, null, [Math.PI / 2 - .15, 0, 0]);
    [-1, 1].forEach(s => {
      P3(B(.34, .17, .44), mat, s * .37, 1.17, 0, null, [0, 0, -s * .38]);
      P3(B(.3, .1, .38), mat, s * .45, 1.05, 0, null, [0, 0, -s * .7]);
      P3(B(.03, .03, .4), glow(0xffd24a), s * .5, 1.21, 0, null, [0, 0, -s * .38]);
    });
    // a grey collar, and the head sunk low in it: pointed hood, tan face, dark eyes, breather mask
    P3(Cy(.2, .25, .1, 6), grey, 0, 1.23, .08);
    gem(hood, 0, 1.38, .14, .42, .38, .44);
    P3(Co(.17, .38, 5), hood, 0, 1.6, .06, null, [-.45, 0, 0]);
    gem(face, 0, 1.33, .3, .32, .27, .22);
    [-1, 1].forEach(s => gem(Ph(0x101014, 120), s * .08, 1.38, .39, .08, .06, .05));
    P3(Cy(.08, .1, .12, 6), grey, 0, 1.29, .43, null, [Math.PI / 2, 0, 0]);
    P3(Cy(.05, .05, .02, 6), dark, 0, 1.29, .5, null, [Math.PI / 2, 0, 0]);
    P3(gcache('gmr', () => new THREE.TorusGeometry(.085, .015, 4, 6)), gl, 0, 1.29, .46);
    // the methane tank: a pyramid behind the head on a box pack, valves either side, a glowing band; hoses to the mask
    P3(B(.5, .42, .24), tankM, 0, 1.06, -.32);
    P3(Co(.3, .72, 4), tankM, 0, 1.46, -.34, null, [-.22, Math.PI / 4, 0]);
    P3(B(.46, .05, .05), gl, 0, .96, -.45);
    [-1, 1].forEach(s => {
      P3(Cy(.04, .05, .2, 6), grey, s * .2, 1.36, -.16);
      P3(Cy(.05, .05, .03, 6), dark, s * .2, 1.47, -.16);
      seg([s * .07, 1.27, .45], [s * .2, 1.2, .2], .022, .022, dark);
      seg([s * .2, 1.2, .2], [s * .18, 1.18, -.18], .022, .022, dark);
    });
    // long heavy arms: upper arm out from under the pad, a thicker forearm down to a clawed hand by the knee
    const armL = (s, el, wr) => {
      seg([s * .42, 1.08, .02], el, .08, .075, skin);
      gem(skin, ...el, .17);
      seg(el, wr, .085, .11, skin);
      gem(skin, wr[0], wr[1] - .04, wr[2] + .02, .16, .14, .17);
      // spurs on the back of the forearm
      P3(Co(.025, .1, 4), bone, (el[0] + wr[0]) / 2 + s * .07, (el[1] + wr[1]) / 2, (el[2] + wr[2]) / 2 - .02, null, [0, 0, -s * 1.2]);
    };
    if (kam) {
      // Arms raised, a lit plasma grenade in each hand
      [-1, 1].forEach(s => {
        armL(s, [s * .62, 1.12, .14], [s * .6, 1.34, .3]);
        claws(bone, s * .6, 1.4, .32, 0, 1, .3, .1);
      });
      kg = new THREE.Group();
      [-.6, .6].forEach(x => {
        const o = new THREE.Mesh(S(), glow(0x7fe0ff));
        o.scale.setScalar(.26);
        o.position.set(x, 1.46, .34);
        kg.add(o);
      });
      g.add(kg);
    }
    else {
      arm = rig(-.42, 1.08, .02, () => {
        armL(-1, [-.6, .78, .1], [-.56, .46, .24]);
        claws(bone, -.56, .38, .27, 0, -1, .4, .14);
      });
      armL(1, [.6, .78, .12], [.56, .48, .28]);
      claws(bone, .56, .4, .34, 0, -.6, 1, .1);
      // Plasma pistol in the right hand
      const pp = Ph(0x3f6b3a, 80);
      ball(pp, .56, .44, .4, .14, .14, .3);
      ball(glow(0x7dff6a), .56, .46, .54, .08);
      [-1, 1].forEach(s => P3(Co(.03, .16, 6), pp, .56 + s * .06, .44, .58, null, [Math.PI / 2, 0, -s * .2]));
      P3(gcache('ppc', () => new THREE.TorusGeometry(.075, .014, 6, 14)), glow(0x7dff6a), .56, .44, .46);
    }
  }
  else if (t === 'jackal') {
    // Low-poly Halo CE Jackal (Kig-Yar): a lean, hunched, bird-like body on backward-bending legs, a long beaked head
    // pushed forward on a thin neck with a crest of red quills and small glowing eyes, dark armour over the chest,
    // shoulders, thighs and shins; a round energy shield on the left wrist (blue, orange on Majors) and a Needler in
    // the right hand. Snipers carry a long beam rifle in both hands instead.
    mat = armor(0x4b4a6e);
    mat.flatShading = true;
    const skin = flat('s', 0xb89a6c, 10);
    const beak = flat('s', 0xd8c08a, 24);
    const quill = flat('s', 0x9a3a2a, 10);
    const dark = flat('a', 0x26262e, 30);
    const cloth = flat('s', 0x4a2440, 6);
    const trim = glow(jmj ? 0xffc070 : 0x9ff0ff);
    const sh = mcache(jmj ? 'jshM' : 'jsh', () => new THREE.MeshBasicMaterial({ color: jmj ? 0xffa040 : 0x6fe0ff, transparent: true, opacity: .35, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    legs = [-1, 1].map(s => rig(s * .13, .92, -.04, () => {
      seg([s * .13, .92, -.04], [s * .15, .6, .16], .075, .06, skin);
      gem(skin, s * .15, .6, .16, .12);
      seg([s * .15, .6, .16], [s * .14, .26, -.1], .06, .045, skin);
      seg([s * .14, .26, -.1], [s * .14, .06, .04], .045, .04, skin);
      gem(skin, s * .14, .05, .08, .12, .07, .26);
      claws(dark, s * .14, .04, .2, 0, -.1, 1, .1);
      P3(B(.13, .26, .1), mat, s * .15, .78, .08, null, [-.4, 0, 0]);
      P3(B(.1, .28, .07), mat, s * .15, .44, .06, null, [.65, 0, 0]);
    }));
    // pelvis and a hanging loincloth; the torso leans forward, armoured front and back
    gem(skin, 0, .95, -.02, .3, .2, .26);
    P3(B(.16, .28, .03), cloth, 0, .8, .13, null, [.12, 0, 0]);
    P3(B(.34, .08, .26), dark, 0, .96, 0);
    gem(skin, 0, 1.17, .04, .36, .5, .3, [.3, 0, 0]);
    P3(B(.38, .36, .12), mat, 0, 1.2, .16, null, [.3, 0, 0]);
    P3(B(.34, .34, .08), mat, 0, 1.18, -.1, null, [.3, 0, 0]);
    [-1, 1].forEach(s => {
      gem(mat, s * .2, 1.36, .07, .22, .14, .24, [0, 0, -s * .5]);
      P3(B(.03, .03, .2), trim, s * .17, 1.24, .22, null, [.3, 0, 0]);
    });
    // neck and the beaked head: snout and lower jaw, eyes, a fan of quills sweeping back, spines down the neck
    seg([0, 1.38, .1], [0, 1.57, .24], .05, .045, skin);
    gem(skin, 0, 1.66, .22, .26, .28, .34);
    P3(Co(.09, .34, 5), beak, 0, 1.63, .5, null, [Math.PI / 2, 0, 0]);
    P3(Co(.06, .24, 4), beak, 0, 1.56, .42, null, [Math.PI / 2 + .35, 0, 0]);
    [-1, 1].forEach(s => gem(glow(0xffb030), s * .09, 1.71, .34, .055));
    [[-.1, -.2], [-.05, -.05], [0, .05], [.05, -.05], [.1, -.2]].forEach(([x, k], i) => P3(Co(.03, .34 + k * .3, 4), quill, x, 1.8 + k * .1, .08 - Math.abs(x) * .3, null, [-.9 + k, 0, -x * 3]));
    for (let i = 0; i < 4; i++)
      P3(Co(.025, .2, 4), quill, 0, 1.46 - i * .1, -.12 - i * .03, null, [-1.2, 0, 0]);
    if (jsn) {
      // Sniper: both hands on a long beam rifle with a glowing muzzle and scope
      seg([-.2, 1.32, .04], [-.18, 1.12, .2], .045, .04, skin);
      seg([-.18, 1.12, .2], [.02, 1.2, .42], .04, .035, skin);
      seg([.2, 1.32, .04], [.26, 1.1, .12], .045, .04, skin);
      seg([.26, 1.1, .12], [.12, 1.16, .2], .04, .035, skin);
      const br = Ph(0x4a3a6a, 90);
      P3(B(.08, .1, 1.2), br, .06, 1.2, .5);
      P3(B(.05, .05, .3), br, .06, 1.28, .3);
      gem(glow(0xff4f8f), .06, 1.2, 1.12, .08);
      P3(B(.03, .03, .5), glow(0xff8fbf), .06, 1.26, .7);
    }
    else {
      // Left arm: wrist gauntlet projecting the round energy shield
      seg([-.2, 1.32, .04], [-.34, 1.12, .12], .045, .04, skin);
      seg([-.34, 1.12, .12], [-.4, 1.15, .24], .04, .035, skin);
      P3(Cy(.07, .07, .14, 6), dark, -.42, 1.17, .26, null, [Math.PI / 2, 0, 0]);
      P3(Cy(.55, .55, .02, 10), sh, -.5, 1.2, .32, null, [Math.PI / 2, 0, 0]);
      P3(gcache('jt10', () => new THREE.TorusGeometry(.55, .025, 4, 10)), trim, -.5, 1.2, .32, null, [0, 0, Math.PI / 10]);
      // Right arm: Needler with glowing needles
      seg([.2, 1.32, .04], [.32, 1.08, .1], .045, .04, skin);
      seg([.32, 1.08, .1], [.34, .98, .28], .04, .035, skin);
      const nd = Ph(0xc0408a, 90);
      P3(B(.09, .12, .36), nd, .34, .95, .4);
      gem(nd, .34, .93, .22, .12, .14, .12);
      [-.035, 0, .035].forEach(x => P3(Co(.02, .15, 4), glow(0xff7be0), .34 + x, 1.07, .4 + x * .5, null, [-.3, 0, 0]));
      [-.02, .02].forEach(x => P3(Co(.018, .12, 4), glow(0xff7be0), .34 + x, 1.05, .28, null, [-.4, 0, 0]));
      P3(Co(.04, .1, 5), nd, .34, .95, .62, null, [Math.PI / 2, 0, 0]);
    }
  }
  else if (t === 'elite') {
    // Low-poly Halo CE Elite (Sangheili): tall and hunched on backward-bending armoured legs, a six-sided chest shell
    // with a metal plate and glowing trim, big rounded pauldrons, a power pack on the back, a long swept-back helmet
    // with a crest over a head with four split mandibles and orange eyes; blue minors, red majors (CE ranks). Plasma
    // rifle in the right hand (the Sword Elite carries an energy sword instead).
    const eMaj = !sel && Math.random() < .3;
    mat = armor(eMaj ? 0xb8302c : 0x3b5bd6);
    mat.flatShading = true;
    if (eMaj)
      g.userData.rank = 1;
    const skin = flat('s', 0x3a3442, 10);
    const metal = flat('a', 0x9aa3b5, 80);
    const dark = flat('a', 0x22202a, 40);
    const bone = flat('s', 0xe0d8c4, 30);
    const trim = glow(0x7fe8ff);
    legs = [-1, 1].map(s => rig(s * .2, 1.0, -.02, () => {
      seg([s * .2, 1.0, -.02], [s * .25, .62, .2], .1, .085, skin);
      gem(skin, s * .25, .62, .2, .17);
      seg([s * .25, .62, .2], [s * .22, .26, -.1], .08, .06, skin);
      seg([s * .22, .26, -.1], [s * .22, .06, .06], .055, .05, skin);
      P3(B(.22, .36, .22), mat, s * .23, .84, .08, null, [-.45, 0, 0]);
      P3(B(.17, .4, .14), mat, s * .24, .44, .07, null, [.6, 0, 0]);
      P3(Co(.06, .2, 4), mat, s * .25, .66, .33, null, [1.2, 0, 0]);
      P3(B(.16, .07, .3), dark, s * .22, .04, .12);
      claws(dark, s * .22, .04, .26, 0, -.1, 1, .12);
      P3(Co(.03, .12, 4), dark, s * .22, .08, -.1, null, [-2.2, 0, 0]);
    }));
    // pelvis, belt and plated tassets front and back
    gem(skin, 0, 1.02, 0, .5, .36, .36);
    P3(B(.62, .08, .44), dark, 0, 1.02, .02);
    [-1, 1].forEach(s => {
      P3(B(.24, .32, .06), mat, s * .19, .86, .2, null, [.2, 0, s * .12]);
      P3(B(.2, .02, .02), trim, s * .19, .99, .23, null, [.2, 0, s * .12]);
      P3(B(.22, .3, .06), mat, s * .19, .88, -.2, null, [-.2, 0, -s * .12]);
    });
    // the chest: a hexagonal shell leaning forward, a metal plate, a chest gem, glowing trim
    P3(Cy(.42, .32, .56, 6), mat, 0, 1.32, .04, [1, 1, .72], [.2, Math.PI / 6, 0]);
    P3(B(.5, .3, .1), metal, 0, 1.36, .28, null, [.2, 0, 0]);
    P3(B(.6, .025, .025), trim, 0, 1.55, .25);
    P3(B(.025, .3, .025), trim, 0, 1.34, .34, null, [.2, 0, 0]);
    gem(trim, 0, 1.37, .35, .09, .09, .05);
    // the back power pack (the back weak point sits on it), with pipes and vents
    P3(B(.46, .5, .2), dark, 0, 1.24, -.26);
    [-1, 1].forEach(s => P3(Cy(.05, .05, .5, 6), metal, s * .17, 1.24, -.34));
    [1.14, 1.3].forEach(y => P3(B(.3, .03, .02), trim, 0, y, -.37));
    // big rounded pauldrons
    [-1, 1].forEach(s => {
      gem(mat, s * .5, 1.5, 0, .48, .34, .58, [0, 0, -s * .4]);
      P3(B(.025, .025, .34), trim, s * .55, 1.63, .06, null, [0, 0, -s * .4]);
    });
    // neck and head: the long helmet swept back to a point, a crest, orange eyes, four mandibles with teeth
    seg([0, 1.5, .04], [0, 1.66, .1], .09, .08, skin);
    gem(skin, 0, 1.75, .08, .44, .5, .6);
    gem(mat, 0, 1.83, .0, .5, .4, .72, [-.25, 0, 0]);
    P3(Co(.13, .34, 4), mat, 0, 1.9, -.38, null, [-Math.PI / 2 - .35, Math.PI / 4, 0]);
    P3(B(.05, .1, .44), metal, 0, 2.0, -.06, null, [-.3, 0, 0]);
    [-1, 1].forEach(s => {
      P3(B(.03, .14, .3), mat, s * .25, 1.9, -.08, null, [-.3, 0, s * .25]);
      gem(glow(0xffb040), s * .11, 1.8, .31, .06);
      seg([s * .07, 1.66, .3], [s * .1, 1.47, .4], .035, .02, skin);
      seg([s * .15, 1.7, .26], [s * .22, 1.52, .34], .035, .02, skin);
      [0, 1].forEach(i => P3(Co(.015, .06, 4), bone, s * (.1 + i * .1), 1.5 + i * .04, .4 - i * .05, null, [Math.PI, 0, 0]));
    });
    // arms: upper arm, an armoured forearm with a glowing strip, a hand
    [-1, 1].forEach(s => {
      const f = () => {
        seg([s * .5, 1.42, 0], [s * .62, 1.1, .12], .08, .075, skin);
        gem(skin, s * .62, 1.1, .12, .15);
        seg([s * .62, 1.1, .12], [s * .58, .98, .36], .075, .065, skin);
        P3(B(.15, .15, .3), mat, s * .6, 1.04, .24, null, [.4, 0, 0]);
        P3(B(.02, .02, .26), trim, s * .68, 1.07, .24, null, [.4, 0, 0]);
        gem(skin, s * .58, .97, .41, .12);
      };
      // Left arm swings; the right arm holds the weapon steady
      if (s < 0)
        arm = rig(-.5, 1.42, 0, f);
      else
        f();
    });
    if (sel)
      swordAt(.58, 1, .3, .75);
    else {
      // Two-pronged plasma rifle
      const gun = Ph(0x5a6070, 90);
      [-1, 1].forEach(k => {
        gem(gun, .58 + k * .055, .98, .5, .08, .12, .46);
        P3(Co(.035, .16, 5), gun, .58 + k * .06, .98, .76, null, [Math.PI / 2, 0, -k * .2]);
      });
      gem(glow(0xff7be0), .58, .98, .72, .07);
      P3(B(.015, .015, .3), glow(0xff7be0), .58, 1.05, .5);
      P3(B(.04, .12, .06), dark, .58, .9, .4);
    }
  }
  else if (t === 'skimmer') {
    // Skimmer: a hunched, thin-limbed flyer in red armour (chest, shoulders, crested helmet with a beaked visor and
    // glowing eyes), carried by two big thruster pods on its back that fire purple jets downward, holding a long
    // heavy rifle in both hands, legs and claws dangling. The jets (g.userData.jets) flicker in flapWings().
    mat = armor(0x8a2a2a);
    const skin = Ph(0x2e3440, 40);
    const dark = Ph(0x23272e, 70);
    const metal = Ph(0x4a5058, 90);
    const red = Ph(0xa83232, 60);
    const jetM = mcache('skJet', () => new THREE.MeshBasicMaterial({ color: 0xb478ff, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false }));
    const ventM = glow(0xd2a8ff);
    // body: pelvis, torso leaning forward, armour plates
    ball(skin, 0, .95, -.05, .3, .26, .26);
    ball(skin, 0, 1.3, .05, .42, .55, .36, [.35, 0, 0]);
    P3(B(.46, .42, .16), mat, 0, 1.32, .22, null, [.35, 0, 0]);
    P3(B(.34, .16, .12), mat, 0, 1.05, .17, null, [.2, 0, 0]);
    P3(B(.06, .3, .02), glow(0xffc040), 0, 1.3, .31, null, [.35, 0, 0]);
    [-1, 1].forEach(s => dome(mat, s * .27, 1.5, .08, .24, .18, .28, [0, 0, -s * .5]));
    // neck and helmeted head
    limb([[0, 1.55, .12], [0, 1.66, .32]], .06, skin);
    ball(skin, 0, 1.7, .4, .24, .24, .3);
    dome(mat, 0, 1.74, .38, .3, .24, .44, [-.2, 0, 0]);
    P3(B(.03, .2, .3), mat, 0, 1.9, .3, null, [-.4, 0, 0]);
    P3(Co(.09, .3, 4), dark, 0, 1.66, .62, null, [Math.PI / 2, 0, 0]);
    [-1, 1].forEach(s => ball(glow(0xffc040), s * .08, 1.74, .55, .06));
    // thruster pods on struts, angled out like wings, purple jets underneath
    g.userData.jets = [];
    [-1, 1].forEach(s => {
      limb([[s * .12, 1.45, -.15], [s * .52, 1.82, -.32]], .055, dark);
      const pv = rig(s * .78, 1.88, -.32, () => {
        const x = s * .78;
        P3(B(.34, .26, .9), mat, x, 1.88, -.32);
        dome(mat, x, 1.88, .13, .34, .26, .36, [Math.PI / 2, 0, 0]);
        P3(B(.36, .06, .92), dark, x, 1.98, -.32);
        P3(B(.05, .26, .4), mat, x, 2.09, -.55, null, [-.5, 0, 0]);
        P3(B(.1, .06, .1), glow(0xffc040), x + s * .175, 1.91, -.18);
        P3(B(.28, .14, .42), metal, x, 1.7, -.42);
        P3(B(.24, .03, .36), ventM, x, 1.62, -.42);
        const jet = P3(Co(.11, .55, 8), jetM, x, 1.33, -.42, null, [Math.PI, 0, 0]);
        g.userData.jets.push(jet);
      });
      pv.rotation.set(-.15, s * .5, -s * .3);
      pv.scale.setScalar(1.4);
    });
    // long arms holding a heavy rifle across the front
    limb([[-.28, 1.45, .1], [-.36, 1.1, .3], [-.18, .95, .52]], .05, skin);
    limb([[.28, 1.45, .1], [.34, 1.05, .25], [.1, .92, .32]], .05, skin);
    const rifle = [[.12, .15, 1.15, .02, .9, .55, metal], [.13, .05, .9, .02, .82, .55, red], [.05, .2, .06, .02, .78, .2, dark], [.09, .09, .22, .02, 1.0, .35, dark]];
    rifle.forEach(([w, h, d, x, y, z, m]) => P3(B(w, h, d), m, x, y, z, null, [0, -.2, 0]));
    [.5, .62, .74, .86].forEach(z => P3(gcache('skc', () => new THREE.TorusGeometry(.07, .015, 6, 12)), dark, .02 + (z - .55) * -.2, .9, z));
    ball(glow(0xb478ff), -.1, .9, 1.12, .09);
    // dangling legs with claws
    [-1, 1].forEach(s => {
      limb([[s * .12, .95, -.05], [s * .2, .65, .12], [s * .15, .35, -.05], [s * .12, .15, .1]], .045, skin);
      [-.05, .05].forEach(o => P3(Co(.02, .14, 4), dark, s * .12 + o, .06, .14, null, [1.2, 0, 0]));
    });
  }
  else if (t === 'fcomb') {
    // Flood combat form: a hunched, broken host (a Marine in green armour, or now and then an Elite in red), the
    // infection form that took it bulging out of its chest with tendrils spilling out, its head lolled to one side
    // under a growth, tumours over the shoulder and back, one arm turned into a long ropy whip with bone claws (it
    // swings: arm)
    const F = floodMats();
    const el = Math.random() < .3;
    mat = armor(el ? 0x9a2a28 : 0x4e5a38);
    const suit = Ph(el ? 0x3a2a30 : 0x2e3428, 30);
    legs = [-1, 1].map(s => rig(s * .17, .92, 0, () => {
      limb([[s * .17, .92, 0], [s * .21, .52, .12], [s * .19, .08, -.02]], .085, suit);
      P3(B(.17, .32, .17), mat, s * .2, .7, .07, null, [.15, 0, 0]);
      P3(B(.15, .3, .15), mat, s * .2, .3, .06, null, [-.1, 0, 0]);
      P3(B(.17, .1, .3), Ph(0x1e1e1c, 20), s * .19, .05, .06);
      if (s > 0)
        ball(F.flesh, s * .22, .55, .12, .18, .22, .16);
    }));
    P3(B(.46, .2, .3), mat, 0, .98, 0);
    // hunched torso: armour plates over a body swollen with flesh
    ball(suit, 0, 1.28, .08, .56, .56, .42, [.45, 0, 0]);
    P3(B(.5, .42, .14), mat, 0, 1.3, .27, null, [.45, 0, 0]);
    P3(B(.5, .4, .16), mat, 0, 1.36, -.14, null, [.5, 0, 0]);
    [-1, 1].forEach(s => P3(B(.22, .14, .28), mat, s * .3, 1.55, .08, null, [.3, 0, s * .4]));
    // the infection form bursting from the chest, tendrils spilling out
    ball(F.pale, -.06, 1.22, .36, .26, .24, .22);
    ball(F.flesh, .08, 1.35, .33, .2, .18, .16);
    for (let i = 0; i < 5; i++) {
      const a = -1 + i * .5;
      limb([[-.06, 1.2, .42], [-.06 + Math.sin(a) * .15, 1.08, .55], [-.06 + Math.sin(a) * .25, .92, .52]], .018, F.rot);
    }
    // tumours on the shoulder and back
    ball(F.flesh, .24, 1.62, -.05, .38, .34, .36);
    ball(F.pale, .32, 1.72, .02, .2, .2, .2);
    ball(F.flesh, .1, 1.45, -.3, .34, .32, .3);
    ball(F.pus, .14, 1.5, -.42, .12);
    // the head, lolled to one side under a flesh growth
    limb([[0, 1.58, .14], [-.1, 1.66, .3]], .06, F.flesh);
    if (el) {
      dome(mat, -.14, 1.66, .34, .34, .3, .46, [-.3, 0, .6]);
      [-1, 1].forEach(s => P3(B(.03, .14, .03), suit, -.14 + s * .07, 1.56, .5, null, [.4, 0, s * .3]));
    }
    else {
      dome(mat, -.14, 1.68, .32, .36, .32, .38, [-.2, 0, .6]);
      P3(B(.22, .06, .04), Ph(0xd8a040, 80), -.12, 1.62, .5, null, [0, 0, .6]);
    }
    ball(F.flesh, 0, 1.68, .42, .2, .16, .16);
    // the whip arm: long, ropy and segmented, three bone claws at the end
    arm = rig(-.34, 1.48, .05, () => {
      limb([[-.34, 1.48, .05], [-.52, 1.2, .2], [-.62, .9, .42], [-.6, .62, .62], [-.52, .42, .78]], .07, F.flesh);
      [-1, 0, 1].forEach(k => P3(Co(.035, .26, 5), F.horn, -.52 + k * .05, .32, .86, null, [2.2, 0, k * .3]));
      ball(F.rot, -.6, .9, .42, .12);
    });
    // the other arm, still armoured, hanging limp
    limb([[.34, 1.48, .05], [.46, 1.15, .18], [.5, .88, .3]], .075, suit);
    P3(B(.13, .22, .13), mat, .45, 1.15, .18, null, [.3, 0, 0]);
    ball(F.flesh, .5, .84, .32, .13);
  }
  else if (t === 'finf') {
    // Flood infection form: a pale, veined, wrinkled bulb on a ring of thin jointed legs that arch up and out, wiry
    // tendrils on top and a pair of feelers in front
    const F = floodMats();
    mat = armor(0xe2c4a8);
    ball(mat, 0, .72, 0, .62, .52, .6);
    [[.14, .78, -.08, .3], [-.14, .76, -.06, .28], [0, .86, .1, .26], [0, .66, -.16, .26]].forEach(([x, y, z, s]) => ball(mat, x, y, z, s));
    ball(F.rot, 0, .52, 0, .48, .2, .46);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * 6.28;
      limb([[Math.cos(a) * .12, .9, Math.sin(a) * .1], [Math.cos(a) * .26, .8, Math.sin(a) * .24], [Math.cos(a) * .3, .6, Math.sin(a) * .28]], .012, F.rot);
    }
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * 6.28 + .3;
      const c = Math.cos(a);
      const s = Math.sin(a);
      limb([[c * .16, .55, s * .16], [c * .42, .72, s * .42], [c * .62, .38, s * .62], [c * .72, 0, s * .72]], .028, F.flesh);
    }
    for (let i = 0; i < 6; i++) {
      const a = R(0, 6.28);
      limb([[Math.cos(a) * .1, .95, Math.sin(a) * .1], [Math.cos(a) * .2 + R(-.05, .05), 1.15, Math.sin(a) * .2], [Math.cos(a) * .26, 1.3, Math.sin(a) * .26]], .012, F.rot);
    }
    [-1, 1].forEach(s => limb([[s * .06, .7, .26], [s * .12, .66, .44], [s * .1, .56, .56]], .018, F.pale));
    ball(glow(0xffe0a0), 0, .74, .3, .05);
  }
  else if (t === 'fcarr') {
    // Flood carrier form: a bloated, lumpy sac of flesh on stubby legs, ridged with veins and pale pustules, two
    // little dangling arms and a vestigial head; it pulses (g.userData.pulse) and bursts into infection forms
    const F = floodMats();
    mat = armor(0xd09a7c);
    legs = [-1, 1].map(s => rig(s * .24, .5, 0, () => {
      limb([[s * .24, .5, 0], [s * .32, .26, .1], [s * .28, .03, 0]], .1, F.rot);
      P3(Co(.04, .14, 4), F.horn, s * .28, .03, .14, null, [1.6, 0, 0]);
    }));
    ball(mat, 0, 1.25, 0, 1.12, 1.2, 1.02);
    [[.32, 1.5, .2, .55], [-.3, 1.55, .15, .5], [.05, 1.75, -.1, .55], [.2, .95, .3, .48], [-.25, 1.0, .28, .46], [0, 1.3, -.4, .6]].forEach(([x, y, z, s], i) => ball(i % 2 ? mat : F.flesh, x, y, z, s));
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * 6.28;
      limb([[Math.cos(a) * .3, 1.9, Math.sin(a) * .3], [Math.cos(a) * .55, 1.5, Math.sin(a) * .5], [Math.cos(a) * .58, 1.0, Math.sin(a) * .52]], .022, F.rot);
    }
    for (let i = 0; i < 9; i++)
      ball(F.pus, R(-.45, .45), R(.85, 1.75), R(-.3, .5), R(.08, .16));
    [-1, 1].forEach(s => {
      limb([[s * .32, 1.1, .4], [s * .38, .85, .5], [s * .34, .66, .52]], .04, F.flesh);
      [-.03, .03].forEach(o => P3(Co(.015, .1, 4), F.horn, s * .34 + o, .58, .53, null, [Math.PI, 0, 0]));
    });
    limb([[0, 1.82, .3], [0, 1.96, .46]], .07, F.flesh);
    ball(F.pale, 0, 1.98, .5, .2, .16, .2);
    g.userData.pulse = true;
  }
  else if (t === 'gravemind') {
    // Proto-Gravemind: a towering mound of Flood biomass rooted to the floor, a huge folded, cratered head with a
    // gaping maw ringed with teeth and strung with gore, and two great segmented tentacles arching overhead, each
    // ending in a dark horn claw
    mat = armor(0xb07c68);
    const F = floodMats();
    ball(mat, 0, .9, 0, 2.0, 1.3, 1.8);
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * 6.28;
      const c = Math.cos(a);
      const s = Math.sin(a);
      limb([[c * .8, .5, s * .7], [c * 1.3, .25, s * 1.2], [c * 1.7, .02, s * 1.55]], .14, F.rot);
    }
    ball(mat, 0, 2.15, .15, 1.7, 1.5, 1.55);
    [[.5, 2.6, .2, .7], [-.5, 2.55, .25, .7], [0, 2.85, -.1, .8], [.6, 1.9, .5, .55], [-.6, 1.9, .5, .55], [0, 2.3, -.5, .9]].forEach(([x, y, z, s], i) => ball(i % 2 ? mat : F.flesh, x, y, z, s));
    [[.3, 2.9, .45], [-.35, 2.75, .55], [.62, 2.3, .55], [-.6, 2.4, .5]].forEach(([x, y, z]) => ball(F.rot, x, y, z, .16, .12, .1));
    ball(F.blood, 0, 1.85, .8, .7, .5, .3);
    ball(Ph(0x1a0604, 10), 0, 1.85, .88, .5, .34, .18);
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * 6.28;
      P3(Co(.04, .18, 4), Ph(0xe8dcc0, 40), Math.cos(a) * .3, 1.85 + Math.sin(a) * .18, .95, null, [Math.PI / 2 + Math.sin(a) * .7, 0, -Math.cos(a) * .5]);
    }
    for (let i = 0; i < 7; i++)
      limb([[R(-.25, .25), 1.72, .92], [R(-.3, .3), 1.45, .98], [R(-.3, .3), 1.2, .95]], .02, F.blood);
    [-1, 1].forEach(s => {
      limb([[s * .8, 2.0, -.3], [s * 1.5, 2.9, -.7], [s * 1.9, 3.8, -.3], [s * 1.8, 4.4, .5], [s * 1.4, 4.5, 1.2]], .26, F.flesh);
      [[s * 1.15, 2.45, -.5], [s * 1.7, 3.35, -.5], [s * 1.85, 4.1, .1], [s * 1.6, 4.45, .85]].forEach(p => P3(gcache('gmr', () => new THREE.TorusGeometry(.2, .05, 6, 12)), F.rot, p[0], p[1], p[2], null, [Math.PI / 2, 0, s * .5]));
      P3(Co(.13, .7, 7), F.horn, s * 1.25, 4.4, 1.55, null, [2.3, 0, -s * .2]);
    });
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * 6.28 + .8;
      const c = Math.cos(a);
      const s = Math.sin(a);
      limb([[c * .9, 1.2, s * .8], [c * 1.5, 1.6, s * 1.3], [c * 1.8, 1.3, s * 1.6], [c * 1.9, .7, s * 1.7]], .1, F.flesh);
    }
    for (let i = 0; i < 12; i++)
      ball(F.pus, R(-.9, .9), R(.5, 2.7), R(-.6, .9), R(.1, .22));
  }
  else if (t === 'ftank') {
    // Flood tank (the Abomination): a hulking pure form, a heaving mass of flesh on thick legs, a huge club arm
    // dragging bone claws along the ground, a smaller whip arm (it swings: arm), plates and spikes down its back
    mat = armor(0xb4806a);
    const F = floodMats();
    legs = [-1, 1].map(s => rig(s * .3, .85, 0, () => {
      limb([[s * .3, .85, 0], [s * .38, .45, .16], [s * .34, .06, 0]], .15, F.flesh);
      [-.07, .07].forEach(o => P3(Co(.04, .16, 4), F.horn, s * .34 + o, .04, .18, null, [1.5, 0, 0]));
    }));
    ball(mat, 0, 1.45, 0, 1.15, 1.1, .95, [.35, 0, 0]);
    ball(F.flesh, .15, 1.75, -.2, .8, .7, .7);
    ball(mat, -.1, 1.15, .2, .7, .6, .6);
    [[.35, 1.6, .3, .3], [-.3, 1.5, .35, .26], [.2, 1.95, .1, .28]].forEach(([x, y, z, s]) => ball(F.pale, x, y, z, s));
    ball(F.flesh, 0, 1.85, .42, .32, .28, .3);
    ball(F.blood, 0, 1.78, .55, .14, .08, .06);
    for (let i = 0; i < 6; i++)
      P3(Co(.08, .4 - i * .03, 5), F.horn, i % 2 ? .18 : -.18, 2.0 - i * .12, -.4 - i * .05, null, [-1, 0, i % 2 ? -.4 : .4]);
    P3(B(.6, .08, .4), F.horn, 0, 2.05, -.25, null, [-.5, 0, 0]);
    limb([[.55, 1.75, .05], [.8, 1.25, .25], [.85, .7, .45], [.75, .25, .5]], .2, F.flesh);
    ball(F.flesh, .75, .22, .52, .36, .3, .36);
    [-1, 0, 1].forEach(k => P3(Co(.06, .32, 5), F.horn, .75 + k * .1, .12, .74, null, [1.8, 0, k * .3]));
    arm = rig(-.55, 1.7, .05, () => {
      limb([[-.55, 1.7, .05], [-.75, 1.35, .25], [-.82, 1.0, .5], [-.75, .7, .75]], .1, F.flesh);
      [-1, 0, 1].forEach(k => P3(Co(.045, .3, 5), F.horn, -.75 + k * .06, .6, .85, null, [2.2, 0, k * .3]));
    });
  }  else if (t === 'ghost') {
    // Ghost: the Covenant hover bike (the model is in ghost.js), in Covenant purple
    mat = armor(0x5a3a8a);
    g.add(ghostMesh(mat));
  }
  else {
    // Low-poly Halo CE Hunter (Mgalekgolo): a huge hunched shell of dark blue armour plates, the orange worm colony
    // showing through at the neck, the belly, the back and behind the knees, a small head sunk low and forward with a
    // hot visor slit, a fan of spines down its back, thick armoured legs, a great slab of a shield with spiked edges on
    // the left arm and the fuel-rod cannon, wrapped in worm coils, on the right
    mat = armor(0x2c3a70);
    mat.flatShading = true;
    const worm = mcache('worm', () => new THREE.MeshPhongMaterial({ color: 0xd8762a, emissive: 0x4a1800, shininess: 30, flatShading: true }));
    const dark = flat('a', 0x22252c, 50);
    const shM = flat('a', 0x6a7488, 80);
    legs = [-1, 1].map(s => rig(s * .34, .9, 0, () => {
      P3(Cy(.26, .2, .5, 6), mat, s * .33, .66, 0);
      gem(mat, s * .34, .43, .06, .38, .3, .38);
      gem(worm, s * .34, .5, -.12, .16);
      P3(Cy(.2, .28, .42, 6), mat, s * .34, .22, .04);
      P3(B(.44, .1, .58), dark, s * .34, .04, .1);
      claws(dark, s * .34, .05, .38, 0, -.1, 1, .14);
    }));
    // the hunched shell, worms in the belly between the chest plates (the front weak point sits among them) and on
    // the back
    gem(mat, 0, 1.12, -.08, 1.2, 1.1, 1.1, [-.35, 0, 0]);
    for (let i = 0; i < 8; i++)
      gem(worm, R(-.1, .1), R(.95, 1.35), R(.34, .42), R(.13, .19));
    for (let i = 0; i < 5; i++)
      gem(worm, R(-.1, .1), 1.15 + R(-.15, .15), -.6, R(.14, .18));
    [-1, 1].forEach(s => {
      P3(B(.5, .44, .12), mat, s * .22, 1.18, .36, null, [.25, s * .3, 0]);
      P3(B(.03, .3, .03), glow(0xff9a40), s * .3, 1.2, .43, null, [.25, s * .3, 0]);
      gem(mat, s * .58, 1.45, -.02, .66, .48, .74, [0, 0, -s * .5]);
    });
    // the head, low and forward, worms showing at the neck, a visor slit and spines over it
    gem(worm, 0, 1.48, .2, .3, .2, .26);
    gem(mat, 0, 1.6, .32, .36, .3, .38);
    P3(B(.26, .05, .06), glow(0xffa040), 0, 1.62, .5);
    [-.24, -.12, 0, .12, .24].forEach(x => P3(Co(.045, .3, 4), dark, x, 1.78 - Math.abs(x) * .6, .18, null, [-.5, 0, -x * 2.2]));
    // a fan of spines down the back
    for (let i = 0; i < 7; i++)
      P3(Co(.08, .5 - i * .04, 4), dark, i % 2 ? .14 : -.14, 1.78 - i * .1, -.42 - i * .05, null, [-.9 - i * .05, 0, i % 2 ? -.3 : .3]);
    // Shield arm: a great slab with a centre ridge, a glowing strip and spiked edges
    seg([-.5, 1.3, 0], [-.78, 1.14, .3], .14, .12, mat);
    P3(B(1.1, 1.55, .14), shM, -.88, 1.08, .38, null, [0, .12, 0]);
    P3(B(.16, 1.4, .06), dark, -.88, 1.08, .47, null, [0, .12, 0]);
    P3(B(.06, 1.2, .1), glow(0x4fa8ff), -.88, 1.08, .5, null, [0, .12, 0]);
    [-.6, -.2, .2, .6].forEach(y => P3(Co(.07, .32, 4), dark, -1.46, 1.08 + y, .3, null, [0, 0, Math.PI / 2]));
    [-.45, 0, .45].forEach(x => P3(Co(.06, .26, 4), dark, -.88 + x, 1.9, .38));
    // Cannon arm: fuel-rod cannon wrapped in worm coils, a green glow at the muzzle
    seg([.5, 1.3, 0], [.72, 1.14, .2], .14, .12, mat);
    P3(Cy(.22, .26, 1, 6), dark, .76, 1.1, .6, null, [Math.PI / 2, 0, 0]);
    [.35, .6, .85].forEach(z => P3(gcache('ht6', () => new THREE.TorusGeometry(.25, .05, 4, 6)), worm, .76, 1.1, z));
    gem(glow(0x7dff6a), .76, 1.1, 1.1, .26);
    P3(B(.3, .04, .04), glow(0xffd060), 0, 1.65, .5);
  }
  // every enemy is low-poly: smooth shapes swapped for faceted ones, every surface flat-shaded (not the Ghost, whose
  // model the drivable one shares, or the energy sword, which is the one you can pick up)
  if (t !== 'ghost')
    lowPoly(g, sw);
  const aura = new THREE.Mesh(new THREE.SphereGeometry(1.05, 14, 10), new THREE.MeshBasicMaterial({ color: 0x78dcff, transparent: true, opacity: .2 }));
  aura.position.y = 1.05;
  g.add(aura);
  return { g, mat, aura, sw, kg, legs, arm };
}

// px, pz: optional fixed position (boss summons); otherwise a random spot at least 14m from the player.
function spawn(t, px, pz) {
  const d = ET[t];
  let x = px;
  let z = pz;
  if (px == null)
    do {
      const a = R(0, 6.28);
      const r = R(.64 * A, .9 * A);
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
    } while (Math.hypot(x - P.x, z - P.z) < .64 * A);
  const { g, mat, aura, sw, kg, legs, arm } = buildEnemy(d.model || t);
  if (d.tint)
    mat.color.setHex(d.tint);
  g.scale.setScalar(d.sc);
  g.rotation.order = 'YXZ'; // so a forward/back lean (rotation.x) is relative to where it faces
  // Tankier per mission cleared and per room within a mission
  const dm = (1 + .55 * P.done.length) * (1 + .06 * Math.max(0, lroom - 1)) * DIFF.hp * (1 + (d.bn ? .9 : .25) * NET.others()); // bosses scale much harder with extra co-op players
  // majors are tougher (more health, stronger shields)
  const rk = g.userData.rank && !d.bn ? [1.3, 1.5] : [1, 1];
  g.position.set(x, 0, z);
  scene.add(g);
  gfxCaster(g);
  // Bosses get glowing weak points (a solid core plus a pulsing halo) attached to the model
  let crits = null;
  if (d.bn) {
    const C = CRITS[d.model || t] || CRITS.elite;
    crits = C.pts.map(([cx, cy, cz, r]) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), new THREE.MeshBasicMaterial({ color: C.col }));
      const h = new THREE.Mesh(new THREE.SphereGeometry(r * 1.7, 12, 10), new THREE.MeshBasicMaterial({ color: C.col, transparent: true, opacity: .35, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.position.set(cx, cy, cz);
      h.position.copy(m.position);
      g.add(m, h);
      return { m, h, r };
    });
  }
  enemies.push({ ...d, t, x, z, id: ++NET.eid, fr: d.fr * DIFF.fr, bs: d.bs * DIFF.bs, g, mat, aura, sw, kg, crits, legs, arm, px: x, pz: z, ph: R(0, 6.28), gs: 0, kf: 0, lcd: R(.3, 1), lunge: 0, wind: 0, swing: 0, hp: d.hp * dm * rk[0], sh: d.sh * dm * rk[1], maxhp: d.hp * dm * rk[0], maxsh: d.sh * dm * rk[1], boss: !!d.bn, sumT: 8, cd: R(1.2, 2.4), dir: Math.random() < .5 ? 1 : -1, dirT: R(1, 3), flash: 0 });
  // Active camouflage: body and sword get their own see-through materials (bo: each one's normal opacity)
  if (d.camo) {
    const e = enemies[enemies.length - 1];
    e.camoMats = [];
    g.traverse(o => {
      if (!o.isMesh || o === aura)
        return;
      const m = o.material.clone();
      m.userData.bo = m.transparent ? m.opacity : 1;
      m.transparent = true;
      m.depthWrite = false;
      if (o.material === mat)
        e.mat = m;
      o.material = m;
      e.camoMats.push(m);
    });
  }
}

function hurt(d) {
  if (state !== 'play' || NET.down || P.bubT > T)
    return;
  // driving a Ghost: it takes most of the hit
  if (P.veh)
    d = vehHit(d);
  else if (P.hog)
    d = hogHit(d);
  P.last = T;
  vig = .7;
  sfx.hit(P.sh > 0);
  d *= DIFF.dmg;
  if (P.dr)
    d *= 1 - P.dr;
  if (P.sh > 0) {
    P.sh -= d;
    if (P.sh <= 0) {
      // Bubble Shield (legendary): the hit that breaks your shield doesn't carry into health, and you're safe for 2s
      if (P.bubble && T > (P.bubCd || 0)) {
        P.bubCd = T + 20;
        P.bubT = T + 2;
        banner('BUBBLE SHIELD');
        flashFx(P.x, P.y + 1.2, P.z, 2, 0x7fd8ff);
      }
      else
        P.hp += P.sh;
      P.sh = 0;
      // EMP Discharge boon: shield break strips nearby enemy shields
      if (P.emp && T > (P.empT || 0)) {
        P.empT = T + 10;
        enemies.forEach(e => {
          if (Math.hypot(e.x - P.x, e.z - P.z) < 7) {
            e.sh = 0;
            e.flash = .15;
          }
        });
        flashFx(P.x, 1.2, P.z, 7, 0x7fd8ff);
        banner('EMP DISCHARGE');
        sfx.boom();
      }
    }
  }
  else
    P.hp -= d;
  if (P.hp <= 0 && P.revive > 0) {
    P.revive--;
    P.hp = P.maxHp * .6;
    P.sh = P.maxSh;
    banner('SECOND WIND');
  }
  else if (P.hp <= 0 && NET.mode)
    netDown();
  else if (P.hp <= 0) {
    state = 'dead';
    sfx.dead();
    music.set(-1);
    endRun(false);
    document.exitPointerLock && document.exitPointerLock();
    if (room > best) {
      best = room;
      try {
        localStorage.setItem('spartan_fps_best', best);
      }
      catch (e) { }
    }
    ov.style.display = 'flex';
    ov.innerHTML = '<h2 style="color:#e5534b">KILLED IN ACTION</h2><div>Reached room ' + room + ' | ' + kills + ' kills | Best ' + best + ' | +' + P.cr + ' credits</div><div style="font-size:12px;color:#99a28f;max-width:520px">' + (P.boons.join(', ') || 'No boons') + '</div><div class="cards"><button class="card" onclick="newRun()"><b>New run</b></button><button class="card" onclick="armory()"><b>Armory</b></button></div>';
  }
}

// Does the ray o + d*t pass through one of this boss's weak points? Returns the weak point's world position.
// Only weak points on the side facing the shooter count, so a back core can't be hit through the body.
const _cv = new THREE.Vector3();

// Walk cycle driven by how far the enemy actually moved this frame: legs swing from the hip in opposition, the free
// arm counter-swings, and the body bobs twice per stride. Faster movement (lunges, charges) means a quicker, wider
// gait; standing still eases into a slow breathing sway. gs = gait strength 0..1, ph = stride phase.
function walkAnim(e, dt) {
  const v = Math.hypot(e.x - e.px, e.z - e.pz) / Math.max(dt, 1e-3);
  e.px = e.x;
  e.pz = e.z;
  e.gs += (Math.min(1, v / 3) - e.gs) * Math.min(1, dt * 8);
  e.ph += dt * (2.2 + v * 1.6) / e.sc;
  const sw = Math.sin(e.ph) * .55 * e.gs;
  if (e.legs) {
    e.legs[0].rotation.x = sw;
    e.legs[1].rotation.x = -sw;
  }
  if (e.arm)
    e.arm.rotation.x = -sw * .7;
  // e.y: the ground (or a versus player's) height under them
  e.g.position.set(e.x, (e.y || 0) + Math.abs(Math.cos(e.ph)) * .06 * e.sc * e.gs + Math.sin(T * 2 + e.ph) * .008 * (1 - e.gs), e.z);
}

function critHit(e, o, d) {
  if (!e.crits)
    return null;
  e.g.updateMatrixWorld(true);
  for (const c of e.crits) {
    c.m.getWorldPosition(_cv);
    if ((_cv.x - e.x) * (o.x - _cv.x) + (_cv.z - e.z) * (o.z - _cv.z) <= 0)
      continue;
    const vx = _cv.x - o.x;
    const vy = _cv.y - o.y;
    const vz = _cv.z - o.z;
    const t = vx * d.x + vy * d.y + vz * d.z;
    if (t > 0 && vx * vx + vy * vy + vz * vz - t * t < (c.r * e.sc * 1.1) ** 2)
      return _cv.clone();
  }
  return null;
}

// Damage types: 'e' energy (Covenant plasma, needles, sword) melts shields but is weak on flesh; 'k' kinetic
// (human guns, explosives, punches) is the reverse; 'n' neutral. Overflow past a breaking shield carries into
// health at the health rate.
const DMGT = { e: { sh: 1.8, hp: .7 }, k: { sh: .75, hp: 1.25 }, n: { sh: 1, hp: 1 } };

// crit: a weak-point hit, which ignores armor; ty: damage type (see DMGT)
function dmgE(e, d, crit, ty) {
  d *= 1 - (crit ? 0 : e.armor || 0);
  e.flash = .08;
  // Something another player owns (a co-op ghost or a versus opponent): report the damage instead of applying it
  if (e.net) {
    netHit(e, d, ty);
    return;
  }
  // Enraging bosses shrug off everything for a moment
  if (e.inv > T)
    return;
  const M = DMGT[ty] || DMGT.n;
  if (e.sh > 0) {
    const s = d * M.sh;
    if (s < e.sh)
      e.sh -= s;
    else {
      const left = (s - e.sh) / M.sh;
      e.sh = 0;
      e.hp -= left * M.hp;
    }
  }
  else
    e.hp -= d * M.hp;
  // A boss can't be burst past its enrage threshold: the hit stops at half health and the boss enrages
  if (e.boss && !e.rage && e.hp + e.sh < (e.maxhp + e.maxsh) * .5) {
    e.hp = Math.max(e.hp, (e.maxhp + e.maxsh) * .5 - e.sh);
    enrage(e, (e.bn || 'BOSS').toUpperCase() + ' IS ENRAGED!');
  }
  if (e.hp <= 0 && !e.dead) {
    e.dead = true;
    kills++;
    sfx.kill(e.t);
    // a destroyed Ghost blows up
    if (e.veh && !e.net)
      explode(e.x, (e.y || 0) + 1, e.z, 5, 40, 25, 'k', true);
    dropMaybe(e);
    earn(e.boss ? 0 : 1);
    scene.remove(e.g);
    if (P.adr)
      P.adrT = 3;
    // Legendary kill effects (not for kills the co-op host applies on a guest's behalf)
    if (!NET.applying) {
      ffReward(e);
      if (P.vamp)
        P.hp = Math.min(P.maxHp, P.hp + P.vamp);
      if (P.siphon)
        P.sh = Math.min(P.maxSh, P.sh + P.siphon);
      if (P.mkShield && P.lastMelee > T - .1)
        P.sh = P.maxSh;
      if (P.chain && !e.kami && Math.random() < P.chain)
        explode(e.x, (e.y || 0) + 1, e.z, 3.5, 40 * dmgMul(), 0, 'k');
    }
    if (e.kami)
      kamiBoom(e);
    // Bonded bosses: losing one enrages the survivor
    if (e.boss)
      enemies.forEach(o => {
        if (o.boss && !o.dead && !o.rage)
          enrage(o, o.bn.toUpperCase() + ' IS ENRAGED!');
      });
  }
}

// Suicide Grunt detonation: also fires when it's killed, so shooting one near its friends hurts them too.
function kamiBoom(e) {
  if (e.boomed)
    return;
  e.boomed = true;
  if (!e.dead) {
    e.dead = true;
    scene.remove(e.g);
  }
  // boom: [radius, damage to enemies, damage to you]; brood: infection forms a Flood carrier releases
  const [r, de, dp] = e.boom || [4.5, 60, 35];
  explode(e.x, (e.y || 0) + 1, e.z, r, de, dp, 'n', true);
  if (e.brood && !NET.client)
    for (let i = 0; i < e.brood; i++) {
      const a = i / e.brood * 6.28;
      spawn('finf', clamp(e.x + Math.cos(a) * 1.5, -A + 2, A - 2), clamp(e.z + Math.sin(a) * 1.5, -A + 2, A - 2));
    }
}

function flashFx(x, y, z, r, col) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .6 }));
  m.position.set(x, y, z);
  scene.add(m);
  fx.push({ m, r, life: .3 });
}

function fwd() {
  return new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
}

function wallT(o, d) {
  const tx = d.x > 0 ? (A - o.x) / d.x : d.x < 0 ? (-A - o.x) / d.x : 1e9;
  const tz = d.z > 0 ? (A - o.z) / d.z : d.z < 0 ? (-A - o.z) / d.z : 1e9;
  let t = Math.min(tx, tz, !groundFn && d.y < 0 ? -o.y / d.y : 1e9);
  pillars.forEach(b => {
    if (!b.nb)
      t = Math.min(t, rayBox(o.x, o.z, d.x, d.z, b, o.y, d.y));
  });
  // Angled corner walls (the plane sx*x + sz*z = OCT for each corner)
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const den = sx * d.x + sz * d.z;
      if (den > 1e-6) {
        const tt = (OCT - (sx * o.x + sz * o.z)) / den;
        if (tt > 0)
          t = Math.min(t, tt);
      }
    }
  // Hilly ground (versus map): step along the ray until it dips into a hill
  if (groundFn)
    for (let s = .5; s < Math.min(t, 160); s += .6)
      if (o.y + d.y * s < groundFn(o.x + d.x * s, o.z + d.z * s)) {
        t = s;
        break;
      }
  return t;
}

// Enemy plasma: a white-hot core inside a coloured glow, stretched along its flight (local +z, so lookAt aims it);
// wider at the head, tapering to the tail. userData.col is the plasma colour (sent to co-op guests).
const BOLT_CORE = new THREE.CylinderGeometry(.05, .04, .85, 6).rotateX(Math.PI / 2);
const BOLT_GLOW = new THREE.CylinderGeometry(.15, .06, 1.2, 8).rotateX(Math.PI / 2);
const _boltW = new THREE.Color(0xffffff);
function boltMesh(col) {
  const m = new THREE.Mesh(BOLT_CORE, new THREE.MeshBasicMaterial({ color: new THREE.Color(col).lerp(_boltW, .55) }));
  m.add(new THREE.Mesh(BOLT_GLOW, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false })));
  m.userData.col = col;
  return m;
}
function boltColor(m, col) {
  if (m.userData.col === col)
    return;
  m.userData.col = col;
  m.material.color.setHex(col).lerp(_boltW, .55);
  m.children[0].material.color.setHex(col);
}

// Distance from the point (x, y, z) to the segment a-b (Vector3s)
function segDist(a, b, x, y, z) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const l2 = dx * dx + dy * dy + dz * dz;
  const t = l2 ? clamp(((x - a.x) * dx + (y - a.y) * dy + (z - a.z) * dz) / l2, 0, 1) : 0;
  return Math.hypot(a.x + dx * t - x, a.y + dy * t - y, a.z + dz * t - z);
}