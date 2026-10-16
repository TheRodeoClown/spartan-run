/*
 * gunmodels.js: the first-person weapon models, held in a Spartan's armoured gloves. Classic script (no modules): all
 * files share one global scope, so load order in index.html matters (before weapons.js, whose setGun calls buildGun).
 *
 * Every model is built into `gun` (the camera-attached group in weapons.js), barrel along -z, the grip near the
 * origin. Live parts in gun.userData: ctr (the MA40 / BR55 digital ammo counter, redrawn when the count changes),
 * cr (the Needler's crystals, one fewer showing as the magazine empties) and glows (Covenant glow materials that
 * flare when firing). gunTick (called from animGun) updates them.
 */

const GMAT = {};
const gmat = (k, f) => GMAT[k] || (GMAT[k] = f());
const gPh = (c, s, sp) => gmat('p' + c + '_' + (s || 40), () => {
  const m = new THREE.MeshPhongMaterial({ color: c, shininess: s || 40, specular: sp || 0x5a5e66 });
  // shiny metal and Covenant shells reflect the level (graphics.js)
  return (s || 40) >= 100 ? gfxShiny(m, .28) : (s || 40) >= 60 ? gfxShiny(m, .1) : m;
});
const gGlow = c => gmat('g' + c, () => new THREE.MeshBasicMaterial({ color: c }));

function buildGun(k) {
  const ud = gun.userData;
  ud.ctr = null;
  ud.cr = null;
  ud.glows = null;
  const root = new THREE.Group();
  gun.add(root);
  const bx = (w, h, d, m, x, y, z, rx, ry, rz, par) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    o.position.set(x, y, z);
    o.rotation.set(rx || 0, ry || 0, rz || 0);
    (par || root).add(o);
    return o;
  };
  const cy = (rt, rb, h, m, x, y, z, rx, ry, rz, n, par) => {
    const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, n || 14), m);
    o.position.set(x, y, z);
    o.rotation.set(rx || 0, ry || 0, rz || 0);
    (par || root).add(o);
    return o;
  };
  const sp = (r, m, x, y, z, sx, sy, sz, rx, ry, rz) => {
    const o = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), m);
    o.position.set(x, y, z);
    o.scale.set(sx || 1, sy || 1, sz || 1);
    o.rotation.set(rx || 0, ry || 0, rz || 0);
    root.add(o);
    return o;
  };
  const Z = Math.PI / 2; // turns a cylinder to lie along z
  const dark = gPh(0x26292e, 60, 0x70757e);
  const steel = gPh(0x5e646c, 80, 0x9aa0aa);
  const black = gPh(0x16181b, 30);
  const brass = gPh(0xc8a050, 90, 0xffe0a0);
  const amber = gPh(0xc8901e, 40);
  // Spartan arms: an armoured forearm running from the hand back out of view, and a glove around the grip
  const armM = gPh(0x55603e, 35, 0x6a7058);
  const suit = gPh(0x2f3236, 20);
  const glove = gPh(0x1e2023, 25);
  const UP = new THREE.Vector3(0, 1, 0);
  const arm = (hx, hy, hz, ex, ey, ez, grip) => {
    const a = new THREE.Vector3(hx, hy, hz);
    const b = new THREE.Vector3(ex, ey, ez);
    const d = b.clone().sub(a);
    const mid = a.clone().addScaledVector(d, .55);
    const fa = cy(.042, .036, d.length(), suit, mid.x, mid.y, mid.z, 0, 0, 0, 10);
    fa.quaternion.setFromUnitVectors(UP, d.clone().normalize());
    // armour plate over the forearm, with a status light
    const pm = a.clone().addScaledVector(d, .45);
    const pl = bx(.07, .035, d.length() * .5, armM, pm.x, pm.y + .02, pm.z);
    pl.lookAt(b.x, b.y + .02, b.z);
    const lt = a.clone().addScaledVector(d, .25);
    bx(.02, .012, .03, gGlow(0x6fd8ff), lt.x, lt.y + .05, lt.z).lookAt(b);
    // the hand: palm and curled fingers wrapped round the grip (or flat under a foregrip)
    bx(.07, .07, .09, glove, hx, hy, hz + .02);
    bx(.075, .035, .07, glove, hx + (grip ? -.005 : 0), hy + (grip ? -.04 : -.035), hz - .02);
    bx(.025, .03, .05, glove, hx - .045, hy + .015, hz - .01, 0, 0, .4);
  };
  const right = (x, y, z) => arm(x, y, z, x + .06, y - .22, z + .24, true);
  const left = (x, y, z) => arm(x, y, z, x - .22, y - .2, z + .2, false);
  // the digital ammo counter (MA40, BR55): a little screen on the back of the gun, facing you
  const counter = (x, y, z, w, h, rx) => {
    const cv = document.createElement('canvas');
    cv.width = 64;
    cv.height = 32;
    const tex = new THREE.CanvasTexture(cv);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
    scr.position.set(x, y, z);
    scr.rotation.x = rx;
    root.add(scr);
    ud.ctr = { ctx: cv.getContext('2d'), tex, n: -1 };
  };
  if (k === 'ar') {
    // MA40: chunky olive bullpup with a vented shroud, the ammo counter on top, magazine behind the grip
    const olive = gPh(0x56623e, 35, 0x6a7258);
    bx(.088, .1, .36, olive, 0, 0, -.06);
    bx(.09, .02, .36, dark, 0, -.055, -.06);
    bx(.05, .025, .28, dark, 0, .062, -.1);
    for (let i = 0; i < 6; i++)
      bx(.054, .008, .02, steel, 0, .077, -.22 + i * .045);
    bx(.074, .05, .07, dark, 0, .07, .09);
    counter(0, .083, .126, .058, .032, -.55);
    bx(.078, .078, .2, dark, 0, -.005, -.31);
    [-1, 1].forEach(s => {
      for (let i = 0; i < 4; i++)
        bx(.004, .036, .022, black, s * .04, -.005, -.24 - i * .045);
    });
    cy(.018, .018, .12, dark, 0, 0, -.46, Z);
    cy(.027, .022, .045, black, 0, 0, -.52, Z, 0, 0, 10);
    bx(.042, .1, .05, black, 0, -.085, .03, .28);
    bx(.048, .13, .075, dark, 0, -.1, .125, -.12);
    bx(.034, .012, .055, brass, 0, -.036, .125);
    bx(.072, .095, .11, olive, 0, -.01, .21);
    bx(.08, .02, .04, black, 0, -.05, .25);
    bx(.066, .045, .15, dark, 0, -.068, -.22);
    bx(.09, .012, .05, amber, 0, .03, -.18);
    bx(.091, .03, .012, amber, 0, .015, .02);
    right(0, -.1, .03);
    left(-.005, -.105, -.22);
  }
  else if (k === 'br') {
    // BR55: long slim rifle with a scope (glowing lens), a muzzle brake and the ammo counter under the scope
    const gm = gPh(0x4a5440, 35, 0x666e5c);
    bx(.072, .09, .44, gm, 0, 0, -.08);
    bx(.074, .018, .44, dark, 0, -.05, -.08);
    cy(.031, .031, .2, dark, 0, .09, -.06, Z);
    cy(.036, .03, .03, black, 0, .09, -.17, Z);
    cy(.026, .026, .005, gGlow(0x7fd8ff), 0, .09, -.186, Z);
    cy(.029, .029, .02, black, 0, .09, .045, Z);
    [-.12, 0].forEach(z => bx(.02, .04, .02, dark, 0, .055, z));
    counter(0, .052, .135, .05, .028, -.6);
    cy(.016, .016, .22, dark, 0, -.005, -.42, Z);
    bx(.045, .04, .07, black, 0, -.005, -.55);
    [-1, 1].forEach(s => bx(.004, .02, .05, steel, s * .023, -.005, -.55));
    bx(.04, .1, .05, black, 0, -.085, .03, .28);
    bx(.045, .12, .07, dark, 0, -.1, .12, -.12);
    bx(.066, .09, .12, gm, 0, -.01, .2);
    bx(.06, .04, .16, dark, 0, -.065, -.24);
    bx(.073, .01, .06, amber, 0, .046, -.25);
    right(0, -.1, .03);
    left(-.005, -.1, -.24);
  }
  else if (k === 'mg') {
    // M6D Magnum, after Halo: Combat Evolved's: a long brushed-silver slide with two stacked barrel ports at the
    // muzzle, the angled smart-link sight block on top at the front (with its hex bolt), a serrated rear sight, a dark
    // frame with a big angular trigger guard, a raked brown textured grip and the magazine showing under it.
    const silver = gPh(0xa6abb0, 90, 0xe0e4e8);
    const silverD = gPh(0x80868c, 70, 0xc0c4c8);
    const gunm = gPh(0x45484c, 50);
    const grip = gmat('mgGrip', () => new THREE.MeshPhongMaterial({ color: 0x6a3a2a, shininess: 18, specular: 0x3a2a24, map: ctex('mgGripTex', 64, 128, 1, 1, (g, w, h) => {
      g.fillStyle = '#c8b4a8';
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(40,20,14,.55)';
      for (let y = 2; y < h; y += 5)
        for (let x = (y % 10 ? 2 : 4.5); x < w; x += 5)
          g.fillRect(x, y, 2, 2);
      g.fillStyle = 'rgba(30,15,10,.6)';
      g.fillRect(0, h * .3, w, 2);
      g.fillRect(0, h * .62, w, 2);
    }) }));
    // the slide: long and squared off, a little taller at the back
    bx(.052, .058, .29, silver, 0, .045, -.11);
    bx(.054, .012, .27, silverD, 0, .018, -.11);
    bx(.05, .02, .07, silverD, 0, .082, .005);
    // serrated rear sight at the back of the slide
    for (let i = 0; i < 6; i++)
      bx(.056, .05, .005, gunm, 0, .05, .02 - i * .011);
    bx(.03, .016, .03, gunm, 0, .1, .02);
    // the muzzle: two stacked rounded barrel ports, dark inside
    [.068, .03].forEach(y => {
      cy(.017, .017, .03, silverD, 0, y, -.26, Z, 0, 0, 12);
      cy(.011, .011, .032, black, 0, y, -.262, Z, 0, 0, 10);
    });
    bx(.05, .02, .03, silverD, 0, .05, -.26);
    // the smart-link sight block on top at the front, sloping down at the back, with a hex bolt on its side
    bx(.054, .045, .12, silver, 0, .095, -.19);
    bx(.054, .035, .06, silver, 0, .088, -.118, .55);
    cy(.012, .012, .008, silverD, .029, .095, -.2, 0, 0, Math.PI / 2, 6);
    cy(.005, .005, .01, gunm, .029, .095, -.2, 0, 0, Math.PI / 2, 6);
    bx(.03, .006, .1, gGlow(0x7fd8ff), 0, .118, -.19);
    // the frame under the slide, the big angular trigger guard and the trigger
    bx(.046, .03, .2, gunm, 0, .0, -.12);
    bx(.012, .075, .014, gunm, 0, -.045, -.195, -.25);
    bx(.012, .012, .13, gunm, 0, -.085, -.13);
    bx(.012, .03, .012, gunm, 0, -.07, -.07);
    bx(.008, .04, .01, silverD, 0, -.035, -.115, .35);
    // the grip, raked back, brown and textured, with the magazine poking out under it
    bx(.046, .13, .062, grip, 0, -.065, .015, .22);
    bx(.048, .02, .066, gunm, 0, -.005, .0, .22);
    bx(.036, .04, .05, black, 0, -.14, .045, .22);
    bx(.042, .012, .058, gunm, 0, -.162, .05, .22);
    right(0, -.085, .03);
  }
  else if (k === 'sg') {
    // M90: heavy receiver, long barrel over a tube magazine, ribbed pump, heat shield, stock
    const wood = gPh(0x4a3624, 20);
    bx(.078, .09, .25, dark, 0, 0, 0);
    bx(.08, .02, .12, steel, 0, .045, .02);
    cy(.024, .024, .44, steel, 0, .015, -.34, Z);
    cy(.019, .019, .38, dark, 0, -.035, -.32, Z);
    cy(.028, .026, .03, black, 0, .015, -.56, Z);
    bx(.074, .065, .15, wood, 0, -.04, -.26);
    for (let i = 0; i < 5; i++)
      bx(.078, .008, .012, black, 0, -.04, -.32 + i * .028);
    bx(.05, .012, .32, gPh(0x56623e, 30), 0, .045, -.3);
    for (let i = 0; i < 5; i++)
      bx(.02, .014, .012, black, 0, .046, -.42 + i * .05);
    bx(.042, .1, .05, black, 0, -.085, .07, .28);
    bx(.064, .085, .16, dark, 0, -.02, .19);
    bx(.066, .02, .1, black, 0, -.065, .23);
    bx(.079, .012, .05, amber, 0, .02, -.04);
    right(0, -.1, .07);
    left(0, -.1, -.26);
  }
  else if (k === 'sn') {
    // S2 AM: very long barrel with a big muzzle brake, a large scope with blue glass, bipod, cheek-rest stock
    const sg = gPh(0x3a4048, 50, 0x7a808a);
    bx(.072, .09, .4, sg, 0, 0, -.06);
    bx(.074, .02, .4, black, 0, -.05, -.06);
    cy(.017, .02, .44, dark, 0, .005, -.48, Z);
    bx(.062, .045, .09, black, 0, .005, -.73);
    [-1, 1].forEach(s => [0, 1, 2].forEach(i => bx(.004, .03, .012, steel, s * .032, .005, -.71 - i * .022)));
    cy(.042, .042, .28, dark, 0, .11, -.06, Z);
    cy(.05, .042, .05, black, 0, .11, -.21, Z);
    cy(.044, .044, .005, gGlow(0x4ab0ff), 0, .11, -.236, Z);
    cy(.038, .034, .04, black, 0, .11, .1, Z);
    cy(.03, .03, .004, gGlow(0x2a70c0), 0, .11, .121, Z);
    [-.14, .03].forEach(z => cy(.046, .046, .025, steel, 0, .11, z, Z));
    [-.13, .02].forEach(z => bx(.022, .05, .02, dark, 0, .065, z));
    bx(.03, .02, .03, dark, .05, .11, -.06);
    bx(.045, .13, .08, dark, 0, -.11, -.02);
    bx(.042, .1, .05, black, 0, -.085, .09, .28);
    bx(.066, .1, .16, sg, 0, -.01, .22);
    bx(.05, .03, .12, gPh(0x2a2c30, 10), 0, .055, .2);
    [-1, 1].forEach(s => bx(.012, .012, .2, dark, s * .02, -.035, -.42, 0, 0, 0));
    bx(.073, .01, .06, amber, 0, .046, -.2);
    right(0, -.1, .09);
    left(-.005, -.08, -.32);
  }
  else if (k === 'pr') {
    // Type-25 Plasma Rifle: a glossy Covenant claw, two prongs sweeping forward round a glowing emitter, vents along
    // the top, the grip inside the frame
    const shell = gPh(0x5a3f9a, 120, 0xd8c0ff);
    const shellD = gPh(0x2e2450, 90, 0xa088e0);
    const gl = gmat('prGlow', () => new THREE.MeshBasicMaterial({ color: 0x7dffb8 }));
    ud.glows = [gl];
    sp(.07, shell, 0, .01, -.06, 1, .78, 2.5);
    sp(.05, shellD, 0, -.025, .06, 1, .8, 1.6);
    [-1, 1].forEach(s => {
      sp(.034, shell, s * .055, .005, -.26, .9, .85, 3.3, 0, s * .12, 0);
      const tip = cy(.001, .03, .1, shell, s * .04, .005, -.4, -Z, 0, 0, 10);
      tip.rotation.z = s * .25;
      bx(.006, .012, .16, gl, s * .072, .02, -.24, 0, s * .12, 0);
    });
    sp(.026, gl, 0, .005, -.3);
    cy(.012, .02, .05, shellD, 0, .005, -.27, Z, 0, 0, 10);
    [-1, 1].forEach(s => bx(.012, .006, .16, gl, s * .025, .058, -.06));
    [-1, 1].forEach(s => bx(.008, .04, .1, shellD, s * .072, .0, .02, 0, 0, s * .3));
    cy(.017, .017, .11, shellD, 0, -.07, .03, .2);
    bx(.02, .02, .14, shellD, 0, -.1, -.01);
    right(0, -.075, .03);
  }
  else if (k === 'rk') {
    // M41 SPNKr: two big launch tubes with ribbed collars, a sight on the left, grip and foregrip under the body
    const olive = gPh(0x5a6242, 30, 0x6e7660);
    [-1, 1].forEach(s => {
      cy(.056, .056, .78, olive, s * .06, .04, -.16, Z, 0, 0, 16);
      cy(.06, .06, .05, dark, s * .06, .04, -.56, Z, 0, 0, 16);
      cy(.042, .042, .01, black, s * .06, .04, -.586, Z, 0, 0, 16);
      cy(.06, .06, .05, dark, s * .06, .04, .23, Z, 0, 0, 16);
      cy(.042, .042, .01, gGlow(0x5a2010), s * .06, .04, .256, Z, 0, 0, 16);
      [-.36, -.1, .1].forEach(z => cy(.059, .059, .016, dark, s * .06, .04, z, Z, 0, 0, 16));
    });
    bx(.1, .08, .34, dark, 0, -.035, -.08);
    bx(.12, .03, .06, amber, 0, .095, -.2);
    cy(.022, .022, .14, dark, -.13, .08, -.12, Z);
    cy(.02, .02, .004, gGlow(0xff4a3a), -.13, .08, -.192, Z);
    bx(.03, .03, .05, dark, -.11, .07, -.12);
    bx(.042, .11, .05, black, 0, -.11, .05, .2);
    bx(.04, .1, .045, black, 0, -.1, -.24, -.1);
    right(0, -.15, .05);
    left(0, -.14, -.24);
  }
  else if (k === 'cb') {
    // Type-51 Carbine: a long, angular Covenant rifle in dark green-grey with a glowing radioactive cell, a long
    // barrel under a finned top spine, and a curved stock
    const hull = gPh(0x3a4a3c, 90, 0xa0c0a8);
    const hullD = gPh(0x1e2620, 60, 0x70907a);
    const gl = gmat('cbGlow', () => new THREE.MeshBasicMaterial({ color: 0x7dff6a }));
    ud.glows = [gl];
    bx(.07, .085, .44, hull, 0, 0, -.1);
    bx(.05, .05, .5, hullD, 0, -.035, -.16);
    cy(.016, .016, .2, hullD, 0, .005, -.44, Z);
    cy(.026, .02, .04, hull, 0, .005, -.55, Z, 0, 0, 6);
    bx(.02, .05, .38, hull, 0, .065, -.12);
    [0, 1, 2].forEach(i => bx(.012, .03, .06, hullD, 0, .1, -.26 + i * .1, .3));
    bx(.03, .05, .1, gl, .038, .0, -.02);
    bx(.074, .006, .3, gl, 0, .044, -.16);
    bx(.04, .1, .05, hullD, 0, -.08, .04, .28);
    bx(.06, .08, .14, hull, 0, -.02, .18, -.15);
    sp(.03, gl, 0, .005, -.58);
    right(0, -.095, .04);
    left(-.005, -.07, -.24);
  }
  else if (k === 'sl') {
    // Spartan Laser: a big boxy UNSC weapon in pale grey with a wide front lens that glows as it charges, a battery
    // pack on the side, a top sight and two handles
    const pale = gPh(0x9aa0a6, 60, 0xd0d4d8);
    const gl = gmat('slGlow', () => new THREE.MeshBasicMaterial({ color: 0xff3a2a }));
    ud.glows = [gl];
    bx(.12, .13, .62, pale, 0, .02, -.16);
    bx(.124, .03, .5, dark, 0, -.035, -.18);
    bx(.13, .015, .1, amber, 0, .09, -.3);
    cy(.06, .06, .06, dark, 0, .02, -.48, Z, 0, 0, 18);
    cy(.048, .048, .005, gl, 0, .02, -.512, Z, 0, 0, 18);
    [-1, 1].forEach(s => bx(.012, .1, .04, black, s * .05, .02, -.49));
    bx(.05, .09, .2, dark, -.085, .0, -.12);
    [0, 1, 2].forEach(i => bx(.052, .008, .02, gl, -.087, .03 - i * .025, -.04));
    cy(.02, .02, .12, dark, 0, .11, -.12, Z);
    cy(.018, .018, .004, gGlow(0xff6a5a), 0, .11, -.181, Z);
    bx(.042, .11, .05, black, 0, -.1, .05, .2);
    bx(.04, .1, .045, black, 0, -.1, -.28, -.1);
    bx(.1, .1, .12, pale, 0, .02, .19);
    right(0, -.14, .05);
    left(0, -.13, -.28);
  }
  else if (k === 'nd') {
    // Type-33 Needler: a bulbous magenta shell with a row of glowing pink crystals along the top (they run out as
    // you fire), a glowing core window, and a grip underneath
    const shell = gPh(0x8a2a66, 110, 0xffb0e0);
    const shellD = gPh(0x40143a, 80, 0xd080c0);
    const gl = gmat('ndGlow', () => new THREE.MeshBasicMaterial({ color: 0xff7be0 }));
    ud.glows = [gl];
    sp(.08, shell, 0, 0, -.08, 1, .95, 2.3);
    sp(.06, shellD, 0, -.03, .07, 1, .9, 1.3);
    cy(.01, .045, .12, shell, 0, 0, -.31, -Z, 0, 0, 12);
    sp(.02, gl, 0, 0, -.37);
    sp(.03, gl, .06, .02, -.06, .4, 1, 2);
    ud.cr = [];
    for (let i = 0; i < 10; i++) {
      const row = i % 2 ? 1 : -1;
      const z = -.2 + Math.floor(i / 2) * .055;
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(.018), gl);
      c.position.set(row * .025, .085 - Math.abs(z + .06) * .2, z);
      c.scale.set(.7, 2.6, .7);
      c.rotation.set(.6, 0, row * .25);
      root.add(c);
      ud.cr.push(c);
    }
    cy(.018, .018, .1, shellD, 0, -.085, .05, .25);
    bx(.03, .015, .12, shellD, 0, -.115, 0);
    right(0, -.105, .05);
  }
}

const GUN_WHITE = new THREE.Color(0xffffff);

// Live parts, every frame (from animGun): the ammo counter, the Needler's crystals, Covenant glows flaring as you fire
function gunTick() {
  const ud = gun.userData;
  if (!P)
    return;
  const c = ud.ctr;
  if (c && c.n !== P.ammo) {
    c.n = P.ammo;
    const g = c.ctx;
    g.fillStyle = '#06121a';
    g.fillRect(0, 0, 64, 32);
    const low = P.ammo <= P.magMax * .25;
    g.fillStyle = low ? '#ff5a4a' : '#5ec8f2';
    g.font = 'bold 22px monospace';
    g.textAlign = 'center';
    g.fillText(String(P.ammo).padStart(2, '0'), 32, 23);
    g.fillRect(6, 27, 52 * Math.max(0, P.ammo) / (P.magMax || 1), 3);
    c.tex.needsUpdate = true;
  }
  if (ud.cr) {
    const n = Math.ceil(ud.cr.length * Math.max(0, P.ammo) / (P.magMax || 1));
    ud.cr.forEach((m, i) => m.visible = i < n);
  }
  if (ud.glows) {
    const hot = (P.cd > 0 && P.cd > wst().rate * .5) || (P.chg > 0 && Math.random() < .3 + P.chg);
    ud.glows.forEach(m => {
      m.userData.base = m.userData.base || m.color.getHex();
      m.color.setHex(m.userData.base);
      if (hot)
        m.color.lerp(GUN_WHITE, .5);
    });
  }
}
