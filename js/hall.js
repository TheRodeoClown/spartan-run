/*
 * hall.js: the walk between rooms. Classic script (no modules): all files share one global scope, so load order in
 * index.html matters (after levels.js and graphics.js).
 *
 * Step through a cleared room's exit and pick your boon, and instead of the next room just loading, you walk a
 * hallway styled after the level (a Covenant ship's corridor, a Forerunner passage, a Flood-choked tunnel, or a rocky
 * canyon path under the sky outdoors) to a door at the far end; through it, the next room starts, and you enter it
 * through an open doorway in its south wall. In co-op you're marked ready at the end of the hallway (the room starts
 * when the whole squad has walked through). A new mission after a boss still loads straight in.
 */

const HALL = { on: false, endZ: -18, done: null };
const HALL_IN = ['cc', 'fr', 'fl'];

function enterHall(done) {
  HALL.on = true;
  HALL.done = done;
  clearHz();
  drops.forEach(d => scene.remove(d.m));
  drops = [];
  buildHall(L);
  P.x = 0;
  P.z = 17;
  P.y = 0;
  P.vy = 0;
  P.dash = 0;
  yaw = 0;
  pitch = 0;
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
  if (!HALL.on || state !== 'play' || P.z > HALL.endZ)
    return false;
  const d = HALL.done;
  HALL.on = false;
  sfx.room();
  d();
  return true;
}

function buildHall(lv) {
  // the same clean slate buildLevel starts from
  setArena(26, 10);
  groundFn = null;
  floor.visible = true;
  gate = null;
  titleScene = false;
  while (envG.children.length)
    envG.remove(envG.children[0]);
  pillars.length = 0;
  decks.length = 0;
  perches.length = 0;
  edgeFn = null;
  waterFn = null;
  envTick = null;
  scene.background.setHex(lv.fog);
  scene.fog.color.setHex(lv.fog);
  scene.fog.near = 10;
  scene.fog.far = 70;
  floor.material = floorMat(lv.sty);
  hemi.color.setHex(lv.hemi[0]);
  hemi.groundColor.setHex(lv.hemi[1]);
  hemi.intensity = lv.hemi[2];
  dl.color.setHex(lv.sun[0]);
  dl.intensity = lv.sun[1];
  dl.position.set(lv.sun[2], lv.sun[3], lv.sun[4]);
  const add = (geo, m, x, y, z) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    envG.add(o);
    return o;
  };
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const glowM = c => mat('hallGlow' + c, () => new THREE.MeshBasicMaterial({ color: c }));
  const L2 = 21;   // the hallway runs from z +L2 (where you come in) to -L2 (the door out)
  const indoor = HALL_IN.includes(lv.sty);
  let sd = 99 + room * 7;
  const rnd = () => (sd = sd * 16807 % 2147483647) / 2147483647;
  if (indoor) {
    // a corridor: walls, a ceiling, ribs every 4m, glowing strips along the ceiling and the floor edges
    const look = lv.sty === 'cc' ? { wall: 0x3a2c5c, rib: 0x5a3f9a, glow: 0xb48cff, shine: 100 }
      : lv.sty === 'fl' ? { wall: 0x4a4636, rib: 0x5a5440, glow: 0xd0ff60, shine: 20 }
        : { wall: 0x7f878d, rib: 0x5d666e, glow: 0x40e8ff, shine: 60 };
    const wallM = mat('hallW' + lv.sty, () => gfxShiny(new THREE.MeshPhongMaterial({ color: look.wall, shininess: look.shine, specular: 0x667080 }), .12));
    const ribM = mat('hallR' + lv.sty, () => gfxShiny(new THREE.MeshPhongMaterial({ color: look.rib, shininess: look.shine, specular: 0x8890a0 }), .16));
    [-1, 1].forEach(s => {
      add(B(.4, 5.4, L2 * 2 + 2), wallM, s * 3.9, 2.7, 0);
      pillars.push({ x: s * 3.9, z: 0, hw: .2, hd: L2 + 1, h: 6 });
      add(B(.06, .12, L2 * 2), glowM(look.glow), s * 3.66, .25, 0);
      add(B(.4, .1, L2 * 2), glowM(look.glow), s * 2.6, 5.12, 0);
    });
    add(B(8.2, .3, L2 * 2 + 2), wallM, 0, 5.4, 0);
    for (let z = -L2 + 2; z <= L2 - 2; z += 4) {
      [-1, 1].forEach(s => add(B(.5, 5.2, .5), ribM, s * 3.55, 2.6, z));
      add(B(7.6, .5, .5), ribM, 0, 5.05, z);
    }
    if (lv.sty === 'fl') {
      // Flood growth creeping over the walls
      const F = floodMats();
      for (let i = 0; i < 26; i++) {
        const s = rnd() < .5 ? -1 : 1;
        const o = add(new THREE.SphereGeometry(1, 10, 8), rnd() < .7 ? F.flesh : F.rot, s * (3.5 - rnd() * .3), rnd() * 4.6, -L2 + rnd() * L2 * 2);
        o.scale.set(.3 + rnd() * .4, .3 + rnd() * .6, .4 + rnd() * .7);
      }
    }
  }
  else {
    // outdoors: a rocky canyon path under the sky, boulders along both sides
    if (lv.sky)
      envG.add(skyDome(...lv.sky));
    const rockM = mat('hallRock' + lv.sty, () => new THREE.MeshPhongMaterial({ color: lv.sty === 'sn' ? 0xb8c4cc : lv.sty === 'ds' ? 0x8a6a4a : 0x6a6458, flatShading: true, shininess: 6 }));
    [-1, 1].forEach(s => {
      pillars.push({ x: s * 4.9, z: 0, hw: 1, hd: L2 + 1, h: 9 });
      for (let z = -L2 - 1; z <= L2 + 1; z += 2.6) {
        const r = 1.8 + rnd() * 1.6;
        const o = add(new THREE.DodecahedronGeometry(r), rockM, s * (4.6 + r * .6), r * .7, z + rnd() - .5);
        o.rotation.set(rnd() * 3, rnd() * 3, 0);
        o.scale.y = 1.2 + rnd() * .9;
      }
      for (let z = -L2; z <= L2; z += 7) {
        const r = 3 + rnd() * 2;
        add(new THREE.DodecahedronGeometry(r), rockM, s * (8 + rnd() * 2), r * 1.4, z).scale.y = 1.6;
      }
    });
    for (let i = 0; i < 6; i++) {
      const o = add(new THREE.DodecahedronGeometry(.25 + rnd() * .3), rockM, (rnd() - .5) * 5, .15, -L2 + rnd() * L2 * 2);
      o.rotation.set(rnd() * 3, rnd() * 3, 0);
    }
  }
  // the walls at each end, the sealed door behind you and the open one ahead
  const frameM = mat('gateFrame', () => new THREE.MeshPhongMaterial({ color: 0x30363d, shininess: 40, specular: 0x556070 }));
  [[L2 + .6, 0xff4030, .4], [-L2 - .6, 0x40ffa0, .5]].forEach(([z, c, o]) => {
    pillars.push({ x: 0, z: z + Math.sign(z) * .6, hw: 6, hd: .3, h: 8 });
    add(B(12, 7, .4), indoor ? mat('hallW' + lv.sty, () => frameM) : frameM, 0, 3.5, z + Math.sign(z) * .6);
    [-2.4, 2.4].forEach(x => add(B(.6, 4.4, .8), frameM, x, 2.2, z));
    add(B(5.4, .6, .8), frameM, 0, 4.4, z);
    const f = add(new THREE.PlaneGeometry(4.2, 4.1), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, side: THREE.DoubleSide, depthWrite: false }), 0, 2.05, z);
    if (z < 0)
      HALL.field = f;
  });
  // chevrons on the floor pointing at the way out
  for (let z = L2 - 6; z > -L2 + 2; z -= 5) {
    const c = add(new THREE.RingGeometry(.5, .8, 3, 1, Math.PI / 2 - 1, 2), new THREE.MeshBasicMaterial({ color: 0x40ffa0, transparent: true, opacity: .35, side: THREE.DoubleSide, depthWrite: false }), 0, .04, z);
    c.rotation.x = -Math.PI / 2;
  }
  envTick = () => {
    if (HALL.field)
      HALL.field.material.opacity = .35 + .2 * Math.sin(T * 5);
  };
  gfxLevel(lv);
}

// The open doorway you came in through, in the south wall behind you as a room starts
function addEntry() {
  const g = new THREE.Group();
  const frameM = mat('gateFrame', () => new THREE.MeshPhongMaterial({ color: 0x30363d, shininess: 40, specular: 0x556070 }));
  [-2.4, 2.4].forEach(x => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(.6, 4.4, .8), frameM);
    p.position.set(x, 2.2, 0);
    g.add(p);
  });
  const top = new THREE.Mesh(new THREE.BoxGeometry(5.4, .6, .8), frameM);
  top.position.y = 4.4;
  g.add(top);
  const dark = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.1), new THREE.MeshBasicMaterial({ color: 0x0a0e14, transparent: true, opacity: .85, side: THREE.DoubleSide }));
  dark.position.y = 2.05;
  g.add(dark);
  g.position.set(0, groundH(0, IN - .5), IN - .5);
  envG.add(g);
}
