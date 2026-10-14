/*
 * arcmap.js: "Arc Facility", the Warzone Firefight map: a UNSC excavation complex in a dark rocky quarry, after the
 * industrial Halo 5 Warzone maps. Classic script (no modules): all files share one global scope.
 *
 * South: the team base (building 01) with the REQ station inside. Middle: the excavation pit with a working drill rig,
 * cargo containers and barriers. West: a huge natural rock arch. East: building 02 with a swinging crane and steaming
 * pipelines. North (the enemy side): a silo on a rocky hill with catwalks, a pipe bridge to a watchtower and a Covenant
 * drop beacon. Moving parts (radar dish, drill, crane, sweeping floodlights, blinking beacons, steam, dust) run in
 * envTick. Everything solid is a box collider in `pillars`; the ground is groundArc (see groundH in core.js).
 */

const ARC = { id: 'arc', n: 'Arc Facility', rooms: 0, A: 70, cut: 30, fog: 0x3c4652, fogN: 45, fogF: 230, sky: [0x26303e, 0x6a7482, 0x30343a], hemi: [0xc0ccdc, 0x3a3630, .95], sun: [0xffe2c4, .8, -6, 10, 4], trim: 0xffa040, sty: 'arc', lay: [] };
// [x, z, height, radius] rough mounds across the quarry floor
const ARC_MOUNDS = [[-20, -20, 1.4, 7], [22, 8, 1.2, 6], [-8, 32, 1.6, 8], [33, -48, 1.2, 6], [-38, -45, 1.5, 7], [-48, 5, 1.6, 8], [50, 2, 1.4, 7]];
// level ground under buildings: [centre x, centre z, half-width, half-depth]
const ARC_PADS = [[0, -57, 17, 12], [45, -25, 9, 11], [-28, 56, 6, 6], [0, 50, 8, 6]];

function groundArc(x, z) {
  let h = .25 * Math.sin(x * .19 + 1) * Math.cos(z * .23) + .15 * Math.sin(x * .41 - z * .37);
  // rocky banks rising toward the side cliffs
  h += 5 * smooth01((Math.abs(x) - 46) / 18);
  // the silo's hill (north-east) and a rise in the north-west
  h += 3.4 * Math.exp(-((x - 26) ** 2 + (z - 50) ** 2) / 170) + 2 * Math.exp(-((x + 34) ** 2 + (z - 34) ** 2) / 120);
  // the excavation pit
  h -= 1.6 * Math.exp(-((x - 4) ** 2 + (z - 10) ** 2) / 90);
  for (const [mx, mz, mh, r] of ARC_MOUNDS)
    h += mh * Math.exp(-((x - mx) ** 2 + (z - mz) ** 2) / (r * r));
  for (const [px, pz, hw, hd] of ARC_PADS) {
    const d = Math.max(Math.abs(x - px) - hw, Math.abs(z - pz) - hd);
    h *= smooth01(d / 6);
  }
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

function arcBuild({ add, M, G, B, WL, walls, wallH, spots, onW, hills, ground }) {
  let sd = 424242;
  const rnd = () => (sd = sd * 16807 % 2147483647) / 2147483647;
  const RR = (a, b) => a + rnd() * (b - a);
  const tex = (k, w, h, rx, ry, draw, extra) => mat(k + rx + 'x' + ry, () => new THREE.MeshLambertMaterial(Object.assign({ map: ctex(k + rx + 'x' + ry, w, h, rx, ry, draw) }, extra || {})));
  const rockM = mat('arcRock', () => new THREE.MeshPhongMaterial({ color: 0x4a4a4c, flatShading: true, shininess: 6 }));
  const rockD = mat('arcRockD', () => new THREE.MeshPhongMaterial({ color: 0x343436, flatShading: true, shininess: 4 }));
  const steel = mat('arcSteel', () => new THREE.MeshPhongMaterial({ color: 0x5c6268, shininess: 60, specular: 0x666a70 }));
  const dark = mat('arcDark', () => new THREE.MeshPhongMaterial({ color: 0x2a2e33, shininess: 40 }));
  const orange = mat('arcOrange', () => new THREE.MeshPhongMaterial({ color: 0xd06a22, shininess: 40 }));
  const lampM = G(0xffd9a0);
  const panel = tex('panel', 256, 256, 2, 2, DR.panel);
  const hazard = tex('hazard', 128, 32, 4, 1, DR.hazard);
  const sign1 = tex('sign01', 256, 160, 1, 1, DR.sign01);
  const sign2 = tex('sign02', 256, 160, 1, 1, DR.sign02);
  const cont = c => mat('cont' + c, () => new THREE.MeshLambertMaterial({ map: ctex('cont', 128, 64, 3, 1, DR.cont), color: c }));
  // solid box with a collider, standing on the ground at its centre
  const solid = (x, z, hw, hd, h, m, y0) => {
    const gy = y0 == null ? groundH(x, z) : y0;
    pillars.push({ x, z, hw, hd, h: gy + h });
    return add(B(hw * 2, h, hd * 2), m, x, gy + h / 2, z);
  };
  const lights = [];   // blinking beacons
  const spins = [];    // [object, axis, speed]
  const sweeps = [];   // floodlight heads that sweep back and forth
  const vents = [];    // steam vent positions

  // Sky, distant ring, the quarry beyond
  const band = ringBand(1800, 150, 0xc8d0e0, .3);
  band.rotation.z = Math.PI / 2;
  band.position.set(-400, 1760, -900);
  envG.add(band);
  ground(mat('gravelBig', () => new THREE.MeshLambertMaterial({ map: ctex('gravelBig', 256, 256, 160, 160, DR.gravel) })));
  hills(34, 140, 320, 40, 110, 0x3c3e42);

  // Terrain mesh
  groundFn = groundArc;
  floor.visible = false;
  const tg = new THREE.PlaneGeometry(A * 2, A * 2, 120, 120);
  tg.rotateX(-Math.PI / 2);
  const tp = tg.attributes.position;
  const col = [];
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i);
    const z = tp.getZ(i);
    const h = groundArc(x, z);
    tp.setY(i, h);
    const k = Math.min(1.1, .82 + h * .05 + .08 * Math.sin(x * .3 + z * .17) * Math.cos(z * .21 - x * .13));
    col.push(k, k * .98, k * .95);
  }
  tg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  tg.computeVertexNormals();
  envG.add(new THREE.Mesh(tg, mat('arcGround', () => new THREE.MeshLambertMaterial({ map: ctex('gravel', 256, 256, 22, 22, DR.gravel), vertexColors: true }))));

  // Quarry walls: rock faces with boulders along the rim and the foot
  walls(14, rockM, 18);
  WL.forEach(wl => {
    const h = wallH(wl, 14, 18);
    spots(wl, 6).forEach(t => {
      const s = R(3, 6);
      onW(wl, t + R(-2, 2), h + R(-2, 1), new THREE.DodecahedronGeometry(s), rockD, -1.8).rotation.set(R(0, 3), R(0, 3), 0);
    });
    spots(wl, 8).forEach(t => {
      const s = R(2, 3.5);
      onW(wl, t + R(-3, 3), 4 + s * .3, new THREE.DodecahedronGeometry(s), rockM, -s * .7).scale.y = .7;
    });
  });

  // ---- Building 01: the team base (doors on the front and both sides; REQ station inside) ----
  const bz = -57;
  const bh = 9;
  [[0, -66, 14, .4], [-14, -62.5, .4, 3.5], [-14, -51.5, .4, 3.5], [14, -62.5, .4, 3.5], [14, -51.5, .4, 3.5], [-9.5, -48, 4.5, .4], [9.5, -48, 4.5, .4]]
    .forEach(([x, z, hw, hd]) => solid(x, z, hw, hd, bh, panel, 0));
  add(B(30, .8, 20), dark, 0, bh + .4, bz);
  add(B(31, .4, 21), steel, 0, bh + .9, bz);
  add(B(28, .05, 18), mat('arcConc', () => new THREE.MeshLambertMaterial({ color: 0x6a6a66 })), 0, .03, bz);
  // door frame, hazard stripe and lights over the main door
  add(B(10.6, .7, .6), dark, 0, 6.2, -47.7);
  add(B(10, .35, .1), hazard, 0, 5.75, -47.4);
  [-4.6, 4.6].forEach(x => add(B(.5, 6, .6), orange, x, 3, -47.7));
  [-3, 0, 3].forEach(x => add(B(.8, .15, .3), lampM, x, 6.6, -47.3));
  // 01 signs and a horizontal stripe on the front face, interior lights
  [-9.5, 9.5].forEach(x => {
    add(new THREE.PlaneGeometry(3.4, 2.1), sign1, x, 6.5, -47.55);
    add(B(9, .25, .05), orange, x, 2.2, -47.56);
  });
  [[-7, -55], [7, -55], [-7, -62], [7, -62]].forEach(([x, z]) => add(B(2.4, .1, .8), lampM, x, bh - .1, z));
  const bl = new THREE.PointLight(0xffd0a0, .9, 30);
  bl.position.set(0, 6, -56);
  envG.add(bl);
  // storage tanks at the corners, rooftop vents, an antenna and a radar dish that turns
  [[-17.5, -63], [17.5, -63]].forEach(([x, z]) => {
    solid(x, z, 2.2, 2.2, 7, steel, 0);
    add(new THREE.CylinderGeometry(2.3, 2.3, 7.2, 16), steel, x, 3.6, z);
    add(new THREE.CylinderGeometry(2.4, 2.4, .3, 16), dark, x, 7.2, z);
    add(new THREE.CylinderGeometry(2.35, 2.35, .4, 16), orange, x, 4, z);
  });
  [-8, 8].forEach(x => {
    add(B(3, 1.6, 3), dark, x, bh + 1.9, -62);
    const fan = add(new THREE.CylinderGeometry(1.2, 1.2, .1, 6), steel, x, bh + 2.75, -62);
    spins.push([fan, 'y', 5]);
  });
  add(new THREE.CylinderGeometry(.12, .2, 8, 6), steel, 10, bh + 5, -52);
  const beacon1 = add(new THREE.SphereGeometry(.35, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3020 }), 10, bh + 9.2, -52);
  lights.push(beacon1);
  const dish = new THREE.Group();
  dish.position.set(-8, bh + 2, -52);
  const dm = new THREE.Mesh(new THREE.SphereGeometry(2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3), steel);
  dm.rotation.x = Math.PI / 2 + .5;
  dm.position.y = 1.6;
  dish.add(new THREE.Mesh(new THREE.CylinderGeometry(.3, .5, 1.6, 8), dark), dm);
  dish.children[0].position.y = .8;
  envG.add(dish);
  spins.push([dish, 'y', .6]);
  // inside: weapon racks and lockers along the back wall, crates
  [-10, -6, 6, 10].forEach(x => add(B(2.6, 2.4, .6), dark, x, 1.2, -65.3));
  [[-10, -52], [10, -52]].forEach(([x, z]) => solid(x, z, .8, .8, 1.6, cont(0x6a7a4a), 0));

  // ---- Building 02 (east), with a crane on the roof and pipelines heading west ----
  const ex = 45;
  const ez = -25;
  [[ex + 6, ez, .4, 8], [ex, ez - 8, 6, .4], [ex, ez + 8, 6, .4], [ex - 6, ez - 5.5, .4, 2.5], [ex - 6, ez + 5.5, .4, 2.5]].forEach(([x, z, hw, hd]) => solid(x, z, hw, hd, 8, panel, 0));
  add(B(13, .6, 17), dark, ex, 8.3, ez);
  add(new THREE.PlaneGeometry(3.2, 2), sign2, ex - 6.45, 6.2, ez - 5.5).rotation.y = -Math.PI / 2;
  add(B(.1, .3, 6), hazard, ex - 6.45, 6.9, ez).rotation.y = Math.PI / 2;
  const crane = new THREE.Group();
  crane.position.set(ex, 8.6, ez + 3);
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
  const pl2 = new THREE.PointLight(0xffc890, .6, 24);
  pl2.position.set(ex - 8, 5, ez);
  envG.add(pl2);
  // two pipelines with supports and a gap to cross; steam vents along them
  [[19, 26], [30, 38.5]].forEach(([x0, x1]) => {
    const cx = (x0 + x1) / 2;
    const len = x1 - x0;
    pillars.push({ x: cx, z: -22.6, hw: len / 2, hd: 1.1, h: groundH(cx, -22.6) + 1.5 });
    [-22, -23.3].forEach(z => {
      const p = add(new THREE.CylinderGeometry(.5, .5, len, 10), steel, cx, groundH(cx, z) + .8, z);
      p.rotation.z = Math.PI / 2;
    });
    for (let x = x0 + 1; x < x1; x += 3)
      add(B(.3, 1, 2.2), dark, x, groundH(x, -22.6) + .4, -22.6);
    vents.push([x0 + 1, groundH(x0 + 1, -22) + 1.3, -22], [x1 - 1, groundH(x1 - 1, -23.3) + 1.3, -23.3]);
  });

  // ---- The rock arch (west), and rock clusters around the quarry ----
  const a0 = new THREE.Vector3(-36, 0, 0);
  const a1 = new THREE.Vector3(-16, 0, 18);
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const p = a0.clone().lerp(a1, t);
    const s = 2.6 + Math.sin(Math.PI * t) * .4 + rnd() * .6;
    add(new THREE.DodecahedronGeometry(s), i % 2 ? rockD : rockM, p.x + RR(-.6, .6), groundH(p.x, p.z) + Math.sin(Math.PI * t) * 13 + 1, p.z + RR(-.6, .6)).rotation.set(rnd() * 3, rnd() * 3, 0);
  }
  [a0, a1].forEach(p => {
    solid(p.x, p.z, 2.6, 2.6, 6, rockD);
    add(new THREE.DodecahedronGeometry(3.6), rockM, p.x, groundH(p.x, p.z) + 2, p.z).scale.y = 1.4;
  });
  [[-50, -22], [-46, 22], [52, 18], [-26, -34], [30, 32], [-6, 44], [52, -50], [-54, 42], [24, -42], [-2, 22]].forEach(([cx, cz]) => {
    const n = 2 + (rnd() * 3 | 0);
    for (let i = 0; i < n; i++) {
      const x = cx + RR(-3, 3);
      const z = cz + RR(-3, 3);
      const s = RR(1.4, 3);
      const g = groundH(x, z);
      pillars.push({ x, z, hw: s * .7, hd: s * .7, h: g + s * 1.3 });
      const o = add(new THREE.DodecahedronGeometry(s), rnd() < .5 ? rockM : rockD, x, g + s * .35, z);
      o.scale.y = .85;
      o.rotation.y = rnd() * 3;
    }
  });

  // ---- The excavation pit: drill rig with a spinning bit, floodlights, containers, barriers ----
  const dx = 4;
  const dz = 10;
  const dg = groundH(dx, dz);
  [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]].forEach(([ox, oz]) => {
    const leg = add(B(.35, 11, .35), orange, dx + ox * .8, dg + 5.5, dz + oz * .8);
    leg.rotation.set(oz * -.06, 0, ox * .06);
  });
  pillars.push({ x: dx, z: dz, hw: 1.8, hd: 1.8, h: dg + 11 });
  add(B(4.4, .5, 4.4), dark, dx, dg + 11, dz);
  add(B(3, 1.6, 3), steel, dx, dg + 12, dz);
  const bit = add(new THREE.CylinderGeometry(.5, .5, 8, 8), steel, dx, dg + 5, dz);
  add(new THREE.ConeGeometry(.6, 1.4, 8), dark, dx, dg + .5, dz).rotation.x = Math.PI;
  spins.push([bit, 'y', 6]);
  const beacon2 = add(new THREE.SphereGeometry(.3, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffa020 }), dx, dg + 13.1, dz);
  lights.push(beacon2);
  vents.push([dx + 2, dg + .4, dz + 1], [dx - 2, dg + .4, dz - 1]);
  // floodlight towers with sweeping beams
  [[-12, -16], [20, 26], [-26, 34], [26, -10]].forEach(([x, z], i) => {
    const g = groundH(x, z);
    solid(x, z, .4, .4, 9, dark);
    const head = new THREE.Group();
    head.position.set(x, g + 9.2, z);
    const lampBox = new THREE.Mesh(new THREE.BoxGeometry(1.4, .8, .8), steel);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.2, .6), lampM);
    face.position.z = .41;
    const beam = new THREE.Mesh(new THREE.ConeGeometry(4, 16, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: .08, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    beam.rotation.x = -Math.PI / 2;
    beam.position.z = 8;
    const aim = new THREE.Group();
    aim.rotation.x = .55;
    aim.add(lampBox, face, beam);
    head.add(aim);
    envG.add(head);
    sweeps.push([head, i * 1.7, Math.atan2(-x, -z)]);
  });
  const pl3 = new THREE.PointLight(0xfff0d0, .7, 40);
  pl3.position.set(dx, 10, dz);
  envG.add(pl3);
  // cargo containers (some stacked), barrier blocks, crates and barrels
  const CONT = [[-6, -24, 'x', 0xb05a28, 1], [10, -14, 'z', 0x2f5a8a, 0], [-22, 2, 'z', 0x7a7e82, 1], [20, 4, 'x', 0x8a2a24, 0], [-14, 26, 'x', 0x2f5a8a, 0],
    [12, 36, 'z', 0xb05a28, 1], [32, -6, 'z', 0x7a7e82, 0], [-34, -30, 'x', 0x8a2a24, 1], [36, 28, 'x', 0xb05a28, 0], [-3, -6, 'x', 0x5a6a3a, 0], [-40, 12, 'z', 0x7a7e82, 0], [42, -44, 'x', 0x2f5a8a, 0]];
  CONT.forEach(([x, z, ax, c, stack]) => {
    const hw = ax === 'x' ? 3.05 : 1.2;
    const hd = ax === 'x' ? 1.2 : 3.05;
    const g = groundH(x, z);
    pillars.push({ x, z, hw, hd, h: g + 2.6 * (stack ? 2 : 1) });
    add(B(hw * 2, 2.6, hd * 2), cont(c), x, g + 1.3, z);
    if (stack)
      add(B(hw * 2, 2.6, hd * 2), cont(CONT[(x * 7 + z) & 3 ? 1 : 3][3]), x + (ax === 'x' ? .3 : 0), g + 3.9, z + (ax === 'z' ? .3 : 0)).rotation.y = .04;
  });
  [[-14, -32, 'x'], [14, -30, 'x'], [0, -28, 'x'], [-28, -8, 'z'], [26, 14, 'z'], [0, 30, 'x'], [-18, 42, 'x'], [16, 46, 'x'], [-40, -8, 'x'], [40, 8, 'z']].forEach(([x, z, ax]) => {
    const hw = ax === 'x' ? 2 : .5;
    const hd = ax === 'x' ? .5 : 2;
    solid(x, z, hw, hd, 1.15, mat('arcBarrier', () => new THREE.MeshLambertMaterial({ color: 0x8a8a84 })));
    add(B(hw * 2 + .02, .2, hd * 2 + .02), hazard, x, groundH(x, z) + .95, z);
  });
  for (let i = 0; i < 40; i++) {
    const x = RR(-55, 55);
    const z = RR(-40, 60);
    if (pillars.some(q => Math.abs(x - q.x) < (q.hw || 1.5) + 1.5 && Math.abs(z - q.z) < (q.hd || 1.5) + 1.5))
      continue;
    const g = groundH(x, z);
    if (rnd() < .5)
      add(B(.9, .9, .9), cont(0x6a5a3a), x, g + .45, z).rotation.y = rnd() * 3;
    else
      add(new THREE.CylinderGeometry(.35, .35, 1, 10), rnd() < .5 ? orange : steel, x, g + .5, z);
  }

  // ---- North: the silo on its hill, a watchtower, a pipe bridge, and the Covenant drop beacon ----
  const sx = 26;
  const sz = 52;
  const sg = groundH(sx, sz) - 1;
  solid(sx, sz, 6.5, 6.5, 22, steel, sg);
  add(new THREE.CylinderGeometry(7, 7.4, 20, 24), mat('arcSilo', () => new THREE.MeshPhongMaterial({ color: 0xb8b8b0, shininess: 30 })), sx, sg + 10, sz);
  add(new THREE.SphereGeometry(7, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), steel, sx, sg + 20, sz);
  [5, 11, 16].forEach(y => add(new THREE.TorusGeometry(7.6, .18, 6, 32), dark, sx, sg + y, sz).rotation.x = Math.PI / 2);
  add(new THREE.PlaneGeometry(4, 2.5), sign1, sx - 3, sg + 13, sz - 6.95).rotation.y = Math.PI + .4;
  const beacon3 = add(new THREE.SphereGeometry(.45, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3020 }), sx, sg + 27.6, sz);
  add(new THREE.CylinderGeometry(.1, .1, 1.2, 6), dark, sx, sg + 27, sz);
  lights.push(beacon3);
  const tx = -28;
  const tz = 56;
  solid(tx, tz, 3, 3, 16, panel, 0);
  add(B(7, .6, 7), dark, tx, 16.3, tz);
  add(B(6.2, 2, .1), mat('arcGlass', () => new THREE.MeshBasicMaterial({ color: 0x8fd0ff, transparent: true, opacity: .5 })), tx, 14.5, tz - 3.06);
  // pipe bridge from the silo to the tower (overhead)
  const bx0 = sx - 7.4;
  const len = bx0 - tx - 3;
  add(B(len, .5, 2.4), dark, tx + 3 + len / 2, 14, (sz + tz) / 2);
  add(new THREE.CylinderGeometry(.6, .6, len, 10), steel, tx + 3 + len / 2, 14.9, (sz + tz) / 2 - .6).rotation.z = Math.PI / 2;
  [-1, 1].forEach(s => add(B(len, .9, .08), steel, tx + 3 + len / 2, 14.7, (sz + tz) / 2 + s * 1.2));
  // Covenant drop beacon: a purple pylon and a pulsing ring where the enemy drops in
  const cov = mat('arcCov', () => new THREE.MeshPhongMaterial({ color: 0x5a3a8a, shininess: 100, specular: 0xb08aff }));
  solid(0, 50, 1, 1, 6, cov);
  add(new THREE.OctahedronGeometry(.9), G(0xc89aff), 0, groundH(0, 50) + 7, 0 + 50);
  const ring = add(new THREE.RingGeometry(4.5, 5, 48), new THREE.MeshBasicMaterial({ color: 0xb48cff, transparent: true, opacity: .4, side: THREE.DoubleSide, depthWrite: false }), 0, groundH(0, 50) + .08, 50);
  ring.rotation.x = -Math.PI / 2;
  [[-4, 47], [4, 53], [5, 46]].forEach(([x, z]) => add(B(1.6, 1, 1.2), cov, x, groundH(x, z) + .5, z).rotation.y = rnd() * 3);

  // ---- Steam and drifting dust ----
  const steamN = 60 * vents.length;
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
  const dp = new Float32Array(500 * 3);
  for (let i = 0; i < 500; i++) {
    dp[i * 3] = R(-65, 65);
    dp[i * 3 + 1] = R(.5, 9);
    dp[i * 3 + 2] = R(-65, 65);
  }
  dgeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  envG.add(new THREE.Points(dgeo, new THREE.PointsMaterial({ color: 0xb8b0a0, size: .1, transparent: true, opacity: .6, depthWrite: false })));

  envTick = dt => {
    spins.forEach(([o, ax, s]) => o.rotation[ax] += s * dt);
    lights.forEach((l, i) => l.visible = Math.floor(T * 1.6 + i * .5) % 2 === 0);
    sweeps.forEach(([h, ph, base]) => h.rotation.y = base + Math.sin(T * .35 + ph) * .9);
    crane.rotation.y = Math.sin(T * .12) * 1.1;
    ring.material.opacity = .25 + .2 * Math.sin(T * 3);
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
    for (let i = 0; i < 1500; i += 3) {
      dp[i] += 1.2 * dt;
      if (dp[i] > 65)
        dp[i] = -65;
    }
    dgeo.attributes.position.needsUpdate = true;
  };
}
