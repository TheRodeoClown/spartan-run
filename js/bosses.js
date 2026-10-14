/*
 * bosses.js: Boss kits (signature moves and reinforcement squads) and the boss AI.
 * Classic script (no modules): all files share one global scope, so load order in index.html matters.
 *
 * Each boss has two moves, telegraphed before they hurt, and summons a squad through portals.
 * A running move is an entry in `hz` (hazards): it owns its meshes and its upd(dt) returns false when finished.
 */

const BOSSKIT = {
  zealot: { moves: ['nades', 'lunge'], sum: ['grunt', 'grunt', 'jackal'], col: 0xffd060 },
  warlord: { moves: ['slam', 'charge'], sum: ['kgrunt', 'kgrunt', 'grunt'], col: 0xff5a3a },
  warden: { moves: ['beam', 'rain'], sum: ['elite', 'jackal', 'jackal'], col: 0x40ffe8 },
  // every: seconds between summons (default 14); the Bonded Hunters are a pair, so each summons less often
  bonded: { moves: ['slam', 'charge'], sum: ['kgrunt', 'jackal'], col: 0x7dff6a, every: 20 },
  blademaster: { moves: ['cloak', 'spin', 'lunge'], sum: ['selite', 'jackal'], col: 0xbfe8ff },
  shipmaster: { moves: ['mortar', 'lunge', 'volley'], sum: ['elite', 'grunt', 'grunt'], col: 0xc890ff },
  skirmisher: { moves: ['snipe', 'volley', 'lunge'], sum: ['jackal', 'jackal', 'kgrunt'], col: 0xff8a4a },
  deacon: { moves: ['mortar', 'nades'], sum: ['kgrunt', 'kgrunt', 'grunt', 'grunt'], col: 0x9fe8ff, every: 12 },
  ironclad: { moves: ['slam', 'mortar', 'charge'], sum: ['kgrunt', 'jackal'], col: 0x8ff6ff }
};
let hz = [];

function clearHz() {
  hz.forEach(h => h.ms.forEach(m => scene.remove(m)));
  hz = [];
}

function updHz(dt) {
  hz = hz.filter(h => {
    const alive = h.upd(dt);
    if (!alive)
      h.ms.forEach(m => scene.remove(m));
    return alive;
  });
}

const gm = (geo, c, o) => new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide }));

function ringAt(x, z, r0, r1, c, o) {
  const m = gm(new THREE.RingGeometry(r0, r1, 48), c, o);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, groundH(x, z) + .05, z);
  scene.add(m);
  return m;
}

// Moves aim at (and hit) tg: the nearest player (always you, outside co-op).
// Charge: glow and aim for `wind` seconds, then rush in a straight line; one hit per charge.
function charge(e, wind, dur, spd, dmg, reach) {
  const tg = netTarget(e);
  e.busy = 1;
  let t = 0;
  let dx = 0;
  let dz = 0;
  let hit = false;
  const glow = ringAt(e.x, e.z, 1.2 * e.sc, 1.5 * e.sc, ET[e.t].col, .6);
  sfx.room();
  hz.push({
    ms: [glow], upd(dt) {
      if (e.dead) {
        e.busy = 0;
        return false;
      }
      t += dt;
      glow.position.set(e.x, groundH(e.x, e.z) + .05, e.z);
      if (t < wind) {
        e.flash = .05;
        const d = Math.hypot(tg.x - e.x, tg.z - e.z) || 1;
        dx = (tg.x - e.x) / d;
        dz = (tg.z - e.z) / d;
        return true;
      }
      if (t < wind + dur) {
        e.x = clamp(e.x + dx * spd * dt, -A + 1, A - 1);
        e.z = clamp(e.z + dz * spd * dt, -A + 1, A - 1);
        pushOut(e, .6 * e.sc);
        if (!hit && Math.hypot(tg.x - e.x, tg.z - e.z) < reach) {
          hit = true;
          hitP(tg, dmg);
          sfx.melee();
        }
        return true;
      }
      e.busy = 0;
      return false;
    }
  });
}

const MOVES = {
  // Zealot: lob three plasma grenades around you; blinking rings mark where they'll burst
  nades(e) {
    const tg = netTarget(e);
    sfx.throw();
    for (let i = 0; i < 3; i++) {
      const tx = clamp(tg.x + R(-3, 3), -A + 1, A - 1);
      const tz = clamp(tg.z + R(-3, 3), -A + 1, A - 1);
      const sx = e.x;
      const sz = e.z;
      const sy = (e.y || 0) + 1.6 * e.sc;
      const gy = groundH(tx, tz) + .3;
      const orb = gm(new THREE.SphereGeometry(.22, 10, 8), 0x7fe0ff, 1);
      const ring = ringAt(tx, tz, 2.9, 3.2, 0x7fe0ff, 0);
      scene.add(orb);
      let t = -i * .15;
      hz.push({
        ms: [orb, ring], upd(dt) {
          t += dt;
          if (t < 0)
            return true;
          if (t < .9) {
            const u = t / .9;
            orb.position.set(sx + (tx - sx) * u, sy + (gy - sy) * u + 6 * u * (1 - u), sz + (tz - sz) * u);
            return true;
          }
          orb.position.set(tx, gy, tz);
          ring.material.opacity = Math.floor(t * 10) % 2 ? .7 : .25;
          if (t < 1.7)
            return true;
          explode(tx, gy, tz, 3.2, 0, 22, 'n', true);
          return false;
        }
      });
    }
  },
  // Zealot: short, fast lunge
  lunge(e) {
    charge(e, .45, .5, 22, 25, 2.4);
  },
  // Warlord: long bull-rush
  charge(e) {
    charge(e, .6, 1.1, 15, 35, 2.8);
  },
  // Warlord: ground slam; an expanding shockwave you can jump over
  slam(e) {
    const tg = netTarget(e);
    if (Math.hypot(tg.x - e.x, tg.z - e.z) > 12) {
      MOVES.charge(e);
      return;
    }
    e.busy = 1;
    let t = 0;
    let hit = false;
    const cx = e.x;
    const cz = e.z;
    const tell = ringAt(cx, cz, .5, 13, 0xff5a3a, 0);
    const wave = ringAt(cx, cz, .5, 1.5, 0xffa040, 0);
    sfx.room();
    hz.push({
      ms: [tell, wave], upd(dt) {
        if (e.dead) {
          e.busy = 0;
          return false;
        }
        t += dt;
        if (t < .8) {
          tell.material.opacity = .08 + .08 * Math.sin(t * 30);
          e.flash = .05;
          return true;
        }
        if (t - dt < .8) {
          tell.material.opacity = 0;
          sfx.boom();
          flashFx(cx, .5, cz, 3, 0xffa040);
          banner('JUMP!');
        }
        const r = 1 + (t - .8) * 14;
        wave.geometry.dispose();
        wave.geometry = new THREE.RingGeometry(Math.max(.1, r - .5), r + .5, 64);
        wave.material.opacity = Math.max(0, .85 - (t - .8) * .8);
        if (!hit && tg.y - groundH(tg.x, tg.z) < .35 && Math.abs(Math.hypot(tg.x - cx, tg.z - cz) - r) < 1.1) {
          hit = true;
          hitP(tg, 30);
        }
        if (r < 14)
          return true;
        e.busy = 0;
        return false;
      }
    });
  },
  // Warden: aims a thin red sight line, then fires a hardlight beam that slowly tracks you; dash out of it
  beam(e) {
    const tg = netTarget(e);
    e.busy = 1;
    let t = 0;
    let acc = 0;
    let ang = Math.atan2(tg.x - e.x, tg.z - e.z);
    const BL = 44;
    const line = gm(new THREE.BoxGeometry(.06, .06, BL), 0xff4040, .55);
    const bm = gm(new THREE.BoxGeometry(.5, .5, BL), 0x9ff8ff, .85);
    const core = gm(new THREE.BoxGeometry(.18, .18, BL), 0xffffff, 1);
    [line, bm, core].forEach(m => {
      m.geometry.translate(0, 0, BL / 2);
      scene.add(m);
    });
    bm.visible = core.visible = false;
    sfx.recharge();
    hz.push({
      ms: [line, bm, core], upd(dt) {
        if (e.dead) {
          e.busy = 0;
          return false;
        }
        t += dt;
        // Turn toward you: fast while aiming, slow once firing
        const da = ((Math.atan2(tg.x - e.x, tg.z - e.z) - ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        ang += clamp(da, -1, 1) * (t < .9 ? 6 : .55) * dt;
        [line, bm, core].forEach(m => {
          m.position.set(e.x, (e.y || 0) + 1.5 * e.sc, e.z);
          m.rotation.set(0, ang, 0);
        });
        if (t < .9)
          return true;
        if (!bm.visible) {
          bm.visible = core.visible = true;
          line.visible = false;
          sfx.shot('sn');
        }
        bm.material.opacity = .6 + .25 * Math.sin(t * 40);
        const vx = Math.sin(ang);
        const vz = Math.cos(ang);
        const px = tg.x - e.x;
        const pz = tg.z - e.z;
        if (px * vx + pz * vz > 0 && Math.abs(px * vz - pz * vx) < .9) {
          acc += 45 * dt;
          if (acc >= 6) {
            hitP(tg, acc);
            acc = 0;
          }
        }
        if (t < 2.3)
          return true;
        e.busy = 0;
        return false;
      }
    });
  },
  // Blademaster: active camo, a flicker, then reappears behind you and slashes (0.35s to react)
  cloak(e) {
    const tg = netTarget(e);
    e.busy = 1;
    let t = 0;
    let hit = false;
    let moved = false;
    sfx.recharge();
    hz.push({
      ms: [], upd(dt) {
        if (e.dead) {
          e.g.visible = true;
          e.busy = 0;
          return false;
        }
        t += dt;
        if (t < 1.3) {
          e.g.visible = Math.random() < .08;
          return true;
        }
        if (!moved) {
          // Behind you: opposite to where the camera faces
          moved = true;
          e.x = clamp(tg.x + Math.sin(tg === P ? yaw : tg.yw) * 3, -A + 1, A - 1);
          e.z = clamp(tg.z + Math.cos(tg === P ? yaw : tg.yw) * 3, -A + 1, A - 1);
          pushOut(e, .6 * e.sc);
          e.g.visible = true;
          e.flash = .1;
          sfx.sword();
          flashFx(e.x, 1.5, e.z, 1.5, 0xbfe8ff);
        }
        if (t < 1.65) {
          if (e.sw)
            e.sw.rotation.x = -1.2;
          return true;
        }
        if (!hit) {
          hit = true;
          if (e.sw)
            e.sw.rotation.x = .6;
          if (Math.hypot(tg.x - e.x, tg.z - e.z) < 3.2)
            hitP(tg, 30);
        }
        e.busy = 0;
        return false;
      }
    });
  },
  // Blademaster: winds up, then spins with the sword out; everything within 4.5m gets cut
  spin(e) {
    const tg = netTarget(e);
    e.busy = 1;
    let t = 0;
    let hit = false;
    const tell = ringAt(e.x, e.z, .4, 4.5, 0xbfe8ff, 0);
    hz.push({
      ms: [tell], upd(dt) {
        if (e.dead) {
          e.busy = 0;
          return false;
        }
        t += dt;
        tell.position.set(e.x, groundH(e.x, e.z) + .05, e.z);
        if (t < .6) {
          tell.material.opacity = .1 + .15 * Math.abs(Math.sin(t * 20));
          e.flash = .05;
          return true;
        }
        if (t - dt < .6)
          sfx.sword();
        // Runs after the enemy loop, so this overrides its face-the-player rotation
        e.g.rotation.y = Math.atan2(tg.x - e.x, tg.z - e.z) + (t - .6) * 28;
        tell.material.opacity = Math.max(0, .35 - (t - .6));
        if (!hit && Math.hypot(tg.x - e.x, tg.z - e.z) < 4.5) {
          hit = true;
          hitP(tg, 30);
        }
        if (t < 1.2)
          return true;
        e.busy = 0;
        return false;
      }
    });
  },
  // Warden: five hardlight pillars strike marked circles, one on you
  rain(e) {
    const tg = netTarget(e);
    const pts = [[tg.x, tg.z]];
    for (let i = 0; i < 4; i++)
      pts.push([clamp(tg.x + R(-7, 7), -A + 2, A - 2), clamp(tg.z + R(-7, 7), -A + 2, A - 2)]);
    sfx.recharge();
    pts.forEach(([x, z], i) => {
      let t = -i * .12;
      let hit = false;
      const ring = ringAt(x, z, 1.7, 2, 0x40ffe8, 0);
      const col = gm(new THREE.CylinderGeometry(2, 2, 14, 24, 1, true), 0xbffcff, 0);
      col.position.set(x, 7, z);
      scene.add(col);
      hz.push({
        ms: [ring, col], upd(dt) {
          t += dt;
          if (t < 0)
            return true;
          if (t < 1.3) {
            ring.material.opacity = .3 + .4 * Math.abs(Math.sin(t * 9));
            return true;
          }
          if (!hit) {
            hit = true;
            col.material.opacity = .7;
            ring.material.opacity = 0;
            if (i === 0)
              sfx.boom();
            if (Math.hypot(tg.x - x, tg.z - z) < 2)
              hitP(tg, 28);
          }
          col.material.opacity -= dt * 2;
          return col.material.opacity > 0;
        }
      });
    });
  },
  // Shipmaster / Deacon / Ironclad: four plasma mortars drop out of the sky on marked circles, one on you
  mortar(e) {
    const tg = netTarget(e);
    const col = BOSSKIT[e.t].col;
    sfx.throw();
    for (let i = 0; i < 4; i++) {
      const tx = clamp(tg.x + (i ? R(-6, 6) : 0), -A + 2, A - 2);
      const tz = clamp(tg.z + (i ? R(-6, 6) : 0), -A + 2, A - 2);
      const gy = groundH(tx, tz);
      const orb = gm(new THREE.SphereGeometry(.4, 10, 8), col, 1);
      const ring = ringAt(tx, tz, 3.5, 3.8, col, 0);
      scene.add(orb);
      let t = -i * .25;
      hz.push({
        ms: [orb, ring], upd(dt) {
          t += dt;
          if (t < 0)
            return true;
          ring.material.opacity = .25 + .35 * Math.abs(Math.sin(t * 8));
          orb.position.set(tx, gy + Math.max(0, 30 * (1 - t / 1.4)), tz);
          if (t < 1.4)
            return true;
          explode(tx, gy + .3, tz, 3.8, 0, 26, 'n', true);
          return false;
        }
      });
    }
  },
  // Skirmisher: a red laser sight tracks you, then locks for a moment and fires. Break line of sight or sidestep.
  snipe(e) {
    const tg = netTarget(e);
    e.busy = 1;
    let t = 0;
    let ax = tg.x;
    let az = tg.z;
    let fired = false;
    const line = gm(new THREE.BoxGeometry(.04, .04, 1), 0xff3030, .7);
    line.geometry.translate(0, 0, .5);
    scene.add(line);
    sfx.recharge();
    hz.push({
      ms: [line], upd(dt) {
        if (e.dead) {
          e.busy = 0;
          return false;
        }
        t += dt;
        // Follows you quickly at first, then barely moves just before the shot
        const k = Math.min(1, dt * (t < .8 ? 5 : 1.2));
        ax += (tg.x - ax) * k;
        az += (tg.z - az) * k;
        const oy = (e.y || 0) + 1.6 * e.sc;
        const ty = (tg.y || 0) + 1.3;
        line.position.set(e.x, oy, e.z);
        line.lookAt(ax, ty, az);
        line.scale.set(1, 1, Math.hypot(ax - e.x, ty - oy, az - e.z) || 1);
        e.flash = .05;
        if (t < 1.1)
          return true;
        if (!fired) {
          fired = true;
          line.material.color.setHex(0xffffff);
          line.scale.x = line.scale.y = 3;
          sfx.shot('sn');
          const o = new THREE.Vector3(e.x, oy, e.z);
          const dir = new THREE.Vector3(ax - e.x, ty - oy, az - e.z).normalize();
          if (Math.hypot(tg.x - ax, tg.z - az) < 1.1 && wallT(o, dir) > Math.hypot(tg.x - e.x, tg.z - e.z) - 1)
            hitP(tg, 40);
        }
        line.material.opacity = Math.max(0, 1 - (t - 1.1) * 6);
        if (t < 1.3)
          return true;
        e.busy = 0;
        return false;
      }
    });
  },
  // Skirmisher / Shipmaster: a fan of nine homing needles
  volley(e) {
    const tg = netTarget(e);
    const base = Math.atan2(tg.x - e.x, tg.z - e.z);
    const oy = (e.y || 0) + 1.4 * e.sc;
    const d = Math.hypot(tg.x - e.x, tg.z - e.z) || 1;
    for (let k = 0; k < 9; k++) {
      const a = base + (k - 4) * .12;
      const dir = new THREE.Vector3(Math.sin(a), ((tg.y || 0) + 1.3 - oy) / d, Math.cos(a)).normalize();
      const mm = new THREE.Mesh(new THREE.BoxGeometry(.07, .07, .45), new THREE.MeshBasicMaterial({ color: BOSSKIT[e.t].col }));
      mm.position.set(e.x, oy, e.z);
      mm.lookAt(mm.position.clone().add(dir));
      scene.add(mm);
      shots.push({ m: mm, v: dir.multiplyScalar(18), dmg: 7, life: 4, home: 1.6, tg });
    }
    sfx.needleE(d);
  }
};

// Enrage (at half health): faster and more aggressive, and invulnerable for 1.5s inside a gold shell,
// so a big burst can't skip the phase.
function enrage(e, msg) {
  if (e.rage)
    return;
  e.rage = 1;
  e.sp *= 1.35;
  e.fr *= .65;
  e.inv = T + 1.5;
  banner(msg);
  sfx.room();
  flashFx(e.x, (e.y || 0) + 1.2 * e.sc, e.z, 2 * e.sc, 0xffd040);
}

function bossAI(e, dt) {
  const K = BOSSKIT[e.t];
  if (!e.rage && e.hp + e.sh < (e.maxhp + e.maxsh) * .5)
    enrage(e, 'ENRAGED!');
  // Reinforcements through portals around the boss (faster once enraged)
  e.sumT -= dt;
  if (e.sumT <= 0) {
    e.sumT = (K.every || 14) * (e.rage ? .65 : 1);
    if (enemies.length < 12) {
      banner(ET[e.t].bn.toUpperCase() + ' CALLS FOR BACKUP');
      K.sum.forEach((t, i) => {
        const a = i / K.sum.length * 6.28 + R(0, 1);
        const x = clamp(e.x + Math.cos(a) * 3.5, -A + 2, A - 2);
        const z = clamp(e.z + Math.sin(a) * 3.5, -A + 2, A - 2);
        spawn(t, x, z);
        flashFx(x, 1, z, 1.8, K.col);
      });
      sfx.room();
    }
  }
  // While a move runs the boss holds its normal fire
  if (e.busy) {
    e.cd = Math.max(e.cd, .3);
    return;
  }
  e.atk = (e.atk == null ? 3 : e.atk) - dt;
  if (e.atk <= 0) {
    e.atk = e.rage ? R(2.5, 4) : R(4, 6);
    MOVES[K.moves[Math.random() * K.moves.length | 0]](e);
  }
}
