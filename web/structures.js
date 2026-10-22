// Buildings and characters: factories (a building plus one machine per line), the hub, agent platforms and characters
import * as THREE from "three";
import { nameOf } from "./i18n.js";
import { boxTexture, brickTexture, canvasTexture, gableGeometry, labelTexture, mat, mesh, radialTileTexture, range, rbox, shingleTexture, tileTexture } from "./util.js";

const WHITE = "#f4efe6";
const GLASS = "#3b5170";

// All windows share one material so they light up together at night
export const windowMaterial = mat(GLASS, { rough: 0.25, metal: 0.2, snow: 0 });
function windowPane(w, h) {
  return mesh(rbox(w, h, 0.08, 0.03), windowMaterial, { cast: false });
}
// A proper window: white frame, glazing bars, a sill underneath. Faces +z; position and turn it like a pane.
const trim = mat("#fbf8f2", { rough: 0.6 });
function framedWindow(w, h, { bars = [1, 1], sill = true, frame = trim } = {}) {
  const g = new THREE.Group();
  g.add(mesh(rbox(w + 0.18, h + 0.18, 0.07, 0.03), frame, { cast: false }));
  g.add(mesh(rbox(w, h, 0.08, 0.02), windowMaterial, { z: 0.02, cast: false }));
  for (let i = 1; i < bars[0] + 1; i++) g.add(mesh(new THREE.BoxGeometry(0.05, h, 0.06), frame, { x: -w / 2 + (w * i) / (bars[0] + 1), z: 0.05, cast: false }));
  for (let i = 1; i < bars[1] + 1; i++) g.add(mesh(new THREE.BoxGeometry(w, 0.05, 0.06), frame, { y: -h / 2 + (h * i) / (bars[1] + 1), z: 0.05, cast: false }));
  if (sill) g.add(mesh(rbox(w + 0.34, 0.07, 0.2, 0.02), frame, { y: -h / 2 - 0.1, z: 0.07 }));
  return g;
}
function place(o, x, y, z, ry = 0) { o.position.set(x, y, z); o.rotation.y = ry; return o; }
// Shared surfaces: shingles for gable roofs, bricks for the shop's base
const shingles = shingleTexture();
const roofMat = (color) => mat(color, { rough: 0.75, map: shingles, bumpMap: shingles.userData.bump, bumpScale: 1.5 });
const bricks = brickTexture();
bricks.repeat.set(1.45, 0.42);
bricks.userData.bump.repeat.copy(bricks.repeat);

/* ---------- Factories ---------- */

const short = (text, n = 8) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

function shopBuilding(color, name) {
  const g = new THREE.Group();
  g.add(mesh(rbox(4.6, 2.5, 3.6, 0.1), mat("#f6efe3"), { y: 1.25 }));
  // Brick base with a stone band on top
  g.add(mesh(rbox(4.66, 0.95, 3.66, 0.06), mat("#c9765a", { map: bricks, bumpMap: bricks.userData.bump, bumpScale: 1.2 }), { y: 0.48 }));
  g.add(mesh(rbox(4.74, 0.09, 3.74, 0.03), trim, { y: 0.98 }));
  g.add(mesh(rbox(4.9, 0.28, 3.9, 0.08), mat("#5d5048"), { y: 2.62 }));
  // Sign
  const sign = mesh(new THREE.PlaneGeometry(3.4, 0.62), new THREE.MeshStandardMaterial({ map: labelTexture(short(name), { bg: "#fff6e8", fg: color, font: 70 }), roughness: 0.7 }), { y: 3.15, z: 1.2, cast: false });
  g.add(mesh(rbox(3.6, 0.78, 0.14, 0.05), mat(color), { y: 3.15, z: 1.12 }));
  g.add(sign);
  // Striped awning
  const stripes = canvasTexture(128, (ctx, s) => { for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? "#fffaf0" : color; ctx.fillRect(i * s / 8, 0, s / 8, s); } }, { repeat: 1 });
  const awning = mesh(rbox(4.4, 0.08, 1.1, 0.03), new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.8 }), { y: 2.05, z: 2.25 });
  awning.rotation.x = 0.32;
  g.add(awning);
  // Door and windows
  g.add(place(framedWindow(0.85, 1.5, { bars: [0, 1], sill: false, frame: mat(color, { rough: 0.6 }) }), 0, 0.8, 1.84));
  g.add(mesh(rbox(1.3, 0.08, 0.5, 0.03), mat("#d8d2c6"), { y: 0.04, z: 2.0 }));
  for (const x of [-1.5, 1.5]) g.add(place(framedWindow(1.05, 0.95, { bars: [1, 1] }), x, 1.45, 1.84));
  for (const z of [-0.8, 0.8]) g.add(place(framedWindow(0.8, 0.85, { bars: [1, 1] }), 2.34, 1.5, z, Math.PI / 2));
  // Rooftop AC unit and a little server shed
  g.add(mesh(rbox(0.9, 0.5, 0.7, 0.06), mat("#c9ccd2", { metal: 0.3 }), { x: -1.2, y: 3.0, z: -0.8 }));
  const shed = new THREE.Group();
  shed.add(mesh(rbox(1.7, 1.7, 1.5, 0.08), mat("#5a6472"), { y: 0.85 }));
  for (let i = 0; i < 3; i++) shed.add(mesh(new THREE.BoxGeometry(1.1, 0.08, 0.04), new THREE.MeshStandardMaterial({ color: "#7dffb0", emissive: "#3dff8a", emissiveIntensity: 1.2 }), { y: 0.55 + i * 0.35, z: 0.77, cast: false }));
  shed.position.set(-3.6, 0, 1.2);
  g.add(shed);
  return g;
}

function studioBuilding(color) {
  const g = new THREE.Group();
  g.add(mesh(rbox(4.2, 2.1, 3.2, 0.1), mat("#eef2f7"), { y: 1.05 }));
  g.add(mesh(rbox(4.28, 0.22, 3.28, 0.05), mat("#c9d2dc"), { y: 0.11 }));
  const roof = mesh(gableGeometry(4.7, 1.35, 3.6), roofMat(color), { y: 2.08 });
  roof.rotation.y = Math.PI / 2;
  g.add(roof);
  g.add(place(framedWindow(2.5, 1.05, { bars: [2, 0] }), 0, 1.15, 1.64));
  for (const z of [-0.6, 0.6]) g.add(place(framedWindow(0.7, 0.75, { bars: [1, 1] }), 2.14, 1.25, z, Math.PI / 2));
  // Rooftop dish
  const dish = mesh(new THREE.SphereGeometry(0.42, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), mat("#e9ecf0", { metal: 0.3, snow: 0 }), { x: -1.2, y: 3.15, z: 0.9 });
  dish.rotation.x = -0.9;
  g.add(dish);
  g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6), mat("#9aa3ad"), { x: -1.2, y: 2.85, z: 0.9 }));
  // A stack of papers
  for (let i = 0; i < 4; i++) g.add(mesh(rbox(0.7, 0.12, 0.5, 0.02), mat(i % 2 ? "#f7f3ea" : "#e9e2d4"), { x: 2.6, y: 0.06 + i * 0.13, z: 1.3, ry: range(-0.2, 0.2) }));
  return g;
}

function homeBuilding(color) {
  const g = new THREE.Group();
  g.add(mesh(rbox(4.2, 2.0, 3.3, 0.1), mat("#fbf3e4"), { y: 1.0 }));
  g.add(mesh(rbox(4.28, 0.24, 3.38, 0.05), mat("#d9c3a0"), { y: 0.12 }));
  const roof = mesh(gableGeometry(4.8, 1.5, 3.8), roofMat("#d0713f"), { y: 1.98 });
  roof.rotation.y = Math.PI / 2;
  g.add(roof);
  // Cat-ear roof
  for (const x of [-0.75, 0.75]) {
    const ear = mesh(new THREE.ConeGeometry(0.42, 0.85, 4), mat("#c96a3f", { rough: 0.7 }), { x, y: 3.55, z: 1.1 });
    ear.rotation.y = Math.PI / 4;
    g.add(ear);
    g.add(mesh(new THREE.ConeGeometry(0.2, 0.45, 4), mat("#f2b9a8"), { x, y: 3.5, z: 1.32, ry: Math.PI / 4 }));
  }
  g.add(mesh(rbox(0.45, 0.9, 0.45, 0.05), mat("#9c5a3c"), { x: 1.4, y: 3.0, z: -0.8 }));
  g.add(mesh(rbox(1.05, 1.5, 0.08, 0.04), trim, { y: 0.75, z: 1.65 }));
  const door = mesh(rbox(0.85, 1.35, 0.1, 0.06), mat("#8a5a3b"), { y: 0.68, z: 1.68 });
  g.add(door);
  g.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), mat("#e8c060", { metal: 0.6, rough: 0.3 }), { x: 0.28, y: 0.7, z: 1.75 }));
  g.add(mesh(rbox(1.2, 0.08, 0.5, 0.03), mat("#d8cbb4"), { y: 0.04, z: 1.95 }));
  const round = mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.08, 24), windowMaterial, { x: 1.25, y: 1.25, z: 1.67 });
  round.rotation.x = Math.PI / 2;
  g.add(round);
  g.add(place(framedWindow(0.85, 0.75, { bars: [1, 1] }), -1.25, 1.25, 1.66));
  // Flower boxes by the door
  for (const x of [-1.9, 1.9]) {
    g.add(mesh(rbox(0.7, 0.35, 0.4, 0.05), mat("#a0673f"), { x, y: 0.18, z: 2.1 }));
    for (let i = 0; i < 5; i++) g.add(mesh(new THREE.SphereGeometry(0.09, 6, 5), mat(["#ff8fb1", "#ffd166", "#f78c6b"][i % 3]), { x: x - 0.25 + i * 0.12, y: 0.42, z: 2.1 }));
  }
  return g;
}

// One machine = one line: base, factory-coloured cap, icon screen, status lamp, spinning gear
export function machine(line, color) {
  const g = new THREE.Group();
  g.add(mesh(rbox(1.3, 0.9, 1.15, 0.1), mat(WHITE), { y: 0.45 }));
  g.add(mesh(rbox(1.38, 0.2, 1.22, 0.07), mat(color, { rough: 0.6 }), { y: 0.98 }));
  const screen = mesh(new THREE.PlaneGeometry(0.78, 0.5), new THREE.MeshStandardMaterial({ map: labelTexture("", { emoji: line.icon, bg: "#26303f", width: 160, height: 100, font: 62 }), emissive: "#ffffff", emissiveIntensity: 0.25, roughness: 0.4 }), { y: 0.55, z: 0.585, cast: false });
  g.add(screen);
  // Output chute faces +x (toward the hub)
  g.add(mesh(rbox(0.35, 0.32, 0.6, 0.05), mat("#9aa3ad", { metal: 0.4 }), { x: 0.75, y: 0.5 }));
  const gear = mesh(new THREE.TorusGeometry(0.2, 0.07, 6, 10), mat("#7b8591", { metal: 0.5, rough: 0.4 }), { x: -0.1, y: 0.55, z: -0.62 });
  g.add(gear);
  g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.42), mat("#8a939e"), { x: -0.38, y: 1.28, z: -0.25 }));
  // Little chimney: puffs while running (the puffs live in main.js)
  g.add(mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.55, 10), mat("#b7bec7", { metal: 0.3 }), { x: 0.3, y: 1.32, z: -0.3 }));
  g.add(mesh(new THREE.TorusGeometry(0.12, 0.03, 6, 12), mat("#8a939e"), { x: 0.3, y: 1.6, z: -0.3 }).rotateX(Math.PI / 2));
  const lamp = mesh(new THREE.SphereGeometry(0.15, 16, 12), new THREE.MeshStandardMaterial({ color: "#9aa0a6", emissive: "#000000", roughness: 0.3 }), { x: -0.38, y: 1.55, z: -0.25 });
  g.add(lamp);
  gear.userData.dynamic = true;
  lamp.userData.dynamic = true;
  g.userData = { gear, lamp, line, chimney: new THREE.Vector3(0.3, 1.65, -0.3) };
  return g;
}

/* ---------- Props, so yards don't look empty ---------- */

function planter(x, z) {
  const g = new THREE.Group();
  g.add(mesh(rbox(0.7, 0.42, 0.7, 0.06), mat("#a8724a"), { y: 0.21 }));
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.6, 6), mat("#6b4a33"), { y: 0.6 }));
  for (const [dx, dy, dz, r] of [[0, 1.15, 0, 0.42], [0.18, 1.0, 0.12, 0.3], [-0.16, 1.02, -0.1, 0.32]]) g.add(mesh(new THREE.IcosahedronGeometry(r, 2), mat("#5c9a35"), { x: dx, y: dy, z: dz }));
  g.position.set(x, 0.3, z);
  return g;
}

function parasolTable(x, z, color) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 20), mat("#f4efe6"), { y: 0.62 }));
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.6, 8), mat("#8a939e"), { y: 0.31 }));
  g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 6), mat("#8a939e"), { y: 1.2 }));
  const stripes = canvasTexture(128, (ctx, s) => { for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? "#fffaf0" : color; ctx.beginPath(); ctx.moveTo(s / 2, s / 2); ctx.arc(s / 2, s / 2, s, (i / 8) * Math.PI * 2, ((i + 1) / 8) * Math.PI * 2); ctx.fill(); } }, { repeat: 1 });
  g.add(mesh(new THREE.ConeGeometry(1.0, 0.42, 16, 1, true), new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.8, side: THREE.DoubleSide }), { y: 1.95 }));
  for (const a of [0.4, 2.6, 4.4]) g.add(mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.36, 12), mat(color), { x: Math.cos(a) * 0.68, y: 0.18, z: Math.sin(a) * 0.68 }));
  g.position.set(x, 0.3, z);
  return g;
}

function barrels(x, z) {
  const g = new THREE.Group();
  for (const [dx, dz] of [[0, 0], [0.5, 0.15], [0.2, 0.52]]) {
    g.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.55, 14), mat("#5f86b8", { metal: 0.2 }), { x: dx, y: 0.28, z: dz }));
    g.add(mesh(new THREE.TorusGeometry(0.22, 0.02, 4, 16), mat("#3f5f88"), { x: dx, y: 0.45, z: dz }).rotateX(Math.PI / 2));
  }
  g.position.set(x, 0.3, z);
  return g;
}

function van(x, z, ry, color, name) {
  // Delivery van
  const g = new THREE.Group();
  g.add(mesh(rbox(1.7, 1.05, 1.0, 0.12), mat("#fbf6ee"), { x: -0.25, y: 0.82 }));
  g.add(mesh(rbox(0.75, 0.8, 0.98, 0.14), mat(color), { x: 0.92, y: 0.7 }));
  g.add(mesh(rbox(0.06, 0.38, 0.8, 0.03), mat("#3b5170", { rough: 0.25, snow: 0 }), { x: 1.3, y: 0.86, cast: false }));
  g.add(mesh(new THREE.PlaneGeometry(1.2, 0.36), new THREE.MeshStandardMaterial({ map: labelTexture(short(name, 6), { bg: "#fbf6ee", fg: color, font: 78 }), roughness: 0.8 }), { x: -0.25, y: 0.9, z: 0.505, cast: false }));
  for (const [wx, wz] of [[-0.6, 0.48], [0.8, 0.48], [-0.6, -0.48], [0.8, -0.48]]) {
    const wheel = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.14, 16), mat("#2f3338"), { x: wx, y: 0.24, z: wz });
    wheel.rotation.x = Math.PI / 2;
    g.add(wheel);
  }
  g.position.set(x, 0.3, z);
  g.rotation.y = ry;
  return g;
}

function catTree(x, z) {
  // Cat tree, for the home yard
  const g = new THREE.Group();
  const post = mat("#d9c3a0"), pad = mat("#c96a3f");
  g.add(mesh(rbox(0.9, 0.12, 0.9, 0.04), pad, { y: 0.06 }));
  g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.7, 10), post, { y: 0.9 }));
  g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.0, 10), post, { x: 0.3, y: 0.55, z: 0.2 }));
  g.add(mesh(rbox(0.6, 0.1, 0.6, 0.05), pad, { x: 0.3, y: 1.08, z: 0.2 }));
  g.add(mesh(rbox(0.7, 0.12, 0.7, 0.05), pad, { y: 1.78 }));
  g.add(mesh(new THREE.SphereGeometry(0.12, 12, 10), mat("#ffd166"), { x: -0.32, y: 1.45, z: 0.1 }));
  g.position.set(x, 0.3, z);
  return g;
}

export function factory(def) {
  const g = new THREE.Group();
  g.position.set(def.x, 0, def.z);
  const tiles = tileTexture({ home: "#e6d3b3", studio: "#d7dde6", shop: "#dcc2a0" }[def.building] || "#dcc2a0");
  tiles.repeat.set(def.w / 3, def.d / 3);
  tiles.userData.bump.repeat.copy(tiles.repeat);
  g.add(mesh(rbox(def.w, 0.3, def.d, 0.12), new THREE.MeshStandardMaterial({ map: tiles, bumpMap: tiles.userData.bump, bumpScale: 1.4, roughness: 0.9 }), { y: 0.15 }));
  // Low railing around the yard
  const rail = mat("#c8bfb2");
  for (const sz of [-1, 1]) g.add(mesh(rbox(def.w - 0.4, 0.22, 0.12, 0.05), rail, { y: 0.41, z: sz * (def.d / 2 - 0.15) }));
  g.add(mesh(rbox(0.12, 0.22, def.d - 0.4, 0.05), rail, { x: -def.w / 2 + 0.15, y: 0.41 }));

  const building = ({ shop: shopBuilding, studio: studioBuilding, home: homeBuilding }[def.building] || shopBuilding)(def.color, nameOf(def.name));
  building.position.set(-def.w / 2 + 3.4, 0.3, -def.d / 2 + 2.6);
  g.add(building);

  // Machines line the side facing the hub
  const machines = [];
  const lines = def.visible || def.lines;
  const n = lines.length;
  lines.forEach((line, i) => {
    const m = machine(line, def.color);
    const z = n === 1 ? 0 : -def.d / 2 + 1.3 + (i * (def.d - 2.6)) / (n - 1);
    m.position.set(def.w / 2 - 1.35, 0.3, z);
    g.add(m);
    machines.push(m);
  });
  // A few crates and a bench
  const crate = new THREE.MeshStandardMaterial({ map: boxTexture(), roughness: 0.85 });
  for (let i = 0; i < 3; i++) g.add(mesh(rbox(0.6, 0.5, 0.6, 0.04), crate, { x: -def.w / 2 + 1 + i * 0.7, y: 0.55, z: def.d / 2 - 1, ry: range(-0.3, 0.3) }));
  g.add(bench(-def.w / 2 + 6.2, def.d / 2 - 0.9, 0));
  // Props depend on the building type
  const front = def.d / 2 - 1.6;
  g.add(planter(-def.w / 2 + 0.75, -def.d / 2 + 0.75));
  g.add(planter(def.w / 2 - 0.75, def.d / 2 - 0.6));
  if (def.building === "shop") {
    g.add(van(-0.6, front - 0.6, 0.2, def.color, nameOf(def.name)));
    g.add(parasolTable(1.8, -def.d / 2 + 1.6, def.color));
    g.add(barrels(-def.w / 2 + 0.9, 0.6));
  } else if (def.building === "studio") {
    g.add(parasolTable(0.6, front - 0.2, def.color));
  } else {
    g.add(catTree(-0.2, front - 0.5));
    g.add(parasolTable(1.8, -def.d / 2 + 1.6, "#e8a23a"));
    g.add(barrels(-def.w / 2 + 0.9, 0.9));
  }
  g.userData = { machines, def, labelAt: new THREE.Vector3(-def.w / 2 + 3.4, 4.6, -def.d / 2 + 2.6) };
  return g;
}

export function bench(x, z, ry) {
  const g = new THREE.Group();
  const wood = mat("#9b6b45");
  g.add(mesh(rbox(1.2, 0.08, 0.38, 0.03), wood, { y: 0.62 }));
  g.add(mesh(rbox(1.2, 0.3, 0.06, 0.03), wood, { y: 0.85, z: -0.18 }));
  for (const sx of [-0.5, 0.5]) g.add(mesh(new THREE.BoxGeometry(0.06, 0.32, 0.32), mat("#4b4f57"), { x: sx, y: 0.45 }));
  g.position.set(x, 0.3, z);
  g.rotation.y = ry;
  return g;
}

/* ---------- Hub: round plaza, glass dome, turntable ---------- */

export function hub(def) {
  const g = new THREE.Group();
  g.position.set(def.x, 0, def.z);
  const plaza = radialTileTexture("#e7e5df");
  const top = new THREE.MeshStandardMaterial({ map: plaza, bumpMap: plaza.userData.bump, bumpScale: 1.2, roughness: 0.9 });
  const side = mat("#cfcbc2");
  g.add(mesh(new THREE.CylinderGeometry(def.radius, def.radius + 0.1, 0.32, 72), [side, top, side], { y: 0.16 }));
  // Arched windows around the wall
  g.add(mesh(new THREE.CylinderGeometry(3.6, 3.7, 1.9, 48), mat("#f3f2ee"), { y: 1.27 }));
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    g.add(mesh(rbox(0.72, 1.17, 0.1, 0.08), trim, { x: Math.sin(a) * 3.63, y: 1.22, z: Math.cos(a) * 3.63, ry: a, cast: false }));
    g.add(mesh(rbox(0.55, 1.0, 0.12, 0.08), windowMaterial, { x: Math.sin(a) * 3.66, y: 1.2, z: Math.cos(a) * 3.66, ry: a, cast: false }));
    g.add(mesh(rbox(0.8, 0.07, 0.18, 0.02), trim, { x: Math.sin(a) * 3.72, y: 0.66, z: Math.cos(a) * 3.72, ry: a }));
  }
  // Plinth around the foot of the wall
  g.add(mesh(new THREE.CylinderGeometry(3.78, 3.82, 0.3, 64), mat("#dcd7cd"), { y: 0.47 }));
  g.add(mesh(new THREE.TorusGeometry(3.62, 0.13, 8, 64), mat("#e2dfd8"), { y: 2.22 }).rotateX(Math.PI / 2));
  // Turntable with parcels, visible through the glass
  const turntable = new THREE.Group();
  turntable.position.y = 2.2;
  turntable.add(mesh(new THREE.CylinderGeometry(2.7, 2.7, 0.16, 48), mat("#c8cdd5", { metal: 0.3, rough: 0.5 })));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    turntable.add(mesh(new THREE.BoxGeometry(2.4, 0.04, 0.12), mat("#9aa3ae"), { y: 0.1, ry: a }));
  }
  const crate = new THREE.MeshStandardMaterial({ map: boxTexture(), roughness: 0.85 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    turntable.add(mesh(rbox(0.42, 0.36, 0.42, 0.04), crate, { x: Math.sin(a) * 1.8, y: 0.28, z: Math.cos(a) * 1.8, ry: a }));
  }
  g.add(turntable);
  // Glass dome and ribs
  const glass = new THREE.MeshPhysicalMaterial({ color: "#e6f4ff", roughness: 0.05, metalness: 0, transparent: true, opacity: 0.2, envMapIntensity: 0.7, depthWrite: false, side: THREE.DoubleSide });
  g.add(mesh(new THREE.SphereGeometry(3.55, 48, 20, 0, Math.PI * 2, 0, Math.PI / 2), glass, { y: 2.22, cast: false, receive: false }));
  const rib = mat("#f4f4f2", { metal: 0.2, rough: 0.5 });
  for (let i = 0; i < 6; i++) {
    const arch = mesh(new THREE.TorusGeometry(3.55, 0.05, 6, 40, Math.PI), rib, { y: 2.22, cast: false });
    arch.rotation.y = (i / 6) * Math.PI;
    g.add(arch);
  }
  g.add(mesh(new THREE.TorusGeometry(2.6, 0.05, 6, 48), rib, { y: 2.22 + 2.3, cast: false }).rotateX(Math.PI / 2));
  // Central spire with an orange beacon
  g.add(mesh(new THREE.CylinderGeometry(0.16, 0.24, 3.6, 12), mat("#f1efea"), { y: 3.9 }));
  const beacon = mesh(new THREE.SphereGeometry(0.36, 20, 16), new THREE.MeshStandardMaterial({ color: "#ff8a3d", emissive: "#ff6a1a", emissiveIntensity: 0.8, roughness: 0.3 }), { y: 5.85 });
  g.add(beacon);
  // Four doors, each under a little canopy on two posts
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const at = (r, y) => ({ x: Math.sin(a) * r, y, z: Math.cos(a) * r, ry: a });
    g.add(mesh(rbox(1.1, 1.3, 0.5, 0.1), mat("#d9d5cc"), at(3.75, 0.95)));
    g.add(mesh(rbox(0.7, 1.0, 0.1, 0.06), mat("#4a5a70"), { ...at(4.0, 0.82), cast: false }));
    g.add(mesh(rbox(1.6, 0.09, 0.95, 0.04), trim, at(4.2, 1.72)));
    for (const s of [-1, 1]) {
      const px = Math.sin(a) * 4.55 + Math.cos(a) * 0.68 * s, pz = Math.cos(a) * 4.55 - Math.sin(a) * 0.68 * s;
      g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.4, 6), mat("#c7ccd2", { metal: 0.4 }), { x: px, y: 1.02, z: pz }));
    }
  }
  // A ring of lights at the foot of the dome, lit at night with the lamps
  g.add(mesh(new THREE.TorusGeometry(3.6, 0.045, 6, 96), lampMaterial, { y: 2.36, cast: false }).rotateX(Math.PI / 2));
  turntable.userData.dynamic = true;
  beacon.userData.dynamic = true;
  g.userData = { turntable, beacon, labelAt: new THREE.Vector3(0, 6.8, 0) };
  return g;
}

/* ---------- Agent platforms and characters ---------- */

function critter() {
  // Orange pixel critter for Claude Code: blocky body, little claws, four legs, a floating gem above
  const g = new THREE.Group();
  const body = mat("#d97757", { rough: 0.7 });
  const pixel = (w, h, d) => rbox(w, h, d, 0.04, 2);
  g.add(mesh(pixel(2.0, 1.45, 1.35), body, { y: 1.18 }));
  for (const s of [-1, 1]) {
    g.add(mesh(pixel(0.5, 0.42, 0.62), body, { x: s * 1.24, y: 1.1 }));
    for (const z of [-0.42, 0.42]) g.add(mesh(pixel(0.26, 0.48, 0.26), body, { x: s * 0.62, y: 0.24, z }));
  }
  const eye = mat("#1d1d1f", { rough: 0.4, snow: 0 });
  for (const x of [-0.42, 0.42]) g.add(mesh(new THREE.BoxGeometry(0.2, 0.3, 0.05), eye, { x, y: 1.32, z: 0.69, cast: false }));
  // A spark floating overhead: eight rays around a bright core, turning slowly
  const spark = new THREE.Group();
  const glow = new THREE.MeshStandardMaterial({ color: "#ffe9d6", emissive: "#ff9a5c", emissiveIntensity: 1.1, roughness: 0.3 });
  for (let i = 0; i < 4; i++) {
    const ray = mesh(rbox(0.13, i % 2 ? 0.62 : 0.9, 0.1, 0.05), glow, { cast: false });
    ray.rotation.z = (i * Math.PI) / 4;
    spark.add(ray);
  }
  spark.add(mesh(new THREE.SphereGeometry(0.16, 14, 10), glow, { cast: false }));
  spark.position.y = 3.05;
  g.add(spark);
  g.userData.spin = spark;
  g.scale.setScalar(1.2);
  return g;
}

function codexCloud() {
  // Blue-violet cloud for Codex, with a >_ face
  const g = new THREE.Group();
  const cloud = new THREE.MeshStandardMaterial({ color: "#8b88ff", emissive: "#5b4dff", emissiveIntensity: 0.35, roughness: 0.45 });
  for (const [x, y, z, r] of [[0, 1.6, 0, 1.05], [0.95, 1.35, 0, 0.78], [-0.95, 1.35, 0.05, 0.8], [0.4, 2.25, -0.1, 0.72], [-0.45, 2.15, 0.15, 0.68], [0, 1.25, 0.45, 0.72], [0.1, 1.5, -0.5, 0.75]]) {
    g.add(mesh(new THREE.SphereGeometry(r, 28, 20), cloud, { x, y, z }));
  }
  const face = new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 0.8 });
  const chevron = new THREE.Group();
  for (const s of [1, -1]) {
    const bar = mesh(rbox(0.13, 0.42, 0.08, 0.04), face, { x: 0, y: s * 0.12, cast: false });
    bar.rotation.z = s * 0.75;
    chevron.add(bar);
  }
  chevron.position.set(-0.28, 1.62, 1.12);
  g.add(chevron);
  g.add(mesh(rbox(0.42, 0.11, 0.08, 0.04), face, { x: 0.25, y: 1.42, z: 1.1, cast: false }));
  return g;
}

function deepseekWhale() {
  // Blue whale for DeepSeek
  const g = new THREE.Group();
  const blue = new THREE.MeshStandardMaterial({ color: "#4d6bfe", roughness: 0.45 });
  const belly = new THREE.MeshStandardMaterial({ color: "#dfe6ff", roughness: 0.6 });
  const body = mesh(new THREE.SphereGeometry(1, 32, 24), blue, { y: 1.45 });
  body.scale.set(1.55, 0.95, 1.0);
  g.add(body);
  const b = mesh(new THREE.SphereGeometry(1, 28, 18), belly, { y: 1.2, z: 0.12 });
  b.scale.set(1.3, 0.62, 0.86);
  g.add(b);
  const tail = new THREE.Group();
  for (const s of [-1, 1]) {
    const fin = mesh(new THREE.SphereGeometry(0.5, 16, 10), blue, { x: -0.25, y: 0.25, z: s * 0.32 });
    fin.scale.set(0.9, 0.2, 0.55);
    fin.rotation.x = s * 0.5;
    tail.add(fin);
  }
  tail.position.set(-1.6, 1.75, 0);
  tail.rotation.z = 0.6;
  g.add(tail);
  for (const s of [-1, 1]) {
    const flipper = mesh(new THREE.SphereGeometry(0.4, 14, 10), blue, { x: 0.35, y: 1.0, z: s * 0.95 });
    flipper.scale.set(0.9, 0.2, 0.6);
    g.add(flipper);
  }
  const eyeMat = new THREE.MeshStandardMaterial({ color: "#14182e", roughness: 0.2 });
  for (const s of [-1, 1]) {
    g.add(mesh(new THREE.SphereGeometry(0.12, 12, 10), eyeMat, { x: 0.95, y: 1.6, z: s * 0.68, cast: false }));
    g.add(mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshStandardMaterial({ color: "#fff", emissive: "#fff" }), { x: 1.02, y: 1.66, z: s * 0.76, cast: false }));
  }
  // Water spout
  const spout = new THREE.Group();
  const water = new THREE.MeshStandardMaterial({ color: "#bfe4ff", emissive: "#9fd6ff", emissiveIntensity: 0.4, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 6; i++) spout.add(mesh(new THREE.SphereGeometry(0.13 - i * 0.012, 10, 8), water, { x: Math.sin(i) * 0.12, y: i * 0.18, z: Math.cos(i) * 0.12, cast: false }));
  spout.position.set(0.3, 2.45, 0);
  g.add(spout);
  g.rotation.y = -0.5;
  g.userData.spout = spout;
  return g;
}

function serverBot() {
  // Local/cloud scripts: a little server rack with blinking LEDs
  const g = new THREE.Group();
  g.add(mesh(rbox(1.5, 2.2, 1.2, 0.12), mat("#3a4352", { rough: 0.5, metal: 0.3 }), { y: 1.25 }));
  const leds = [];
  for (let i = 0; i < 5; i++) {
    const led = mesh(new THREE.BoxGeometry(1.0, 0.09, 0.05), new THREE.MeshStandardMaterial({ color: "#7dffb0", emissive: "#3dff8a", emissiveIntensity: 1 }), { y: 0.65 + i * 0.32, z: 0.61, cast: false });
    leds.push(led);
    g.add(led);
  }
  for (const x of [-0.45, 0.45]) g.add(mesh(rbox(0.32, 0.22, 0.4, 0.06), mat("#2b3240"), { x, y: 0.11 }));
  g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6), mat("#9aa3ad"), { x: 0.4, y: 2.65 }));
  g.add(mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshStandardMaterial({ color: "#4caf7a", emissive: "#4caf7a", emissiveIntensity: 1 }), { x: 0.4, y: 2.98, cast: false }));
  g.userData.leds = leds;
  return g;
}

function lobster() {
  // Red lobster for OpenClaw
  const g = new THREE.Group();
  const red = mat("#e0533d", { rough: 0.55 });
  const dark = mat("#b8392a", { rough: 0.6 });
  const body = mesh(new THREE.SphereGeometry(0.75, 24, 18), red, { y: 1.1 });
  body.scale.set(1.0, 0.75, 1.25);
  g.add(body);
  for (let i = 0; i < 3; i++) {
    const seg = mesh(new THREE.SphereGeometry(0.5 - i * 0.1, 16, 12), i % 2 ? dark : red, { y: 0.95 - i * 0.08, z: -0.95 - i * 0.45 });
    seg.scale.set(1.1, 0.6, 0.8);
    g.add(seg);
  }
  const fan = mesh(new THREE.ConeGeometry(0.45, 0.5, 5), dark, { y: 0.75, z: -2.35 });
  fan.rotation.x = -Math.PI / 2;
  fan.scale.y = 0.35;
  g.add(fan);
  const claws = [];
  for (const s of [-1, 1]) {
    const arm = mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.8, 8), red, { x: s * 0.75, y: 1.15, z: 0.75 });
    arm.rotation.x = Math.PI / 2.6;
    arm.rotation.z = s * -0.5;
    g.add(arm);
    const claw = new THREE.Group();
    const palm = mesh(new THREE.SphereGeometry(0.38, 16, 12), red);
    palm.scale.set(0.8, 0.6, 1.2);
    claw.add(palm);
    for (const k of [-1, 1]) {
      const pincer = mesh(new THREE.ConeGeometry(0.16, 0.6, 8), red, { y: k * 0.12, z: 0.5 });
      pincer.rotation.x = Math.PI / 2;
      claw.add(pincer);
    }
    claw.position.set(s * 1.05, 1.3, 1.35);
    g.add(claw);
    claws.push(claw);
  }
  for (const s of [-1, 1]) {
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 6), dark, { x: s * 0.25, y: 1.6, z: 0.75 }));
    g.add(mesh(new THREE.SphereGeometry(0.09, 10, 8), mat("#1d1d1f", { snow: 0 }), { x: s * 0.25, y: 1.82, z: 0.78, cast: false }));
    for (const z of [-0.3, 0.1, 0.5]) {
      const leg = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6), dark, { x: s * 0.85, y: 0.55, z });
      leg.rotation.z = s * 0.9;
      g.add(leg);
    }
  }
  g.userData.claws = claws;
  return g;
}

function robot(color = "#c9a227") {
  // Round little robot for anything custom (webhook reports)
  const g = new THREE.Group();
  const shell = mat(color, { rough: 0.45, metal: 0.1 });
  g.add(mesh(new THREE.SphereGeometry(1.0, 32, 24), shell, { y: 1.35 }));
  const face = mesh(new THREE.CircleGeometry(0.62, 32), new THREE.MeshStandardMaterial({ color: "#1f2633", roughness: 0.3 }), { y: 1.42, z: 0.97, cast: false });
  g.add(face);
  const glow = new THREE.MeshStandardMaterial({ color: "#9ff3ff", emissive: "#5ee6ff", emissiveIntensity: 1 });
  for (const x of [-0.22, 0.22]) g.add(mesh(new THREE.CircleGeometry(0.1, 16), glow, { x, y: 1.5, z: 0.985, cast: false }));
  g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5), mat("#9aa3ad"), { y: 2.55 }));
  g.add(mesh(new THREE.SphereGeometry(0.11, 12, 10), glow, { y: 2.82, cast: false }));
  for (const x of [-0.45, 0.45]) g.add(mesh(rbox(0.35, 0.3, 0.45, 0.1), mat("#3a4352"), { x, y: 0.2 }));
  return g;
}

export function agentPlatform(def) {
  const g = new THREE.Group();
  g.position.set(def.x, 0, def.z);
  const plaza = radialTileTexture("#e9e8e4", { rings: 7 });
  const top = new THREE.MeshStandardMaterial({ map: plaza, bumpMap: plaza.userData.bump, bumpScale: 1.2, roughness: 0.9 });
  const side = mat("#cfcbc2");
  g.add(mesh(new THREE.CylinderGeometry(def.radius, def.radius + 0.1, 0.34, 64), [side, top, side], { y: 0.17 }));
  const stage = radialTileTexture("#f2f1ee", { rings: 4 });
  const stageTop = new THREE.MeshStandardMaterial({ map: stage, bumpMap: stage.userData.bump, bumpScale: 1, roughness: 0.8 });
  g.add(mesh(new THREE.CylinderGeometry(def.radius * 0.58, def.radius * 0.6, 0.28, 56), [side, stageTop, side], { y: 0.48 }));
  // Glowing ring that lights up while working
  const ring = mesh(new THREE.TorusGeometry(def.radius * 0.6, 0.06, 8, 64), new THREE.MeshStandardMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 0.15 }), { y: 0.63, cast: false });
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  const character = ({ claude: critter, codex: codexCloud, deepseek: deepseekWhale, system: serverBot, openclaw: lobster, custom: robot }[def.kind] || robot)(def.color);
  character.position.y = 0.62;
  g.add(character);
  // Pallet where finished parcels get stacked
  const pallet = new THREE.Group();
  pallet.add(mesh(rbox(1.3, 0.16, 1.0, 0.03), mat("#b88a5c")));
  pallet.position.set(def.radius * 0.72, 0.42, def.radius * 0.35);
  g.add(pallet);
  // Lamp posts and a bench
  for (const a of [2.4, 4.0]) g.add(lampPost(Math.cos(a) * (def.radius - 0.5), Math.sin(a) * (def.radius - 0.5), 0.34));
  g.add(bench(-def.radius * 0.2, def.radius - 0.75, Math.PI));
  for (const o of [character, ring, pallet]) o.userData.dynamic = true;
  g.userData = { character, ring, pallet, def, baseY: 0.62, labelAt: new THREE.Vector3(0, 4.3, 0) };
  return g;
}

export const lamps = [];
export const lampMaterial = new THREE.MeshStandardMaterial({ color: "#fff6dc", emissive: "#ffcf7a", emissiveIntensity: 0 });
export function lampPost(x, z, y0 = 0) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.7, 8), mat("#4b4f57", { metal: 0.4 }), { y: 0.85 }));
  const head = mesh(new THREE.SphereGeometry(0.16, 12, 10), lampMaterial, { y: 1.78, cast: false });
  g.add(head);
  g.position.set(x, y0, z);
  lamps.push(head);
  return g;
}
