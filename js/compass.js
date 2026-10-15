/*
 * compass.js: the heading strip across the top of the HUD (every mode). Classic script (no modules): all files share
 * one global scope. North is +z (the way you face when a Firefight starts) and east is -x, so east is on your right
 * when you face north. Marks: enemies (red; bosses orange and bigger; cloaked Elites don't show), teammates (blue),
 * and in Firefight the REQ stations (yellow), the generators in a defend round (cyan) and where the latest squad
 * dropped in (a flashing purple arrow). Marks behind you sit at the ends, pointing the way to turn. Versus shows
 * directions only.
 */

const cmp = document.createElement('canvas');
cmp.id = 'cmp';
cmp.width = 400;
cmp.height = 40;
$('hud').appendChild(cmp);
const CMP_SPAN = 1.75; // radians either side of centre (about 100 degrees)
const CMP_N = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

// Compass bearing of a direction on the ground: 0 = north (+z), +pi/2 = east (-x)
const bearing = (dx, dz) => Math.atan2(-dx, dz);
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));

function compassMarks() {
  const m = [];
  if (NET.mode === 'vs')
    return m;
  enemies.forEach(e => {
    if (e.dead || e.camo)
      return;
    m.push({ x: e.x, z: e.z, c: e.boss ? '#ffa040' : '#ff4a3a', s: e.boss ? 5 : 3.2, k: 'dot' });
  });
  if (NET.mode === 'coop')
    netRemotes().forEach(r => m.push({ x: r.x, z: r.z, c: '#5ec8f2', s: 3.5, k: 'dot' }));
  if (FF.on) {
    FF_STATIONS.forEach(([x, z]) => m.push({ x, z, c: '#ffd060', s: 4, k: 'sq' }));
    if (ffTargets().length)
      ffGensUp().forEach(g => m.push({ x: g.x, z: g.z, c: '#5ff0ff', s: 4.5, k: 'sq' }));
    if (FF.znAt && T - FF.znAt < 8 && FF_ZONES[FF.zi] && Math.floor(T * 4) % 2 === 0)
      m.push({ x: FF_ZONES[FF.zi][0], z: FF_ZONES[FF.zi][1], c: '#c89aff', s: 7, k: 'tri' });
  }
  return m;
}

function compass() {
  const show = !!P && (state === 'play' || state === 'pick') && !scoped();
  cmp.style.display = show ? 'block' : 'none';
  if (!show)
    return;
  const g = cmp.getContext('2d');
  const W2 = cmp.width;
  const H2 = cmp.height;
  const cx = W2 / 2;
  g.clearRect(0, 0, W2, H2);
  // a dark band that fades out at the ends
  const bg = g.createLinearGradient(0, 0, W2, 0);
  bg.addColorStop(0, 'rgba(8,12,18,0)');
  bg.addColorStop(.2, 'rgba(8,12,18,.55)');
  bg.addColorStop(.8, 'rgba(8,12,18,.55)');
  bg.addColorStop(1, 'rgba(8,12,18,0)');
  g.fillStyle = bg;
  g.fillRect(0, 4, W2, 22);
  const fwd = Math.atan2(Math.sin(yaw), -Math.cos(yaw));
  const px = a => cx + wrapA(a - fwd) / CMP_SPAN * cx;
  const fade = x => Math.max(0, 1 - Math.abs(x - cx) / cx) * 1.4;
  // ticks every 15 degrees, letters every 45
  g.textAlign = 'center';
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI / 12;
    const x = px(a);
    if (Math.abs(wrapA(a - fwd)) > CMP_SPAN)
      continue;
    const al = Math.min(1, fade(x));
    if (i % 3 === 0) {
      const n = CMP_N[i / 3];
      g.fillStyle = n === 'N' ? 'rgba(255,208,96,' + al + ')' : 'rgba(220,232,214,' + al + ')';
      g.font = (n.length === 1 ? 'bold 17px' : '13px') + ' monospace';
      g.fillText(n, x, 20);
    }
    else {
      g.fillStyle = 'rgba(200,214,196,' + al * .6 + ')';
      g.fillRect(x - .5, 8, 1, 6);
    }
  }
  // marks: off the ends of the strip they pin to the edge (turn that way)
  compassMarks().forEach(o => {
    const rel = wrapA(bearing(o.x - P.x, o.z - P.z) - fwd);
    const off = Math.abs(rel) > CMP_SPAN * .95;
    const x = cx + clamp(rel / CMP_SPAN, -.95, .95) * cx;
    const d = Math.hypot(o.x - P.x, o.z - P.z);
    g.globalAlpha = off ? .55 : Math.max(.45, 1 - d / 120);
    g.fillStyle = o.c;
    const y = 31;
    const s = o.s;
    g.beginPath();
    if (off) {
      // a little arrow pointing the way to turn
      const sg = Math.sign(rel);
      g.moveTo(x + sg * s, y);
      g.lineTo(x - sg * s, y - s);
      g.lineTo(x - sg * s, y + s);
    }
    else if (o.k === 'tri') {
      g.moveTo(x, y + s);
      g.lineTo(x - s, y - s * .6);
      g.lineTo(x + s, y - s * .6);
    }
    else if (o.k === 'sq')
      g.rect(x - s * .8, y - s * .8, s * 1.6, s * 1.6);
    else
      g.arc(x, y, s, 0, 7);
    g.fill();
  });
  g.globalAlpha = 1;
  // your heading: a caret in the middle
  g.fillStyle = '#9bc45a';
  g.beginPath();
  g.moveTo(cx, 26);
  g.lineTo(cx - 5, 33);
  g.lineTo(cx + 5, 33);
  g.fill();
  g.fillRect(cx - .75, 2, 1.5, 6);
}

/* ---------- Objective waypoints ---------- */
// Markers over what to guard (Firefight generators: letter, health, distance; red "UNDER ATTACK" when hit, grey when
// lost; "DEFEND NEXT" in the break before a defend round) and what to kill (commanders and bosses). Drawn over the
// view and through walls; off-screen ones stick to the edge of the screen.
const wpBox = document.createElement('div');
wpBox.id = 'wpts';
$('hud').appendChild(wpBox);
const wpEls = [];
const _wp = new THREE.Vector3();

function waypointList() {
  const out = [];
  if (!FF.on)
    return out;
  const obj = ffObjective();
  if (obj)
    FF.gens.forEach(g => {
      const dead = g.hp <= 0;
      const hot = !dead && T - g.hitAt < 1.5;
      out.push({ x: g.x, y: g.y + 3.4, z: g.z, mark: g.name, label: dead ? 'LOST' : hot ? 'UNDER ATTACK' : obj === 'next' ? 'DEFEND NEXT' : 'DEFEND', col: dead ? '#8a9096' : hot && Math.floor(T * 6) % 2 ? '#ff5a4a' : '#5ff0ff', hp: dead ? null : g.hp / g.max });
    });
  const R0 = FF_ROUNDS[FF.round - 1];
  if (FF.ph === 'play' && R0 && (R0.kind === 'bosses' || R0.kind === 'boss'))
    enemies.forEach(e => {
      if (e.boss && !e.dead && !e.camo)
        out.push({ x: e.x, y: (e.y || 0) + 2.6 * e.sc, z: e.z, mark: '!', label: 'KILL', col: '#ffa040', hp: (Math.max(0, e.hp) + e.sh) / ((e.maxhp + e.maxsh) || 1) });
    });
  return out;
}

function waypoints() {
  const list = state === 'play' && P ? waypointList() : [];
  const W2 = wpBox.clientWidth;
  const H2 = wpBox.clientHeight;
  list.forEach((m, i) => {
    let el = wpEls[i];
    if (!el) {
      el = document.createElement('div');
      el.className = 'wp';
      el.innerHTML = '<b><span></span></b><em></em><i><u></u></i><small></small>';
      wpBox.appendChild(el);
      wpEls[i] = el;
    }
    el.style.display = 'block';
    _wp.set(m.x, m.y, m.z).project(cam);
    let sx = _wp.x;
    let sy = _wp.y;
    const behind = _wp.z > 1;
    if (behind) {
      sx = -sx;
      sy = -sy;
    }
    // keep it on screen; behind you it rides the bottom edge on the side to turn toward
    let px = (sx * .5 + .5) * W2;
    let py = (-sy * .5 + .5) * H2;
    const edge = behind || px < 30 || px > W2 - 30 || py < 60 || py > H2 - 40;
    if (behind)
      py = H2 - 40;
    px = clamp(px, 30, W2 - 30);
    py = clamp(py, 60, H2 - 40);
    el.style.left = px + 'px';
    el.style.top = py + 'px';
    el.style.color = m.col;
    el.style.opacity = edge ? .75 : 1;
    el.firstChild.firstChild.textContent = m.mark;
    el.children[1].textContent = m.label;
    el.children[2].style.display = m.hp == null ? 'none' : 'block';
    if (m.hp != null)
      el.children[2].firstChild.style.width = Math.round(100 * m.hp) + '%';
    el.children[3].textContent = Math.round(Math.hypot(m.x - P.x, m.z - P.z)) + 'm';
  });
  for (let i = list.length; i < wpEls.length; i++)
    wpEls[i].style.display = 'none';
}