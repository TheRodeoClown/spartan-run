/*
 * audio.js: Procedural Web Audio: sound effects, adaptive in-game score and the title theme.
 * Classic script (no modules): all files share one global scope, so load order in index.html matters.
 */

let ac;
let master;
let sfxG;
let musG;
let nbuf;
let rev;
let padG;
let chantG;
let drumG;
let pulseG;
let pianoG;
let hall;
let muted = false;
let musOff = false;
let mmode = -1;
let mstep = 0;
let nextT = 0;
let mtimer = null;
const audio = {
  init() {
    if (ac) {
      ac.resume && ac.resume();
      return;
    }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C)
      return;
    try {
      ac = new C();
      const cmp = ac.createDynamicsCompressor();
      master = ac.createGain();
      master.gain.value = .85;
      master.connect(cmp);
      cmp.connect(ac.destination);
      sfxG = ac.createGain();
      sfxG.gain.value = .9;
      sfxG.connect(master);
      musG = ac.createGain();
      musG.gain.value = .5;
      musG.connect(master);
      nbuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const d = nbuf.getChannelData(0);
      for (let i = 0; i < d.length; i++)
        d[i] = Math.random() * 2 - 1;
      const len = Math.floor(ac.sampleRate * 2.6);
      const ib = ac.createBuffer(2, len, ac.sampleRate);
      for (let c = 0; c < 2; c++) {
        const x = ib.getChannelData(c);
        for (let i = 0; i < len; i++)
          x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
      }
      rev = ac.createConvolver();
      rev.buffer = ib;
      const rg = ac.createGain();
      rg.gain.value = .8;
      rev.connect(rg);
      rg.connect(musG);
      const L = wet => {
        const g = ac.createGain();
        g.gain.value = 0;
        g.connect(musG);
        const s = ac.createGain();
        s.gain.value = wet;
        g.connect(s);
        s.connect(rev);
        return g;
      };
      padG = L(.6);
      chantG = L(.9);
      drumG = L(.15);
      pulseG = L(.1);
      pianoG = L(.5);
      // A longer, darker hall for the title theme's choir, piano and strings
      const hl = Math.floor(ac.sampleRate * 5);
      const hb = ac.createBuffer(2, hl, ac.sampleRate);
      for (let c = 0; c < 2; c++) {
        const x = hb.getChannelData(c);
        for (let i = 0; i < hl; i++)
          x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / hl, 3) * Math.min(1, i / 400);
      }
      hall = ac.createConvolver();
      hall.buffer = hb;
      const hg = ac.createGain();
      hg.gain.value = .5;
      hall.connect(hg);
      hg.connect(musG);
      [[chantG, .6], [pianoG, .7], [padG, .35]].forEach(([g, w]) => {
        const s = ac.createGain();
        s.gain.value = w;
        g.connect(s);
        s.connect(hall);
      });
      applyAudio();
    }
    catch (e) {
      ac = null;
    }
  },
  toggle() {
    muted = !muted;
    applyAudio();
  },
  toggleMusic() {
    musOff = !musOff;
    applyAudio();
  }
};
// Player settings (saved): volumes 0-1 and a mouse sensitivity multiplier. The M/N mute toggles sit on top of these.
let SET = { master: 1, music: 1, sfx: 1, sens: 1 };
try {
  Object.assign(SET, JSON.parse(localStorage.getItem('spartan_settings') || '{}'));
}
catch (e) { }

function saveSet() {
  try {
    localStorage.setItem('spartan_settings', JSON.stringify(SET));
  }
  catch (e) { }
}

function applyAudio() {
  if (!ac)
    return;
  master.gain.value = muted ? 0 : .85 * SET.master;
  musG.gain.value = musOff ? 0 : .5 * SET.music;
  sfxG.gain.value = .9 * SET.sfx;
}

const mtof = n => 440 * Math.pow(2, (n - 69) / 12);

function osc(type, f0, f1, t, dur, v, dest, filt) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1)
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + Math.min(.01, dur / 4));
  g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  let n = o;
  if (filt) {
    const f = ac.createBiquadFilter();
    f.type = filt[0];
    f.frequency.value = filt[1];
    o.connect(f);
    n = f;
  }
  n.connect(g);
  g.connect(dest || sfxG);
  o.start(t);
  o.stop(t + dur + .05);
}

function noise(t, dur, v, type, f0, f1, q, dest) {
  const s = ac.createBufferSource();
  const f = ac.createBiquadFilter();
  const g = ac.createGain();
  s.buffer = nbuf;
  f.type = type;
  f.frequency.setValueAtTime(f0, t);
  if (f1)
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  if (q)
    f.Q.value = q;
  g.gain.setValueAtTime(.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + Math.min(.005, dur / 4));
  g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  s.connect(f);
  f.connect(g);
  g.connect(dest || sfxG);
  s.start(t, Math.random() * .5);
  s.stop(t + dur + .05);
}
const raw = {
  shot(k) {
    const t = ac.currentTime;
    const p = R(.94, 1.06);
    if (k === 'ar')
      raw.rifle();
    else if (k === 'br') {
      noise(t, .12, .6, 'bandpass', 1600 * p, 300, 1);
      osc('sine', 120 * p, 35, t, .14, .9);
      osc('square', 300, 90, t, .05, .15);
    }
    else if (k === 'mg') {
      noise(t, .16, .7, 'bandpass', 1200 * p, 200, .9);
      osc('sine', 90 * p, 28, t, .2, 1);
    }
    else if (k === 'sg') {
      noise(t, .35, .9, 'lowpass', 2500, 150, .6);
      osc('sine', 100, 25, t, .3, 1);
      noise(t + .38, .05, .25, 'highpass', 2000);
      noise(t + .5, .06, .3, 'highpass', 1500);
    }
    else if (k === 'sn') {
      noise(t, .6, .8, 'bandpass', 2400, 150, .7);
      osc('sine', 140, 30, t, .5, 1);
      osc('sawtooth', 1800, 200, t, .4, .12, sfxG, ['lowpass', 3000]);
    }
    else if (k === 'pr') {
      osc('sawtooth', 1500 * p, 500, t, .09, .2, sfxG, ['lowpass', 3500]);
      osc('sine', 2400, 900, t, .07, .12);
    }
    else if (k === 'nd') {
      osc('sine', 2000 * p, 900, t, .08, .12);
      noise(t, .05, .2, 'highpass', 5000);
    }
    else {
      noise(t, .5, .4, 'lowpass', 1500, 200, .5);
      osc('sine', 70, 30, t, .4, .8);
    }
  },
  reloadX(k, t) {
    if (k === 'mg') {
      noise(t + .08, .05, .3, 'highpass', 2500);
      osc('sine', 220, 100, t + .08, .08, .35);
      noise(t + .5, .06, .3, 'highpass', 1800);
      osc('sine', 180, 80, t + .5, .1, .4);
    }
    else if (k === 'sg') {
      for (let i = 0; i < 4; i++) {
        const u = t + .15 + i * .35;
        osc('square', 900 + i * 80, null, u, .03, .12);
        noise(u, .04, .2, 'highpass', 2500);
      }
      noise(t + 1.7, .12, .35, 'bandpass', 900, 300, 1);
      osc('sawtooth', 150, 80, t + 1.7, .12, .25, sfxG, ['lowpass', 600]);
    }
    else if (k === 'sn') {
      osc('square', 500, 200, t + .3, .06, .15);
      noise(t + .3, .08, .3, 'highpass', 2000);
      noise(t + 1.2, .1, .3, 'highpass', 1500);
      osc('square', 400, 250, t + 1.4, .07, .15);
    }
    else if (k === 'pr') {
      noise(t, .9, .25, 'highpass', 3000);
      osc('sawtooth', 200, 1200, t + .8, .7, .12, sfxG, ['lowpass', 3000]);
    }
    else if (k === 'rk') {
      osc('sine', 90, 40, t + .2, .2, .7);
      noise(t + .2, .1, .4, 'lowpass', 900);
      osc('square', 300, 150, t + 1.8, .08, .2);
      noise(t + 2.1, .1, .35, 'highpass', 1500);
    }
    else {
      osc('triangle', 1400, 1800, t + .2, .25, .15);
      osc('triangle', 1800, 2200, t + .5, .25, .12);
      noise(t + .3, .3, .15, 'highpass', 4000);
    }
  },
  swap() {
    const t = ac.currentTime;
    noise(t, .1, .25, 'bandpass', 1200, 500, 1);
    osc('square', 500, 300, t + .08, .05, .12);
  },
  grab() {
    const t = ac.currentTime;
    osc('sine', 600, 1200, t, .15, .2);
    osc('sine', 900, 1800, t + .06, .15, .15);
  },
  sword() {
    const t = ac.currentTime;
    osc('sawtooth', 300, 1100, t, .3, .25, sfxG, ['lowpass', 2500]);
    osc('sine', 90, 40, t + .1, .2, .5);
    noise(t, .25, .3, 'bandpass', 800, 2400, 1);
  },
  rifle() {
    const t = ac.currentTime;
    const p = R(.9, 1.1);
    noise(t, .07, .5, 'bandpass', 2200 * p, 500, 1.2);
    osc('sine', 150 * p, 45, t, .09, .7);
    osc('square', 420 * p, 120, t, .04, .12);
  },
  crit() {
    const t = ac.currentTime;
    osc('square', 2600, 3400, t, .06, .14, sfxG, ['lowpass', 5000]);
    osc('sine', 3800, null, t + .05, .08, .14);
    noise(t, .05, .2, 'highpass', 4000);
  },
  tick(h) {
    const t = ac.currentTime;
    osc('sine', h ? 2400 : 1700, null, t, .05, .18);
    if (h)
      osc('sine', 3200, null, t + .04, .07, .12);
  },
  reload(k) {
    const t = ac.currentTime;
    if (k && k !== 'ar' && k !== 'br') {
      raw.reloadX(k, t);
      return;
    }
    noise(t + .1, .06, .3, 'highpass', 2500);
    osc('sine', 200, 100, t + .1, .08, .3);
    noise(t + .7, .07, .35, 'highpass', 1800);
    osc('sine', 160, 70, t + .7, .1, .4);
  },
  beep() {
    const t = ac.currentTime;
    [0, .14, .28].forEach(o => osc('square', 2200, null, t + o, .06, .15));
  },
  needleE(d) {
    const t = ac.currentTime;
    const v = Math.max(.03, .2 * (1 - d / 32));
    osc('sine', 2000, 900, t, .08, v);
    noise(t, .04, v * .6, 'highpass', 5000);
  },
  dry() {
    const t = ac.currentTime;
    osc('square', 1800, null, t, .025, .12);
    noise(t, .03, .15, 'highpass', 3000);
  },
  cock() {
    const t = ac.currentTime;
    osc('square', 1200, null, t, .03, .15);
    osc('square', 600, null, t + .07, .04, .15);
  },
  throw() {
    const t = ac.currentTime;
    noise(t, .28, .25, 'bandpass', 300, 1400, .8);
  },
  boom() {
    const t = ac.currentTime;
    noise(t, 1.2, .9, 'lowpass', 1800, 80, .7);
    osc('sine', 100, 28, t, .9, .9);
    osc('sawtooth', 120, 30, t, .5, .25, sfxG, ['lowpass', 300]);
  },
  jump() {
    const t = ac.currentTime;
    noise(t, .12, .18, 'bandpass', 600, 1400, 1);
    osc('sine', 140, 220, t, .1, .2);
  },
  land() {
    const t = ac.currentTime;
    noise(t, .1, .3, 'lowpass', 500, 120);
    osc('sine', 90, 45, t, .12, .4);
  },
  dash() {
    const t = ac.currentTime;
    noise(t, .35, .5, 'bandpass', 500, 2600, .9);
    osc('sawtooth', 180, 420, t, .3, .15, sfxG, ['lowpass', 1200]);
  },
  melee() {
    const t = ac.currentTime;
    noise(t, .18, .3, 'bandpass', 500, 2000, 1);
    osc('sawtooth', 900, 180, t + .08, .18, .2, sfxG, ['lowpass', 2500]);
    osc('sine', 100, 40, t + .1, .15, .6);
  },
  plasma(d) {
    const t = ac.currentTime;
    const v = Math.max(.04, .28 * (1 - d / 32));
    osc('sawtooth', 1100, 350, t, .16, v, sfxG, ['lowpass', 3000]);
    osc('sine', 1800, 700, t, .1, v * .5);
  },
  hit(sh) {
    const t = ac.currentTime;
    if (sh) {
      noise(t, .1, .35, 'highpass', 3000, 1000);
      osc('sawtooth', 1400, 300, t, .12, .25, sfxG, ['lowpass', 3500]);
    }
    else {
      osc('sine', 110, 50, t, .18, .6);
      noise(t, .15, .4, 'lowpass', 800, 200);
    }
  },
  recharge() {
    const t = ac.currentTime;
    osc('triangle', 250, 1000, t, 1.4, .12);
    osc('sine', 255, 1010, t, 1.4, .1);
  },
  kill(k) {
    const t = ac.currentTime;
    noise(t, .12, .3, 'bandpass', 1500, 300, 1);
    if (k === 'grunt' || k === 'kgrunt') {
      osc('square', 900, 350, t, .22, .15, sfxG, ['lowpass', 2500]);
      osc('square', 1100, 420, t + .08, .2, .12, sfxG, ['lowpass', 2500]);
    }
    else if (k === 'jackal' || k === 'jmajor' || k === 'jsniper' || k === 'skimmer' || k === 'finf') {
      osc('sawtooth', 1400, 500, t, .15, .18, sfxG, ['lowpass', 3000]);
    }
    else if (k === 'elite' || k === 'selite' || k === 'celite' || k === 'blademaster') {
      osc('sawtooth', 220, 80, t, .5, .25, sfxG, ['lowpass', 900]);
    }
    else {
      osc('sawtooth', 90, 40, t, .9, .35, sfxG, ['lowpass', 400]);
      noise(t, .6, .3, 'lowpass', 500, 80);
    }
  },
  room() {
    const t = ac.currentTime;
    osc('sine', 70, 35, t, .7, .5);
    noise(t, .6, .3, 'lowpass', 400, 80);
  },
  clear() {
    const t = ac.currentTime;
    [392, 494, 587].forEach((f, i) => osc('triangle', f, null, t + i * .1, .5, .18));
  },
  pick() {
    const t = ac.currentTime;
    osc('sine', 784, null, t, .5, .18);
    osc('sine', 1175, null, t + .08, .6, .14);
  },
  dead() {
    const t = ac.currentTime;
    osc('sawtooth', 260, 35, t, 1.6, .3, sfxG, ['lowpass', 900]);
    noise(t, 1, .3, 'lowpass', 900, 60);
  }
};
const sfx = {};
Object.keys(raw).forEach(k => sfx[k] = (...a) => {
  if (ac && !muted)
    try {
      raw[k](...a);
    }
    catch (e) { }
});

/* Original score: modal chant, string pad and war drums in the spirit of epic sci-fi. Not a copy of any existing piece. */
const BPM = 104;
const SP = 60 / BPM / 4;
const CH = [
  [50, 57, 62, 65], [48, 55, 60, 64], [46, 53, 58, 62], [48, 55, 60, 67]
];
const ROOT = [38, 36, 34, 36];
const MEL = [
  [[0, 6, 62], [6, 10, 65]], [[0, 8, 64], [8, 8, 60]], [[0, 6, 62], [6, 6, 58], [12, 4, 62]], [[0, 10, 64], [10, 6, 62]],
  [[0, 6, 65], [6, 10, 69]], [[0, 8, 67], [8, 8, 64]], [[0, 6, 65], [6, 6, 62], [12, 4, 58]], [[0, 16, 62]]
];

function chant(n, t, dur) {
  const f = mtof(n);
  const g = ac.createGain();
  const o1 = ac.createOscillator();
  const o2 = ac.createOscillator();
  const lfo = ac.createOscillator();
  const lg = ac.createGain();
  o1.type = o2.type = 'sawtooth';
  o1.frequency.value = f;
  o2.frequency.value = f;
  o2.detune.value = 9;
  lfo.frequency.value = 5.2;
  lg.gain.value = 7;
  lfo.connect(lg);
  lg.connect(o1.detune);
  lg.connect(o2.detune);
  g.gain.setValueAtTime(.0001, t);
  g.gain.exponentialRampToValueAtTime(.8, t + .35);
  g.gain.setValueAtTime(.8, t + dur - .1);
  g.gain.exponentialRampToValueAtTime(.0001, t + dur + .7);
  [[500, 5, .6], [1000, 7, .35], [2500, 8, .12]].forEach(([fr, q, v]) => {
    const bp = ac.createBiquadFilter();
    const m = ac.createGain();
    bp.type = 'bandpass';
    bp.frequency.value = fr;
    bp.Q.value = q;
    m.gain.value = v;
    o1.connect(bp);
    o2.connect(bp);
    bp.connect(m);
    m.connect(g);
  });
  g.connect(chantG);
  [o1, o2, lfo].forEach(o => {
    o.start(t);
    o.stop(t + dur + .8);
  });
}

function pad(chord, t, dur) {
  chord.forEach(n => [-6, 6].forEach(d => {
    const o = ac.createOscillator();
    const g = ac.createGain();
    const f = ac.createBiquadFilter();
    o.type = 'sawtooth';
    o.frequency.value = mtof(n);
    o.detune.value = d;
    f.type = 'lowpass';
    f.frequency.value = 800;
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(.05, t + 1.2);
    g.gain.setValueAtTime(.05, t + dur - .2);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur + 1.2);
    o.connect(f);
    f.connect(g);
    g.connect(padG);
    o.start(t);
    o.stop(t + dur + 1.3);
  }));
}

function taiko(t, v) {
  osc('sine', 110, 42, t, .35, .9 * v, drumG);
  noise(t, .05, .3 * v, 'lowpass', 800, null, 0, drumG);
}

function beat(s, t) {
  if (mmode === 2) {
    tbeat(s, t);
    return;
  }
  const bar = Math.floor(s / 16) % 8;
  const st = s % 16;
  const ci = bar % 4;
  if (st === 0) {
    pad(CH[ci], t, 16 * SP);
    osc('sine', mtof(ROOT[ci]), null, t, 16 * SP, .5, padG);
    MEL[bar].forEach(([a, l, n]) => chant(n, t + a * SP, l * SP));
  }
  if (mmode === 1) {
    if (st === 0 || st === 6 || st === 10)
      taiko(t, st ? .7 : 1);
    if (st === 8) {
      noise(t, .18, .35, 'bandpass', 1600, null, .8, drumG);
      osc('triangle', 200, 120, t, .1, .3, drumG);
    }
    if (bar === 7 && st >= 12)
      taiko(t, .4 + (st - 12) * .15);
    if (st % 2 === 0) {
      noise(t, .04, .07, 'highpass', 7000, null, 0, drumG);
      osc('sawtooth', mtof(ROOT[ci] + 12 + [0, 0, 7, 0, 0, 7, 12, 7][st / 2]), null, t, .14, .2, pulseG, ['lowpass', 700]);
    }
  }
}

function lead(n, t, dur) {
  const g = ac.createGain();
  const f = ac.createBiquadFilter();
  const lfo = ac.createOscillator();
  const lg = ac.createGain();
  const os = [0, -8, 8].map(d => {
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = mtof(n);
    o.detune.value = d;
    return o;
  });
  f.type = 'lowpass';
  f.frequency.value = 2200;
  lfo.frequency.value = 5;
  lg.gain.value = 9;
  lfo.connect(lg);
  os.forEach(o => {
    lg.connect(o.detune);
    o.connect(f);
  });
  g.gain.setValueAtTime(.0001, t);
  g.gain.exponentialRampToValueAtTime(.12, t + .12);
  g.gain.setValueAtTime(.12, t + dur - .1);
  g.gain.exponentialRampToValueAtTime(.0001, t + dur + .4);
  f.connect(g);
  g.connect(chantG);
  [...os, lfo].forEach(o => {
    o.start(t);
    o.stop(t + dur + .5);
  });
}

/* Original title theme, in the spirit of epic sci-fi scores (not a copy of any existing piece). Three 8-bar
   sections at 66 BPM, D minor, looping (~87s):
   1. a cappella monk choir: "oh" chords on root and fifth under an "ah" melody, in a long cathedral hall
   2. soft piano: arpeggios and a high melody over swelling strings, the choir underneath
   3. full: war drums, a driving low-string ostinato, the melody on soaring strings, choir and strings behind */
const SP2 = 60 / 66 / 4;
// chord tones (strings / choir) and bass root, MIDI notes
const TC = {
  Dm: [[50, 57, 62, 65], 38], Bb: [[46, 53, 58, 62], 34], C: [[48, 55, 60, 64], 36], F: [[53, 57, 60, 65], 41],
  A: [[45, 52, 57, 61], 33], Gm: [[43, 50, 55, 58], 31], Am: [[45, 52, 57, 60], 33], D: [[50, 57, 62, 66], 38]
};
const TPROG = ['Dm', 'Bb', 'C', 'Dm', 'F', 'C', 'Bb', 'A', 'Dm', 'Bb', 'F', 'C', 'Dm', 'Gm', 'Bb', 'A', 'Dm', 'Bb', 'C', 'Am', 'Dm', 'Bb', 'C', 'D'];
// melody per bar: [start 16th, length in 16ths, note]
const TMEL = [
  // choir
  [[0, 8, 62], [8, 4, 64], [12, 4, 65]], [[0, 12, 65], [12, 4, 64]], [[0, 8, 64], [8, 8, 60]], [[0, 16, 62]],
  [[0, 6, 65], [6, 6, 67], [12, 4, 69]], [[0, 10, 67], [10, 6, 64]], [[0, 8, 65], [8, 4, 64], [12, 4, 62]], [[0, 16, 61]],
  // piano
  [[0, 4, 74], [4, 4, 72], [8, 8, 69]], [[0, 8, 70], [8, 8, 65]], [[0, 4, 69], [4, 4, 72], [8, 8, 77]], [[0, 16, 76]],
  [[0, 4, 74], [4, 4, 77], [8, 4, 76], [12, 4, 74]], [[0, 8, 70], [8, 8, 74]], [[0, 6, 72], [6, 6, 70], [12, 4, 69]], [[0, 16, 69]],
  // strings
  [[0, 6, 62], [6, 2, 65], [8, 8, 69]], [[0, 6, 70], [6, 2, 69], [8, 8, 65]], [[0, 6, 67], [6, 2, 69], [8, 4, 72], [12, 4, 74]], [[0, 16, 69]],
  [[0, 6, 74], [6, 2, 72], [8, 8, 77]], [[0, 6, 77], [6, 2, 74], [8, 8, 70]], [[0, 4, 72], [4, 4, 74], [8, 4, 76], [12, 4, 72]], [[0, 16, 74]]
];

// Monk choir voice: three slightly detuned saws with vibrato, shaped by vowel formants ('a' = ah, 'o' = oh)
const VOW = { a: [[730, 6, 1], [1090, 8, .5], [2440, 10, .18]], o: [[570, 6, 1], [840, 8, .45], [2410, 10, .14]] };
function choir(n, t, dur, v, vowel) {
  const f = mtof(n);
  const g = ac.createGain();
  const mix = ac.createGain();
  mix.gain.value = .9;
  const src = [-8, 0, 8].map(d => {
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.detune.value = d + R(-3, 3);
    o.connect(mix);
    return o;
  });
  const lfo = ac.createOscillator();
  const lg = ac.createGain();
  lfo.frequency.value = R(4.4, 5.2);
  lg.gain.value = 6;
  lfo.connect(lg);
  src.forEach(o => lg.connect(o.detune));
  VOW[vowel].forEach(([fr, q, a]) => {
    const bp = ac.createBiquadFilter();
    const m = ac.createGain();
    bp.type = 'bandpass';
    bp.frequency.value = fr;
    bp.Q.value = q;
    m.gain.value = a;
    mix.connect(bp);
    bp.connect(m);
    m.connect(g);
  });
  g.gain.setValueAtTime(.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + .55);
  g.gain.setValueAtTime(v, t + Math.max(.56, dur - .15));
  g.gain.exponentialRampToValueAtTime(.0001, t + dur + 1);
  g.connect(chantG);
  [...src, lfo].forEach(o => {
    o.start(t);
    o.stop(t + dur + 1.1);
  });
}

// Soft piano: a few sine partials with a quick attack, a long decay and a closing filter
function piano(n, t, v) {
  const f = mtof(n);
  const g = ac.createGain();
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(Math.min(9000, f * 8), t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(300, f * 2), t + 1.5);
  [[1, 1], [2, .45], [3, .2], [4, .1], [5.02, .05]].forEach(([h, a]) => {
    const o = ac.createOscillator();
    const og = ac.createGain();
    o.type = 'sine';
    o.frequency.value = f * h;
    og.gain.value = a;
    o.connect(og);
    og.connect(lp);
    o.start(t);
    o.stop(t + 3.2);
  });
  g.gain.setValueAtTime(.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + .008);
  g.gain.exponentialRampToValueAtTime(v * .3, t + .4);
  g.gain.exponentialRampToValueAtTime(.0001, t + 3);
  lp.connect(g);
  g.connect(pianoG);
}

// String section: three detuned saws per note, slow bow-in
function strings(chord, t, dur, v) {
  chord.forEach(n => [-9, 0, 9].forEach(d => {
    const o = ac.createOscillator();
    const g = ac.createGain();
    const f = ac.createBiquadFilter();
    o.type = 'sawtooth';
    o.frequency.value = mtof(n);
    o.detune.value = d;
    f.type = 'lowpass';
    f.frequency.value = 1500;
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 1.4);
    g.gain.setValueAtTime(v, t + dur - .2);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur + 1.4);
    o.connect(f);
    f.connect(g);
    g.connect(padG);
    o.start(t);
    o.stop(t + dur + 1.5);
  }));
}

// Rising cymbal-like swell into the next section
function swell(t, dur, v) {
  const s = ac.createBufferSource();
  const f = ac.createBiquadFilter();
  const g = ac.createGain();
  s.buffer = nbuf;
  s.loop = true;
  f.type = 'highpass';
  f.frequency.setValueAtTime(700, t);
  f.frequency.exponentialRampToValueAtTime(5000, t + dur);
  g.gain.setValueAtTime(.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + dur);
  g.gain.linearRampToValueAtTime(0, t + dur + .06);
  s.connect(f);
  f.connect(g);
  g.connect(padG);
  s.start(t);
  s.stop(t + dur + .1);
}

function tbeat(s, t) {
  const bar = Math.floor(s / 16) % 24;
  const st = s % 16;
  const sec = bar >> 3; // 0 choir, 1 piano, 2 full
  const [ch, root] = TC[TPROG[bar]];
  const dur = 16 * SP2;
  if (st === 0) {
    const tg = (g, v) => g.gain.setTargetAtTime(v, t, 1.5);
    tg(chantG, [.95, .55, .6][sec]);
    tg(padG, [.4, .6, .75][sec]);
    tg(pianoG, [0, .85, .5][sec]);
    tg(drumG, [0, .35, 1][sec]);
    tg(pulseG, [0, 0, .75][sec]);
    // choir "oh" on the root and fifth all the way through; strings join from section 2
    choir(ch[0], t, dur, sec ? .32 : .42, 'o');
    choir(ch[1], t, dur, sec ? .28 : .38, 'o');
    if (sec)
      strings(ch, t, dur, sec === 1 ? .035 : .05);
    osc('sine', mtof(root), null, t, dur, sec ? .45 : .28, padG);
    const mel = TMEL[bar];
    if (sec === 0)
      mel.forEach(([a, l, n]) => choir(n, t + a * SP2, l * SP2, .75, 'a'));
    else if (sec === 1)
      mel.forEach(([a, l, n]) => piano(n, t + a * SP2, .3));
    else
      mel.forEach(([a, l, n]) => lead(n, t + a * SP2, l * SP2));
    if (bar % 8 === 7)
      swell(t + 8 * SP2, 8 * SP2, .14);
  }
  // piano arpeggio in eighths, and a soft drum every other bar
  if (sec === 1) {
    if (st % 2 === 0)
      piano([ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[3] + 12, ch[2] + 12, ch[1] + 12, ch[3], ch[2]][st / 2], t, .1);
    if (st === 0 && bar % 2 === 0)
      taiko(t, .5);
  }
  // full section: war drums, snare hits and the low-string ostinato
  if (sec === 2) {
    if (st === 0 || st === 10 || (st === 6 && bar % 2))
      taiko(t, st ? .65 : 1);
    if (st === 8 || (st === 14 && bar % 4 === 3))
      noise(t, .2, .3, 'bandpass', 1500, null, .8, drumG);
    if (st % 2 === 0)
      osc('sawtooth', mtof(root + 12 + [0, 0, 7, 0, 12, 7, 0, 7][st / 2]), null, t, .14, .22, pulseG, ['lowpass', 800]);
    if (bar === 23 && st >= 8)
      taiko(t, .35 + (st - 8) * .08);
  }
}

function sched() {
  if (!ac)
    return;
  if (nextT < ac.currentTime - .5)
    nextT = ac.currentTime + .1;
  while (nextT < ac.currentTime + .3) {
    beat(mstep, nextT);
    nextT += (mmode === 2 ? SP2 : SP);
    mstep++;
  }
}
const music = {
  set(m) {
    if (!ac)
      return;
    if ((m === 2) !== (mmode === 2) && mtimer) {
      mstep = 0;
      nextT = ac.currentTime + .1;
    }
    mmode = m;
    const t = ac.currentTime;
    const s = (g, v) => g.gain.setTargetAtTime(v, t, .7);
    s(padG, m < 0 ? 0 : .6);
    s(chantG, m < 0 ? 0 : m === 1 ? .35 : .6);
    s(drumG, m === 1 ? 1 : 0);
    s(pulseG, m === 1 ? .8 : 0);
    s(pianoG, m === 2 ? .5 : 0);
    if (m >= 0 && !mtimer) {
      mstep = 0;
      nextT = t + .15;
      mtimer = setInterval(sched, 25);
    }
    if (m < 0)
      setTimeout(() => {
        if (mmode < 0 && mtimer) {
          clearInterval(mtimer);
          mtimer = null;
        }
      }, 3500);
  }
};

// Browsers only allow sound after the first click or key press: start the title music right then
function firstSound() {
  removeEventListener('pointerdown', firstSound);
  removeEventListener('keydown', firstSound);
  audio.init();
  if (state === 'title' || state === 'menu')
    music.set(2);
}
addEventListener('pointerdown', firstSound);
addEventListener('keydown', firstSound);
