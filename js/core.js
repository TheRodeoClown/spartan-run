/*
 * core.js: Renderer, scene, camera, lights and arena collision helpers.
 * Classic script (no modules): all files share one global scope, so load order in index.html matters.
 */

const $ = id => document.getElementById(id);
const wrap = $('wrap');
const cv = $('c');
const ov = $('ov');
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, logarithmicDepthBuffer: true });
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e1116);
scene.fog = new THREE.Fog(0x0e1116, 14, 48);
const cam = new THREE.PerspectiveCamera(75, 16 / 9, .1, 6000);
cam.rotation.order = 'YXZ';

function resize() {
  const w = wrap.clientWidth;
  const h = wrap.clientHeight;
  renderer.setSize(w, h, false);
  cam.aspect = w / h;
  cam.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x223018, .95);
scene.add(hemi);
const dl = new THREE.DirectionalLight(0xffffff, .6);
dl.position.set(5, 10, 3);
scene.add(dl);
// Arena half-width: 30 for missions, larger for the versus map (see setArena)
let A = 30;
// K: scale from the original 22m arena (cover layouts and decals are authored at that size)
const K = 30 / 22;
const R = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const floor = new THREE.Mesh(new THREE.PlaneGeometry(A * 2, A * 2), new THREE.MeshLambertMaterial({ color: 0x1b2230 }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

/* grid built per level */
/* walls built per level */
const pillars = [];
const envG = new THREE.Group();
scene.add(envG);

// Octagonal arena: straight walls at |x|, |z| = A, corners cut by angled walls whose inner face is |x| + |z| = OCT.
// IN: inner face of the straight walls; CUT: where the angled corner walls meet them
let IN = A - .5;
let CUT = Math.round(9 * K * 10) / 10;
let OCT = IN + CUT;
const outArena = p => Math.abs(p.x) > A || Math.abs(p.z) > A || Math.abs(p.x) + Math.abs(p.z) > OCT;

// Resize the arena (each level sets it when it's built).
function setArena(a, cut) {
  if (a === A && cut === CUT)
    return;
  A = a;
  IN = a - .5;
  CUT = cut;
  OCT = IN + cut;
  floor.geometry.dispose();
  floor.geometry = new THREE.PlaneGeometry(a * 2, a * 2);
}

// Colliders are boxes: half-sizes hw/hd (default 1.5, the 3x3 cover blocks) and height h (default 3.5).
const inPillar = (p, m) => pillars.some(q => Math.abs(p.x - q.x) < (q.hw || 1.5) + m && Math.abs(p.z - q.z) < (q.hd || 1.5) + m && p.y < (q.h || 3.5));

// Keep a body of radius r out of cover pillars and the angled corner walls.
function pushOut(o, r) {
  pillars.forEach(b => {
    const hw = b.hw || 1.5;
    const hd = b.hd || 1.5;
    const cx = clamp(o.x, b.x - hw, b.x + hw);
    const cz = clamp(o.z, b.z - hd, b.z + hd);
    const dx = o.x - cx;
    const dz = o.z - cz;
    const d = Math.hypot(dx, dz);
    if (d < r) {
      if (d > .001) {
        o.x += dx / d * (r - d);
        o.z += dz / d * (r - d);
      }
      else {
        // Centre inside the box: leave along the shorter way out
        const ex = hw - Math.abs(o.x - b.x);
        const ez = hd - Math.abs(o.z - b.z);
        if (ex < ez)
          o.x += (o.x < b.x ? -1 : 1) * (ex + r);
        else
          o.z += (o.z < b.z ? -1 : 1) * (ez + r);
      }
    }
  });
  const s = Math.abs(o.x) + Math.abs(o.z);
  const lim = OCT - r * 1.42;
  if (s > lim) {
    const k = (s - lim) / 2;
    o.x -= Math.sign(o.x) * k;
    o.z -= Math.sign(o.z) * k;
  }
}

function rayBox(ox, oz, dx, dz, b) {
  let t0 = 0;
  let t1 = 1e9;
  for (const [o, d, c, hh] of [[ox, dx, b.x, b.hw || 1.5], [oz, dz, b.z, b.hd || 1.5]]) {
    if (Math.abs(d) < 1e-6) {
      if (Math.abs(o - c) > hh)
        return 1e9;
    }
    else {
      let a = (c - hh - o) / d;
      let e = (c + hh - o) / d;
      if (a > e)
        [a, e] = [e, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, e);
    }
  }
  return t0 <= t1 ? t0 : 1e9;
}
