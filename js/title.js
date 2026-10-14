/*
 * title.js: The title-screen scene: a twilight meadow on the ring, with an ancient Forerunner stone portal, broken
 * arches, pines, mountains and a lake, the ring band rising into a purple sky, and sparkles and fireflies.
 * Classic script (no modules): all files share one global scope, so load order in index.html matters.
 */

// Camera target for the title: the portal's centre
const TITLE_LOOK = new THREE.Vector3(0, 7.6, -18);

function buildTitle() {
  // Same clean-up buildLevel does, without an arena
  while (envG.children.length)
    envG.remove(envG.children[0]);
  pillars.length = 0;
  decks.length = 0;
  edgeFn = null;
  groundFn = null;
  gate = null;
  floor.visible = false;
  titleScene = true;
  decor.forEach(g => scene.remove(g));

  const sky = 0x4b3f86;
  scene.background.setHex(sky);
  scene.fog.color.setHex(0x51458c);
  scene.fog.near = 40;
  scene.fog.far = 300;
  hemi.color.setHex(0x9a8cff);
  hemi.groundColor.setHex(0x1c2a26);
  hemi.intensity = 1.05;
  dl.color.setHex(0xff9ad6);
  dl.intensity = .55;
  dl.position.set(-6, 5, -10);

  const add = (geo, m, x, y, z) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    envG.add(o);
    return o;
  };
  const stone = mat('tStone', () => new THREE.MeshPhongMaterial({ color: 0x6a7c9a, emissive: 0x141a34, flatShading: true, shininess: 18, specular: 0x5a6a99 }));
  const stoneD = mat('tStoneD', () => new THREE.MeshPhongMaterial({ color: 0x3a4458, emissive: 0x0c0f1e, flatShading: true, shininess: 8 }));
  const rockM = mat('tRock', () => new THREE.MeshPhongMaterial({ color: 0x2c3654, flatShading: true, shininess: 4 }));
  const pineM = mat('tPine', () => new THREE.MeshPhongMaterial({ color: 0x0f1c22, flatShading: true, shininess: 2 }));
  const glowTex = ctex('glow', 128, 128, 1, 1, DR.glow);

  // Sky: deep blue overhead fading to violet and pink at the horizon, with soft pink clouds
  envG.add(skyDome(0x16205a, 0x9a62c8, 0x2a2350));
  [[-420, 230, -900, 760, 0xff7ac8, .55], [-150, 330, -1100, 900, 0xc070ff, .35], [380, 200, -900, 620, 0x6a7aff, .3], [-650, 130, -700, 520, 0xff9ad0, .45], [200, 360, -1000, 700, 0xff8ad8, .25]].forEach(([x, y, z, s, c, o]) => {
    const p = add(new THREE.PlaneGeometry(s, s * .45), new THREE.MeshBasicMaterial({ map: glowTex, color: c, transparent: true, opacity: o, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }), x, y, z);
    p.lookAt(0, 0, 0);
  });
  // The ring itself, rising straight up behind the portal
  const band = ringBand(1800, 150, 0xb8c6ff, .38);
  band.rotation.z = Math.PI / 2;
  band.position.set(0, 1745, -1300);
  envG.add(band);

  // Meadow
  add(new THREE.CircleGeometry(500, 48), mat('tGrass', () => new THREE.MeshLambertMaterial({ map: ctex('grassBig', 256, 256, 220, 220, DR.grass), color: 0x6fa066 })), 0, 0, 0).rotation.x = -Math.PI / 2;
  // Lake beyond the portal
  add(new THREE.PlaneGeometry(220, 60), new THREE.MeshPhongMaterial({ color: 0x1d2a5c, shininess: 120, specular: 0x9a8cff, transparent: true, opacity: .95 }), 0, .04, -62).rotation.x = -Math.PI / 2;

  // Mountains: big faceted rock masses around the lake, a tall peak left of centre like the far crags
  [[-55, -105, 34, 1.5], [-20, -130, 26, 1.1], [45, -110, 30, 1.2], [90, -95, 26, 1], [-100, -80, 24, 1], [10, -160, 30, .9], [130, -140, 40, 1.1], [-140, -150, 44, 1.2]].forEach(([x, z, r, h]) => {
    const o = add(new THREE.DodecahedronGeometry(r), rockM, x, r * .45 * h - 4, z);
    o.scale.set(1.2, h, 1);
    o.rotation.set(R(-.2, .2), R(0, 6), R(-.2, .2));
  });
  // Rocky shore and nearer outcrops
  [[-30, -40, 7], [-22, -44, 4], [26, -38, 8], [36, -46, 5], [-45, -30, 9], [50, -28, 10], [18, -50, 4]].forEach(([x, z, r]) => {
    const o = add(new THREE.DodecahedronGeometry(r), stoneD, x, r * .35, z);
    o.scale.y = .8;
    o.rotation.y = R(0, 6);
  });

  // Pines: tall dark silhouettes close on the left, more along the far shore and the right
  const pine = (x, z, s) => {
    add(new THREE.CylinderGeometry(.15 * s, .3 * s, 3 * s, 5), pineM, x, 1.5 * s, z);
    for (let j = 0; j < 5; j++)
      add(new THREE.ConeGeometry((1.9 - j * .32) * s, 2.6 * s, 7), pineM, x, (2.6 + j * 1.55) * s, z);
  };
  [[-17, -6, 2.4], [-21, -12, 2.7], [-24, -3, 2], [-15, -16, 1.7], [19, -13, 1.5], [22, -18, 1.8], [25, -8, 1.6]].forEach(([x, z, s]) => pine(x, z, s));
  for (let i = 0; i < 26; i++)
    pine(R(-60, 60), R(-78, -70), R(1.4, 2.4));
  for (let i = 0; i < 14; i++)
    pine(R(30, 70), R(-40, -10), R(1.2, 2));

  // The portal: a great stone ring with a carved outer rim and a glowing inner edge, a faint field inside it
  const P0 = new THREE.Group();
  P0.position.set(0, 8.9, -18);
  envG.add(P0);
  P0.add(new THREE.Mesh(new THREE.TorusGeometry(8.6, .8, 10, 72), stone));
  P0.add(new THREE.Mesh(new THREE.TorusGeometry(9.5, .14, 6, 72), stoneD));
  P0.add(new THREE.Mesh(new THREE.TorusGeometry(7.75, .12, 6, 72), new THREE.MeshBasicMaterial({ color: 0x8fdcff })));
  const field = new THREE.Mesh(new THREE.CircleGeometry(7.7, 64), new THREE.MeshBasicMaterial({ color: 0x6a7dff, transparent: true, opacity: .12, depthWrite: false, blending: THREE.AdditiveBlending }));
  P0.add(field);
  // Rubble at its foot
  [[-6, -16, 1.1], [-4.5, -19, .7], [5.5, -17, .9], [7, -19.5, 1.3], [3.8, -15.5, .5]].forEach(([x, z, r]) => add(new THREE.DodecahedronGeometry(r), stone, x, r * .4, z).rotation.y = R(0, 6));

  // Broken arches: curved stone columns rising from the meadow on either side
  const arch = (cx, cy, cz, r, a0, a1, ry) => {
    const o = add(new THREE.TorusGeometry(r, 1, 8, 32, a1 - a0), stoneD, cx, cy, cz);
    o.rotation.set(0, ry, a0);
  };
  arch(-1, -.3, -8, 10, Math.PI - 1.05, Math.PI, .3);
  arch(1.5, -.3, -6, 10.5, 0, 1.15, -.3);
  // A fallen section lying in the grass on the right
  const fall = add(new THREE.BoxGeometry(5, 1.6, 1.8), stoneD, 8.5, .6, -3);
  fall.rotation.set(.1, -.6, .25);
  add(new THREE.BoxGeometry(2.4, 1.2, 1.6), stoneD, 11.5, .5, -1.5).rotation.set(0, .4, -.15);

  // Glowing meadow flowers, sparkles drifting around the portal, and fireflies
  const pts = (n, col, size, op, place) => {
    const geo = new THREE.BufferGeometry();
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++)
      place(p, i * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const m = new THREE.PointsMaterial({ map: glowTex, color: col, size, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending });
    envG.add(new THREE.Points(geo, m));
    return { geo, p, m, n };
  };
  pts(900, 0xd9ff70, .2, .9, (p, i) => {
    p[i] = R(-22, 22);
    p[i + 1] = R(.05, .3);
    p[i + 2] = R(-16, 3);
  });
  const sparkA = [];
  const spark = pts(420, 0xc4e6ff, .32, .9, (p, i) => {
    const a = R(0, 6.28);
    const r = Math.random() < .7 ? R(7.4, 9.6) : R(0, 7.4);
    sparkA.push([a, r, R(-.4, .4), R(.04, .2)]);
    p[i] = Math.cos(a) * r;
    p[i + 1] = 8.9 + Math.sin(a) * r;
    p[i + 2] = -18 + R(-.4, .4);
  });
  const flies = pts(70, 0xeaff9c, .3, .9, (p, i) => {
    p[i] = R(-18, 18);
    p[i + 1] = R(.5, 5);
    p[i + 2] = R(-16, 1);
  });
  envTick = dt => {
    // sparkles drift slowly round the ring and wobble; the field and sparkles breathe
    for (let k = 0; k < spark.n; k++) {
      const s = sparkA[k];
      s[0] += s[3] * dt;
      const r = s[1] + Math.sin(T * 1.3 + k) * .15;
      spark.p[k * 3] = Math.cos(s[0]) * r;
      spark.p[k * 3 + 1] = 8.9 + Math.sin(s[0]) * r;
      spark.p[k * 3 + 2] = -18 + s[2];
    }
    spark.geo.attributes.position.needsUpdate = true;
    spark.m.opacity = .65 + .3 * Math.sin(T * 2.1);
    field.material.opacity = .1 + .05 * Math.sin(T * .9);
    for (let k = 0; k < flies.n * 3; k += 3) {
      flies.p[k] += Math.sin(T * .7 + k) * .6 * dt;
      flies.p[k + 1] += Math.cos(T * .9 + k * 1.7) * .25 * dt;
      flies.p[k + 2] += Math.cos(T * .5 + k) * .5 * dt;
    }
    flies.geo.attributes.position.needsUpdate = true;
    flies.m.opacity = .55 + .4 * Math.sin(T * 3.3);
  };
}

// Slow drift in front of the portal
function titleCam(dt) {
  T += dt;
  cam.position.set(Math.sin(T * .12) * 1.2, 3.3 + Math.sin(T * .2) * .15, 4.5 + Math.sin(T * .09) * .5);
  cam.lookAt(TITLE_LOOK);
}

// Title logo: a silver SPARTAN over a thin, widely spaced RUN
const TITLE_LOGO = '<div class="logo"><div class="l1">SPARTAN</div><div class="l2">RUN</div></div>';
