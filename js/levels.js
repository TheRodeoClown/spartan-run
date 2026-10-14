/*
 * levels.js: Level definitions (LV), procedural textures and the Halo-style arena builder.
 * Classic script (no modules): all files share one global scope, so load order in index.html matters.
 */

const LV = [
  {
    id: 'ob', n: 'Outpost Delta', sub: 'UNSC firebase in a dusk canyon, the ring hanging in the sky.', rooms: 4, boss: 'zealot', mix: ['grunt', 'jackal', 'elite'],
    fog: 0xb48c78, fogN: 40, fogF: 260, sky: [0x1b2f52, 0xe39a68, 0x4a3a32], hemi: [0xa8bcd8, 0x3a3028, .75], sun: [0xffc89a, .85, -6, 4, -10], trim: 0xd8b13a, sty: 'ob',
    lay: [[-8, -6], [8, -6], [-8, 8], [8, 8], [0, 1], [0, -14]]
  },
  {
    id: 'cc', n: 'Covenant Cruiser', sub: 'Glossy violet halls, plasma light and a view of the ring.', rooms: 5, boss: 'warlord', mix: ['grunt', 'jackal', 'elite'],
    fog: 0x140a22, fogN: 14, fogF: 85, hemi: [0x8a6ad0, 0x1a0f28, .6], sun: [0x9a7aff, .35, 5, 10, 3], trim: 0xb06bff, sty: 'cc',
    lay: [[-10, -2], [10, -2], [0, -9], [-5, 3], [5, 3], [-14, -12], [14, -12]]
  },
  {
    id: 'fr', n: 'Forerunner Ring', sub: 'Silver monoliths on the grass of the ring itself.', rooms: 6, boss: 'warden', mix: ['jackal', 'elite', 'grunt'],
    fog: 0xc4dae6, fogN: 45, fogF: 280, sky: [0x2f6fc9, 0xd7e8f2, 0x9fb0a0], hemi: [0xd8ecff, 0x4f6a3a, .85], sun: [0xfff4dc, .9, 6, 10, 4], trim: 0x5ff0ff, sty: 'fr',
    lay: [[-6, -8], [6, -8], [-12, 0], [12, 0], [0, -2], [-6, 6], [6, 6]]
  },
  // bossN: how many copies of the boss spawn; bn: display name for the group
  {
    id: 'ds', n: 'Tsavo Wastes', sub: 'Sun-bleached dunes, Forerunner ruins and a downed Pelican.', rooms: 4, boss: 'bonded', bossN: 2, bn: 'Bonded Hunters', mix: ['grunt', 'jackal', 'elite'],
    fog: 0xd9b98a, fogN: 40, fogF: 260, sky: [0x4f8fd0, 0xf0d6a8, 0xb08860], hemi: [0xffe8cc, 0x6a5030, .55], sun: [0xfff0d0, .7, 4, 12, 6], trim: 0xff9a3a, sty: 'ds',
    lay: [[-9, -4], [9, -4], [0, -11], [-4, 5], [4, 5], [-14, 8], [14, 8]]
  },
  {
    id: 'sn', n: 'Glacier Relay', sub: 'A Forerunner relay buried in ice, deep in a blizzard.', rooms: 5, boss: 'blademaster', mix: ['jackal', 'grunt', 'elite'],
    fog: 0xc8d6e2, fogN: 18, fogF: 120, sky: [0x7d93ab, 0xd4dee8, 0xc0ccd8], hemi: [0xdde8f5, 0x8090a0, .9], sun: [0xe8f0ff, .6, -4, 8, 5], trim: 0x6fd0ff, sty: 'sn',
    lay: [[-7, -9], [7, -9], [-12, 2], [12, 2], [0, 0], [-5, 8], [5, 8]]
  }
];

// Procedural canvas textures and shared materials, cached by key (no image files).
const TX = {};
const MT = {};
const mat = (k, f) => MT[k] || (MT[k] = f());

function ctex(k, w, h, rx, ry, draw) {
  if (!TX[k]) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    TX[k] = t;
  }
  return TX[k];
}

function speck(g, w, h, n, a) {
  for (let i = 0; i < n; i++) {
    const v = Math.random() < .5 ? 0 : 255;
    g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + R(0, a) + ')';
    g.fillRect(Math.random() * w, Math.random() * h, R(1, 3), R(1, 3));
  }
}

const DR = {
  // UNSC deck plates
  plate: (g, w, h) => {
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 2; j++) {
        g.fillStyle = 'hsl(210,7%,' + R(27, 34) + '%)';
        g.fillRect(i * 128, j * 128, 128, 128);
        g.strokeStyle = 'rgba(255,255,255,.07)';
        g.lineWidth = 2;
        g.strokeRect(i * 128 + 8, j * 128 + 8, 112, 112);
        g.fillStyle = 'rgba(0,0,0,.35)';
        [[12, 12], [116, 12], [12, 116], [116, 116]].forEach(([a, b]) => {
          g.beginPath();
          g.arc(i * 128 + a, j * 128 + b, 3, 0, 7);
          g.fill();
        });
      }
    g.fillStyle = '#15191e';
    [0, 127].forEach(p => {
      g.fillRect(0, p, w, 3);
      g.fillRect(p, 0, 3, h);
    });
    speck(g, w, h, 3000, .1);
  },
  // UNSC wall panels with a hazard stripe along the bottom
  unscw: (g, w, h) => {
    g.fillStyle = '#59616a';
    g.fillRect(0, 0, w, h);
    speck(g, w, h, 3000, .08);
    for (let x = 0; x < w; x += 128) {
      g.fillStyle = 'rgba(0,0,0,.35)';
      g.fillRect(x, 0, 3, h);
      g.fillStyle = 'rgba(255,255,255,.07)';
      g.fillRect(x + 3, 0, 2, h);
    }
    g.fillStyle = '#3d444b';
    g.fillRect(0, 0, w, 14);
    g.fillStyle = '#2b3036';
    g.fillRect(0, 56, w, 6);
    g.save();
    g.beginPath();
    g.rect(0, h - 22, w, 22);
    g.clip();
    g.fillStyle = '#d8b13a';
    g.fillRect(0, h - 22, w, 22);
    g.fillStyle = '#1c1c1c';
    for (let x = -40; x < w + 40; x += 24) {
      g.beginPath();
      g.moveTo(x, h);
      g.lineTo(x + 12, h);
      g.lineTo(x + 34, h - 22);
      g.lineTo(x + 22, h - 22);
      g.fill();
    }
    g.restore();
    g.fillStyle = 'rgba(230,230,220,.7)';
    g.font = 'bold 20px monospace';
    g.fillText('UNSC', 30, 92);
    g.font = '12px monospace';
    g.fillText('FIREBASE D-07', 300, 92);
  },
  // Olive UNSC supply crate
  crate: (g, w, h) => {
    g.fillStyle = '#4f5c3e';
    g.fillRect(0, 0, w, h);
    for (let x = 8; x < w; x += 16) {
      g.fillStyle = 'rgba(0,0,0,.22)';
      g.fillRect(x, 0, 4, h);
      g.fillStyle = 'rgba(255,255,255,.06)';
      g.fillRect(x + 4, 0, 2, h);
    }
    g.strokeStyle = '#2f3826';
    g.lineWidth = 14;
    g.strokeRect(7, 7, w - 14, h - 14);
    speck(g, w, h, 2500, .12);
    g.fillStyle = 'rgba(235,235,220,.8)';
    g.textAlign = 'center';
    g.font = 'bold 46px monospace';
    g.fillText('UNSC', w / 2, h / 2 + 8);
    g.font = '16px monospace';
    g.fillText('SUPPLY 0472', w / 2, h / 2 + 36);
  },
  // Covenant hex floor (canvas sized so pointy-top hexes tile)
  hex: (g, w, h) => {
    g.fillStyle = '#1c1130';
    g.fillRect(0, 0, w, h);
    const r = 32;
    const hw = w / 4;
    for (let row = -1; row <= 4; row++)
      for (let col = -1; col <= 4; col++) {
        const cx = col * hw + (row & 1 ? hw / 2 : 0);
        const cy = row * r * 1.5;
        g.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = Math.PI / 6 + k * Math.PI / 3;
          g.lineTo(cx + Math.cos(a) * (r - 3), cy + Math.sin(a) * (r - 3));
        }
        g.closePath();
        g.fillStyle = ((row + 4) % 4 * 3 + (col + 4) % 4 * 5) % 7 === 0 ? 'rgba(150,100,255,.28)' : 'rgba(70,40,120,.25)';
        g.fill();
        g.strokeStyle = 'rgba(150,110,255,.35)';
        g.lineWidth = 2;
        g.stroke();
      }
  },
  // Covenant wall: violet gradient with elongated organic panels
  covw: (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#1e1233');
    gr.addColorStop(.5, '#3a2462');
    gr.addColorStop(1, '#1a0f2c');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = 'rgba(120,90,200,.14)';
      g.beginPath();
      g.ellipse(32 + i * 64, h / 2, 14, 80, 0, 0, 7);
      g.fill();
      g.strokeStyle = 'rgba(180,140,255,.25)';
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(32 + i * 64, h / 2, 22, 100, 0, 0, 7);
      g.stroke();
    }
    speck(g, w, h, 800, .04);
  },
  // View out of the cruiser window: stars, a planet and the ring
  space: (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#02030a');
    gr.addColorStop(1, '#0b1234');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) {
      g.fillStyle = 'rgba(255,255,255,' + R(.2, .9) + ')';
      g.fillRect(Math.random() * w, Math.random() * h, R(.6, 1.8), R(.6, 1.8));
    }
    const pg = g.createRadialGradient(760, 40, 4, 780, 70, 82);
    pg.addColorStop(0, '#f0d8b0');
    pg.addColorStop(.75, '#9a6a50');
    pg.addColorStop(1, 'rgba(40,20,20,0)');
    g.fillStyle = pg;
    g.beginPath();
    g.arc(780, 70, 82, 0, 7);
    g.fill();
    g.strokeStyle = 'rgba(200,220,255,.9)';
    g.lineWidth = 4;
    g.beginPath();
    g.ellipse(330, 128, 280, 100, -.1, Math.PI, 2 * Math.PI);
    g.stroke();
    g.strokeStyle = 'rgba(110,170,110,.7)';
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(330, 129, 276, 97, -.1, Math.PI, 2 * Math.PI);
    g.stroke();
  },
  grass: (g, w, h) => {
    g.fillStyle = '#4d7a34';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 14; i++) {
      g.fillStyle = Math.random() < .5 ? 'rgba(90,70,40,.16)' : 'rgba(40,70,30,.2)';
      g.beginPath();
      g.arc(Math.random() * w, Math.random() * h, R(10, 40), 0, 7);
      g.fill();
    }
    g.lineWidth = 1;
    for (let i = 0; i < 5000; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      g.strokeStyle = 'hsl(' + R(78, 110) + ',' + R(35, 55) + '%,' + R(22, 44) + '%)';
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + R(-2, 2), y - R(3, 8));
      g.stroke();
    }
  },
  // Forerunner silver metal; fnGlow is the matching emissive map for the cyan inlays
  fn: (g, w, h) => {
    g.fillStyle = '#8d959b';
    g.fillRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(255,255,255,.14)');
    gr.addColorStop(1, 'rgba(0,0,0,.18)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    speck(g, w, h, 1500, .06);
    g.strokeStyle = 'rgba(30,36,40,.55)';
    g.lineWidth = 2;
    [[0, 36, w, 36], [0, 220, w, 220], [1, 0, 1, h]].forEach(([a, b, c, d]) => {
      g.beginPath();
      g.moveTo(a, b);
      g.lineTo(c, d);
      g.stroke();
    });
    DR.fnLines(g, 'rgba(40,50,56,.7)', 2);
  },
  fnGlow: (g, w, h) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    DR.fnLines(g, '#5ff4ff', 3);
    g.fillStyle = '#3fd8e8';
    g.fillRect(0, 40, w, 2);
  },
  fnLines: (g, c, lw) => {
    g.strokeStyle = c;
    g.lineWidth = lw;
    [[[0, 128], [56, 92], [200, 92], [256, 128]], [[0, 128], [56, 164], [200, 164], [256, 128]]].forEach(pl => {
      g.beginPath();
      pl.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
      g.stroke();
    });
  },
  // Inner surface of a Halo ring: land, water and clouds between metal rims
  ring: (g, w, h) => {
    g.fillStyle = '#4f7d45';
    g.fillRect(0, 0, w, h);
    const cs = ['#3f6a3a', '#6b8a4a', '#2f5f8a', '#8a7a5a', '#2a4f7a', '#5a7a3a'];
    for (let i = 0; i < 90; i++) {
      g.fillStyle = cs[i % 6];
      g.beginPath();
      g.ellipse(Math.random() * w, R(22, h - 22), R(10, 70), R(4, 20), 0, 0, 7);
      g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,.3)';
    for (let i = 0; i < 50; i++) {
      g.beginPath();
      g.ellipse(Math.random() * w, R(16, h - 16), R(8, 50), R(2, 6), R(-.2, .2), 0, 7);
      g.fill();
    }
    g.fillStyle = '#8f9aa3';
    g.fillRect(0, 0, w, 12);
    g.fillRect(0, h - 12, w, 12);
    g.fillStyle = '#5f6a72';
    g.fillRect(0, 0, w, 5);
    g.fillRect(0, h - 5, w, 5);
  },
  // Banded gas giant
  giant: (g, w, h) => {
    for (let y = 0; y < h; y++) {
      g.fillStyle = 'hsl(' + (22 + 8 * Math.sin(y * .09)) + ',38%,' + (58 + 10 * Math.sin(y * .21) + 6 * Math.sin(y * .57 + 1) + 3 * Math.sin(y * 1.3)) + '%)';
      g.fillRect(0, y, w, 1);
    }
    g.fillStyle = 'rgba(160,80,50,.5)';
    g.beginPath();
    g.ellipse(170, 80, 18, 8, 0, 0, 7);
    g.fill();
  },
  // Soft radial glow for the sun and lamps
  // Desert sand with wind ripples
  sand: (g, w, h) => {
    g.fillStyle = '#c39a5e';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) {
      g.fillStyle = 'rgba(120,80,30,' + (.05 + .05 * Math.sin(y * .35 + Math.sin(y * .07) * 3)) + ')';
      g.fillRect(0, y, w, 2);
    }
    speck(g, w, h, 4000, .12);
  },
  // Sandstone blocks with carved glyphs
  stone: (g, w, h) => {
    g.fillStyle = '#c99a62';
    g.fillRect(0, 0, w, h);
    speck(g, w, h, 3000, .12);
    g.strokeStyle = 'rgba(80,50,20,.45)';
    g.lineWidth = 3;
    for (let y = 0; y < h; y += 64) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
      for (let x = ((y / 64) % 2) * 64; x < w; x += 128) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x, y + 64);
        g.stroke();
      }
    }
    g.strokeStyle = 'rgba(90,55,25,.35)';
    g.lineWidth = 2;
    for (let i = 0; i < 6; i++)
      g.strokeRect(R(20, w - 40), R(10, h - 50), R(10, 24), R(10, 24));
  },
  // Snow with soft blue drifts
  snow: (g, w, h) => {
    g.fillStyle = '#eef3f8';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = 'rgba(150,180,215,' + R(.05, .15) + ')';
      g.beginPath();
      g.ellipse(Math.random() * w, Math.random() * h, R(10, 50), R(5, 20), R(0, 3), 0, 7);
      g.fill();
    }
    speck(g, w, h, 2500, .08);
  },
  glow: (g, w, h) => {
    const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(.2, 'rgba(255,255,255,.55)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, w, h);
  }
};

// Gradient sky sphere, drawn first and behind everything.
function skyDome(top, hor, bot) {
  const r = 2400;
  const geo = new THREE.SphereGeometry(r, 32, 16);
  const p = geo.attributes.position;
  const col = [];
  const a = new THREE.Color(top);
  const b = new THREE.Color(hor);
  const c = new THREE.Color(bot);
  const t = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / r;
    if (y >= 0)
      t.copy(b).lerp(a, Math.pow(y, .5));
    else
      t.copy(b).lerp(c, Math.min(1, -y * 5));
    col.push(t.r, t.g, t.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  m.renderOrder = -2;
  return m;
}

// A Halo ring: an open cylinder band, terrain on the inside, metal rims.
function ringBand(r, w, tint, op) {
  return new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 256, 1, true), new THREE.MeshBasicMaterial({
    map: ctex('ring', 1024, 128, 10, 1, DR.ring), color: tint, side: THREE.DoubleSide, fog: false, transparent: true, opacity: op, depthWrite: false
  }));
}

function floorMat(s) {
  return mat('fl' + s, () => s === 'ob'
    ? new THREE.MeshLambertMaterial({ map: ctex('plate', 256, 256, 11, 11, DR.plate) })
    : s === 'cc'
      ? new THREE.MeshPhongMaterial({ map: ctex('hex', 222, 192, 9, 9, DR.hex), shininess: 70, specular: 0x553388 })
      : s === 'ds'
        ? new THREE.MeshLambertMaterial({ map: ctex('sand', 256, 256, 8, 8, DR.sand) })
        : s === 'sn'
          ? new THREE.MeshLambertMaterial({ map: ctex('snow', 256, 256, 8, 8, DR.snow) })
          : new THREE.MeshLambertMaterial({ map: ctex('grass', 256, 256, 12, 12, DR.grass) }));
}

// Per-level ambient animation (snowfall, blowing sand), run every frame from tick() in main.js.
let envTick = null;

// Visuals only: cover keeps its 3x3 footprint at each lay position (see pillars/pushOut/rayBox in core.js).
function buildLevel(lv, empty) {
  while (envG.children.length)
    envG.remove(envG.children[0]);
  pillars.length = 0;
  envTick = null;
  // Cover layouts are authored for a 22m arena; spread them to the current size
  const lay = lv.lay.map(([x, z]) => [x * K, z * K]);
  scene.background.setHex(lv.fog);
  scene.fog.color.setHex(lv.fog);
  scene.fog.near = lv.fogN;
  scene.fog.far = lv.fogF;
  floor.material = floorMat(lv.sty);
  hemi.color.setHex(lv.hemi[0]);
  hemi.groundColor.setHex(lv.hemi[1]);
  hemi.intensity = lv.hemi[2];
  dl.color.setHex(lv.sun[0]);
  dl.intensity = lv.sun[1];
  dl.position.set(lv.sun[2], lv.sun[3], lv.sun[4]);

  const M = c => new THREE.MeshLambertMaterial({ color: c });
  const G = c => new THREE.MeshBasicMaterial({ color: c });
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const add = (geo, m, x, y, z) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    envG.add(o);
    return o;
  };
  // The octagon's 8 wall segments, from the inner-face polygon: straight sides at 21.5, corners cut where
  // |x| + |z| = OCT. Each: wall centre x, z, length, inward normal nx, nz, ry (local +z faces the arena,
  // local x runs along the wall) and diag (an angled corner wall).
  const WL = (() => {
    const c = CUT;
    const V = [[-c, -IN], [c, -IN], [IN, -c], [IN, c], [c, IN], [-c, IN], [-IN, c], [-IN, -c]];
    return V.map((a, i) => {
      const b = V[(i + 1) % 8];
      const mx = (a[0] + b[0]) / 2;
      const mz = (a[1] + b[1]) / 2;
      const ml = Math.hypot(mx, mz);
      const nx = -mx / ml;
      const nz = -mz / ml;
      return { x: mx - nx * .5, z: mz - nz * .5, len: Math.hypot(b[0] - a[0], b[1] - a[1]), nx, nz, ry: Math.atan2(nx, nz), diag: i % 2 === 1 };
    });
  })();
  // Place something on a wall's inner face: t = distance along the wall, o = offset out from the face.
  const onW = (wl, t, y, geo, m, o) => {
    const ob = add(geo, m, wl.x + wl.nx * (.5 + o) + Math.cos(wl.ry) * t, y, wl.z + wl.nz * (.5 + o) - Math.sin(wl.ry) * t);
    ob.rotation.y = wl.ry;
    return ob;
  };
  // A box centred on a wall segment, running along it
  const segBox = (wl, w, h, d, y, m) => {
    const o = add(B(w, h, d), m, wl.x, y, wl.z);
    o.rotation.y = wl.ry;
    return o;
  };
  // Walls: straight sides h tall, angled corners hd tall (taller corners break up the skyline)
  const wallH = (wl, h, hd) => wl.diag && hd ? hd : h;
  const walls = (h, m, hd) => WL.forEach(wl => {
    const hh = wallH(wl, h, hd);
    segBox(wl, wl.len + 1.2, hh, 1, hh / 2, m);
  });
  // Evenly spaced positions along a wall, `step` apart
  const spots = (wl, step) => {
    const n = Math.max(0, Math.floor((wl.len - 2) / step));
    const a = [];
    for (let i = 0; i <= n; i++)
      a.push((i - n / 2) * step);
    return a;
  };
  // Just behind the middle of each angled corner wall: where towers and spires go
  const cornerPts = WL.filter(w => w.diag).map(w => [w.x - w.nx * 3, w.z - w.nz * 3]);
  const hills = (n, r0, r1, h0, h1, c) => {
    const m = new THREE.MeshLambertMaterial({ color: c, flatShading: true });
    for (let i = 0; i < n; i++) {
      const a = i / n * 6.283 + R(-.1, .1);
      const r = R(r0, r1);
      const h = R(h0, h1);
      add(new THREE.ConeGeometry(h * R(.7, 1.2), h, 5 + (Math.random() * 4 | 0)), m, Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r).rotation.y = R(0, 3);
    }
  };
  const ground = m => {
    add(new THREE.CircleGeometry(900, 48), m, 0, -.05, 0).rotation.x = -Math.PI / 2;
  };
  const decals = c => {
    [8 * K, 14 * K].forEach(r => {
      add(new THREE.RingGeometry(r, r + .14, 64), G(c), 0, .03, 0).rotation.x = -Math.PI / 2;
    });
    add(B(.12, .02, A * 2 - 2), G(c), 0, .03, 0);
    add(B(A * 2 - 2, .02, .12), G(c), 0, .03, 0);
  };
  const glowM = c => new THREE.MeshBasicMaterial({ map: ctex('glow', 128, 128, 1, 1, DR.glow), color: c, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
  // Forerunner metal with glowing cyan inlays; k = texture repeats along the length
  const fnM = k => mat('fn' + k, () => new THREE.MeshPhongMaterial({
    map: ctex('fn' + k, 256, 256, k, 1, DR.fn), emissive: 0xffffff, emissiveMap: ctex('fng' + k, 256, 256, k, 1, DR.fnGlow), shininess: 70, specular: 0x8899aa
  }));
  // Drifting particles over the arena; move(p, i, dt) updates the xyz triple at p[i]
  const particles = (n, col, size, y0, y1, move) => {
    const geo = new THREE.BufferGeometry();
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      p[i * 3] = R(-40, 40);
      p[i * 3 + 1] = R(y0, y1);
      p[i * 3 + 2] = R(-40, 40);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    envG.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: col, size, transparent: true, opacity: .85, depthWrite: false })));
    envTick = dt => {
      for (let i = 0; i < n * 3; i += 3)
        move(p, i, dt);
      geo.attributes.position.needsUpdate = true;
    };
  };
  // Pine trees outside the walls; snowy ones get white caps on each tier
  const pines = (n, r0, r1, snowy) => {
    const tk = M(0x4a3626);
    const lf = new THREE.MeshLambertMaterial({ color: snowy ? 0x23402c : 0x2e4a2a, flatShading: true });
    const sw = M(0xf2f6fa);
    for (let i = 0; i < n; i++) {
      const a = R(0, 6.28);
      const r = R(r0, r1);
      const s = R(1, 1.8);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      add(new THREE.CylinderGeometry(.22 * s, .32 * s, 2 * s, 6), tk, x, s, z);
      for (let j = 0; j < 3; j++) {
        add(new THREE.ConeGeometry((2.1 - j * .5) * s, 2.6 * s, 7), lf, x, (2.6 + j * 1.4) * s, z);
        if (snowy)
          add(new THREE.ConeGeometry((1.2 - j * .3) * s, 1.1 * s, 7), sw, x, (3.25 + j * 1.4) * s, z);
      }
    }
  };

  if (lv.sky)
    envG.add(skyDome(...lv.sky));

  if (lv.sty === 'ob') {
    // Outpost Delta: open-air UNSC firebase at dusk
    const wm = mat('unscwS', () => new THREE.MeshLambertMaterial({ map: ctex('unscwS', 512, 128, 2.5, 1, DR.unscw) }));
    const dark = M(0x2b3138);
    const crate = mat('crate', () => new THREE.MeshLambertMaterial({ map: ctex('crate', 256, 256, 1, 1, DR.crate) }));
    const warm = G(0xffd9a0);
    const sd = new THREE.Vector3(lv.sun[2], lv.sun[3], lv.sun[4]).normalize().multiplyScalar(1500);
    add(new THREE.PlaneGeometry(700, 700), glowM(0xffb070), sd.x, sd.y, sd.z).lookAt(0, 0, 0);
    add(new THREE.CircleGeometry(40, 32), new THREE.MeshBasicMaterial({ color: 0xfff2dc, fog: false, depthWrite: false }), sd.x, sd.y, sd.z).lookAt(0, 0, 0);
    const gi = add(new THREE.SphereGeometry(240, 32, 24), new THREE.MeshBasicMaterial({ map: ctex('giant', 256, 128, 1, 1, DR.giant), color: 0xf0d4c8, fog: false }), -1250, 640, -420);
    gi.rotation.z = .35;
    const rg = new THREE.Group();
    const band = ringBand(1300, 120, 0xfff0e4, .9);
    band.rotation.x = Math.PI / 2;
    rg.add(band);
    rg.position.set(420, -560, -1450);
    rg.rotation.set(.1, -.6, .08);
    envG.add(rg);
    ground(M(0x4a3e34));
    hills(30, 110, 260, 20, 62, 0x4f4a50);
    const rock = new THREE.MeshLambertMaterial({ color: 0x5d5550, flatShading: true });
    for (let i = 0; i < 24; i++) {
      const a = R(0, 6.28);
      const r = R(A + 5, A + 40);
      const s = R(1.5, 5);
      add(new THREE.DodecahedronGeometry(s, 0), rock, Math.cos(a) * r, s * .35, Math.sin(a) * r).rotation.set(R(0, 3), R(0, 3), 0);
    }
    // Radio masts outside the walls
    [[-34, -44, 32], [48, 30, 24]].forEach(([x, z, h]) => {
      add(new THREE.CylinderGeometry(.4, 2.6, h, 4, 6, true), new THREE.MeshBasicMaterial({ color: 0x2c3238, wireframe: true }), x, h / 2, z);
      add(new THREE.CylinderGeometry(1.8, .2, .7, 12), dark, x, h + .3, z);
      add(new THREE.SphereGeometry(.35, 8, 6), G(0xff3a3a), x, h + 1, z);
    });
    walls(4, wm, 5.5);
    WL.forEach(wl => {
      const h = wallH(wl, 4, 5.5);
      segBox(wl, wl.len + 1.4, .3, 1.5, h + .15, dark);
      spots(wl, 8).forEach(t => {
        onW(wl, t, h - .5, B(1, .25, .4), warm, .15);
        onW(wl, t, h - .25, B(.2, .5, .6), dark, .05);
      });
    });
    // Guard towers behind the angled corner walls
    cornerPts.forEach(([x, z]) => {
      add(B(3, 9, 3), M(0x50585f), x, 4.5, z);
      add(B(3.6, .4, 3.6), dark, x, 9.2, z);
      add(B(3.05, .5, 3.05), G(0xffc070), x, 8, z);
    });
    decals(lv.trim);
    const pl = new THREE.PointLight(0xffb070, .6, 40);
    pl.position.set(0, 6, 0);
    envG.add(pl);
    if (!empty)
      lay.forEach(([x, z], i) => {
        pillars.push({ x, z });
        add(B(3.3, .12, 3.3), dark, x, .06, z);
        add(B(3, 3.5, 3), crate, x, 1.75, z);
        if (i % 2)
          add(B(1.4, .8, 1), M(0x3c4730), x + R(-.5, .5), 3.9, z + R(-.4, .4)).rotation.y = R(-.5, .5);
      });
  }
  else if (lv.sty === 'cc') {
    // Covenant Cruiser: enclosed, glossy violet, blue plasma light
    const wm = mat('covwS', () => new THREE.MeshPhongMaterial({ map: ctex('covwS', 256, 256, 3, 1, DR.covw), shininess: 90, specular: 0x7755bb }));
    const shiny = mat('covs', () => new THREE.MeshPhongMaterial({ color: 0x4a2c78, shininess: 110, specular: 0x9a80ff }));
    const dk = mat('covd', () => new THREE.MeshPhongMaterial({ color: 0x1c1030, shininess: 60, specular: 0x553388 }));
    const blue = G(0x6fa8ff);
    const vio = G(0xb48cff);
    walls(6, wm);
    add(new THREE.PlaneGeometry(A * 2, A * 2), dk, 0, 6, 0).rotation.x = Math.PI / 2;
    for (let z = -A + 4; z <= A - 4; z += 6)
      add(B(A * 2, .5, .8), shiny, 0, 5.75, z);
    add(new THREE.CircleGeometry(4.5, 6), vio, 0, 5.4, 0).rotation.x = Math.PI / 2;
    add(new THREE.TorusGeometry(4.7, .3, 8, 6), shiny, 0, 5.4, 0).rotation.x = Math.PI / 2;
    add(new THREE.PlaneGeometry(16, 16), glowM(0x8a5cff), 0, 5.3, 0).rotation.x = Math.PI / 2;
    // Fins and light strips on every wall; the angled corners get a sealed hexagonal door instead of a centre fin;
    // the north wall (WL[0]) is a window instead
    WL.forEach((wl, j) => {
      const ts = spots(wl, 6);
      if (j) {
        ts.forEach(t => {
          if (!(wl.diag && t === 0))
            onW(wl, t, 3, new THREE.SphereGeometry(1, 16, 12), shiny, -.1).scale.set(.5, 3.2, .75);
        });
        ts.slice(0, -1).forEach(t => onW(wl, t + 3, 2.8, B(.14, 3.2, .08), blue, .02));
      }
      if (wl.diag) {
        onW(wl, 0, 2.4, new THREE.CircleGeometry(1.9, 6), dk, .02);
        onW(wl, 0, 2.4, new THREE.RingGeometry(1.75, 1.95, 6), blue, .03);
        onW(wl, 0, 2.4, new THREE.TorusGeometry(2.1, .18, 8, 6), shiny, .05);
      }
      onW(wl, 0, .12, B(wl.len, .1, .1), vio, .03);
      onW(wl, 0, 5.3, B(wl.len, .1, .1), vio, .03);
    });
    onW(WL[0], 0, 3.2, new THREE.PlaneGeometry(WL[0].len * .75, 2.6), mat('space', () => new THREE.MeshBasicMaterial({ map: ctex('space', 1024, 104, 1, 1, DR.space), fog: false })), .04);
    [4.6, 1.8].forEach(y => onW(WL[0], 0, y, B(WL[0].len * .75 + .6, .22, .16), vio, .05));
    for (let i = -2; i <= 2; i++)
      onW(WL[0], i * WL[0].len * .75 / 4, 3.2, B(.3, 2.9, .2), shiny, .06);
    decals(lv.trim);
    [[-10, 4.5, 0, 0x8a5cff], [10, 4.5, 0, 0x8a5cff], [0, 4, -15, 0x4fa8ff], [0, 4, 15, 0x8a5cff]].forEach(([x, y, z, c]) => {
      const p = new THREE.PointLight(c, .9, 36);
      p.position.set(x * K, y, z * K);
      envG.add(p);
    });
    if (!empty)
      lay.forEach(([x, z]) => {
        pillars.push({ x, z });
        add(new THREE.SphereGeometry(1, 20, 14), shiny, x, 1.75, z).scale.set(1.5, 1.85, 1.5);
        add(new THREE.TorusGeometry(1.5, .07, 6, 32), blue, x, 1.75, z).rotation.x = Math.PI / 2;
        add(new THREE.CylinderGeometry(1.1, 1.3, .25, 20), dk, x, .12, z);
        add(new THREE.SphereGeometry(.22, 10, 8), blue, x, 3.7, z);
      });
  }
  else if (lv.sty === 'ds') {
    // Tsavo Wastes: open desert, sandstone Forerunner ruins, a downed Pelican, blowing sand
    const sm = mat('stone', () => new THREE.MeshLambertMaterial({ map: ctex('stone', 256, 256, 8, 1, DR.stone) }));
    const sm1 = mat('stone1', () => new THREE.MeshLambertMaterial({ map: ctex('stone1', 256, 256, 1, 1, DR.stone) }));
    const org = G(0xff9a3a);
    const rg = new THREE.Group();
    const band = ringBand(1400, 110, 0xfff4e6, .75);
    band.rotation.x = Math.PI / 2;
    rg.add(band);
    rg.position.set(-500, -600, -1500);
    rg.rotation.set(.15, .55, -.1);
    envG.add(rg);
    ground(mat('sandBig', () => new THREE.MeshLambertMaterial({ map: ctex('sandBig', 256, 256, 160, 160, DR.sand) })));
    // Dunes (flattened half-spheres) and distant mesas
    const dn = new THREE.MeshLambertMaterial({ color: 0xc4985c, flatShading: true });
    for (let i = 0; i < 22; i++) {
      const a = R(0, 6.28);
      const r = R(95, 230);
      const h = R(6, 18);
      const o = add(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), dn, Math.cos(a) * r, -1, Math.sin(a) * r);
      o.scale.set(h * R(3, 5), h, h * R(2, 3));
      o.rotation.y = R(0, 3);
    }
    const ms = new THREE.MeshLambertMaterial({ color: 0xb0704a, flatShading: true });
    for (let i = 0; i < 9; i++) {
      const a = R(0, 6.28);
      const r = R(180, 320);
      const h = R(40, 90);
      const rr = R(25, 60);
      add(new THREE.CylinderGeometry(rr * .85, rr, h, 7), ms, Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r);
    }
    // Broken ruin pillars and a ruined arch outside the walls
    for (let i = 0; i < 9; i++) {
      const a = R(0, 6.28);
      const r = R(A + 6, A + 38);
      const h = R(5, 14);
      add(B(2.2, h, 2.2), sm1, Math.cos(a) * r, h / 2 - .5, Math.sin(a) * r).rotation.set(R(-.15, .15), R(0, 3), R(-.15, .15));
    }
    [-1, 1].forEach(s => add(B(4, 20, 4), sm1, 40 + s * 7, 10, -45));
    add(B(18, 4, 4), sm1, 40, 21, -45);
    add(B(10, .5, .3), org, 40, 19, -42.9);
    // Crashed Pelican: fuselage, cockpit, tail boom and a snapped wing, half buried, on a scorch mark
    const pg = new THREE.Group();
    const pm = M(0x5a5f52);
    const pd = M(0x2e322c);
    pg.position.set(-32, 0, -34);
    pg.rotation.set(.12, .6, .22);
    envG.add(pg);
    [[4, 3.2, 14, 0, 1.4, 0, pm], [3.2, 2.4, 3, 0, 1.2, 8, pm], [2.6, .6, 1.6, 0, 2.2, 9, G(0x88a0a8)], [1.6, 1.6, 7, 0, 2.4, -10, pm], [6, .3, 2, 0, 4, -13, pm], [14, .4, 3, -2, 1.8, 1, pm], [1.2, 1.2, 2, 5, 1, 1, pd], [1.2, 1.2, 2, -9, .6, 1, pd]].forEach(([w, h, d, x, y, z, m]) => {
      const o = new THREE.Mesh(B(w, h, d), m);
      o.position.set(x, y, z);
      pg.add(o);
    });
    pg.children[5].rotation.z = -.35;
    add(new THREE.CircleGeometry(10, 24), M(0x5a4630), -32, .02, -34).rotation.x = -Math.PI / 2;
    // Ruined sandstone walls: glyph strips, and broken blocks of uneven height along the top
    const smW = mat('stoneW', () => new THREE.MeshLambertMaterial({ map: ctex('stoneW', 256, 256, 3, 1, DR.stone) }));
    walls(4, smW, 6);
    WL.forEach(wl => {
      const h = wallH(wl, 4, 6);
      segBox(wl, wl.len + 1.4, .4, 1.6, h + .2, smW);
      spots(wl, 6).forEach(t => onW(wl, t, h / 2 + .2, B(.5, h - .6, .12), org, .02));
      spots(wl, 3).forEach(t => {
        if (Math.random() < .55) {
          const bh = R(.5, 2.4);
          onW(wl, t + R(-.6, .6), h + .4 + bh / 2, B(R(1.2, 2.6), bh, 1.2), sm1, -.6).rotation.z = R(-.12, .12);
        }
      });
    });
    // Obelisks behind the angled corner walls
    cornerPts.forEach(([x, z]) => {
      add(new THREE.CylinderGeometry(.5, 1.8, 12, 4), sm1, x, 6, z).rotation.set(R(-.1, .1), Math.PI / 4, R(-.1, .1));
      add(new THREE.OctahedronGeometry(.6), org, x, 12.8, z);
    });
    particles(700, 0xe8cfa0, .09, 0, 4, (p, i, dt) => {
      p[i] += 7 * dt;
      p[i + 1] += Math.sin(T * 3 + i) * .3 * dt;
      if (p[i] > 40) {
        p[i] = -40;
        p[i + 2] = R(-40, 40);
      }
    });
    // Cover: weathered sandstone blocks with a glowing Forerunner glyph band
    if (!empty)
      lay.forEach(([x, z]) => {
        pillars.push({ x, z });
        add(B(3, 2.4, 3), sm1, x, 1.2, z);
        add(B(2.2, 1.3, 2.4), sm1, x + R(-.3, .3), 3, z + R(-.3, .3)).rotation.set(R(-.2, .2), R(0, 1), R(-.15, .15));
        add(B(3.04, .12, 3.04), org, x, 1.6, z);
      });
  }
  else if (lv.sty === 'sn') {
    // Glacier Relay: Forerunner relay in a blizzard, ice-block cover with frozen crates inside
    const cy = G(0x6fd0ff);
    const snowM = M(0xf2f6fa);
    const ice = mat('ice', () => new THREE.MeshPhongMaterial({ color: 0xbfe3f5, transparent: true, opacity: .82, shininess: 120, specular: 0xffffff }));
    ground(mat('snowBig', () => new THREE.MeshLambertMaterial({ map: ctex('snowBig', 256, 256, 160, 160, DR.snow) })));
    hills(28, 90, 240, 40, 120, 0xdfe7ef);
    pines(50, A + 4, A + 64, true);
    // Snow-capped walls with icicles, snow drifts banked against the base
    walls(4.5, fnM(4), 6.5);
    WL.forEach(wl => {
      const h = wallH(wl, 4.5, 6.5);
      segBox(wl, wl.len + 1.4, .5, 2, h + .25, snowM);
      spots(wl, 1.7).forEach(t => {
        const ih = R(.3, 1.1);
        onW(wl, t + R(-.3, .3), h - ih / 2, new THREE.ConeGeometry(.08, ih, 5), ice, .05).rotation.x = Math.PI;
      });
      spots(wl, 5).forEach(t => onW(wl, t + R(-1, 1), 0, new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), snowM, -.2).scale.set(R(1.8, 3.2), R(.5, 1.1), 1.1));
    });
    // Spires behind the angled corner walls
    cornerPts.forEach(([x, z]) => {
      add(new THREE.CylinderGeometry(.25, 2.2, 20, 4), fnM(4), x, 10, z).rotation.y = Math.PI / 4;
      add(new THREE.OctahedronGeometry(.8), cy, x, 21.2, z);
    });
    // The relay: a tall spire with a floating halo and a light beam
    add(new THREE.CylinderGeometry(3, 10, 70, 4), fnM(4), 0, 35, -70).rotation.y = Math.PI / 4;
    add(new THREE.TorusGeometry(12, .6, 8, 48), cy, 0, 58, -70);
    add(new THREE.CylinderGeometry(2, 2, 2400, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0x8ff6ff, transparent: true, opacity: .4, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }), 0, 1270, -70);
    [9 * K, 4.5 * K].forEach(r => {
      add(new THREE.RingGeometry(r, r + .18, 64), cy, 0, .03, 0).rotation.x = -Math.PI / 2;
    });
    particles(2500, 0xffffff, .12, 0, 25, (p, i, dt) => {
      p[i + 1] -= 2.2 * dt;
      p[i] += (1.4 + Math.sin(T * .7 + i) * .4) * dt;
      if (p[i + 1] < 0) {
        p[i + 1] = 25;
        p[i] = R(-40, 40);
        p[i + 2] = R(-40, 40);
      }
      if (p[i] > 40)
        p[i] = -40;
    });
    if (!empty)
      lay.forEach(([x, z]) => {
        pillars.push({ x, z });
        add(B(1.8, 2.2, 1.8), M(0x4f5c3e), x, 1.1, z);
        add(B(3, 3.5, 3), ice, x, 1.75, z);
        add(B(3.1, .35, 3.1), snowM, x, 3.67, z);
      });
  }
  else if (lv.sty === 'fr') {
    // Forerunner Ring: on the ring's surface, the band rising into the sky
    const cy = G(0x5ff0ff);
    const band = ringBand(1800, 150, 0xf2f8ff, .6);
    band.rotation.z = Math.PI / 2;
    band.position.set(0, 1760, 0);
    envG.add(band);
    ground(mat('grassBig', () => new THREE.MeshLambertMaterial({ map: ctex('grassBig', 256, 256, 220, 220, DR.grass) })));
    hills(26, 120, 280, 30, 90, 0x7d9088);
    pines(46, A + 4, A + 60, false);
    // Forerunner walls; the angled corners rise into stepped pylons with a glowing seam
    walls(4.5, fnM(4), 7);
    WL.forEach(wl => {
      const h = wallH(wl, 4.5, 7);
      segBox(wl, wl.len + 1.5, .35, 1.9, h + .15, fnM(4));
      if (wl.diag) {
        segBox(wl, wl.len * .55, 1.4, 1.4, h + 1, fnM(4));
        onW(wl, 0, h / 2, B(.25, h - 1, .1), cy, .02);
      }
    });
    // Spires behind the angled corner walls
    cornerPts.forEach(([x, z]) => {
      add(new THREE.CylinderGeometry(.25, 2.2, 20, 4), fnM(4), x, 10, z).rotation.y = Math.PI / 4;
      add(new THREE.OctahedronGeometry(.8), cy, x, 21.2, z);
    });
    // Distant tower with a light beam, and a giant arch
    add(new THREE.CylinderGeometry(4, 18, 130, 4), fnM(4), -110, 63, -210).rotation.y = .3;
    add(new THREE.CylinderGeometry(2.5, 2.5, 2400, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0x8ff6ff, transparent: true, opacity: .45, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }), -110, 1328, -210);
    [-1, 1].forEach(s => add(B(10, 110, 10), fnM(4), 170 + s * 28, 48, -160).rotation.z = -s * .3);
    add(B(46, 8, 10), fnM(4), 170, 100, -160);
    // Central octagonal platform with glowing rings and lines out to the walls
    add(new THREE.CylinderGeometry(11 * K, 11 * K + .4, .12, 8), mat('fnp', () => new THREE.MeshPhongMaterial({ color: 0x7f878d, shininess: 30, specular: 0x445058 })), 0, .06, 0).rotation.y = Math.PI / 8;
    [9.6 * K, 4.5 * K].forEach(r => {
      add(new THREE.RingGeometry(r, r + .18, 64), cy, 0, .13, 0).rotation.x = -Math.PI / 2;
    });
    // Lines from the platform edge out to the walls
    const r0 = 11 * K;
    const ln = A - 1 - r0;
    [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([x, z]) => add(B(x ? ln : .18, .04, z ? ln : .18), cy, x * (r0 + ln / 2), .03, z * (r0 + ln / 2)));
    if (!empty)
      lay.forEach(([x, z]) => {
        pillars.push({ x, z });
        add(new THREE.CylinderGeometry(1.25, 2.1, 3.5, 4), fnM(4), x, 1.75, z).rotation.y = Math.PI / 4;
        add(new THREE.CylinderGeometry(.6, 1.25, .5, 4), fnM(4), x, 3.75, z).rotation.y = Math.PI / 4;
        add(new THREE.OctahedronGeometry(.45), cy, x, 4.6, z);
      });
  }
}
buildLevel(LV[0], true);
