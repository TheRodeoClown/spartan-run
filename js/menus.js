/*
 * menus.js: Overlay screens: title, mission select, armory and the boon picker.
 * Classic script (no modules): all files share one global scope, so load order in index.html matters.
 */

const decor = ['grunt', 'jackal', 'elite', 'hunter'].map((t, i) => {
  const { g } = buildEnemy(t);
  g.children[g.children.length - 1].visible = false;
  g.scale.setScalar(ET[t].sc);
  g.position.set(-4.8 + i * 3.2, 0, 0);
  g.rotation.y = (1.5 - i) * .12;
  return g;
});

function orbit(dt) {
  if (titleScene) {
    titleCam(dt);
    return;
  }
  T += dt;
  const a = Math.sin(T * .25) * .9;
  cam.position.set(Math.sin(a) * 9, 2.2 + Math.sin(T * .4) * .3, Math.cos(a) * 9);
  cam.lookAt(0, 1.5, 0);
}

// Boon cards stay locked for 1s on a fresh pick screen so a held fire button or number key can't pick by accident.
let pickAt = 0;

function showPick(title) {
  if (title) {
    ptitle = title;
    pickAt = performance.now() + 1000;
  }
  pw = null;
  ov.style.display = 'flex';
  ov.style.background = '';
  ov.style.justifyContent = '';
  ov.innerHTML = '<h2>' + ptitle + '</h2><div id="pkc"></div><div class="cards">' + choices.map((c, i) => '<button class="card pk rar-' + (c.r || 'c') + '" onclick="pick(' + i + ')"><span class="rar">' + RARITY[c.r || 'c'].n + '</span><b>[' + (i + 1) + '] ' + c.n + '</b><small>' + c.d + '</small>' + boonNote(c) + '</button>').join('') + '</div>';
  pickTick();
}

// Boons with diminishing returns: show what your earlier picks already give, what this one would make it, and the cap.
// The boon is tried on a copy of your stats (c.x is the non-weapon part of a weapon legendary).
const DR_STAT = {
  dmg: ['Damage', p => soft(p.dmg / 8, 1.8), 1.8],
  rate: ['Fire rate', p => soft(.09 / p.rate, 1.65), 1.65],
  nade: ['Grenades', p => soft(p.nadeMul, 2.2), 2.2],
  melee: ['Melee', p => soft(p.meleeMul, 3), 3],
  dr: ['Damage taken', p => 1 - (p.dr || 0), .64]
};
const DR_BOON = { 'Hardened Rounds': 'dmg', 'Prometheus Rounds': 'dmg', 'Tuned Trigger': 'rate', 'Overclocked Trigger': 'rate', 'Bigger Boom': 'nade', 'Reclaimer Gift': 'nade', 'Hardlight Strike': 'melee', 'Hardlight Overdrive': 'melee', 'Spartan Charge': 'melee', 'Thick Plating': 'dr' };

function boonNote(c) {
  const k = DR_BOON[c.n];
  if (!k || !P)
    return '';
  const [label, val, cap] = DR_STAT[k];
  const q = Object.assign({}, P, { slots: P.slots.slice(), sa: P.sa.slice(), sr: P.sr.slice(), boons: P.boons.slice() });
  (c.x || c.f)(q);
  const pc = v => (v >= 1 ? '+' : '') + Math.round((v - 1) * 100) + '%';
  const now = val(P);
  const next = val(q);
  return '<small class="drn">' + label + ' now <b>' + pc(now) + '</b> &rarr; <b>' + pc(next) + '</b> (max ' + pc(cap) + ')' + (Math.abs(next - now) < .005 ? ' MAXED' : '') + '</small>';
}
function pickTick() {
  const left = pickAt - performance.now();
  const c = $('pkc');
  if (!c)
    return;
  ov.querySelectorAll('.pk').forEach(b => b.disabled = left > 0);
  c.textContent = left > 0 ? 'Choose a boon in ' + Math.ceil(left / 1000) + '...' : 'Choose a boon' + (P.slots[1] ? ' (weapon boons let you pick which gun to drop)' : '');
  if (left > 0)
    setTimeout(pickTick, 100);
}

function afterPick() {
  // Multiplayer: wait for the squad instead of starting the next room straight away
  if (NET.mode) {
    netAfterPick();
    return;
  }
  if (P.pending) {
    P.pending = 0;
    nextMission();
  }
  else
    nextRoom();
}

function dropW(s) {
  setW(P, pw.w, s);
  if (pw.x)
    pw.x(P);
  P.boons.push(pw.n);
  pw = null;
  afterPick();
}

// A run drops you into each mission once, in random order; clearing the last one wins the run.
function nextMission() {
  const left = LV.map((l, i) => i).filter(i => !P.done.includes(LV[i].id));
  if (!left.length) {
    if (NET.mode) {
      NET.phase = 'v';
      netFinish();
    }
    else
      endRun(true);
    return;
  }
  startLevel(left[Math.random() * left.length | 0]);
  banner('MISSION ' + (P.done.length + 1) + '/' + LV.length + ': ' + L.n.toUpperCase());
}

function armory() {
  state = 'title';
  ov.style.display = 'flex';
  ov.style.background = 'linear-gradient(rgba(8,10,6,.35),rgba(8,10,6,.93))';
  ov.style.justifyContent = 'flex-start';
  const u = UPS.map((x, i) => {
    const l = S.ups[x.id] || 0;
    const mx = l >= x.max;
    return '<button class="card" ' + (mx ? 'disabled style="opacity:.5"' : 'onclick="buyUp(' + i + ')"') + '><b>' + x.n + ' [' + l + '/' + x.max + ']</b><small>' + x.d + '</small><small>' + (mx ? 'MAX' : x.cost(l) + ' credits') + '</small></button>';
  }).join('');
  const o = LOADS.map((x, i) => {
    const own = S.own[x.id];
    const sel = S.sel === x.id;
    return '<button class="card" onclick="buyLoad(' + i + ')"' + (sel ? ' style="border-color:#9bc45a"' : '') + '><b>' + x.n + '</b><small>Starting sidearm</small><small>' + (sel ? 'EQUIPPED (click to unequip)' : own ? 'Owned: click to equip' : x.c + ' credits') + '</small></button>';
  }).join('');
  ov.innerHTML = '<h2>ARMORY</h2><div>Credits: ' + S.cr + '</div><div class="cards sm">' + u + '</div><div style="color:#99a28f;font-size:13px">STARTING LOADOUT</div><div class="cards sm">' + o + '</div><button class="card" style="text-align:center;width:auto" onclick="startTitle()">BACK</button>';
}

function buyUp(i) {
  const x = UPS[i];
  const l = S.ups[x.id] || 0;
  const c = x.cost(l);
  if (l >= x.max || S.cr < c)
    return;
  S.cr -= c;
  S.ups[x.id] = l + 1;
  save();
  sfx.pick();
  armory();
}

function buyLoad(i) {
  const x = LOADS[i];
  if (S.own[x.id])
    S.sel = S.sel === x.id ? null : x.id;
  else if (S.cr >= x.c) {
    S.cr -= x.c;
    S.own[x.id] = 1;
    S.sel = x.id;
  }
  else
    return;
  save();
  sfx.pick();
  armory();
}

function pick(i) {
  const c = choices[i];
  if (!c || performance.now() < pickAt)
    return;
  sfx.pick();
  // Already carrying that weapon: just apply any extra effect.
  if (c.w && P.slots.includes(c.w)) {
    if (c.x)
      c.x(P);
    P.boons.push(c.n);
    afterPick();
    return;
  }
  if (c.w && P.slots[1]) {
    pw = c;
    ov.innerHTML = '<h2>REPLACE WHICH WEAPON?</h2><div>Taking the ' + c.n + '</div><div class="cards">' + P.slots.map((k, s) => '<button class="card" onclick="dropW(' + s + ')"><b>[' + (s + 1) + '] Drop ' + W[k].n + '</b><small>Slot ' + (s + 1) + (s === P.cur ? ' (held)' : '') + '</small></button>').join('') + '<button class="card" onclick="showPick()"><b>Back</b><small>Choose a different boon</small></button></div>';
    return;
  }
  c.f(P);
  P.boons.push(c.n);
  afterPick();
}

function lock() {
  try {
    const r = cv.requestPointerLock();
    if (r && r.catch)
      r.catch(() => { });
  }
  catch (e) { }
}

function banner(s) {
  const b = $('ban');
  b.textContent = s;
  b.style.transition = 'none';
  b.style.opacity = 1;
  setTimeout(() => {
    b.style.transition = 'opacity 1.5s';
    b.style.opacity = 0;
  }, 50);
}

// The title backdrop: the scene shows through, darkened a little at the edges and the bottom for the menus
const TITLE_BG = 'radial-gradient(ellipse at 50% 42%,rgba(10,8,30,0) 35%,rgba(10,8,30,.55) 100%),linear-gradient(rgba(0,0,0,0) 60%,rgba(8,6,20,.7))';

function showTitle() {
  buildTitle();
  ov.style.background = TITLE_BG;
  ov.style.justifyContent = 'center';
  ov.innerHTML = TITLE_LOGO + '<div class="tag">A HALO-INSPIRED ROGUE-LITE</div><button class="press" onclick="startTitle()">PRESS START</button>';
}

// Settings panel (pause menu and title screen): sliders write SET live and save it.
// [key, label, slider min, slider max, slider units per 1.0]
const SLIDERS = [['master', 'Master volume', 0, 100, 100], ['music', 'Music', 0, 100, 100], ['sfx', 'Effects', 0, 100, 100], ['sens', 'Mouse sensitivity', 10, 300, 100]];
const fmtSet = k => k === 'sens' ? SET.sens.toFixed(2) + 'x' : Math.round(SET[k] * 100) + '%';

function settingsHTML() {
  return '<div class="set">' + SLIDERS.map(([k, n, a, b, s]) => '<label for="s_' + k + '">' + n + '</label><input type="range" id="s_' + k + '" min="' + a + '" max="' + b + '" value="' + Math.round(SET[k] * s) + '" oninput="setVal(\'' + k + '\',this.value/' + s + ')"><span id="v_' + k + '">' + fmtSet(k) + '</span>').join('') + '</div><button id="fsbtn" class="linkbtn" onclick="toggleFull()">' + fsLabel() + '</button>';
}

// Fullscreen: the game area fills the screen (the settings panel's button toggles it; Esc also leaves)
function toggleFull() {
  if (document.fullscreenElement)
    document.exitFullscreen().catch(() => { });
  else if (wrap.requestFullscreen)
    wrap.requestFullscreen({ navigationUI: 'hide' }).catch(() => banner('FULLSCREEN IS NOT AVAILABLE HERE'));
}
document.addEventListener('fullscreenchange', () => {
  const b = $('fsbtn');
  if (b)
    b.textContent = fsLabel();
  setTimeout(resize, 50);
});
const fsLabel = () => document.fullscreenElement ? 'EXIT FULLSCREEN' : 'FULLSCREEN';

function setVal(k, v) {
  SET[k] = v;
  $('v_' + k).textContent = fmtSet(k);
  applyAudio();
  saveSet();
}

function titleSettings() {
  ov.innerHTML = '<h2>SETTINGS</h2>' + settingsHTML() + '<div class="cards"><button class="card" style="text-align:center" onclick="showControls(\'titleSettings\')"><b>CONTROLS</b><small>Keys and mouse</small></button><button class="card" style="text-align:center" onclick="startTitle()"><b>BACK</b></button></div>';
}



// Controls page, reached from the pause menu, the multiplayer menu and Settings. back: the function that redraws
// the screen you came from.
const CONTROLS = [['WASD', 'Move'], ['Mouse', 'Look'], ['Left click (hold)', 'Fire'], ['Right click (hold)', 'Zoom (scope on the BR55 and sniper)'], ['Space', 'Jump'],
  ['Shift + WASD', 'Thruster boost (any direction)'], ['Shift + W', 'Sprint (versus)'], ['R', 'Reload'], ['Q', 'Throw grenade'], ['F', 'Melee'],
  ['Wheel or 1 / 2', 'Swap weapon'], ['1 - 3', 'Pick a boon'], ['Tab (hold)', 'Scoreboard (multiplayer)'], ['E', 'REQ station / get in or out of a vehicle (Firefight)'], ['Driving a Ghost', 'Mouse steers, W/S/A/D, Shift boosts, click fires'], ['Warthog', 'Walk up to a seat: driver (mouse steers, W/S), passenger (shoot), gunner (hold fire)'], ['Esc or P', 'Pause menu'], ['M / N', 'Mute all / mute music']];

function controlsHTML() {
  return '<div class="ctl">' + CONTROLS.map(([k, a]) => '<div><b>' + k + '</b><span>' + a + '</span></div>').join('') + '</div>';
}

function showControls(back) {
  ov.innerHTML = '<h2>CONTROLS</h2>' + controlsHTML() + '<button class="card" style="text-align:center;width:auto" onclick="' + back + '()">BACK</button>';
}

// Install as an app: Chrome and Edge offer it once the page qualifies (see manifest.webmanifest and sw.js)
let installEvt = null;
addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  installEvt = e;
  const b = $('instl');
  if (b)
    b.style.display = 'inline-block';
});
addEventListener('appinstalled', () => {
  installEvt = null;
  banner('INSTALLED: SPARTAN RUN IS IN YOUR APPS');
  const b = $('instl');
  if (b)
    b.style.display = 'none';
});

function installApp() {
  if (!installEvt)
    return;
  const e = installEvt;
  installEvt = null;
  e.prompt();
}
let pauseAt = 0;

function pause() {
  if (state !== 'play')
    return;
  // Multiplayer never pauses the match: Esc opens a menu over it
  if (NET.mode) {
    netMenu();
    return;
  }
  state = 'paused';
  pauseAt = performance.now();
  down = false;
  zoomOn = false;
  document.exitPointerLock && document.exitPointerLock();
  pauseScreen();
}

function pauseScreen() {
  ov.style.display = 'flex';
  ov.style.background = '';
  ov.style.justifyContent = '';
  ov.innerHTML = '<h2>PAUSED</h2>' + settingsHTML() + '<div class="cards"><button class="card" style="text-align:center" onclick="resume()"><b>RESUME</b></button><button class="card" style="text-align:center" onclick="showControls(\'pauseScreen\')"><b>CONTROLS</b><small>Keys and mouse</small></button><button class="card" style="text-align:center" onclick="quitRun()"><b>QUIT TO TITLE</b><small>Ends this run; credits are kept</small></button></div><div style="font-size:12px;color:#99a28f">Esc or P to resume</div>';
}

function resume() {
  if (state !== 'paused')
    return;
  state = 'play';
  ov.style.display = 'none';
  lock();
}

// Abandon the run: clear the arena, bank credits (endRun) and go back to the title screen.
function quitRun() {
  clearHz();
  [enemies, shots, nades, drops, rockets, needles].forEach(a => a.forEach(o => scene.remove(o.g || o.m)));
  enemies = [];
  shots = [];
  nades = [];
  drops = [];
  rockets = [];
  needles = [];
  state = 'dead';
  endRun(false);
  L = null;
  startTitle();
}

function startTitle() {
  audio.init();
  music.set(2);
  state = 'title';
  if (!titleScene)
    buildTitle();
  ov.style.display = 'flex';
  ov.style.background = TITLE_BG;
  ov.style.justifyContent = 'flex-end';
  ov.innerHTML = '<div style="flex:1"></div>' + TITLE_LOGO + '<div class="tag">Credits: ' + S.cr + (best ? ' | Best room: ' + best : '') + '</div><div style="flex:1"></div><div class="cards sm"><button class="card" style="text-align:center" onclick="newRun(false)"><b>DEPLOY</b><small>Start a new run (normal)</small></button><button class="card" style="text-align:center;border-color:#c9a227" onclick="newRun(true)"><b style="color:#ffd060">LEGENDARY</b><small>Tougher enemies, 1.5x credits</small></button><button class="card" style="text-align:center" onclick="armory()"><b>ARMORY</b><small>Permanent upgrades</small></button><button class="card" style="text-align:center;border-color:#5ec8f2" onclick="mpMenu()"><b style="color:#8fd8ff">MULTIPLAYER</b><small>Online co-op or versus</small></button><button class="card" style="text-align:center" onclick="titleSettings()"><b>SETTINGS</b><small>Volume and mouse sensitivity</small></button></div><button id="instl" class="linkbtn" style="display:' + (installEvt ? 'inline-block' : 'none') + '" onclick="installApp()">INSTALL AS APP</button><div style="font-size:12px;color:#b8b0d8;margin-bottom:2%">Esc in game opens the pause menu (controls and settings)</div>';
}
showTitle();
