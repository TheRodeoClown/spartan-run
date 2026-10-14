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
  const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  const s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  const m = Math.hypot(f, s) || 1;
  const sy = Math.sin(yaw);
  const cy = Math.cos(yaw);
  // Adrenaline boon: speed boost for 3s after a kill
  P.adrT = (P.adrT || 0) - dt;
  const spd = P.speed * (P.adrT > 0 ? 1.35 : 1);
  P.x = clamp(P.x + (-sy * f + cy * s) / m * spd * dt, -A + 1, A - 1);
  P.z = clamp(P.z + (-cy * f - sy * s) / m * spd * dt, -A + 1, A - 1);
  // Thruster dash: sideways burst over 0.18s
  P.tcd -= dt;
  if (P.dash > 0) {
    P.dash -= dt;
    const v = P.dashDir * DASH / .18 * dt;
    P.x = clamp(P.x + cy * v, -A + 1, A - 1);
    P.z = clamp(P.z - sy * v, -A + 1, A - 1);
  }
  pushOut(P, .5);
  // Jump: P.y is height above the floor
  P.vy -= 20 * dt;
  P.y += P.vy * dt;
  if (P.y <= 0) {
    if (P.vy < -6)
      sfx.land();
    P.y = 0;
    P.vy = 0;
  }
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
    P.sh = Math.min(P.maxSh, P.sh + P.maxSh / 1.5 * dt);
  }
  else
    P.rch = 0;
  // Burst weapons (BR) keep firing the rest of the burst 0.07s apart once the trigger starts it.
  if (P.bl > 0) {
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
      if (P.ammo >= SWING_COST)
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
    e.flash -= dt;
    e.dirT -= dt;
    if (e.boss)
      bossAI(e, dt);
    if (e.dirT <= 0) {
      e.dir *= -1;
      e.dirT = R(1, 3);
    }
    const dx = P.x - e.x;
    const dz = P.z - e.z;
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
    e.g.rotation.y = Math.atan2(dx, dz);
    walkAnim(e, dt);
    if (e.crits)
      e.crits.forEach(c => c.h.scale.setScalar(1 + .25 * Math.sin(T * 8)));
    e.mat.emissive.setHex(e.flash > 0 ? 0xffffff : 0);
    e.aura.visible = e.sh > 0;
    e.aura.material.opacity = .1 + .3 * e.sh / (e.maxsh || 1);
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
            hurt(e.bd);
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
    else if (e.cd <= 0 && !panic) {
      for (let k = 0; k < e.burst; k++) {
        const a = Math.atan2(nx, nz) + (e.spread ? (k - (e.burst - 1) / 2) * .14 : R(-.06, .06));
        const dir = new THREE.Vector3(Math.sin(a), (1.3 - 1.3 * e.sc) / d, Math.cos(a)).normalize();
        // Needler Jackals fire homing needles; everyone else fires plasma bolts
        const mm = e.needle
          ? new THREE.Mesh(new THREE.BoxGeometry(.06, .06, .42), new THREE.MeshBasicMaterial({ color: e.col }))
          : new THREE.Mesh(new THREE.SphereGeometry(.16, 8, 6), new THREE.MeshBasicMaterial({ color: e.col }));
        mm.position.set(e.x, 1.4 * e.sc, e.z);
        if (e.needle)
          mm.lookAt(mm.position.clone().add(dir));
        scene.add(mm);
        shots.push({ m: mm, v: dir.multiplyScalar(e.bs * (e.needle ? R(.9, 1.1) : 1)), dmg: e.bd, life: 4, home: e.needle ? 2.2 : 0 });
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
      b.v.lerp(new THREE.Vector3(P.x - p.x, 1.3 + P.y - p.y, P.z - p.z).normalize().multiplyScalar(s), Math.min(1, dt * b.home)).setLength(s);
      b.m.lookAt(p.clone().add(b.v));
    }
    p.addScaledVector(b.v, dt);
    b.life -= dt;
    if (Math.hypot(p.x - P.x, p.y - 1.3 - P.y, p.z - P.z) < .7) {
      b.life = 0;
      hurt(b.dmg);
    }
    if (outArena(p) || p.y < 0 || pillars.some(q => Math.abs(p.x - q.x) < 1.5 && Math.abs(p.z - q.z) < 1.5 && p.y < 3.5))
      b.life = 0;
    if (b.life <= 0)
      scene.remove(b.m);
  });
  shots = shots.filter(b => b.life > 0);
  nades.forEach(n => {
    n.v.y -= 18 * dt;
    const p = n.m.position;
    p.addScaledVector(n.v, dt);
    if (p.y < .15) {
      p.y = .15;
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
      if (Math.abs(p.x - q.x) < 1.6 && Math.abs(p.z - q.z) < 1.6 && p.y < 3.5) {
        n.v.x *= -.4;
        n.v.z *= -.4;
        p.x += n.v.x * dt * 2;
        p.z += n.v.z * dt * 2;
      }
    });
    n.fuse -= dt;
    // Sticky Grenades boon: latch onto the first enemy touched and ride along
    if (P.sticky && !n.st) {
      const e = enemies.find(e => !e.dead && Math.hypot(e.x - p.x, 1.1 * e.sc - p.y, e.z - p.z) < .9 * e.sc);
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
        const d = Math.hypot(e.x - p.x, e.z - p.z, e.sc - p.y);
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
  if (state === 'play' && lroom > L.rooms && !enemies.some(e => e.boss)) {
    enemies.forEach(e => {
      e.dead = true;
      scene.remove(e.g);
    });
    enemies = [];
    bossDown();
    return;
  }
  if (state === 'play' && !enemies.length) {
    state = 'pick';
    earn(8 + lroom * 2);
    music.set(0);
    sfx.clear();
    document.exitPointerLock && document.exitPointerLock();
    const pool = BOONS.filter(b => !(b.w && P.slots.includes(b.w)) && !(b.th && P.thrust) && !(b.once && P.boons.includes(b.n)) && !(b.mx && b.mx(P))).sort(() => Math.random() - .5);
    const wp = pool.filter(b => b.w);
    const ot = pool.filter(b => !b.w);
    choices = (room % 2 ? [wp[0], ot[0], ot[1]] : pool.slice(0, 3)).filter(Boolean);
    ov.style.display = 'flex';
    showPick('ROOM CLEARED');
  }
}

function tick(dt) {
  animGun(dt);
  if (envTick)
    envTick(dt);
  cam.fov += ((zoomOn && P && P.wpn !== 'sw' ? (P.wpn === 'sn' ? 18 : 45) : 75) - cam.fov) * Math.min(1, dt * 12);
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
  $('info').textContent = P.slots.map((k, i) => k ? (i === P.cur ? '[' + W[k].n.split(' ')[0] + ']' : W[k].n.split(' ')[0]) : '-').join(' ') + '   ' + W[P.wpn].n + (W[P.wpn].ty === 'e' ? ' (energy)' : '') + '   ' + (P.wpn === 'sw' ? (P.ammo >= SWING_COST ? 'Energy ' + P.ammo + '%' : 'SWORD DEPLETED') : P.reload > 0 ? 'RELOADING' : P.ammo + P.sr[P.cur] <= 0 ? 'NO AMMO' : 'Ammo ' + P.ammo + ' | ' + P.sr[P.cur]) + '   Grenades ' + P.nades + '/' + P.nadeMax + (P.thrust ? '   Thruster ' + (P.tcd > 0 ? Math.ceil(P.tcd) + 's' : 'READY') : '');
  // One bar for all bosses in the fight (Bonded Hunters are a pair), measured against their combined starting total
  const bss = enemies.filter(e => e.boss);
  $('boss').style.display = bss.length ? 'block' : 'none';
  if (bss.length) {
    $('boss').firstChild.textContent = L && L.bossN > 1 ? L.bn : bss[0].bn;
    $('boss').lastChild.firstChild.style.width = 100 * Math.max(0, bss.reduce((s, b) => s + Math.max(0, b.hp) + b.sh, 0) / (bossTotal || 1)) + '%';
  }
  $('room').textContent = (L ? (LEGEND ? 'LEGENDARY | ' : '') + L.n + ' | ' + (lroom > L.rooms ? 'BOSS' : 'Room ' + lroom + '/' + L.rooms) : '') + '  Kills ' + kills;
  $('vig').style.opacity = vig;
  $('cross').style.borderColor = hitT > 0 ? hitCol : 'rgba(155,196,90,.8)';
}
let last = performance.now();

function loop(now) {
  const dt = Math.min(.05, (now - last) / 1000);
  last = now;
  if (state === 'play')
    update(dt);
  else if (state === 'title' || state === 'menu')
    orbit(dt);
  tick(dt);
  hud();
  renderer.render(scene, cam);
  requestAnimationFrame(loop);
}
cam.position.set(0, 1.6, 14);
requestAnimationFrame(loop);
