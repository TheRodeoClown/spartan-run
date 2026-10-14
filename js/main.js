/*
 * main.js: Per-frame update, HUD and the main loop (boot).
 * Classic script (no modules): all files share one global scope, so load order in index.html matters.
 */

function update(dt) {
  T += dt;
  vig = Math.max(0, vig - dt * 1.5);
  hitT = Math.max(0, hitT - dt);
  if (freeLook && !locked) {
    if (mx < .06)
      yaw += 1.8 * dt;
    else if (mx > .94)
      yaw -= 1.8 * dt;
  }
  // Down (multiplayer) or with the in-match menu open: no moving or shooting; the world keeps running
  const frz = NET.down || NET.menu;
  const f = frz ? 0 : (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  const s = frz ? 0 : (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  const m = Math.hypot(f, s) || 1;
  const sy = Math.sin(yaw);
  const cy = Math.cos(yaw);
  // Adrenaline boon: speed boost for 3s after a kill
  P.adrT = (P.adrT || 0) - dt;
  // Sprint (versus): hold Shift while moving forward; firing or zooming stops it, and you can't shoot while sprinting
  P.spr = NET.mode === 'vs' && !frz && f > 0 && (keys.ShiftLeft || keys.ShiftRight) && !down && !zoomOn;
  const spd = P.speed * (P.adrT > 0 ? 1.35 : 1) * (P.spr ? 1.6 : 1);
  P.x = clamp(P.x + (-sy * f + cy * s) / m * spd * dt, -A + 1, A - 1);
  P.z = clamp(P.z + (-cy * f - sy * s) / m * spd * dt, -A + 1, A - 1);
  // Thruster dash: sideways burst over 0.18s
  // Grenadier (legendary): a grenade back every few seconds
  if (P.nadeRegen) {
    P.nrT = (P.nrT || 0) + dt;
    if (P.nrT >= P.nadeRegen) {
      P.nrT = 0;
      if (P.nades < P.nadeMax)
        P.nades++;
    }
  }
  P.tcd -= dt;
  if (P.dash > 0) {
    P.dash -= dt;
    const v = P.dashDir * DASH / .18 * dt;
    P.x = clamp(P.x + cy * v, -A + 1, A - 1);
    P.z = clamp(P.z - sy * v, -A + 1, A - 1);
  }
  pushOut(P, .5);
  // Exit gate: once it's open, walk into it to move on (in co-op the host takes everyone through)
  if (gate && gate.open && state === 'play') {
    gate.field.material.opacity = .3 + .2 * Math.sin(T * 5);
    gate.chev.forEach((c, i) => c.material.opacity = .35 + .35 * Math.sin(T * 6 - i));
    if (P.z < -IN + 3 && Math.abs(P.x) < 2.6 && !NET.down) {
      if (NET.client)
        NET.gt = room;
      else {
        startPick();
        return;
      }
    }
  }
  // Jump and gravity: P.y is the height of your feet; on hilly ground they follow the terrain
  P.vy -= 20 * dt;
  P.y += P.vy * dt;
  const gy = groundH(P.x, P.z);
  // Stay on the ground when walking downhill instead of skipping off it
  if (P.y <= gy || (P.gnd && P.vy <= 0 && P.y - gy < .6)) {
    if (P.vy < -6)
      sfx.land();
    P.y = gy;
    P.vy = 0;
    P.gnd = 1;
  }
  else
    P.gnd = 0;
  cam.position.set(P.x, 1.6 + P.y, P.z);
  cam.rotation.set(pitch, yaw, 0);
  P.cd -= dt;
  P.mcd -= dt;
  if (P.reload > 0) {
    P.reload -= dt;
    if (P.reload <= 0) {
      const n = Math.min(P.magMax - P.ammo, P.sr[P.cur]);
      P.ammo += n;
      P.sr[P.cur] -= n;
      sfx.cock();
    }
  }
  if (T - P.last > P.shDelay) {
    if (!P.rch && P.sh < P.maxSh) {
      P.rch = 1;
      sfx.recharge();
    }
    P.sh = Math.min(P.maxSh, P.sh + P.maxSh / 1.5 * dt * (P.shRate || 1));
  }
  else
    P.rch = 0;
  // Burst weapons (BR) keep firing the rest of the burst 0.07s apart once the trigger starts it.
  if (frz || P.spr) { }
  else if (P.bl > 0) {
    P.bt -= dt;
    if (P.bt <= 0) {
      if (P.ammo > 0 && P.reload <= 0) {
        fire();
        P.bl--;
        P.bt = .07;
      }
      else
        P.bl = 0;
    }
  }
  else if (P.wpn === 'sw') {
    if (down) {
      if (P.ammo >= swingCost())
        melee();
      else if (P.mcd <= 0) {
        P.mcd = .4;
        sfx.dry();
      }
    }
  }
  else if (down && P.cd <= 0 && P.reload <= 0) {
    if (P.ammo > 0) {
      fire();
      const b = W[P.wpn].burst;
      if (b) {
        P.bl = b - 1;
        P.bt = .07;
      }
    }
    else if (P.sr[P.cur] > 0)
      startReload();
    else {
      P.cd = .4;
      sfx.dry();
    }
  }
  enemies.forEach(e => {
    // Networked bodies (co-op ghosts, versus players) are moved by the network, not by this AI
    if (e.net)
      return;
    e.flash -= dt;
    e.dirT -= dt;
    if (e.boss)
      bossAI(e, dt);
    if (e.dirT <= 0) {
      e.dir *= -1;
      e.dirT = R(1, 3);
    }
    // Chase the nearest player (always you, outside co-op)
    const tg = netTarget(e);
    const dx = tg.x - e.x;
    const dz = tg.z - e.z;
    const d = Math.hypot(dx, dz) || 1;
    const nx = dx / d;
    const nz = dz / d;
    const panic = e.panic && e.hp < e.maxhp * .4;
    // Melee enemies (Sword Elites) close in and barely strafe; lunging triples their speed.
    const mv = e.busy ? 0 : panic ? -1.3 : e.kami ? 1 : e.melee ? (d > 1.8 && e.wind <= 0 ? 1 : 0) : d > e.pref + 3 ? 1 : d < e.pref - 3 ? -1 : 0;
    const st = e.kami || e.busy ? 0 : e.melee ? .15 : .5;
    const spd = e.sp * (e.lunge > 0 ? 3.2 : 1);
    e.x = clamp(e.x + (nx * mv - nz * e.dir * st) * spd * dt, -A + 1, A - 1);
    e.z = clamp(e.z + (nz * mv + nx * e.dir * st) * spd * dt, -A + 1, A - 1);
    pushOut(e, .6 * e.sc);
    enemies.forEach(o => {
      if (o !== e) {
        const ox = e.x - o.x;
        const oz = e.z - o.z;
        const od = Math.hypot(ox, oz) || 1;
        const mn = .7 * (e.sc + o.sc);
        if (od < mn) {
          e.x += ox / od * (mn - od) * .5;
          e.z += oz / od * (mn - od) * .5;
        }
      }
    });
    e.y = groundH(e.x, e.z);
    e.g.rotation.y = Math.atan2(dx, dz);
    walkAnim(e, dt);
    if (e.crits)
      e.crits.forEach(c => c.h.scale.setScalar(1 + .25 * Math.sin(T * 8)));
    e.mat.emissive.setHex(e.flash > 0 ? 0xffffff : 0);
    // Shield bubble; gold while an enraging boss is invulnerable
    const inv = e.inv > T;
    e.aura.visible = e.sh > 0 || inv;
    e.aura.material.color.setHex(inv ? 0xffd040 : 0x78dcff);
    e.aura.material.opacity = inv ? .45 : .1 + .3 * e.sh / (e.maxsh || 1);
    e.cd -= dt;
    if (e.melee) {
      // Sword Elite: lunge in from mid range, raise the sword (0.35s tell), then slash
      e.lcd -= dt;
      e.lunge -= dt;
      if (e.lcd <= 0 && d < 7 && d > 3 && e.wind <= 0) {
        e.lunge = .3;
        e.lcd = R(2.5, 4);
      }
      if (e.wind > 0) {
        e.wind -= dt;
        e.sw.rotation.x = .2 - 1.4 * (1 - e.wind / .35);
        if (e.wind <= 0) {
          e.swing = .25;
          sfx.sword();
          if (d < 2.7)
            hitP(tg, e.bd);
        }
      }
      else if (e.cd <= 0 && d < 2.6) {
        e.wind = .35;
        e.cd = e.fr;
      }
      if (e.swing > 0) {
        e.swing -= dt;
        e.sw.rotation.x = -1.2 + 1.8 * (1 - Math.max(0, e.swing) / .25);
      }
      else if (e.wind <= 0)
        e.sw.rotation.x += (.2 - e.sw.rotation.x) * Math.min(1, dt * 8);
    }
    else if (e.kami) {
      // Suicide Grunt: sprint at you, prime both grenades within 2.2m, detonate 0.45s later
      if (e.kf <= 0 && d < 2.2) {
        e.kf = .45;
        sfx.beep();
      }
      if (e.kf > 0) {
        e.kf -= dt;
        e.kg.visible = Math.floor(T * 16) % 2 === 0;
        if (e.kf <= 0)
          kamiBoom(e);
      }
    }
    // Active Camo (legendary): they hold fire at you for 2s after a dash
    else if (e.cd <= 0 && !panic && !(tg === P && P.camoT > T)) {
      for (let k = 0; k < e.burst; k++) {
        const a = Math.atan2(nx, nz) + (e.spread ? (k - (e.burst - 1) / 2) * .14 : R(-.06, .06));
        // Aim from the muzzle at the target's chest, allowing for hills between them
        const dir = new THREE.Vector3(Math.sin(a), ((tg.y || 0) + 1.3 - e.y - 1.3 * e.sc) / d, Math.cos(a)).normalize();
        // Needler Jackals fire homing needles; everyone else fires plasma bolts
        const mm = e.needle
          ? new THREE.Mesh(new THREE.BoxGeometry(.06, .06, .42), new THREE.MeshBasicMaterial({ color: e.col }))
          : new THREE.Mesh(new THREE.SphereGeometry(.16, 8, 6), new THREE.MeshBasicMaterial({ color: e.col }));
        mm.position.set(e.x, e.y + 1.4 * e.sc, e.z);
        if (e.needle)
          mm.lookAt(mm.position.clone().add(dir));
        scene.add(mm);
        shots.push({ m: mm, v: dir.multiplyScalar(e.bs * (e.needle ? R(.9, 1.1) : 1)), dmg: e.bd, life: 4, home: e.needle ? 2.2 : 0, tg });
      }
      if (e.needle)
        sfx.needleE(d);
      else
        sfx.plasma(d);
      e.cd = e.fr * R(.8, 1.2);
    }
  });
  enemies = enemies.filter(e => !e.dead);
  updHz(dt);
  shots.forEach(b => {
    const p = b.m.position;
    // Needles home in on you for their first 1.2s
    if (b.home && b.life > 2.8) {
      const s = b.v.length();
      const q = b.tg || P;
      b.v.lerp(new THREE.Vector3(q.x - p.x, 1.3 + q.y - p.y, q.z - p.z).normalize().multiplyScalar(s), Math.min(1, dt * b.home)).setLength(s);
      b.m.lookAt(p.clone().add(b.v));
    }
    p.addScaledVector(b.v, dt);
    b.life -= dt;
    netTargets().forEach(q => {
      if (b.life > 0 && Math.hypot(p.x - q.x, p.y - 1.3 - q.y, p.z - q.z) < .7) {
        b.life = 0;
        hitP(q, b.dmg);
      }
    });
    if (outArena(p) || p.y < groundH(p.x, p.z) || inPillar(p, 0))
      b.life = 0;
    if (b.life <= 0)
      scene.remove(b.m);
  });
  shots = shots.filter(b => b.life > 0);
  nades.forEach(n => {
    n.v.y -= 18 * dt;
    const p = n.m.position;
    p.addScaledVector(n.v, dt);
    const gy = groundH(p.x, p.z) + .15;
    if (p.y < gy) {
      p.y = gy;
      n.v.y *= -.4;
      n.v.x *= .7;
      n.v.z *= .7;
    }
    if (Math.abs(p.x) > A - .5) {
      n.v.x *= -.5;
      p.x = clamp(p.x, -A + .5, A - .5);
    }
    if (Math.abs(p.z) > A - .5) {
      n.v.z *= -.5;
      p.z = clamp(p.z, -A + .5, A - .5);
    }
    // Bounce off the angled corner walls: push back inside and reflect the velocity (damped)
    {
      const sx = Math.sign(p.x);
      const sz = Math.sign(p.z);
      const s = Math.abs(p.x) + Math.abs(p.z);
      if (s > OCT - .5) {
        const k = (s - OCT + .5) / 2;
        p.x -= sx * k;
        p.z -= sz * k;
        const vn = (sx * n.v.x + sz * n.v.z) / 2;
        if (vn > 0) {
          n.v.x -= sx * vn * 1.5;
          n.v.z -= sz * vn * 1.5;
        }
      }
    }
    pillars.forEach(q => {
      if (Math.abs(p.x - q.x) < (q.hw || 1.5) + .1 && Math.abs(p.z - q.z) < (q.hd || 1.5) + .1 && p.y < (q.h || 3.5)) {
        n.v.x *= -.4;
        n.v.z *= -.4;
        p.x += n.v.x * dt * 2;
        p.z += n.v.z * dt * 2;
      }
    });
    n.fuse -= dt;
    // Sticky Grenades boon: latch onto the first enemy touched and ride along
    if (P.sticky && !n.st) {
      const e = enemies.find(e => !e.dead && Math.hypot(e.x - p.x, 1.1 * e.sc + (e.y || 0) - p.y, e.z - p.z) < .9 * e.sc);
      if (e) {
        n.st = e;
        n.ox = p.x - e.x;
        n.oy = p.y;
        n.oz = p.z - e.z;
      }
    }
    if (n.st) {
      n.v.set(0, 0, 0);
      p.set(n.st.x + n.ox, n.oy, n.st.z + n.oz);
    }
    if (n.fuse <= 0) {
      const rad = 6 * Math.sqrt(nadeM());
      const dm = 70 * nadeM();
      enemies.forEach(e => {
        const d = Math.hypot(e.x - p.x, e.z - p.z, e.sc + (e.y || 0) - p.y);
        if (d < rad)
          dmgE(e, dm * (1 - d / rad * .5), false, 'k');
      });
      if (Math.hypot(P.x - p.x, 1.6 + P.y - p.y, P.z - p.z) < rad)
        hurt(18);
      flashFx(p.x, p.y, p.z, rad, 0xffb040);
      sfx.boom();
      scene.remove(n.m);
    }
  });
  nades = nades.filter(n => n.fuse > 0);
  updDrops(dt);
  updRockets(dt);
  updNeedles(dt);
  enemies = enemies.filter(e => !e.dead);
  // Rooms and bosses are decided only by the page that runs the world (solo, or the co-op host)
  if (NET.mode === 'vs' || NET.client)
    return;
  if (L.wave) {
    L.waveT -= dt;
    if (L.waveT <= 0) {
      const w = L.wave;
      L.wave = null;
      w();
    }
    return;
  }
  if (state === 'play' && lroom > L.rooms && !enemies.some(e => e.boss)) {
    enemies.forEach(e => {
      e.dead = true;
      scene.remove(e.g);
    });
    enemies = [];
    bossDown();
    return;
  }
  if (state === 'play' && !enemies.length && !L.cleared)
    roomClear();
}

function roomClear() {
  L.cleared = true;
  earn(8 + lroom * 2);
  music.set(0);
  sfx.clear();
  openGate();
}

// The boon offer after a room: one weapon boon on odd rooms; never a weapon you hold, a one-off you have, or a maxed boon
function makeChoices() {
  const pool = BOONS.filter(b => !(b.w && P.slots.includes(b.w)) && !(b.th && P.thrust) && !(b.once && P.boons.includes(b.n)) && !(b.mx && b.mx(P))).sort(() => Math.random() - .5);
  const wp = pool.filter(b => b.w);
  const ot = pool.filter(b => !b.w);
  choices = (room % 2 ? [wp[0], ot[0], ot[1]] : pool.slice(0, 3)).filter(Boolean);
  // From the second mission on, sometimes swap the last card for a variant of a gun you carry
  const vars = P.done.length >= 1 ? P.slots.filter(k => k && VARIANTS[k] && !(P.vr && P.vr[k])) : [];
  if (vars.length && choices.length && Math.random() < .5) {
    const k = vars[Math.random() * vars.length | 0];
    choices[choices.length - 1] = { n: VARIANTS[k].n, d: 'VARIANT of your ' + W[k].n + ': ' + VARIANTS[k].d, f: p => {
      p.vr = p.vr || {};
      p.vr[k] = 1;
    } };
  }
}

function tick(dt) {
  animGun(dt);
  if (envTick)
    envTick(dt);
  cam.fov += ((zoomOn && P && P.wpn !== 'sw' ? (P.wpn === 'sn' ? 18 : 45) : P && P.spr && state === 'play' ? 83 : 75) - cam.fov) * Math.min(1, dt * 12);
  cam.updateProjectionMatrix();
  tracers.forEach(t => {
    t.life -= dt;
    if (t.life <= 0) {
      scene.remove(t.m);
      t.m.geometry.dispose();
    }
  });
  tracers = tracers.filter(t => t.life > 0);
  slashes.forEach(s => {
    s.life -= dt;
    s.m.material.opacity = .6 * Math.max(0, s.life / .25);
    s.m.scale.setScalar(1 + (.25 - s.life) * .8);
    if (s.life <= 0) {
      scene.remove(s.m);
      s.m.geometry.dispose();
    }
  });
  slashes = slashes.filter(s => s.life > 0);
  fx.forEach(f => {
    f.life -= dt;
    const k = 1 - f.life / .3;
    f.m.scale.setScalar(Math.max(.01, f.r * k));
    f.m.material.opacity = .6 * (1 - k);
    if (f.life <= 0)
      scene.remove(f.m);
  });
  fx = fx.filter(f => f.life > 0);
}

function hud() {
  // No health bars or crosshair on the title and menu screens
  $('hud').style.visibility = state === 'title' || state === 'menu' ? 'hidden' : 'visible';
  const sc = scoped();
  $('scope').style.display = sc ? 'block' : 'none';
  $('cross').style.display = state === 'play' && !sc ? 'block' : 'none';
  $('clk').style.display = state === 'play' && !locked && !freeLook ? 'block' : 'none';
  if (!P)
    return;
  $('sh').firstChild.style.width = 100 * P.sh / P.maxSh + '%';
  $('hp').firstChild.style.width = 100 * P.hp / P.maxHp + '%';
  $('en').style.display = P.wpn === 'sw' && state === 'play' ? 'block' : 'none';
  $('en').firstChild.style.width = P.ammo + '%';
  hudWeapon();
  // One bar for all bosses in the fight (Bonded Hunters are a pair), measured against their combined starting total
  const bss = enemies.filter(e => e.boss);
  $('boss').style.display = bss.length ? 'block' : 'none';
  if (bss.length) {
    $('boss').firstChild.textContent = L && L.bossN > 1 ? L.bn : bss[0].bn;
    $('boss').lastChild.firstChild.style.width = 100 * Math.max(0, bss.reduce((s, b) => s + Math.max(0, b.hp) + b.sh, 0) / (bossTotal || 1)) + '%';
  }
  $('room').textContent = NET.mode ? netRoomText() : (L ? (LEGEND ? 'LEGENDARY | ' : '') + L.n + ' | ' + (lroom > L.rooms ? 'BOSS' : 'Room ' + lroom + '/' + L.rooms) : '') + '  Kills ' + kills;
  $('vig').style.opacity = vig;
  $('cross').style.borderColor = hitT > 0 ? hitCol : 'rgba(155,196,90,.8)';
}
// Weapon panel (bottom right): name and damage type, magazine count and reserve, a row of rounds that empties as you
// fire (it refills during a reload), your other weapon underneath; grenades and thruster on the left.
const hudK = {};
function hudSet(id, prop, v) {
  if (hudK[id + prop] === v)
    return;
  hudK[id + prop] = v;
  const el = $(id);
  if (prop === 'text')
    el.textContent = v;
  else if (prop === 'html')
    el.innerHTML = v;
  else if (prop === 'cls')
    el.className = v;
  else
    el.style[prop] = v;
}

function hudWeapon() {
  const k = P.wpn;
  const w = W[k];
  const sw = k === 'sw';
  const energy = w.ty === 'e';
  hudSet('wname', 'html', esc(wName(k).toUpperCase()) + '<i class="' + (energy ? 'te' : 'tk') + '">' + (sw ? 'ENERGY BLADE' : energy ? 'ENERGY' : 'KINETIC') + '</i>');
  hudSet('wname', 'cls', P.vr && P.vr[k] ? 'var' : '');
  const reloading = P.reload > 0;
  const res = sw ? '' : P.sr[P.cur];
  let mag = sw ? Math.round(P.ammo) : P.ammo;
  let fill = sw ? P.ammo / 100 : P.ammo / P.magMax;
  if (reloading) {
    fill = 1 - P.reload / wst().rt;
    mag = 'RELOADING';
  }
  else if (!sw && P.ammo + P.sr[P.cur] <= 0)
    mag = 'EMPTY';
  else if (sw && P.ammo < swingCost())
    mag = 'DEPLETED';
  hudSet('amag', 'text', String(mag) + (sw && typeof mag === 'number' ? '%' : ''));
  hudSet('ares', 'text', sw || reloading || typeof mag !== 'number' ? '' : '/ ' + res);
  hudSet('wammo', 'cls', reloading ? 'rl' : typeof mag !== 'number' || fill <= .25 ? 'low' : '');
  // Rounds: one segment per round in the magazine (a smooth bar for big magazines and the sword)
  const seg = sw || P.magMax > 40 ? 0 : (wbar.clientWidth || 220) / P.magMax;
  hudSet('wpips', 'backgroundSize', seg ? seg + 'px 100%' : '100% 100%');
  hudSet('wpips', 'cls', seg ? '' : 'smooth');
  hudSet('wpips', 'width', Math.max(0, Math.min(1, fill)) * 100 + '%');
  const o = P.slots[1 - P.cur];
  hudSet('wsec', 'text', o ? (2 - P.cur) + '   ' + wName(o).toUpperCase() + (o === 'sw' ? '' : '   ' + ((P.sa[1 - P.cur] || 0) + P.sr[1 - P.cur])) : '');
  hudSet('gnade', 'html', '<b>GRENADES</b>' + '<i class="on"></i>'.repeat(Math.max(0, P.nades)) + '<i></i>'.repeat(Math.max(0, P.nadeMax - P.nades)));
  hudSet('gthr', 'html', P.thrust ? '<b>THRUSTER</b><span><i style="width:' + Math.round(100 * (1 - Math.max(0, P.tcd) / 2.5)) + '%"></i></span>' : '');
}
let last = performance.now();

function loop(now) {
  const dt = Math.min(.05, (now - last) / 1000);
  last = now;
  if (state === 'play')
    update(dt);
  else if (state === 'title' || state === 'menu')
    orbit(dt);
  else if (NET.host && (state === 'pick' || state === 'wait'))
    netHostIdle(dt);
  netTick(dt);
  tick(dt);
  hud();
  renderer.render(scene, cam);
  requestAnimationFrame(loop);
}
cam.position.set(0, 1.6, 14);
requestAnimationFrame(loop);
