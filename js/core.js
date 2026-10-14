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
const A = 30;
// K: scale from the original 22m arena (cover layouts and decals are authored at that size)
const K = A / 22;
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
const IN = A - .5;
const CUT = Math.round(9 * K * 10) / 10;
const OCT = IN + CUT;
const outArena = p => Math.abs(p.x) > A || Math.abs(p.z) > A || Math.abs(p.x) + Math.abs(p.z) > OCT;

// Keep a body of radius r out of cover pillars and the angled corner walls.
function pushOut(o, r) {
  pillars.forEach(b => {
    const cx = clamp(o.x, b.x - 1.5, b.x + 1.5);
    const cz = clamp(o.z, b.z - 1.5, b.z + 1.5);
    const dx = o.x - cx;
    const dz = o.z - cz;
    const d = Math.hypot(dx, dz);
    if (d < r) {
      if (d > .001) {
        o.x += dx / d * (r - d);
        o.z += dz / d * (r - d);
      }
      else
        o.x += r + 1.5;
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
  for (const [o, d, c] of [[ox, dx, b.x], [oz, dz, b.z]]) {
    if (Math.abs(d) < 1e-6) {
      if (Math.abs(o - c) > 1.5)
        return 1e9;
    }
    else {
      let a = (c - 1.5 - o) / d;
      let e = (c + 1.5 - o) / d;
      if (a > e)
        [a, e] = [e, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, e);
    }
  }
  return t0 <= t1 ? t0 : 1e9;
}
