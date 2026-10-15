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
