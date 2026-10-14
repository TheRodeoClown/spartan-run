/*
 * input.js: Pointer lock, mouse and keyboard handlers.
 * Classic script (no modules): all files share one global scope, so load order in index.html matters.
 */

// Pointer lock for mouse-look. If the page is embedded where lock is blocked, fall back to
// free look: moving the mouse turns the camera, and holding it near a side edge keeps turning.
let everLocked = false;
let freeLook = false;
let mx = .5;
// Losing the mouse lock mid-fight (the browser's Esc) pauses the game.
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === cv;
  if (locked)
    everLocked = true;
  else if (state === 'play')
    pause();
});
document.addEventListener('pointerlockerror', () => {
  if (!everLocked && !freeLook) {
    freeLook = true;
    banner('Mouse lock blocked here: move the mouse to look');
  }
});
document.addEventListener('mousemove', e => {
  const r = wrap.getBoundingClientRect();
  const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  mx = inside ? (e.clientX - r.left) / r.width : .5;
  if (state !== 'play' || !(locked || down || freeLook))
    return;
  const k = .0025 * cam.fov / 75 * SET.sens;
  yaw -= e.movementX * k;
  pitch = clamp(pitch - e.movementY * k, -1.4, 1.4);
});
cv.addEventListener('mousedown', e => {
  if (e.button === 2) {
    zoomOn = true;
    return;
  }
  // The first click only grabs the mouse; it doesn't fire.
  if (state === 'play' && !locked && !freeLook) {
    lock();
    return;
  }
  down = true;
});
addEventListener('mouseup', e => {
  if (e.button === 2)
    zoomOn = false;
  else
    down = false;
});
cv.addEventListener('contextmenu', e => e.preventDefault());
wrap.addEventListener('wheel', e => {
  if (state === 'play') {
    e.preventDefault();
    const n = performance.now();
    if (n - lw > 220) {
      lw = n;
      swapTo(P.cur ? 0 : 1);
    }
  }
}, { passive: false });
addEventListener('keydown', e => {
  // Typing in a text box (multiplayer name or join code) isn't a game key
  if (e.target && e.target.tagName === 'INPUT')
    return;
  // Tab shows the multiplayer scoreboard while held
  if (e.code === 'Tab' && NET.mode) {
    NET.tab = 1;
    e.preventDefault();
    return;
  }
  if (e.repeat)
    return;
  // Esc / P toggle the pause menu (a short guard stops one Esc from both pausing and resuming)
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (state === 'paused') {
      if (performance.now() - pauseAt > 300)
        resume();
    }
    else if (state === 'play')
      pause();
    return;
  }
  // Firefight REQ station: E closes it again
  if (e.code === 'KeyE' && FF.on && NET.menu && state === 'play') {
    netResume();
    return;
  }
  keys[e.code] = true;
  if (e.code === 'KeyM')
    audio.toggle();
  if (e.code === 'KeyN')
    audio.toggleMusic();
  if (state === 'play' && !NET.menu && !NET.down) {
    if (e.code === 'Digit1')
      swapTo(0);
    if (e.code === 'Digit2')
      swapTo(1);
    if (e.code === 'KeyQ')
      throwNade();
    if (e.code === 'KeyR')
      startReload();
    if (e.code === 'KeyF')
      melee();
    if (e.code === 'KeyE')
      ffReq();
    if (e.code === 'Space') {
      jump();
      e.preventDefault();
    }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight')
      thrust();
  }
  else if (state === 'pick' && /^Digit[1-3]$/.test(e.code)) {
    const q = +e.code.slice(5) - 1;
    if (pw) {
      if (q < 2)
        dropW(q);
    }
    else
      pick(q);
  }
});
addEventListener('keyup', e => {
  keys[e.code] = false;
  if (e.code === 'Tab')
    NET.tab = 0;
});
