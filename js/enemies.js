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

function buildEnemy(t) {
  const g = new THREE.Group();
  // The group new parts go into: the model root, or a limb pivot while rig() runs
  let tg = g;
  const L = c => mcache('l' + c, () => new THREE.MeshLambertMaterial({ color: c }));
  const Ph = (c, s) => mcache('p' + c + s, () => new THREE.MeshPhongMaterial({ color: c, shininess: s, specular: 0x666677 }));
  const glow = c => mcache('g' + c, () => new THREE.MeshBasicMaterial({ color: c }));
  const armor = c => new THREE.MeshPhongMaterial({ color: c, shininess: 60, specular: 0x555566 });
  const B = (w, h, d) => gcache('b' + [w, h, d], () => new THREE.BoxGeometry(w, h, d));
  const S = () => gcache('s', () => new THREE.SphereGeometry(.5, 14, 10));
  const Hemi = () => gcache('h', () => new THREE.SphereGeometry(.5, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2));
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
  let mat;
  let sw = null;
  let kg = null;
  let legs = null; // [left, right] hip pivots
  let arm = null; // free (non-weapon) arm's shoulder pivot
  // Variants reuse a base body: the Sword Elite carries an energy sword,
  // the suicide Grunt holds two lit plasma grenades.
  const sel = t === 'selite';
  const kam = t === 'kgrunt';
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
    // Stubby legs, armored harness, peaked methane tank with a hose to the breather mask
    mat = armor(0xe8943a);
    const skin = L(0x7d7058);
    const dark = Ph(0x2a2a30, 30);
    const tank = Ph(0x6fa8cf, 90);
    const gl = glow(0x9fe8ff);
    legs = [-1, 1].map(s => rig(s * .17, .62, -.02, () => {
      limb([[s * .17, .62, -.02], [s * .22, .34, .1], [s * .2, .08, 0]], .085, skin);
      P3(B(.2, .08, .3), dark, s * .2, .04, .06);
      P3(B(.2, .2, .12), mat, s * .22, .36, .16, null, [.3, 0, 0]);
    }));
    ball(skin, 0, .86, 0, .82, .76, .68);
    P3(B(.6, .42, .16), mat, 0, .92, .22, null, [.3, 0, 0]);
    P3(B(.66, .12, .5), mat, 0, .62, 0);
    [-1, 1].forEach(s => dome(mat, s * .33, 1.06, 0, .4, .24, .44, [0, 0, -s * .5]));
    P3(Co(.34, .85, 4), tank, 0, 1.12, -.34, null, [-.2, Math.PI / 4, 0]);
    P3(B(.5, .06, .06), gl, 0, .92, -.52, null, [-.2, 0, 0]);
    P3(Cy(.05, .05, .14, 6), dark, 0, 1.56, -.44);
    ball(skin, 0, 1.42, .16, .5, .46, .5);
    P3(B(.26, .16, .14), dark, 0, 1.34, .38);
    P3(Cy(.05, .05, .06, 8), gl, 0, 1.34, .46, null, [Math.PI / 2, 0, 0]);
    limb([[.08, 1.3, .32], [.2, 1.2, .05], [.12, 1.18, -.26]], .025, dark);
    [-1, 1].forEach(s => ball(glow(0xffd24a), s * .09, 1.48, .37, .09));
    if (kam) {
      // Arms raised, a lit plasma grenade in each hand
      [-1, 1].forEach(s => limb([[s * .33, 1.05, .02], [s * .46, 1.18, .12], [s * .5, 1.25, .25]], .07, skin));
      kg = new THREE.Group();
      [-.5, .5].forEach(x => {
        const o = new THREE.Mesh(S(), glow(0x7fe0ff));
        o.scale.setScalar(.26);
        o.position.set(x, 1.25, .25);
        kg.add(o);
      });
      g.add(kg);
    }
    else {
      arm = rig(-.33, 1.05, .02, () => limb([[-.33, 1.05, .02], [-.44, .86, .14], [-.42, .78, .3]], .07, skin));
      limb([[.33, 1.05, .02], [.46, .86, .18], [.5, .76, .32]], .07, skin);
      // Plasma pistol
      const pp = Ph(0x3f6b3a, 80);
      ball(pp, .5, .74, .42, .14, .14, .3);
      ball(glow(0x7dff6a), .5, .76, .56, .08);
      P3(B(.04, .1, .06), dark, .5, .66, .36);
    }
  }
  else if (t === 'jackal') {
    // Bird-like: backward knees, beaked head with quills, wrist shield and Needler
    mat = armor(0x4a5560);
    const skin = L(0x9a8f78);
    const beak = L(0xc9b98a);
    const quill = L(0xb05a3a);
    const dark = Ph(0x2a2a30, 30);
    const sh = mcache('jsh', () => new THREE.MeshBasicMaterial({ color: 0x6fe0ff, transparent: true, opacity: .35, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    legs = [-1, 1].map(s => rig(s * .12, .9, -.04, () => {
      limb([[s * .12, .9, -.04], [s * .15, .58, .14], [s * .14, .24, -.1], [s * .14, .05, .06]], .06, skin);
      P3(B(.11, .05, .24), dark, s * .14, .03, .1);
      P3(B(.12, .28, .08), mat, s * .15, .62, .17, null, [-.4, 0, 0]);
    }));
    ball(skin, 0, 1.12, 0, .42, .6, .36, [.25, 0, 0]);
    P3(B(.36, .42, .14), mat, 0, 1.18, .14, null, [.25, 0, 0]);
    P3(B(.4, .1, .3), mat, 0, .9, 0);
    [-1, 1].forEach(s => dome(mat, s * .2, 1.36, .02, .24, .16, .26, [0, 0, -s * .6]));
    limb([[0, 1.38, .04], [0, 1.58, .12]], .05, skin);
    ball(skin, 0, 1.68, .16, .32, .36, .5);
    P3(Co(.08, .34), beak, 0, 1.64, .52, null, [Math.PI / 2, 0, 0]);
    [-1, 1].forEach(s => ball(glow(0xff5030), s * .09, 1.73, .3, .07));
    [[-.08, .1], [0, .14], [.08, .1], [0, .02]].forEach(([x, o], i) => P3(Co(.03, .32, 5), quill, x, 1.86 - o * .5, -.02 - i * .03, null, [-.7 - o, 0, x * 2]));
    // Left arm: wrist gauntlet projecting the energy shield
    limb([[-.2, 1.32, 0], [-.34, 1.12, .12], [-.4, 1.15, .24]], .045, skin);
    P3(Cy(.07, .07, .14, 8), dark, -.42, 1.17, .26, null, [Math.PI / 2, 0, 0]);
    P3(Cy(.55, .55, .02, 24), sh, -.5, 1.2, .32, null, [Math.PI / 2, 0, 0]);
    P3(gcache('jt', () => new THREE.TorusGeometry(.55, .02, 6, 32)), glow(0x9ff0ff), -.5, 1.2, .32);
    // Right arm: Needler with glowing needles
    limb([[.2, 1.32, 0], [.32, 1.08, .1], [.34, .98, .28]], .045, skin);
    const nd = Ph(0xc0408a, 90);
    P3(B(.09, .12, .36), nd, .34, .95, .4);
    ball(nd, .34, .93, .22, .12, .14, .12);
    [-.035, 0, .035].forEach(x => P3(Co(.02, .15, 5), glow(0xff7be0), .34 + x, 1.07, .4 + x * .5, null, [-.3, 0, 0]));
  }
  else if (t === 'elite') {
    // Backward knees with armored shins, chest plate, pauldrons, helmet, four mandibles, back power pack
    mat = armor(0x3b5bd6);
    const skin = L(0x3d3347);
    const metal = Ph(0x9aa3b5, 90);
    const dark = Ph(0x24222c, 40);
    legs = [-1, 1].map(s => rig(s * .2, 1.0, -.02, () => {
      limb([[s * .2, 1.0, -.02], [s * .24, .62, .2], [s * .22, .26, -.1], [s * .22, .05, .08]], .085, skin);
      P3(B(.17, .38, .14), mat, s * .24, .42, .12, null, [-.55, 0, 0]);
      P3(B(.16, .06, .3), dark, s * .22, .03, .12);
      P3(B(.24, .26, .26), mat, s * .21, .92, .02);
    }));
    ball(skin, 0, 1.02, 0, .5, .4, .36);
    P3(B(.74, .56, .42), mat, 0, 1.3, .04);
    P3(B(.5, .3, .1), metal, 0, 1.33, .27);
    P3(B(.62, .06, .08), metal, 0, 1.06, .2);
    // Back power pack (the back weak point sits on it)
    P3(B(.46, .5, .18), dark, 0, 1.22, -.24);
    [-1, 1].forEach(s => P3(Cy(.05, .05, .5, 8), metal, s * .17, 1.22, -.31));
    [-1, 1].forEach(s => {
      dome(mat, s * .5, 1.48, 0, .52, .4, .62, [0, 0, -s * .45]);
      P3(B(.08, .04, .42), metal, s * .55, 1.6, 0, null, [0, 0, -s * .45]);
    });
    limb([[0, 1.5, .02], [0, 1.64, .05]], .08, skin);
    // Head (its front holds the helmet-gem weak point), helmet and crest
    ball(skin, 0, 1.75, .05, .49, .59, .7);
    dome(mat, 0, 1.8, -.02, .55, .52, .78, [-.25, 0, 0]);
    P3(B(.04, .08, .32), metal, 0, 1.98, -.02, null, [-.3, 0, 0]);
    [-1, 1].forEach(s => {
      ball(glow(0xffb040), s * .11, 1.8, .3, .06);
      P3(B(.05, .24, .05), skin, s * .1, 1.58, .36, null, [.3, 0, s * .3]);
      P3(B(.05, .22, .05), skin, s * .19, 1.62, .32, null, [.2, 0, s * .7]);
    });
    [-1, 1].forEach(s => {
      const f = () => {
        limb([[s * .5, 1.42, 0], [s * .62, 1.1, .12], [s * .58, .98, .36]], .075, skin);
        P3(B(.14, .14, .3), mat, s * .6, 1.04, .24, null, [.4, 0, 0]);
      };
      // Left arm swings; the right arm holds the weapon steady
      if (s < 0)
        arm = rig(-.5, 1.42, 0, f);
      else
        f();
    });
    if (sel)
      swordAt(.58, 1, .3, 2);
    else {
      // Two-pronged plasma rifle
      const gun = Ph(0x5a6070, 90);
      [-1, 1].forEach(k => ball(gun, .58 + k * .05, .98, .52, .08, .12, .42));
      ball(glow(0xff7be0), .58, .98, .72, .07);
      P3(B(.04, .12, .06), dark, .58, .9, .4);
    }
  }
  else {
    // Hunter: hunched armored shell with back spines, exposed orange worm colonies at belly and back,
    // spiked shield and fuel-rod cannon
    mat = armor(0xb5652c);
    const worm = mcache('worm', () => new THREE.MeshPhongMaterial({ color: 0xd8762a, emissive: 0x4a1800, shininess: 30 }));
    const dark = Ph(0x2b2b2b, 50);
    const shM = mcache('hsh', () => new THREE.MeshPhongMaterial({ color: 0x3e4c63, shininess: 70, specular: 0x8899bb }));
    legs = [-1, 1].map(s => rig(s * .32, .9, 0, () => {
      P3(Cy(.24, .19, .5, 10), mat, s * .32, .66, 0);
      ball(mat, s * .33, .43, .06, .36, .3, .36);
      P3(Cy(.19, .26, .42, 10), mat, s * .33, .22, .04);
      P3(B(.42, .1, .56), dark, s * .33, .04, .1);
    }));
    [-1, 1].forEach(s => {
      dome(mat, s * .56, 1.42, -.02, .62, .46, .7, [0, 0, -s * .5]);
      P3(B(.5, .42, .1), mat, s * .21, 1.18, .28, null, [.25, s * .3, 0]);
    });
    // Exposed worms in the stomach, between the chest plates (the front weak point sits among them)
    for (let i = 0; i < 8; i++)
      ball(worm, R(-.1, .1), R(.95, 1.35), R(.3, .4), R(.13, .19));
    dome(mat, 0, 1.0, -.05, 1.2, 1.1, 1.1, [-.35, 0, 0]);
    for (let i = 0; i < 5; i++)
      ball(worm, R(-.1, .1), 1.15 + R(-.15, .15), -.56, R(.14, .18));
    for (let i = 0; i < 5; i++)
      [-1, 1].forEach(s => P3(Co(.06, .36, 5), dark, s * .18, 1.52 - i * .1, -.18 - i * .09, null, [-.9 - i * .15, 0, s * .25]));
    ball(mat, 0, 1.6, .3, .34, .3, .36);
    P3(B(.24, .05, .06), glow(0xffa040), 0, 1.63, .47);
    [-.24, -.12, 0, .12, .24].forEach(x => P3(Co(.045, .3, 5), dark, x, 1.78 - Math.abs(x) * .6, .16, null, [-.5, 0, -x * 2.2]));
    // Shield arm: blue-grey metal plate with a glow strip and edge spikes
    limb([[-.5, 1.3, 0], [-.75, 1.15, .3]], .12, mat);
    P3(B(1.1, 1.5, .12), shM, -.85, 1.1, .35);
    P3(B(.08, 1.2, .14), glow(0x4fa8ff), -.85, 1.1, .4);
    [-.6, -.2, .2, .6].forEach(y => P3(Co(.06, .3, 5), dark, -1.42, 1.1 + y, .35, null, [0, 0, Math.PI / 2]));
    // Cannon arm: fuel-rod cannon wrapped in worm coils
    limb([[.5, 1.3, 0], [.7, 1.15, .2]], .12, mat);
    P3(Cy(.2, .24, 1, 10), dark, .75, 1.1, .6, null, [Math.PI / 2, 0, 0]);
    [.35, .6, .85].forEach(z => P3(gcache('ht', () => new THREE.TorusGeometry(.24, .04, 6, 16)), worm, .75, 1.1, z));
    ball(glow(0x7dff6a), .75, 1.1, 1.1, .24);
  }
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
  // Tankier per mission cleared and per room within a mission
  const dm = (1 + .4 * P.done.length) * (1 + .06 * Math.max(0, lroom - 1)) * DIFF.hp * (1 + (d.bn ? .9 : .25) * NET.others()); // bosses scale much harder with extra co-op players
  g.position.set(x, 0, z);
  scene.add(g);
  // Bosses get glowing weak points (a solid core plus a pulsing halo) attached to the model
  let crits = null;
  if (d.bn) {
    const C = CRITS[(d.model || t) === 'hunter' ? 'hunter' : 'elite'];
    crits = C.pts.map(([cx, cy, cz, r]) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), new THREE.MeshBasicMaterial({ color: C.col }));
      const h = new THREE.Mesh(new THREE.SphereGeometry(r * 1.7, 12, 10), new THREE.MeshBasicMaterial({ color: C.col, transparent: true, opacity: .35, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.position.set(cx, cy, cz);
      h.position.copy(m.position);
      g.add(m, h);
      return { m, h, r };
    });
  }
  enemies.push({ ...d, t, x, z, id: ++NET.eid, fr: d.fr * DIFF.fr, bs: d.bs * DIFF.bs, g, mat, aura, sw, kg, crits, legs, arm, px: x, pz: z, ph: R(0, 6.28), gs: 0, kf: 0, lcd: R(.3, 1), lunge: 0, wind: 0, swing: 0, hp: d.hp * dm, sh: d.sh * dm, maxhp: d.hp * dm, maxsh: d.sh * dm, boss: !!d.bn, sumT: 8, cd: R(1.2, 2.4), dir: Math.random() < .5 ? 1 : -1, dirT: R(1, 3), flash: 0 });
}

function hurt(d) {
  if (state !== 'play' || NET.down)
    return;
  P.last = T;
  vig = .7;
  sfx.hit(P.sh > 0);
  d *= DIFF.dmg;
  if (P.dr)
    d *= 1 - P.dr;
  if (P.sh > 0) {
    P.sh -= d;
    if (P.sh <= 0) {
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
    dropMaybe(e);
    earn(e.boss ? 0 : 1);
    scene.remove(e.g);
    if (P.adr)
      P.adrT = 3;
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
  explode(e.x, (e.y || 0) + 1, e.z, 4.5, 60, 35, 'n', true);
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
    t = Math.min(t, rayBox(o.x, o.z, d.x, d.z, b));
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
