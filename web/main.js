// tinyfactory: rendering, camera, day/night and weather, parcels
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { createParcels, hubCurve, scrollBelts } from "./flow.js";
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
// Quality: auto (default) starts with post-processing (soft ambient occlusion + tilt-shift, the miniature look) and drops to
// medium for good if this machine can't hold the frame rate; medium renders straight to the screen with hardware MSAA;
// high always keeps the post-processing (for screenshots); low is 1x resolution for old machines. Capped at 30 fps.
const QUALITY = params.get("q") || "auto";
const savedQuality = (() => { try { return localStorage.getItem("tinyfactory-quality"); } catch { return null; } })();
const WANT_POST = QUALITY === "high" || (QUALITY === "auto" && savedQuality !== "medium");
// The first frames go straight to the screen (fewer shaders to compile, so the park shows sooner); post-processing
// comes on a moment later. Screenshots with ?q=high get it from the start.
let post = QUALITY === "high" && WANT_POST;
let postFrom = WANT_POST && !post ? 20 : Infinity;
const FPS_CAP = Number(params.get("fps") || 30);

/* ---------- Renderer, scene ---------- */

const canvas = document.createElement("canvas");
canvas.id = "scene";
document.body.prepend(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: QUALITY !== "high" && params.get("aa") !== "0", powerPreference: "high-performance" });
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

// The online demo has no server: static.js plays the demo factory inside the page
const local = window.TINYFACTORY_STATIC ? await import("./static.js") : null;
async function fetchState() {
  if (local) return local.fetchState();
  const res = await fetch(api("/api/state"), { cache: "no-store" });
  if (!res.ok) throw new Error(`state ${res.status}`);
  return res.json();
}
performance.mark("tf:modules");
let state = await fetchState().catch(() => ({ factories: [], agents: [], counts: {}, events: [], cities: [], stale: true }));
if (!params.get("lang") && state.lang) setLang(state.lang);
const DEMO = Boolean(state.demo);
performance.mark("tf:state");
const layout = computeLayout(state);
const structure = signature(state);

const camera = new THREE.PerspectiveCamera(24, innerWidth / innerHeight, 1, 600);
// Same rule as the phone layout in style.css: narrow windows and any portrait screen (tablets too)
const narrow = () => matchMedia("(max-width: 760px), (max-aspect-ratio: 4/5)").matches;
// On a portrait screen the camera turns 90°, so the wide park (factories → hub → agents) runs top to bottom
const portrait = () => innerWidth / innerHeight < 0.8;
function aim(cam, { target, az, polar, dist }) {
  cam.position.set(target.x + Math.sin(az) * Math.sin(polar) * dist, target.y + Math.cos(polar) * dist, target.z + Math.cos(az) * Math.sin(polar) * dist);
  cam.lookAt(target);
  cam.updateMatrixWorld();
}
// The part of the screen the park should fill, clear of the cards around the edges
function safeArea() {
  // Mid-size windows start with the task list folded away (ui.js), so the park gets the full width
  return narrow() ? { l: 14, r: innerWidth - 14, t: 150, b: innerHeight - 78 } : { l: innerWidth <= 1100 ? 28 : 348, r: innerWidth - 28, t: 108, b: innerHeight - 104 };
}
// Frame the whole park inside the safe area: find the closest distance that fits, then slide the target to centre it
// The points that must be in view: yard corners, building tops (their labels sit above), platforms and the hub.
// Fitting these instead of the bounding box keeps empty corners of the box from shrinking the park.
function framePoints() {
  const pts = [];
  const ring = (x, z, r, y) => { for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; pts.push(new THREE.Vector3(x + Math.cos(a) * r, y, z + Math.sin(a) * r)); } };
  for (const f of layout.factories) {
    for (const dx of [-f.w / 2, f.w / 2]) for (const dz of [-f.d / 2, f.d / 2]) pts.push(new THREE.Vector3(f.x + dx, 0, f.z + dz));
    pts.push(new THREE.Vector3(f.x - f.w / 2 + 3.4, 6.5, f.z - f.d / 2 + 2.6));
  }
  for (const a of layout.agents) { ring(a.x, a.z, a.radius, 0); pts.push(new THREE.Vector3(a.x, 6, a.z)); }
  ring(layout.hub.x, layout.hub.z, layout.hub.radius, 0);
  pts.push(new THREE.Vector3(layout.hub.x, 8.5, layout.hub.z));
  if (layout.pond) ring(layout.pond.x, layout.pond.z, layout.pond.r, 0);
  return pts;
}
function homeView() {
  const b = layout.bounds;
  const view = { target: new THREE.Vector3((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2), az: portrait() ? Math.PI / 2 - 0.08 : -0.06, polar: portrait() ? 0.6 : 0.84, dist: 80 };
  const corners = framePoints();
  const cam = new THREE.PerspectiveCamera(camera.fov, innerWidth / innerHeight, 1, 1000);
  const toScreen = (p) => { const q = p.clone().project(cam); return [((q.x + 1) / 2) * innerWidth, ((1 - q.y) / 2) * innerHeight]; };
  const box = () => {
    aim(cam, view);
    const pts = corners.map(toScreen);
    return { x0: Math.min(...pts.map((p) => p[0])), x1: Math.max(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), y1: Math.max(...pts.map((p) => p[1])) };
  };
  const ray = new THREE.Raycaster(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const groundAt = (x, y) => { ray.setFromCamera(new THREE.Vector2((x / innerWidth) * 2 - 1, 1 - (y / innerHeight) * 2), cam); return ray.ray.intersectPlane(ground, new THREE.Vector3()); };
  const s = safeArea();
  for (let pass = 0; pass < 3; pass++) {
    let lo = 20, hi = 420;
    for (let i = 0; i < 24; i++) {
      view.dist = (lo + hi) / 2;
      const r = box();
      if (r.x1 - r.x0 <= s.r - s.l && r.y1 - r.y0 <= s.b - s.t) hi = view.dist; else lo = view.dist;
    }
    view.dist = hi;
    const r = box();
    const from = groundAt((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2), to = groundAt((s.l + s.r) / 2, (s.t + s.b) / 2);
    if (from && to) view.target.add(from.sub(to));
  }
  return view;
}
let HOME = homeView();
const maxDist = () => Math.max(150, HOME.dist * 1.4);
const rig = { target: HOME.target.clone(), az: HOME.az, polar: HOME.polar, dist: HOME.dist, goal: { ...HOME, target: HOME.target.clone() } };
const placeCamera = () => aim(camera, rig);

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
performance.mark("tf:world");
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
performance.mark("tf:baked");

/* ---------- Post-processing (q=high only): AO + tilt-shift ---------- */

const transparentMeshes = [], particles = [];
scene.traverse((o) => {
  if (!o.isMesh || !o.material?.transparent) return;
  transparentMeshes.push(o);
  if (o.material.isMeshPhysicalMaterial) { o.material.envMap = envMap; o.material.needsUpdate = true; }
});
const useEnvironment = (on) => { scene.environment = on ? envMap : null; scene.environmentIntensity = 0.35; };
useEnvironment(WANT_POST);

const size = renderer.getDrawingBufferSize(new THREE.Vector2());
let composer = null, gtao = null, tiltH = null, tiltV = null;
if (WANT_POST) {
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
  uniforms: { tDiffuse: { value: null }, step: { value: new THREE.Vector2() }, focus: { value: 0.5 }, band: { value: 0.22 }, amount: { value: 1 } },
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
if (WANT_POST) {
  tiltH = new ShaderPass(tiltShader("x"));
  tiltV = new ShaderPass(tiltShader("y"));
  composer.addPass(tiltH);
  composer.addPass(tiltV);
  composer.addPass(new OutputPass());
} else if (params.has("tilt")) {
  // Tilt-shift is off by default (sharpness first); ?tilt=1 blurs the top and bottom edges with CSS
  document.body.insertAdjacentHTML("beforeend", '<div class="tilt top"></div><div class="tilt bottom"></div>');
}
let wasPortrait = portrait();
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  // "Home" follows the window; turning a phone sideways also moves the camera there
  HOME = homeView();
  if (portrait() !== wasPortrait) { wasPortrait = portrait(); Object.assign(rig.goal, { ...HOME, target: HOME.target.clone() }); }
  const s = renderer.getDrawingBufferSize(new THREE.Vector2());
  if (!composer) return;
  composer.setSize(innerWidth, innerHeight);
  // Ambient occlusion is soft anyway: half resolution on sharp screens costs a quarter as much
  const ao = renderer.getPixelRatio() >= 1.5 ? 0.5 : 1;
  gtao?.setSize(Math.round(s.x * ao), Math.round(s.y * ao));
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
  // Cloud shadows drift over the park on sunny days (an overcast sky is one big shadow already)
  weatherUniforms.cloudOffset.value.x += dt * 0.0028;
  weatherUniforms.cloudOffset.value.y += dt * 0.0012;

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
  // Nights stay readable: a bright moon and a blue-grey sky light keep the buildings' own colours
  sun.intensity = THREE.MathUtils.lerp(0.95, 3.5 * cloudDim, day);
  sun.color.copy(tmpColor.set("#bccaff")).lerp(new THREE.Color("#fff1dc").lerp(new THREE.Color("#ffb070"), golden * day), day);
  hemi.intensity = THREE.MathUtils.lerp(0.8, 0.98 + sky.cloud * 0.35, day);
  hemi.color.set("#5f72a6").lerp(new THREE.Color(sky.cloud > 0.5 ? "#e4e9ef" : "#d6e9ff"), day);
  hemi.groundColor.set("#2c3628").lerp(new THREE.Color(sky.snow > 0.5 ? "#c9d2dc" : "#5d7a3a"), day);
  if (scene.environment) scene.environmentIntensity = THREE.MathUtils.lerp(0.08, 0.35, day);
  const fog = tmpColor.set("#223049").lerp(new THREE.Color(sky.snow > 0.5 ? "#c8d0d8" : sky.cloud > 0.5 ? "#b4bdb0" : "#a9bf8e"), day);
  // Golden hour on a clear day: the haze and sky light warm up as the sun gets low
  const warm = golden * day * (1 - sky.cloud);
  fog.lerp(new THREE.Color("#e2b48c"), warm * 0.5);
  hemi.color.lerp(new THREE.Color("#ffd2a6"), warm * 0.45);
  scene.fog.color.copy(fog);
  scene.background.copy(fog);
  // Fog scales with the camera distance, so a big park zoomed out isn't drowned in haze
  scene.fog.near = rig.dist * THREE.MathUtils.lerp(0.62, 0.72, day) - sky.cloud * 5;
  scene.fog.far = rig.dist * 1.75;
  renderer.toneMappingExposure = THREE.MathUtils.lerp(1.28, 0.92, day);
  weatherUniforms.cloudStrength.value = THREE.MathUtils.smoothstep(day, 0.4, 0.9) * (1 - sky.cloud) * (1 - sky.snow) * 0.5;
  const night = 1 - day;
  lampMaterial.emissiveIntensity = night * 3.2;
  for (const g of glows) { g.material.opacity = night * (g.isSprite ? 0.95 : 0.7); g.visible = night > 0.02; }
  for (const o of transparentMeshes) if (o.material.isMeshPhysicalMaterial) o.material.envMapIntensity = THREE.MathUtils.lerp(0.06, o.material.userData.env ?? (o.material.userData.env = o.material.envMapIntensity), day);
  windowMaterial.emissive.set("#ffc979");
  windowMaterial.emissiveIntensity = night * 1.7;
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
    const w = local
      ? await local.fetchWeather(target.lat, target.lon)
      : await fetch(api(`/api/weather?lat=${target.lat}&lon=${target.lon}`), { signal: AbortSignal.timeout(9000) }).then((res) => (res.ok ? res.json() : {}));
    if (w.code !== undefined) weather = describeWeather(w.code, w.temp);
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

// One route through the hub per line and agent, made the first time a parcel needs it
const hubRoutes = new Map();
function hubRoute(lineId, agentId, inBelt, outBelt) {
  const key = `${lineId}>${agentId}`;
  if (!hubRoutes.has(key)) hubRoutes.set(key, hubCurve(inBelt.curve.getPointAt(1), outBelt.curve.getPointAt(0), world.hub.position));
  return hubRoutes.get(key);
}

function dispatch(lineId, ok = true) {
  const line = world.lines.get(lineId);
  const agentId = lineById.get(lineId)?.agent || line?.line.agent;
  const out = world.outBelts.get(agentId);
  if (!line || !out) return;
  machineAnim.set(lineId, 2.5);
  sendWorker(line.machine, 2.6);
  tourVisit(line.machine);
  parcels.send([line.belt, hubRoute(lineId, agentId, line.belt, out), out], {
    tint: ok === false ? "#e5484d" : undefined,
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

/* ---------- People: yard crews tend the machines, strollers on the paths, birds now and then ---------- */

const WORK_SPOT = 1.25;   // a worker stands this far on the yard side of the machine they tend (clear of its body)
const lerpAngle = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
// Someone from that yard walks over (the nearest free worker), or the one already there stays longer
function sendWorker(machine, seconds) {
  const crew = world.workers.filter((w) => w.factory === machine.parent);
  const there = crew.find((w) => w.target === machine);
  if (there) { there.work = Math.max(there.work, seconds); return; }
  const free = crew.filter((w) => !w.target).sort((a, b) => Math.abs(a.group.position.z - machine.position.z) - Math.abs(b.group.position.z - machine.position.z))[0];
  if (free) { free.target = machine; free.work = seconds; }
}
function pose(g, swing, reach = 0) {
  const { legs, arms } = g.userData;
  legs[0].rotation.x = swing; legs[1].rotation.x = -swing;
  arms[0].rotation.x = -swing * 0.8 + reach; arms[1].rotation.x = swing * 0.8 + reach;
}
const goal = new THREE.Vector3(), step = new THREE.Vector3();
function updatePeople(dt, t, day) {
  // A line that runs continuously keeps a worker beside it
  for (const [id, entry] of world.lines) if (lineById.get(id)?.status === "running") sendWorker(entry.machine, 1.5);
  for (const w of world.workers) {
    const g = w.group;
    if (w.target) goal.set(w.target.position.x - WORK_SPOT, 0.3, w.target.position.z);
    else goal.set(w.home.x, 0.3, w.home.z + (w.wander || 0));
    step.subVectors(goal, g.position).setY(0);
    const dist = step.length();
    if (dist > 0.04) {
      g.position.addScaledVector(step.normalize(), Math.min(dist, dt * 1.7));
      g.rotation.y = lerpAngle(g.rotation.y, Math.atan2(step.x, step.z), Math.min(1, dt * 10));
      w.step += dt * 10;
      g.position.y = 0.3 + Math.abs(Math.sin(w.step)) * 0.03;
      pose(g, Math.sin(w.step) * 0.55);
    } else if (w.target) {
      // At the machine: face it and work the panel
      g.rotation.y = lerpAngle(g.rotation.y, Math.PI / 2, Math.min(1, dt * 8));
      g.position.y = 0.3;
      const tap = Math.sin(t * 11 + w.step) * 0.22;
      const { arms, legs } = g.userData;
      legs[0].rotation.x = legs[1].rotation.x = 0;
      arms[0].rotation.x = -1.15 + tap; arms[1].rotation.x = -1.15 - tap;
      w.work -= dt;
      if (w.work <= 0) w.target = null;
    } else {
      // Idle: stand facing the machines, now and then shift a step along the lane
      g.rotation.y = lerpAngle(g.rotation.y, Math.PI / 2 + Math.sin(t * 0.4 + w.step) * 0.5, Math.min(1, dt * 3));
      g.position.y = 0.3;
      pose(g, 0, 0.05);
      w.idle -= dt;
      if (w.idle <= 0) { w.idle = 4 + Math.random() * 7; w.wander = (Math.random() - 0.5) * 1.6; }
    }
  }
  for (const p of world.walkers) {
    const len = p.curve.getLength();
    p.u += (p.dir * p.speed * dt) / len;
    if (p.u > p.span[1] || p.u < p.span[0]) { p.dir *= -1; p.u = THREE.MathUtils.clamp(p.u, p.span[0], p.span[1]); }
    const at = p.curve.getPointAt(p.u), tan = p.curve.getTangentAt(p.u);
    // Keep to the right-hand side of the path
    p.group.position.set(at.x - tan.z * p.dir * 0.45, Math.abs(Math.sin(p.step)) * 0.025, at.z + tan.x * p.dir * 0.45);
    p.group.rotation.y = Math.atan2(tan.x * p.dir, tan.z * p.dir);
    p.step += dt * 8;
    pose(p.group, Math.sin(p.step) * 0.5);
  }
  // Birds: every 45 s a flock crosses the sky in daylight, on a different line each time
  const k = (t % 45) / 45, pass = Math.floor(t / 45);
  world.birds.visible = day > 0.35 && k < 0.4;
  if (world.birds.visible) {
    world.birds.position.set(rig.target.x - 70 + (k / 0.4) * 140, 11, rig.target.z + Math.sin(pass * 2.3) * 14 - 4);
    for (const bird of world.birds.children) for (const wing of bird.userData.wings) wing.rotation.x = -wing.userData.side * Math.sin(t * 11 + bird.position.x) * 0.7;
  }
}

function animate(dt, t) {
  scrollBelts(dt, 1);
  if (world.water?.material.normalMap) { world.water.material.normalMap.offset.x += dt * 0.012; world.water.material.normalMap.offset.y += dt * 0.007; }
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
    // Blink every few seconds (each agent on its own beat); Codex's cursor blinks faster while it works
    if (character.userData.eyes) { const k = (t + def.x * 0.37 + def.z * 0.61) % 4.3; for (const e of character.userData.eyes) e.scale.y = k < 0.12 ? 0.12 : 1; }
    if (character.userData.cursor) character.userData.cursor.visible = Math.floor(t * (working ? 5 : 1.6)) % 2 === 0;
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
const KEY_STATUS = new Set(["running", "live", "warn", "queued"]);
function placeAt(el, x, bottom) {
  el.style.display = "";
  const w = el._w || 120, h = el._h || 34, anchor = bottom;
  // Big labels never cover each other: slide up past the one in the way, and stretch the stem down to the building
  for (let tries = 0; tries < 6; tries++) {
    const hit = bigBoxes.find(([x0, y0, x1, y1]) => x - w / 2 < x1 && x + w / 2 > x0 && bottom - h < y1 && bottom > y0);
    if (!hit) break;
    bottom = hit[1] - 4;
  }
  // Keep the whole label on screen; the stem stays under its middle
  x = THREE.MathUtils.clamp(x, w / 2 + 8, Math.max(w / 2 + 8, innerWidth - w / 2 - 8));
  el.style.transform = `translate(${x}px, ${bottom}px) translate(-50%, -100%)`;
  el.style.setProperty("--stem", `${16 + anchor - bottom}px`);
  bigBoxes.push([x - w / 2 - 4, bottom - h - 4, x + w / 2 + 4, anchor + 18]);
}
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const agentStatus = (a) => (a?.status === "running" ? (a.busy ? `${t("processing")} ${a.busy}` : t("processing")) : a?.status === "warn" ? t("warn") : t("standby"));
function updateLabels() {
  bigBoxes = [];
  const hubAt = screenOf(world.hub.userData.labelAt.clone().add(world.hub.position));
  const hubEl = ui.label("hub", `<i class="sq" style="background:#ff8a3d"></i>${esc(state.title || "tinyfactory")}<small>${t("hub")} · ${t("inTransit", parcels.count())}</small>`, "big", "hub");
  if (hubAt) placeAt(hubEl, hubAt.x, hubAt.y - 16);
  for (const [id, p] of world.agents) {
    const def = p.userData.def;
    const el = ui.label(`a-${id}`, `<i class="sq" style="background:${def.color}"></i>${esc(nameOf(def.name))}<small>${esc(agentStatus(agentById.get(id)))}</small>`, "big", `agent:${id}`);
    const at = screenOf(p.userData.labelAt.clone().add(p.position));
    if (at) placeAt(el, at.x, at.y - 16); else el.style.display = "none";
  }
  for (const f of world.factories) {
    const def = f.userData.def;
    const big = ui.label(`f-${def.id}`, `<i class="sq" style="background:${def.color}"></i>${esc(nameOf(def.name))}${def.hiddenCount ? `<small>${t("more", def.hiddenCount)}</small>` : ""}`, "big", `factory:${def.id}`);
    const at = screenOf(f.userData.labelAt.clone().add(f.position));
    if (at) placeAt(big, at.x, at.y - 16); else big.style.display = "none";
  }
  // Machine labels of all factories: sorted by screen height and stacked to the right of their machines, never overlapping.
  // Left-aligned so long names grow toward the hub instead of covering the factory building.
  const mode = document.body.dataset.labels || "key";
  const all = world.factories.flatMap((f) => f.userData.machines.map((m) => {
    const line = lineById.get(m.userData.line.id) || m.userData.line;
    const el = ui.label(`m-${line.id}`, `<i class="dot ${line.status === "scheduled" ? "hollow" : line.status || "idle"}"></i>${esc(nameOf(line.name))}<small>${esc(lineStatus(line))}</small>`, "small", `line:${line.id}`);
    return { id: line.id, el, anchor: screenOf(m.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0.2, 1.75, 0))) };
  }));
  // By default only the lines worth a look carry a label; the labels button switches to every line, then none
  const items = all.filter((it) => it.anchor && (mode === "all" || KEY_STATUS.has(lineById.get(it.id)?.status))).sort((a, b) => a.anchor.y - b.anchor.y);
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
  for (const it of all) if (!visible.has(it.id)) { it.el.style.display = "none"; hideLeader(it.id); }
  for (const { it, x, bottom, h } of placed) {
    it.el.style.display = "";
    it.el.style.transform = `translate(${x}px, ${bottom}px) translate(0, -100%)`;
    leader(it.id, it.anchor.x, it.anchor.y, x + 8, bottom - h / 2);
  }
}

/* ---------- Camera controls ---------- */

/* ---------- Tour: a slow orbit for a screen that's always on; each new run gets a short visit ---------- */

const tour = { on: false, visiting: false, until: 0, next: 0 };
function setTour(on) {
  tour.on = on;
  tour.visiting = false;
  document.querySelector('.toolbar [data-act="tour"]')?.classList.toggle("on", on);
  // Start on the whole park for a moment before the first visit
  if (on) { ui.select(null); Object.assign(rig.goal, { target: HOME.target.clone(), dist: HOME.dist }); tour.next = performance.now() + 8000; }
}
function tourVisit(machine) {
  const now = performance.now();
  if (!tour.on || now < tour.next) return;
  Object.assign(rig.goal, { target: machine.getWorldPosition(new THREE.Vector3()).setY(0), dist: Math.min(HOME.dist, 38) });
  tour.visiting = true;
  tour.until = now + 5000;
  tour.next = now + 20000;
}
function updateTour(dt, t) {
  const g = rig.goal;
  if (tour.visiting) {
    if (performance.now() < tour.until) return;
    tour.visiting = false;
    Object.assign(g, { target: HOME.target.clone(), dist: HOME.dist });
  }
  g.az += dt * 0.045;
  g.polar = HOME.polar + Math.sin(t * 0.08) * 0.06;
}

function onTool(act, arg) {
  const g = rig.goal;
  // Taking the camera back from the tour
  if (tour.on && ["reset", "left", "right", "in", "out", "pick", "focus"].includes(act)) setTour(false);
  if (act === "tour") return setTour(!tour.on);
  if (act === "reset") Object.assign(g, { target: HOME.target.clone(), az: HOME.az, polar: HOME.polar, dist: HOME.dist });
  if (act === "left") g.az -= Math.PI / 4;
  if (act === "right") g.az += Math.PI / 4;
  if (act === "in") g.dist = Math.max(28, g.dist * 0.78);
  if (act === "out") g.dist = Math.min(maxDist(), g.dist / 0.78);
  if (act === "weather") preview = arg;
  if (act === "city") setCity(arg);
  if (act === "share") shareImage();
  if (act === "focus") onTool("pick", `line:${arg}`);
  // Something was picked (in the scene, a label, the list or the activity card): fly there and open its detail
  if (act === "pick") {
    const [kind, ...rest] = String(arg).split(":"), id = rest.join(":");
    const at = pickTarget(kind, id);
    if (!at) return;
    g.target = at.pos.clone().setY(0);
    g.dist = Math.min(g.dist, narrow() ? Math.max(at.dist, HOME.dist * 0.55) : at.dist);
    // Phones: the detail opens as a sheet over the bottom half, so aim a little in front and the picked thing sits above it
    if (narrow()) g.target.add(new THREE.Vector3(Math.sin(g.az), 0, Math.cos(g.az)).multiplyScalar(g.dist * 0.09));
    if (kind === "line") dispatchPreview(id);
    ui.select({ kind, id });
  }
  if (act === "selected") selection = arg ? pickTarget(arg.kind, arg.id) : null;
}
// Where a picked thing is, how close the camera comes, and the ring drawn around it
function pickTarget(kind, id) {
  if (kind === "line") { const e = world.lines.get(id); return e && { pos: e.machine.getWorldPosition(new THREE.Vector3()), dist: 40, ring: 1.15 }; }
  if (kind === "agent") { const p = world.agents.get(id); return p && { pos: p.position.clone(), dist: 46, ring: p.userData.def.radius + 0.35 }; }
  if (kind === "factory") { const f = world.factories.find((x) => x.userData.def.id === id); return f && { pos: f.position.clone(), dist: 60, ring: 0 }; }
  if (kind === "hub") return { pos: world.hub.position.clone(), dist: 52, ring: layout.hub.radius + 0.35 };
  return null;
}
let selection = null;
const marker = new THREE.Mesh(new THREE.TorusGeometry(1, 0.07, 8, 72), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9, depthWrite: false }));
marker.rotation.x = -Math.PI / 2;
marker.visible = false;
scene.add(marker);
function updateMarker(t) {
  marker.visible = Boolean(selection?.ring);
  if (!marker.visible) return;
  marker.position.set(selection.pos.x, 0.45, selection.pos.z);
  marker.scale.setScalar(selection.ring * (1 + Math.sin(t * 3) * 0.04));
  marker.material.opacity = 0.65 + Math.sin(t * 3) * 0.25;
}

// Picking in the scene: the nearest machine, platform or hub under the pointer, measured on screen
const right = new THREE.Vector3();
let PICKS = null;
function pickAt(x, y) {
  PICKS ||= [
    ...[...world.lines.keys()].map((id) => ({ key: `line:${id}`, pos: world.lines.get(id).machine.getWorldPosition(new THREE.Vector3()).setY(0.8), r: 1.0 })),
    ...[...world.agents.entries()].map(([id, p]) => ({ key: `agent:${id}`, pos: p.position.clone().setY(1.4), r: p.userData.def.radius * 0.75 })),
    { key: "hub", pos: world.hub.position.clone().setY(2), r: layout.hub.radius * 0.7 }
  ];
  right.setFromMatrixColumn(camera.matrixWorld, 0);
  let best = null, score = 1;
  for (const p of PICKS) {
    const c = screenOf(p.pos);
    if (!c) continue;
    const e = screenOf(p.pos.clone().addScaledVector(right, p.r));
    const radius = Math.max(14, Math.hypot(e.x - c.x, e.y - c.y));
    const k = Math.hypot(x - c.x, y - c.y) / radius;
    if (k < score) { score = k; best = p.key; }
  }
  return best;
}
function dispatchPreview(id) { if (DEMO) dispatch(id); }

// One finger / mouse drag turns the view, right button or shift pans, two fingers pinch to zoom
let drag = null, pinch = null;
const pointers = new Map();
const spread = () => { const [a, b] = [...pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
canvas.addEventListener("pointerdown", (e) => {
  document.getElementById("weather-menu").classList.remove("open");
  document.body.classList.remove("sheet");
  if (tour.on) setTour(false);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  canvas.setPointerCapture(e.pointerId);
  press = { x: e.clientX, y: e.clientY, n: pointers.size };
  if (pointers.size === 2) { drag = null; pinch = { from: spread(), dist: rig.goal.dist }; }
  else drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey };
});
let press = null;
canvas.addEventListener("pointermove", (e) => {
  if (!pointers.size && e.pointerType === "mouse") canvas.style.cursor = pickAt(e.clientX, e.clientY) ? "pointer" : "";
  if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6) press = null;
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pointers.size === 2) { rig.goal.dist = THREE.MathUtils.clamp(pinch.dist * (pinch.from / Math.max(spread(), 1)), 28, maxDist()); return; }
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
function release(e) {
  // A tap or click that didn't move picks what's under it (or closes the detail on empty ground)
  if (e.type === "pointerup" && press && press.n === 1 && pointers.size === 1) {
    const key = pickAt(e.clientX, e.clientY);
    if (key) onTool("pick", key); else if (ui.selected) ui.select(null);
  }
  press = null;
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  // Lifting one finger of a pinch carries on as a drag from the other one, without a jump
  const rest = [...pointers.values()][0];
  drag = rest ? { x: rest.x, y: rest.y, pan: false } : null;
}
canvas.addEventListener("pointerup", release);
canvas.addEventListener("pointercancel", release);
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("wheel", (e) => { e.preventDefault(); if (tour.on) setTour(false); rig.goal.dist = THREE.MathUtils.clamp(rig.goal.dist * Math.exp(e.deltaY * 0.0012), 28, maxDist()); }, { passive: false });

/* ---------- Data: poll /api/state; new runs become parcels ---------- */

// Parcels from one poll arrive spread out instead of all at once
let nextSlot = 0;
function schedule(ev) {
  const now = performance.now();
  nextSlot = Math.max(nextSlot, now) + 700 + Math.random() * 900;
  setTimeout(() => dispatch(ev.line, ev.ok), nextSlot - now);
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
  updateTab();
}

// Share poster: the current frame (with its post-processing) framed by a title card and a strip of today's numbers.
// Phones get the system share sheet; elsewhere it downloads as PNG.
function shareImage() {
  if (post) composer.render(); else renderer.render(scene, camera);
  const src = renderer.domElement;
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d");
  ctx.drawImage(src, 0, 0);
  const s = out.width / innerWidth, W = out.width, H = out.height;
  const font = (weight, size) => `${weight} ${size * s}px -apple-system, "PingFang SC", "Helvetica Neue", sans-serif`;
  // Soft vignette so the cards sit on calmer ground
  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(20,30,10,0.28)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
  const card = (x, y, w, h, r) => {
    ctx.save();
    ctx.shadowColor = "rgba(40,30,10,0.22)";
    ctx.shadowBlur = 24 * s;
    ctx.shadowOffsetY = 6 * s;
    ctx.fillStyle = "rgba(251,248,242,0.96)";
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
    ctx.restore();
  };
  // Title card, top left
  const title = state.title || t("shareTitle");
  ctx.font = font(700, 30);
  const titleW = Math.max(ctx.measureText(title).width + 110 * s, 330 * s);
  card(28 * s, 28 * s, titleW, 104 * s, 22 * s);
  ctx.font = font(400, 40);
  ctx.fillText("🏭", 46 * s, 92 * s);
  ctx.fillStyle = "#2c2a26";
  ctx.font = font(700, 30);
  ctx.fillText(title, 104 * s, 76 * s);
  const d = new Date();
  ctx.fillStyle = "#8b857b";
  ctx.font = font(500, 15);
  ctx.fillText(`${t("title")} · ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`, 104 * s, 106 * s);
  // Numbers strip, bottom centre
  const lines = state.factories.reduce((n, f) => n + f.lines.length, 0), c = state.counts || {};
  const cells = [[String(lines), t("linesWord"), "#2c2a26"], [String(state.agents.length), "Agent", "#2c2a26"], [String(c.running || 0), t("running"), "#3f9b4f"], [String(c.done || 0), t("doneToday"), "#2c2a26"], [String(c.warn || 0), t("warn"), c.warn ? "#e0663c" : "#2c2a26"]];
  const cw = 132 * s, stripW = cw * cells.length + 40 * s, sx = (W - stripW) / 2, sy = H - 150 * s;
  card(sx, sy, stripW, 104 * s, 24 * s);
  cells.forEach(([n, label, color], i) => {
    const x = sx + 20 * s + cw * i + cw / 2;
    ctx.textAlign = "center";
    ctx.fillStyle = color;
    ctx.font = font(700, 36);
    ctx.fillText(n, x, sy + 56 * s);
    ctx.fillStyle = "#8b857b";
    ctx.font = font(500, 14);
    ctx.fillText(label, x, sy + 82 * s);
    if (i) { ctx.fillStyle = "rgba(60,50,40,0.1)"; ctx.fillRect(sx + 20 * s + cw * i, sy + 26 * s, 1.5 * s, 52 * s); }
  });
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = font(600, 14);
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 6 * s;
  ctx.fillText("tinyfactory · github.com/ybkjs/tinyfactory", W / 2, H - 22 * s);
  const name = `tinyfactory-${d.toISOString().slice(0, 10)}.png`;
  out.toBlob(async (blob) => {
    const file = new File([blob], name, { type: "image/png" });
    if (narrow() && navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file] }); return; } catch { /* closed: fall back to download */ } }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, "image/png");
}

// When something needs attention, say so on the browser tab too: "(2) tinyfactory" and a red dot on the icon
const baseTitle = document.title;
const iconLink = document.querySelector('link[rel="icon"]');
const baseIcon = iconLink?.href;
const alertIcon = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🏭</text><circle cx="78" cy="22" r="20" fill="#ff3b30" stroke="white" stroke-width="6"/></svg>')}`;
let lastWarn = -1;
function updateTab() {
  const warn = state.counts?.warn || 0, name = state.title || baseTitle;
  document.title = warn ? `(${warn}) ${name}` : name;
  if (warn === lastWarn || !iconLink) return;
  lastWarn = warn;
  iconLink.href = warn ? alertIcon : baseIcon;
}

// Keyboard: / or ⌘K find, H home, arrows turn, +/- zoom, L labels, T tasks, P tour, Esc closes a detail (ui.js)
addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); ui.openFinder(); return; }
  if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.("input, textarea, [contenteditable]")) return;
  if (e.key === "/") { e.preventDefault(); ui.openFinder(); return; }
  const click = (act) => document.querySelector(`.toolbar [data-act="${act}"]`)?.click();
  const keys = { h: () => onTool("reset"), ArrowLeft: () => onTool("left"), ArrowRight: () => onTool("right"), "+": () => onTool("in"), "=": () => onTool("in"), "-": () => onTool("out"), _: () => onTool("out"), l: () => click("labels"), t: () => click("panel"), p: () => onTool("tour") };
  const fn = keys[e.key.length === 1 ? e.key.toLowerCase() : e.key];
  if (!fn) return;
  e.preventDefault();
  fn();
});

ui.render(state);
updateTab();
if (params.get("tour") === "1") setTour(true);
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
  if (params.has("fps") || now < adapt.quietUntil || document.visibilityState !== "visible" || !document.hasFocus()) return;
  // Auto: post-processing goes first if the frame rate can't keep up, and stays off on this machine from then on
  if (post && QUALITY === "auto") {
    if (fps < 24) { if (++adapt.bad >= 2) { post = false; useEnvironment(false); adapt.bad = 0; adapt.quietUntil = now + 6000; try { localStorage.setItem("tinyfactory-quality", "medium"); } catch { /* private mode */ } } } else adapt.bad = 0;
    return;
  }
  if (QUALITY !== "medium" && QUALITY !== "auto") return;
  const dpr = renderer.getPixelRatio();
  const step = (next) => { renderer.setPixelRatio(next); resize(); adapt.bad = adapt.good = 0; adapt.quietUntil = now + 6000; };
  if (fps < 20) { adapt.good = 0; if (++adapt.bad >= 2 && dpr > MIN_DPR) step(Math.max(MIN_DPR, dpr - 0.25)); }
  else if (fps >= 28) { adapt.bad = 0; if (++adapt.good >= 3 && dpr < MAX_DPR) step(Math.min(MAX_DPR, dpr + 0.25)); }
  else adapt.bad = adapt.good = 0;
}
// Shadows refresh every third frame: parcels and characters move slowly enough
renderer.shadowMap.autoUpdate = false;
let frameNo = 0, isNight = false;
function frame() {
  requestAnimationFrame(frame);
  pending += clock.getDelta();
  // 12 fps when the window isn't focused: less work while nobody watches
  const cap = document.hasFocus() ? FPS_CAP : 12;
  if (pending < (1 / cap) * 0.85) return;
  const dt = Math.min(pending, 0.1), t = clock.elapsedTime;
  pending = 0;
  if (tour.on) updateTour(dt, t);
  const k = 1 - Math.exp(-dt * (tour.on ? 1.2 : 4));
  rig.target.lerp(rig.goal.target, k);
  rig.az += (rig.goal.az - rig.az) * k;
  rig.polar += (rig.goal.polar - rig.polar) * k;
  rig.dist += (rig.goal.dist - rig.dist) * k;
  placeCamera();
  const { now, day } = applyLighting(dt);
  // Dark cards after dusk; two thresholds so twilight doesn't flicker between the two
  if (!isNight && day < 0.22) document.body.classList.add("night"), isNight = true;
  else if (isNight && day > 0.32) document.body.classList.remove("night"), isNight = false;
  updateParticles(dt, t);
  animate(dt, t);
  updatePeople(dt, t, day);
  updateMarker(t);
  updateLabels();
  if (t - lastClock > 1) {
    lastClock = t;
    const w = preview === "live" ? liveWeather : { ...describeWeather({ clear: 0, rain: 61, snow: 73 }[PREVIEW[preview]?.kind] ?? 0), temp: liveWeather.temp };
    // A clear night shows the moon, not the sun
    ui.renderClock(now, cityName(city), day < 0.15 && w.emoji === "☀️" ? { ...w, emoji: "🌙" } : day < 0.15 && w.emoji === "⛅" ? { ...w, emoji: "☁️" } : w);
  }
  if (frameNo++ % 3 === 0) renderer.shadowMap.needsUpdate = true;
  if (post) composer.render(); else renderer.render(scene, camera);
  adaptQuality();
  // The first frame is on screen: fade the loading screen out (after a couple of frames, so shaders have compiled)
  if (frameNo === 1) performance.mark("tf:first-frame");
  if (frameNo === postFrom) { postFrom = Infinity; post = true; adapt.quietUntil = performance.now() + 6000; }
  if (frameNo === 3) { performance.mark("tf:ready"); const splash = document.getElementById("splash"); if (splash) { splash.classList.add("done"); setTimeout(() => splash.remove(), 700); } }
}
frame();
window.__factory = { dispatch, onTool, scene, renderer, world, rig, weatherUniforms };
