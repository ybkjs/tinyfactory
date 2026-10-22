// tinyfactory: rendering, camera, day/night and weather, parcels
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { createParcels, scrollBelts } from "./flow.js";
import { bakeStatic } from "./bake.js";
import { lampMaterial, lamps, windowMaterial } from "./structures.js";
import { cityName, describeWeather, lineStatus, nameOf, setLang, t } from "./i18n.js";
import { computeLayout, signature } from "./layout.js";
import { createUI } from "./ui.js";
import { canvasTexture, mesh, rbox, weatherUniforms } from "./util.js";
import { buildWorld } from "./world.js";

const params = new URLSearchParams(location.search);
const TOKEN = params.get("token");
const api = (path) => `${path}${TOKEN ? `${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(TOKEN)}` : ""}`;
// Quality: medium (default) renders straight to the screen at native resolution with hardware MSAA — sharpest and cheapest;
// high adds post-processing with ambient occlusion (for screenshots); low is 1x resolution for old machines. Capped at 30 fps.
const QUALITY = params.get("q") || "medium";
const POST = QUALITY === "high";
const FPS_CAP = Number(params.get("fps") || 30);

/* ---------- Renderer, scene ---------- */

const canvas = document.createElement("canvas");
canvas.id = "scene";
document.body.prepend(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !POST && params.get("aa") !== "0", powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, QUALITY === "low" ? 1 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// Neutral keeps colours truer than ACES: greener grass, brighter roofs
renderer.toneMapping = params.get("tm") === "aces" ? THREE.ACESFilmicToneMapping : THREE.NeutralToneMapping;
renderer.domElement.addEventListener("webglcontextlost", (e) => e.preventDefault());
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog("#a9bf8e", 70, 170);
scene.background = new THREE.Color("#a9bf8e");
const pmrem = new THREE.PMREMGenerator(renderer);
// Reflections only on glass and water: scene-wide IBL costs every pixel an extra lookup
const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

/* ---------- First load: what's on this machine decides the layout ---------- */

async function fetchState() {
  const res = await fetch(api("/api/state"), { cache: "no-store" });
  if (!res.ok) throw new Error(`state ${res.status}`);
  return res.json();
}
let state = await fetchState().catch(() => ({ factories: [], agents: [], counts: {}, events: [], cities: [], stale: true }));
if (!params.get("lang") && state.lang) setLang(state.lang);
const DEMO = Boolean(state.demo);
const layout = computeLayout(state);
const structure = signature(state);

const camera = new THREE.PerspectiveCamera(24, innerWidth / innerHeight, 1, 400);
// Frame the whole park, leaving room for the panel on the left
function homeView() {
  const b = layout.bounds;
  const spanX = b.maxX - b.minX + 6, spanZ = b.maxZ - b.minZ + 6;
  const aspect = innerWidth / innerHeight, k = 2 * Math.tan(THREE.MathUtils.degToRad(12));
  const panel = innerWidth > 760 ? 0.13 : 0;
  const dist = THREE.MathUtils.clamp(Math.max((spanX * 1.18) / (k * aspect * (1 - panel * 2)), (spanZ * 0.95) / k), 45, 150);
  const visibleWidth = k * dist * aspect;
  return { target: new THREE.Vector3((b.minX + b.maxX) / 2 - visibleWidth * panel * 0.5, 0, (b.minZ + b.maxZ) / 2 + 1), az: -0.06, polar: 0.84, dist };
}
const HOME = homeView();
const rig = { target: HOME.target.clone(), az: HOME.az, polar: HOME.polar, dist: HOME.dist, goal: { ...HOME, target: HOME.target.clone() } };
function placeCamera() {
  const { target, az, polar, dist } = rig;
  camera.position.set(target.x + Math.sin(az) * Math.sin(polar) * dist, target.y + Math.cos(polar) * dist, target.z + Math.cos(az) * Math.sin(polar) * dist);
  camera.lookAt(target);
}

/* ---------- Lights ---------- */

const hemi = new THREE.HemisphereLight("#d6e9ff", "#5d7a3a", 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight("#fff1dc", 3.0);
sun.castShadow = true;
sun.shadow.mapSize.setScalar(QUALITY === "low" ? 2048 : 4096);
Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 40, bottom: -40, near: 1, far: 200 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
sun.shadow.radius = 4;
scene.add(sun, sun.target);

/* ---------- The park ---------- */

const world = buildWorld(scene, layout);
const parcels = createParcels(scene);

// Lamp glow at night: a sprite on the bulb and a light pool on the ground
const glowTex = canvasTexture(128, (ctx, s) => {
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,214,150,1)");
  g.addColorStop(0.35, "rgba(255,190,110,0.45)");
  g.addColorStop(1, "rgba(255,170,90,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
}, { repeat: 1 });
const glows = [];
scene.updateMatrixWorld(true);
for (const head of lamps) {
  const p = head.getWorldPosition(new THREE.Vector3());
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  sprite.position.copy(p);
  sprite.scale.setScalar(1.6);
  const pool = mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }), { x: p.x, y: 0.06 + (p.y > 2 ? 0.34 : 0), z: p.z, cast: false, receive: false });
  pool.rotation.x = -Math.PI / 2;
  scene.add(sprite, pool);
  glows.push(sprite, pool);
}

// Chimney puffs from busy machines, recycled from a small pool
const puffGeo = new THREE.SphereGeometry(0.17, 10, 8);
const puffs = Array.from({ length: 70 }, () => {
  const m = new THREE.Mesh(puffGeo, new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 1, transparent: true, opacity: 0, depthWrite: false }));
  m.visible = false;
  scene.add(m);
  return { m, life: 0, vx: 0, vz: 0 };
});
let puffNext = 0;
const puffClock = new Map();
function puff(pos) {
  const p = puffs[puffNext++ % puffs.length];
  p.m.position.copy(pos);
  p.life = 1.8;
  p.vx = (Math.random() - 0.5) * 0.25;
  p.vz = (Math.random() - 0.5) * 0.25;
  p.m.visible = true;
}
function updatePuffs(dt) {
  for (const p of puffs) {
    if (p.life <= 0) continue;
    p.life -= dt;
    const k = 1 - Math.max(p.life, 0) / 1.8;
    p.m.position.x += p.vx * dt;
    p.m.position.z += p.vz * dt;
    p.m.position.y += dt * (0.9 - k * 0.4);
    p.m.scale.setScalar(0.55 + k * 1.7);
    p.m.material.opacity = (1 - k) * 0.7;
    if (p.life <= 0) p.m.visible = false;
  }
}

// Merge static meshes once the glow positions are known
bakeStatic(scene);

/* ---------- Post-processing (q=high only): AO + tilt-shift ---------- */

const transparentMeshes = [], particles = [];
scene.traverse((o) => {
  if (!o.isMesh || !o.material?.transparent) return;
  transparentMeshes.push(o);
  if (o.material.isMeshPhysicalMaterial) { o.material.envMap = envMap; o.material.needsUpdate = true; }
});
if (QUALITY === "high") { scene.environment = envMap; scene.environmentIntensity = 0.35; }

const size = renderer.getDrawingBufferSize(new THREE.Vector2());
let composer = null, gtao = null, tiltH = null, tiltV = null;
if (POST) {
  composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 }));
  composer.addPass(new RenderPass(scene, camera));
  gtao = new GTAOPass(scene, camera, size.x, size.y);
  gtao.output = GTAOPass.OUTPUT.Default;
  gtao.blendIntensity = 0.75;
  gtao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.6, thickness: 1.5, scale: 1.0, samples: 12 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
  composer.addPass(gtao);
  const render = gtao.render.bind(gtao);
  gtao.render = (...args) => {
    const hidden = [...glows, ...particles, ...transparentMeshes].filter((o) => o.visible);
    for (const o of hidden) o.visible = false;
    render(...args);
    for (const o of hidden) o.visible = true;
  };
}
const tiltShader = (axis) => ({
  uniforms: { tDiffuse: { value: null }, step: { value: new THREE.Vector2() }, focus: { value: 0.52 }, band: { value: 0.16 }, amount: { value: 1 } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 step; uniform float focus; uniform float band; uniform float amount; varying vec2 vUv;
    void main(){
      float k = smoothstep(band, band + 0.32, abs(vUv.y - focus)) * amount;
      vec2 d = step * k;
      vec4 c = texture2D(tDiffuse, vUv) * 0.1633;
      c += (texture2D(tDiffuse, vUv + d) + texture2D(tDiffuse, vUv - d)) * 0.1531;
      c += (texture2D(tDiffuse, vUv + d * 2.0) + texture2D(tDiffuse, vUv - d * 2.0)) * 0.12245;
      c += (texture2D(tDiffuse, vUv + d * 3.0) + texture2D(tDiffuse, vUv - d * 3.0)) * 0.0918;
      c += (texture2D(tDiffuse, vUv + d * 4.0) + texture2D(tDiffuse, vUv - d * 4.0)) * 0.051;
      gl_FragColor = c;
    }`
});
if (POST) {
  tiltH = new ShaderPass(tiltShader("x"));
  tiltV = new ShaderPass(tiltShader("y"));
  composer.addPass(tiltH);
  composer.addPass(tiltV);
  composer.addPass(new OutputPass());
} else if (params.has("tilt")) {
  // Tilt-shift is off by default (sharpness first); ?tilt=1 blurs the top and bottom edges with CSS
  document.body.insertAdjacentHTML("beforeend", '<div class="tilt top"></div><div class="tilt bottom"></div>');
}
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  const s = renderer.getDrawingBufferSize(new THREE.Vector2());
  if (!POST) return;
  composer.setSize(innerWidth, innerHeight);
  gtao?.setSize(s.x, s.y);
  tiltH.uniforms.step.value.set(2.2 / s.x * renderer.getPixelRatio(), 0);
  tiltV.uniforms.step.value.set(0, 2.2 / s.y * renderer.getPixelRatio());
}
resize();
addEventListener("resize", resize);

/* ---------- Day, night and weather ---------- */

// Sun altitude/azimuth (approximate, plenty for shadows)
function sunAt(date, lat, lon) {
  const rad = Math.PI / 180;
  const n = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360, g = ((357.528 + 0.9856003 * n) % 360) * rad;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad, eps = 23.439 * rad;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)), dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
  const ha = (gmst * 15 + lon) * rad - ra, phi = lat * rad;
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha));
  const az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(ha));
  return { alt, az };
}

const PREVIEW = {
  "clear-day": { hour: 10.5, kind: "clear" }, dusk: { hour: 16.9, kind: "clear" }, night: { hour: 21.5, kind: "clear" },
  rain: { hour: 14, kind: "rain" }, snow: { hour: 11, kind: "snow" }, "snow-night": { hour: 19.5, kind: "snow" }
};
let preview = params.get("weather") || "live";
let liveWeather = describeWeather(0);
liveWeather.temp = undefined;
// City: ?city=… first, then the one picked last time in this browser, then the server's default (config / time zone)
const savedCity = (() => { try { return localStorage.getItem("tinyfactory-city"); } catch { return null; } })();
const cities = state.cities?.length ? state.cities : [state.city || { id: "beijing", zh: "北京", en: "Beijing", lat: 39.904, lon: 116.407 }];
let city = cities.find((c) => c.id === (params.get("city") || savedCity)) || state.city || cities[0];
const weatherCache = new Map();
let lastClock = 0;
const sky = { snow: 0, rain: 0, cloud: 0 };

function currentTime() {
  if (preview === "live" || !PREVIEW[preview]) return new Date();
  const d = new Date();
  const h = PREVIEW[preview].hour;
  d.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0);
  return d;
}
function currentKind() { return preview === "live" || !PREVIEW[preview] ? liveWeather.kind : PREVIEW[preview].kind; }

// Rain streaks and snowflakes fall around the camera target and recycle
const RAIN_N = 4200, SNOW_N = 5200;
const rainGeo = new THREE.BufferGeometry();
const rainPos = new Float32Array(RAIN_N * 6);
for (let i = 0; i < RAIN_N; i++) { const x = (Math.random() - 0.5) * 100, y = Math.random() * 40, z = (Math.random() - 0.5) * 80; rainPos.set([x, y, z, x + 0.06, y - 0.9, z + 0.02], i * 6); }
rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
const rain = particles[0] = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: "#d6e4ff", transparent: true, opacity: 0, depthWrite: false }));
rain.frustumCulled = false;
scene.add(rain);
const flake = canvasTexture(64, (ctx, s) => { const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.5, "rgba(255,255,255,0.7)"); g.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, s, s); }, { repeat: 1 });
const snowGeo = new THREE.BufferGeometry();
const snowPos = new Float32Array(SNOW_N * 3);
for (let i = 0; i < SNOW_N; i++) snowPos.set([(Math.random() - 0.5) * 100, Math.random() * 40, (Math.random() - 0.5) * 80], i * 3);
snowGeo.setAttribute("position", new THREE.BufferAttribute(snowPos, 3));
const snow = particles[1] = new THREE.Points(snowGeo, new THREE.PointsMaterial({ map: flake, size: 0.32, transparent: true, opacity: 0, depthWrite: false }));
snow.frustumCulled = false;
scene.add(snow);

const tmpColor = new THREE.Color();
function applyLighting(dt) {
  const now = currentTime();
  const { alt, az } = sunAt(now, city.lat, city.lon);
  const kind = currentKind();
  const ease = Math.min(1, dt * 1.5);
  sky.snow += ((kind === "snow" ? 1 : 0) - sky.snow) * ease;
  sky.rain += ((kind === "rain" ? 1 : 0) - sky.rain) * ease;
  sky.cloud += ((kind === "clear" ? 0 : kind === "cloudy" ? 0.6 : 1) - sky.cloud) * ease;
  weatherUniforms.snow.value = sky.snow;

  const h = Math.sin(alt);
  const day = THREE.MathUtils.smoothstep(h, -0.08, 0.22);
  const golden = 1 - THREE.MathUtils.smoothstep(h, 0.05, 0.35);
  // Below the horizon the sun hands over to a fixed moonlight
  const dir = day > 0.02
    ? new THREE.Vector3(Math.cos(alt) * Math.sin(az), Math.max(0.12, h), -Math.cos(alt) * Math.cos(az)).normalize()
    : new THREE.Vector3(-0.45, 0.8, 0.35).normalize();
  sun.position.copy(rig.target).addScaledVector(dir, 90);
  sun.target.position.copy(rig.target);
  const cloudDim = 1 - sky.cloud * 0.5;
  sun.intensity = THREE.MathUtils.lerp(0.42, 3.1 * cloudDim, day);
  sun.color.copy(tmpColor.set("#a9bbff")).lerp(new THREE.Color("#fff1dc").lerp(new THREE.Color("#ffb070"), golden * day), day);
  hemi.intensity = THREE.MathUtils.lerp(0.32, 1.15 + sky.cloud * 0.25, day);
  hemi.color.set("#2c3c6a").lerp(new THREE.Color(sky.cloud > 0.5 ? "#e4e9ef" : "#d6e9ff"), day);
  hemi.groundColor.set("#141a22").lerp(new THREE.Color(sky.snow > 0.5 ? "#c9d2dc" : "#5d7a3a"), day);
  if (scene.environment) scene.environmentIntensity = THREE.MathUtils.lerp(0.08, 0.35, day);
  const fog = tmpColor.set("#18202e").lerp(new THREE.Color(sky.snow > 0.5 ? "#c8d0d8" : sky.cloud > 0.5 ? "#b4bdb0" : "#a9bf8e"), day);
  scene.fog.color.copy(fog);
  scene.background.copy(fog);
  // Fog scales with the camera distance, so a big park zoomed out isn't drowned in haze
  scene.fog.near = rig.dist * THREE.MathUtils.lerp(0.62, 0.72, day) - sky.cloud * 5;
  scene.fog.far = rig.dist * 1.75;
  renderer.toneMappingExposure = THREE.MathUtils.lerp(1.2, 0.92, day);
  const night = 1 - day;
  lampMaterial.emissiveIntensity = night * 3.2;
  for (const g of glows) { g.material.opacity = night * (g.isSprite ? 0.9 : 0.55); g.visible = night > 0.02; }
  for (const o of transparentMeshes) if (o.material.isMeshPhysicalMaterial) o.material.envMapIntensity = THREE.MathUtils.lerp(0.06, o.material.userData.env ?? (o.material.userData.env = o.material.envMapIntensity), day);
  windowMaterial.emissive.set("#ffc979");
  windowMaterial.emissiveIntensity = night * 0.9;
  rain.material.opacity = sky.rain * 0.55;
  snow.material.opacity = sky.snow * 0.95;
  return { now, day };
}

function updateParticles(dt, t) {
  const cx = rig.target.x, cz = rig.target.z;
  if (sky.rain > 0.01) {
    for (let i = 0; i < RAIN_N; i++) {
      const k = i * 6;
      let y = rainPos[k + 1] - dt * 26;
      if (y < 0) { y += 40; rainPos[k] = cx + (Math.random() - 0.5) * 100; rainPos[k + 2] = cz + (Math.random() - 0.5) * 80; }
      rainPos[k + 1] = y; rainPos[k + 3] = rainPos[k] + 0.06; rainPos[k + 4] = y - 0.9; rainPos[k + 5] = rainPos[k + 2] + 0.02;
    }
    rainGeo.attributes.position.needsUpdate = true;
  }
  if (sky.snow > 0.01) {
    for (let i = 0; i < SNOW_N; i++) {
      const k = i * 3;
      let y = snowPos[k + 1] - dt * 2.2;
      snowPos[k] += Math.sin(t * 0.8 + i) * dt * 0.4;
      if (y < 0) { y += 40; snowPos[k] = cx + (Math.random() - 0.5) * 100; snowPos[k + 2] = cz + (Math.random() - 0.5) * 80; }
      snowPos[k + 1] = y;
    }
    snowGeo.attributes.position.needsUpdate = true;
  }
}

async function fetchWeather(force = false) {
  const target = city;
  const cached = weatherCache.get(target.id);
  if (cached && !force && Date.now() - cached.at < 15 * 60 * 1000) { liveWeather = cached.weather; return; }
  let weather = null;
  try {
    const res = await fetch(api(`/api/weather?lat=${target.lat}&lon=${target.lon}`), { signal: AbortSignal.timeout(9000) });
    if (res.ok) { const w = await res.json(); if (w.code !== undefined) weather = describeWeather(w.code, w.temp); }
  } catch { /* keep the last known weather */ }
  if (!weather) return;
  weatherCache.set(target.id, { weather, at: Date.now() });
  if (target === city) { liveWeather = weather; lastClock = -1; }
}
function setCity(id) {
  const next = cities.find((c) => c.id === id);
  if (!next || next === city) return;
  city = next;
  try { localStorage.setItem("tinyfactory-city", id); } catch { /* private mode: just don't remember */ }
  liveWeather = weatherCache.get(id)?.weather || { kind: "clear", text: "…", emoji: "⏳", temp: undefined };
  ui.setCity(id);
  lastClock = -1;
  fetchWeather();
}
/* ---------- State, parcels, character animation ---------- */

let lineById = new Map(), agentById = new Map();
function index() {
  lineById = new Map(state.factories.flatMap((f) => f.lines.map((l) => [l.id, l])));
  agentById = new Map(state.agents.map((a) => [a.id, a]));
}
index();
const seen = new Set((state.events || []).map((e) => e.id));
const agentAnim = new Map(layout.agents.map((a) => [a.id, { jump: 0, spin: 0, work: 0, stack: 0 }]));
const machineAnim = new Map();
const crate = new THREE.MeshStandardMaterial({ color: "#c99a62", roughness: 0.85 });

function dispatch(lineId) {
  const line = world.lines.get(lineId);
  const agentId = lineById.get(lineId)?.agent || line?.line.agent;
  const out = world.outBelts.get(agentId);
  if (!line || !out) return;
  machineAnim.set(lineId, 2.5);
  parcels.send([line.belt, out], {
    onArrive: () => {
      const a = agentAnim.get(agentId);
      a.jump = 0.6;
      a.work = 2.6;
    }
  });
}

function stackBox(agentId) {
  const platform = world.agents.get(agentId);
  const a = agentAnim.get(agentId);
  const i = a.stack % 8;
  if (!platform || !a) return;
  if (i === 0) for (const c of [...platform.userData.pallet.children].slice(1)) platform.userData.pallet.remove(c);
  platform.userData.pallet.add(mesh(rbox(0.5, 0.4, 0.42, 0.04, 2), crate, { x: (i % 2) * 0.56 - 0.28, y: 0.3 + Math.floor(i / 4) * 0.42, z: (Math.floor(i / 2) % 2) * 0.46 - 0.23 }));
  a.stack += 1;
}

const LAMP = { running: "#4fd16a", live: "#4fd16a", queued: "#5b86ff", warn: "#ff6a3d", idle: "#9aa0a6", scheduled: "#c7cdd4", paused: "#7d838a" };

function animate(dt, t) {
  scrollBelts(dt, 1);
  parcels.update(dt);
  updatePuffs(dt);
  world.hub.userData.turntable.rotation.y += dt * (0.25 + parcels.count() * 0.12);
  world.hub.userData.beacon.material.emissiveIntensity = 0.6 + Math.sin(t * 3) * 0.35;
  for (const [id, entry] of world.lines) {
    const s = lineById.get(id)?.status || "idle";
    const active = (machineAnim.get(id) || 0) > 0 || s === "running";
    if (machineAnim.has(id)) machineAnim.set(id, machineAnim.get(id) - dt);
    const { gear, lamp, chimney } = entry.machine.userData;
    if (active) {
      gear.rotation.z += dt * 4;
      const c = (puffClock.get(id) || 0) + dt;
      if (c > 0.32) { puff(entry.machine.localToWorld(chimney.clone())); puffClock.set(id, 0); } else puffClock.set(id, c);
    }
    const blink = s === "warn" ? 0.5 + Math.sin(t * 5) * 0.5 : active ? 0.8 + Math.sin(t * 8) * 0.2 : 0.35;
    lamp.material.color.set(LAMP[s] || LAMP.idle);
    lamp.material.emissive.set(LAMP[s] || LAMP.idle);
    lamp.material.emissiveIntensity = s === "scheduled" || s === "idle" || s === "paused" ? 0.05 : blink;
  }
  for (const [id, platform] of world.agents) {
    const a = agentAnim.get(id);
    const { character, ring, baseY, def } = platform.userData;
    const status = agentById.get(id)?.status;
    const working = a.work > 0 || status === "running";
    if (a.jump > 0) a.jump -= dt;
    if (a.work > 0) { a.work -= dt; if (a.work <= 0) { a.spin = 0.8; stackBox(id); } }
    if (a.spin > 0) a.spin -= dt;
    const hop = a.jump > 0 ? Math.sin((1 - a.jump / 0.6) * Math.PI) * 1.1 : 0;
    const kind = def.kind;
    const bob = (kind === "codex" ? Math.sin(t * 1.6) * 0.18 + 0.25 : kind === "deepseek" || kind === "custom" ? Math.sin(t * 1.3) * 0.12 : 0) + (working ? Math.abs(Math.sin(t * 9)) * 0.08 : 0);
    character.position.y = baseY + hop + bob;
    character.rotation.y = (kind === "deepseek" ? -0.5 + Math.sin(t * 0.7) * 0.25 : 0) + (a.spin > 0 ? (1 - a.spin / 0.8) * Math.PI * 2 : working ? Math.sin(t * 12) * 0.06 : 0);
    ring.material.emissiveIntensity = working ? 1.2 + Math.sin(t * 6) * 0.4 : 0.15;
    if (character.userData.spin) character.userData.spin.rotation.z += dt * (working ? 2.4 : 0.5);
    if (character.userData.spout) { const s = working ? 1 + Math.sin(t * 10) * 0.15 : 0.6 + Math.sin(t * 2) * 0.1; character.userData.spout.scale.setScalar(s); }
    if (character.userData.leds) character.userData.leds.forEach((led, i) => { led.material.emissiveIntensity = working ? (Math.sin(t * 14 + i * 1.7) > 0 ? 1.6 : 0.2) : 0.6 + Math.sin(t * 1.5 + i) * 0.2; });
    if (character.userData.claws) character.userData.claws.forEach((c, i) => { c.rotation.x = Math.sin(t * (working ? 9 : 1.5) + i * 2) * (working ? 0.35 : 0.1); });
  }
}

/* ---------- Labels ---------- */

const ui = createUI({ onTool, cities });
const v = new THREE.Vector3();
// Thin leader lines from small labels back to their machines
const leaders = document.createElementNS("http://www.w3.org/2000/svg", "svg");
leaders.classList.add("leaders");
document.getElementById("labels").appendChild(leaders);
const leaderLines = new Map();
function leader(id, x1, y1, x2, y2) {
  let line = leaderLines.get(id);
  if (!line) { line = document.createElementNS("http://www.w3.org/2000/svg", "line"); leaders.appendChild(line); leaderLines.set(id, line); }
  line.setAttribute("x1", x1); line.setAttribute("y1", y1); line.setAttribute("x2", x2); line.setAttribute("y2", y2);
  line.style.display = "";
}
function hideLeader(id) { const line = leaderLines.get(id); if (line) line.style.display = "none"; }
function screenOf(p) {
  v.copy(p).project(camera);
  return v.z > 1 ? null : { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight };
}
// Big labels are centred above their anchor; their boxes are remembered so small labels can steer around them
let bigBoxes = [];
function placeAt(el, x, bottom) {
  el.style.display = "";
  el.style.transform = `translate(${x}px, ${bottom}px) translate(-50%, -100%)`;
  const w = el._w || 120, h = el._h || 34;
  bigBoxes.push([x - w / 2 - 4, bottom - h - 4, x + w / 2 + 4, bottom + 18]);
}
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const agentStatus = (a) => (a?.status === "running" ? (a.busy ? `${t("processing")} ${a.busy}` : t("processing")) : a?.status === "warn" ? t("warn") : t("standby"));
function updateLabels() {
  bigBoxes = [];
  const hubAt = screenOf(world.hub.userData.labelAt.clone().add(world.hub.position));
  const hubEl = ui.label("hub", `<i class="sq" style="background:#ff8a3d"></i>${esc(state.title || "tinyfactory")}<small>${t("hub")} · ${t("inTransit", parcels.count())}</small>`, "big");
  if (hubAt) placeAt(hubEl, hubAt.x, hubAt.y - 16);
  for (const [id, p] of world.agents) {
    const def = p.userData.def;
    const el = ui.label(`a-${id}`, `<i class="sq" style="background:${def.color}"></i>${esc(nameOf(def.name))}<small>${esc(agentStatus(agentById.get(id)))}</small>`, "big");
    const at = screenOf(p.userData.labelAt.clone().add(p.position));
    if (at) placeAt(el, at.x, at.y - 16); else el.style.display = "none";
  }
  for (const f of world.factories) {
    const def = f.userData.def;
    const big = ui.label(`f-${def.id}`, `<i class="sq" style="background:${def.color}"></i>${esc(nameOf(def.name))}${def.hiddenCount ? `<small>${t("more", def.hiddenCount)}</small>` : ""}`, "big");
    const at = screenOf(f.userData.labelAt.clone().add(f.position));
    if (at) placeAt(big, at.x, at.y - 16); else big.style.display = "none";
  }
  // Machine labels of all factories: sorted by screen height and stacked to the right of their machines, never overlapping.
  // Left-aligned so long names grow toward the hub instead of covering the factory building.
  const items = world.factories.flatMap((f) => f.userData.machines.map((m) => {
    const line = lineById.get(m.userData.line.id) || m.userData.line;
    const el = ui.label(`m-${line.id}`, `<i class="dot ${line.status === "scheduled" ? "hollow" : line.status || "idle"}"></i>${esc(nameOf(line.name))}<small>${esc(lineStatus(line))}</small>`, "small");
    return { id: line.id, el, anchor: screenOf(m.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0.2, 1.75, 0))) };
  })).filter((it) => it.anchor).sort((a, b) => a.anchor.y - b.anchor.y);
  const lift = Math.max(14, 600 / rig.dist);
  // Stack the labels top-down; if the column runs into the toolbar, drop the least important label and try again
  const rank = { warn: 0, running: 1, live: 2, queued: 3, scheduled: 4, idle: 5, paused: 6 };
  const byImportance = [...items].sort((a, b) => (rank[lineById.get(a.id)?.status] ?? 5) - (rank[lineById.get(b.id)?.status] ?? 5));
  const limit = innerHeight - 100;
  let shown = items, placed = [];
  while (true) {
    placed = [];
    let prevBottom = -Infinity;
    for (const it of shown) {
      const h = it.el._h || 26, w = it.el._w || 140;
      const x = it.anchor.x + lift * 1.4;
      let bottom = Math.max(it.anchor.y - lift * 0.4, prevBottom + h + 4);
      // Slide below any big label in the way
      for (let tries = 0; tries < 4; tries++) {
        const hit = bigBoxes.find(([x0, y0, x1, y1]) => x < x1 && x + w > x0 && bottom - h < y1 && bottom > y0);
        if (!hit) break;
        bottom = hit[3] + h + 4;
      }
      placed.push({ it, x, bottom, h });
      prevBottom = bottom;
    }
    if (!placed.length || placed.at(-1).bottom <= limit) break;
    const drop = byImportance.findLast((it) => shown.includes(it));
    shown = shown.filter((it) => it !== drop);
  }
  const visible = new Set(placed.map((p) => p.it.id));
  for (const it of items) if (!visible.has(it.id)) { it.el.style.display = "none"; hideLeader(it.id); }
  for (const { it, x, bottom, h } of placed) {
    it.el.style.display = "";
    it.el.style.transform = `translate(${x}px, ${bottom}px) translate(0, -100%)`;
    leader(it.id, it.anchor.x, it.anchor.y, x + 8, bottom - h / 2);
  }
}

/* ---------- Camera controls ---------- */

function onTool(act, arg) {
  const g = rig.goal;
  if (act === "reset") Object.assign(g, { target: HOME.target.clone(), az: HOME.az, polar: HOME.polar, dist: HOME.dist });
  if (act === "left") g.az -= Math.PI / 4;
  if (act === "right") g.az += Math.PI / 4;
  if (act === "in") g.dist = Math.max(28, g.dist * 0.78);
  if (act === "out") g.dist = Math.min(150, g.dist / 0.78);
  if (act === "weather") preview = arg;
  if (act === "city") setCity(arg);
  if (act === "share") shareImage();
  if (act === "focus") {
    const entry = world.lines.get(arg);
    if (entry) { g.target = entry.machine.getWorldPosition(new THREE.Vector3()); g.dist = 40; dispatchPreview(arg); }
  }
}
function dispatchPreview(id) { if (DEMO) dispatch(id); }

let drag = null;
canvas.addEventListener("pointerdown", (e) => { document.getElementById("weather-menu").classList.remove("open"); drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.x = e.clientX; drag.y = e.clientY;
  const g = rig.goal;
  if (drag.pan) {
    const k = g.dist * 0.0011;
    const right = new THREE.Vector3(Math.cos(g.az), 0, -Math.sin(g.az)), fwd = new THREE.Vector3(Math.sin(g.az), 0, Math.cos(g.az));
    g.target = g.target.clone().addScaledVector(right, -dx * k).addScaledVector(fwd, -dy * k);
  } else {
    g.az -= dx * 0.005;
    g.polar = THREE.MathUtils.clamp(g.polar + dy * 0.003, 0.35, 1.15);
  }
});
canvas.addEventListener("pointerup", () => { drag = null; });
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("wheel", (e) => { e.preventDefault(); rig.goal.dist = THREE.MathUtils.clamp(rig.goal.dist * Math.exp(e.deltaY * 0.0012), 28, 150); }, { passive: false });

/* ---------- Data: poll /api/state; new runs become parcels ---------- */

// Parcels from one poll arrive spread out instead of all at once
let nextSlot = 0;
function schedule(ev) {
  const now = performance.now();
  nextSlot = Math.max(nextSlot, now) + 700 + Math.random() * 900;
  setTimeout(() => dispatch(ev.line), nextSlot - now);
}

let reloading = false;
async function poll() {
  try {
    const next = await fetchState();
    // Lines or agents appeared or vanished: rebuild the park
    if (signature(next) !== structure && !reloading) { reloading = true; setTimeout(() => location.reload(), 1500); }
    for (const ev of next.events || []) {
      if (seen.has(ev.id)) continue;
      seen.add(ev.id);
      schedule(ev);
    }
    state = next;
    index();
  } catch {
    state = { ...state, stale: true };
  }
  ui.render(state);
}

// Share card: the current frame plus a title strip, saved as PNG
function shareImage() {
  renderer.render(scene, camera);
  const src = renderer.domElement;
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d");
  ctx.drawImage(src, 0, 0);
  const s = out.width / innerWidth;
  ctx.fillStyle = "rgba(251,248,242,0.92)";
  ctx.beginPath();
  ctx.roundRect(24 * s, 24 * s, 420 * s, 92 * s, 18 * s);
  ctx.fill();
  ctx.fillStyle = "#2c2a26";
  ctx.font = `700 ${26 * s}px -apple-system, "PingFang SC", sans-serif`;
  ctx.fillText(`🏭 ${state.title || t("shareTitle")}`, 44 * s, 64 * s);
  const lines = state.factories.reduce((n, f) => n + f.lines.length, 0);
  ctx.font = `500 ${15 * s}px -apple-system, "PingFang SC", sans-serif`;
  ctx.fillStyle = "#8b857b";
  ctx.fillText(`${t("lines", lines)} · ${state.agents.length} agents · ${t("doneToday")} ${state.counts.done || 0} · tinyfactory`, 44 * s, 96 * s);
  out.toBlob((blob) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `tinyfactory-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, "image/png");
}

ui.render(state);
setInterval(poll, Math.max(2, state.interval || 10) * 1000);
ui.setCity(city.id);
fetchWeather();
setInterval(() => fetchWeather(true), 15 * 60 * 1000);

/* ---------- Main loop ---------- */

const clock = new THREE.Clock();
let pending = 0;
// Adaptive quality: native resolution first. Only drop a step when the window is focused and really struggling
// (two windows under 20 fps), never below 1.5x; ignore the first 6 s and 6 s after each change (shader compiles, occluded windows)
const MAX_DPR = Math.min(devicePixelRatio, QUALITY === "low" ? 1 : 2);
const MIN_DPR = Math.min(MAX_DPR, 1.5);
const adapt = { frames: 0, since: performance.now(), quietUntil: performance.now() + 6000, bad: 0, good: 0 };
function adaptQuality() {
  adapt.frames += 1;
  const now = performance.now(), span = now - adapt.since;
  if (span < 2000) return;
  const fps = (adapt.frames * 1000) / span;
  adapt.frames = 0;
  adapt.since = now;
  if (QUALITY !== "medium" || params.has("fps") || now < adapt.quietUntil || document.visibilityState !== "visible" || !document.hasFocus()) return;
  const dpr = renderer.getPixelRatio();
  const step = (next) => { renderer.setPixelRatio(next); resize(); adapt.bad = adapt.good = 0; adapt.quietUntil = now + 6000; };
  if (fps < 20) { adapt.good = 0; if (++adapt.bad >= 2 && dpr > MIN_DPR) step(Math.max(MIN_DPR, dpr - 0.25)); }
  else if (fps >= 28) { adapt.bad = 0; if (++adapt.good >= 3 && dpr < MAX_DPR) step(Math.min(MAX_DPR, dpr + 0.25)); }
  else adapt.bad = adapt.good = 0;
}
// Shadows refresh every third frame: parcels and characters move slowly enough
renderer.shadowMap.autoUpdate = false;
let frameNo = 0;
function frame() {
  requestAnimationFrame(frame);
  pending += clock.getDelta();
  // 12 fps when the window isn't focused: less work while nobody watches
  const cap = document.hasFocus() ? FPS_CAP : 12;
  if (pending < (1 / cap) * 0.85) return;
  const dt = Math.min(pending, 0.1), t = clock.elapsedTime;
  pending = 0;
  const k = 1 - Math.exp(-dt * 4);
  rig.target.lerp(rig.goal.target, k);
  rig.az += (rig.goal.az - rig.az) * k;
  rig.polar += (rig.goal.polar - rig.polar) * k;
  rig.dist += (rig.goal.dist - rig.dist) * k;
  placeCamera();
  const { now } = applyLighting(dt);
  updateParticles(dt, t);
  animate(dt, t);
  updateLabels();
  if (t - lastClock > 1) { lastClock = t; ui.renderClock(now, cityName(city), preview === "live" ? liveWeather : { ...describeWeather({ clear: 0, rain: 61, snow: 73 }[PREVIEW[preview]?.kind] ?? 0), temp: liveWeather.temp }); }
  if (frameNo++ % 3 === 0) renderer.shadowMap.needsUpdate = true;
  if (POST) composer.render(); else renderer.render(scene, camera);
  adaptQuality();
}
frame();
window.__factory = { dispatch, onTool, scene, renderer };
