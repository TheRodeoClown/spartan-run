/*
 * graphics.js: the Halo: Combat Evolved look. Classic script (no modules): all files share one global scope, so load
 * order in index.html matters (after core.js; the post-processing scripts from three/examples load before it).
 *
 * - Post-processing (when SET.gfx is on and the effects scripts loaded): the scene renders into a multisampled
 *   target, then bloom (so plasma, lights, shields and the sun glow) and a final grade (CE's punchy colour: a little
 *   more saturation and contrast, a soft vignette).
 * - Sun shadows: characters, vehicles and props cast real-time shadows from each level's sun, in a box that follows
 *   you.
 * - Reflections: a cubemap of each level, rendered once when it's built, that shiny materials reflect (the chrome look
 *   of Covenant armour and weapons). Materials opt in with gfxShiny().
 * - Skies: a drifting cloud layer and a glowing sun disk on outdoor levels.
 * Everything falls back to the plain renderer if the quality setting is low or the effects scripts didn't load.
 */

SET.gfx = SET.gfx == null ? 1 : SET.gfx;

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = true;
dl.castShadow = true;
dl.shadow.mapSize.set(2048, 2048);
Object.assign(dl.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 160 });
dl.shadow.bias = -.0006;
dl.shadow.normalBias = .03;
scene.add(dl.target);
// the direction the sunlight comes from (set per level from its sun position)
const SUN = new THREE.Vector3(5, 10, 3).normalize();

/* ---------- Reflections ---------- */
const ENV_RT = new THREE.WebGLCubeRenderTarget(128, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
const ENV_CAM = new THREE.CubeCamera(1, 4000, ENV_RT);
scene.add(ENV_CAM);
// A material that reflects the level around it: k is how much (Covenant armour ~.25, gun metal ~.12)
function gfxShiny(m, k) {
  m.envMap = ENV_RT.texture;
  m.combine = THREE.MixOperation;
  m.reflectivity = k;
  return m;
}

/* ---------- Post-processing ---------- */
let composer = null;
let bloomPass = null;
// The final grade: CE's saturated, contrasty look and a soft vignette
const GRADE = {
  uniforms: { tDiffuse: { value: null }, sat: { value: 1.16 }, con: { value: 1.07 }, vig: { value: .55 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
  fragmentShader: [
    'uniform sampler2D tDiffuse; uniform float sat; uniform float con; uniform float vig; varying vec2 vUv;',
    'void main() {',
    '  vec4 c = texture2D(tDiffuse, vUv);',
    '  vec3 col = c.rgb;',
    '  float l = dot(col, vec3(.299, .587, .114));',
    '  col = mix(vec3(l), col, sat);',
    '  col = (col - .5) * con + .5;',
    '  vec2 d = vUv - .5;',
    '  col *= 1. - dot(d, d) * vig;',
    '  gl_FragColor = vec4(clamp(col, 0., 1.), c.a);',
    '}'
  ].join('\n')
};

function gfxInit() {
  if (!THREE.EffectComposer || !THREE.UnrealBloomPass || !THREE.ShaderPass)
    return;
  const w = Math.max(1, wrap.clientWidth);
  const h = Math.max(1, wrap.clientHeight);
  // multisampled (WebGL 2) so edges stay smooth through the effects
  const rt = renderer.capabilities.isWebGL2 && THREE.WebGLMultisampleRenderTarget
    ? new THREE.WebGLMultisampleRenderTarget(w, h, { format: THREE.RGBAFormat })
    : new THREE.WebGLRenderTarget(w, h, { format: THREE.RGBAFormat });
  composer = new THREE.EffectComposer(renderer, rt);
  composer.addPass(new THREE.RenderPass(scene, cam));
  // only the brightest things bloom (plasma, lights, glows, the sun), not bright skies or snow
  bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), .38, .3, .94);
  composer.addPass(bloomPass);
  const grade = new THREE.ShaderPass(GRADE);
  grade.renderToScreen = true;
  composer.addPass(grade);
}
gfxInit();

function gfxResize() {
  if (!composer)
    return;
  const w = Math.max(1, wrap.clientWidth);
  const h = Math.max(1, wrap.clientHeight);
  composer.setSize(w, h);
  bloomPass.setSize(w / 2, h / 2);
}
addEventListener('resize', gfxResize);

// Render a frame: the sun's shadow box follows the camera; effects when they're on
function gfxRender() {
  const hi = !!SET.gfx;
  renderer.shadowMap.enabled = hi;
  dl.castShadow = hi;
  if (hi) {
    const c = cam.position;
    dl.target.position.set(c.x, c.y, c.z);
    dl.position.set(c.x + SUN.x * 70, c.y + SUN.y * 70, c.z + SUN.z * 70);
  }
  if (hi && composer)
    composer.render();
  else
    renderer.render(scene, cam);
}

/* ---------- Per level ---------- */
// Cast and receive shadows on everything sensible in a freshly built level, add the clouds and sun, and capture the
// reflection cubemap
function gfxLevel(lv) {
  const sp = lv && lv.sun ? new THREE.Vector3(lv.sun[2], lv.sun[3], lv.sun[4]) : new THREE.Vector3(5, 10, 3);
  SUN.copy(sp.lengthSq() > 0 ? sp.normalize() : new THREE.Vector3(5, 10, 3).normalize());
  if (SUN.y < .35) {
    SUN.y = .35;
    SUN.normalize();
  }
  const sph = new THREE.Sphere();
  envG.traverse(o => {
    if (!o.isMesh)
      return;
    const m = o.material;
    if (!m || m.isMeshBasicMaterial || m.transparent)
      return;
    o.receiveShadow = true;
    if (!o.geometry.boundingSphere)
      o.geometry.computeBoundingSphere();
    sph.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);
    // props cast shadows; the ground, walls of the sky and far scenery don't
    o.castShadow = sph.radius < 40 && Math.hypot(sph.center.x, sph.center.z) < 260;
  });
  floor.receiveShadow = true;
  if (lv && lv.sky && lv.sty !== 'cc')
    envG.add(gfxSky(lv));
  // the reflection cubemap: the level seen from a little above the middle of where you'll fight
  const gy = groundH(0, 0);
  ENV_CAM.position.set(0, gy + 4, 0);
  const vis = gun.visible;
  gun.visible = false;
  ENV_CAM.update(renderer, scene);
  gun.visible = vis;
}

// Something that moves (an enemy, a vehicle, a player avatar) casts a shadow; glows and shields don't
function gfxCaster(g) {
  g.traverse(o => {
    if (o.isMesh && o.material && !o.material.isMeshBasicMaterial && !o.material.transparent)
      o.castShadow = true;
  });
}

/* ---------- Sky: clouds and the sun ---------- */
function gfxCloudTex() {
  return ctex('ceClouds', 512, 256, 1, 1, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    // soft cumulus: overlapping fuzzy blobs in drifting bands, thicker toward the horizon (the bottom of the texture)
    let sd = 7;
    const rnd = () => (sd = sd * 16807 % 2147483647) / 2147483647;
    for (let i = 0; i < 420; i++) {
      const y = Math.pow(rnd(), .7) * h;
      const x = rnd() * w;
      const r = 6 + rnd() * 26 * (.4 + y / h);
      const a = .05 + rnd() * .1;
      [0, -w, w].forEach(ox => {
        const gr = g.createRadialGradient(x + ox, y, 0, x + ox, y, r);
        gr.addColorStop(0, 'rgba(255,255,255,' + a + ')');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        g.fillRect(x + ox - r, y - r, r * 2, r * 2);
      });
    }
  });
}

function gfxSky(lv) {
  const grp = new THREE.Group();
  // a cloud dome: the texture wraps round the horizon and fades out overhead
  const tex = gfxCloudTex();
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(3, 1);
  const tint = new THREE.Color(lv.hemi ? lv.hemi[0] : 0xffffff).lerp(new THREE.Color(0xffffff), .4);
  const cl = new THREE.Mesh(new THREE.SphereGeometry(2300, 48, 12, 0, Math.PI * 2, Math.PI * .12, Math.PI * .4),
    new THREE.MeshBasicMaterial({ map: tex, color: tint, transparent: true, opacity: .85, side: THREE.BackSide, fog: false, depthWrite: false }));
  cl.renderOrder = -1;
  grp.add(cl);
  // the sun: a hot core and a wide glow (bloom picks it up)
  const glowT = ctex('glow', 128, 128, 1, 1, DR.glow);
  const sunC = new THREE.Color(lv.sun ? lv.sun[0] : 0xfff2d8);
  [[260, 1, sunC.clone().lerp(new THREE.Color(0xffffff), .6)], [900, .55, sunC]].forEach(([s, o, c]) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowT, color: c, transparent: true, opacity: o, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    sp.position.copy(SUN).multiplyScalar(2100);
    sp.scale.set(s, s, 1);
    sp.renderOrder = -1;
    grp.add(sp);
  });
  grp.userData.clouds = cl;
  GFX_SKY.push(grp);
  return grp;
}
const GFX_SKY = [];

// Every frame: drift the clouds
function gfxTick(dt) {
  for (let i = GFX_SKY.length - 1; i >= 0; i--) {
    const g = GFX_SKY[i];
    if (!g.parent) {
      GFX_SKY.splice(i, 1);
      continue;
    }
    g.userData.clouds.rotation.y += dt * .004;
    g.position.copy(cam.position);
  }
}
