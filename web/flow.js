// Conveyor belts and parcels: machine → hub → agent. Each belt is a Bézier curve the parcels ride along.
import * as THREE from "three";
import { beltTexture, boxTexture, mat, mesh, rbox } from "./util.js";

const BELT_Y = 0.62, BELT_W = 0.74, SKIRT = 0.22;
const beltMap = beltTexture();
const beltMaterial = new THREE.MeshStandardMaterial({ map: beltMap, roughness: 0.7 });
const railMaterial = mat("#f1f3f5", { metal: 0.35, rough: 0.4 });
const skirtMaterial = mat("#dfe3e8", { metal: 0.15, rough: 0.55 });
const postMaterial = mat("#9aa3ad", { metal: 0.35, rough: 0.45 });
const skirtSides = skirtMaterial.clone();
skirtSides.side = THREE.DoubleSide;

function ribbon(curve, width, samples) {
  const positions = [], uvs = [], indices = [];
  const length = curve.getLength();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const p = curve.getPointAt(t), tangent = curve.getTangentAt(t);
    const side = new THREE.Vector3().crossVectors(up, tangent).normalize().multiplyScalar(width / 2);
    positions.push(p.x - side.x, p.y, p.z - side.z, p.x + side.x, p.y, p.z + side.z);
    uvs.push(0, (t * length) / 1.2, 1, (t * length) / 1.2);
    if (i < samples) { const k = i * 2; indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }   // wound to face up
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// A vertical strip hanging from the belt's edge (offset to one side), so the conveyor reads as a solid body, not a wire
function skirt(curve, offset, samples) {
  const positions = [], indices = [], up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= samples; i++) {
    const t = i / samples, p = curve.getPointAt(t);
    const side = new THREE.Vector3().crossVectors(up, curve.getTangentAt(t)).normalize().multiplyScalar(offset);
    positions.push(p.x + side.x, p.y + 0.05, p.z + side.z, p.x + side.x, p.y - SKIRT, p.z + side.z);
    if (i < samples) { const k = i * 2; indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }   // wound to face up
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function offsetCurve(curve, offset, samples) {
  const up = new THREE.Vector3(0, 1, 0), points = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const side = new THREE.Vector3().crossVectors(up, curve.getTangentAt(t)).normalize().multiplyScalar(offset);
    points.push(curve.getPointAt(t).add(side).add(new THREE.Vector3(0, 0.07, 0)));
  }
  return new THREE.CatmullRomCurve3(points);
}

// Leaves a heading along outA and arrives at b heading along inB (horizontal unit vectors)
export function belt(scene, a, outA, b, inB) {
  const dist = a.distanceTo(b);
  const curve = new THREE.CubicBezierCurve3(
    new THREE.Vector3(a.x, BELT_Y, a.z),
    new THREE.Vector3(a.x + outA.x * dist * 0.38, BELT_Y, a.z + outA.z * dist * 0.38),
    new THREE.Vector3(b.x - inB.x * dist * 0.38, BELT_Y, b.z - inB.z * dist * 0.38),
    new THREE.Vector3(b.x, BELT_Y, b.z)
  );
  const samples = Math.max(16, Math.round(dist * 3));
  const group = new THREE.Group();
  const surface = mesh(ribbon(curve, BELT_W, samples), beltMaterial, { cast: false });
  group.add(surface);
  // Body: light side skirts and a base underneath (it casts the shadow), white rails along the top edges
  for (const s of [-1, 1]) group.add(mesh(skirt(curve, s * (BELT_W / 2 + 0.05), samples), skirtSides, { cast: false }));
  group.add(mesh(ribbon(curve, BELT_W + 0.1, samples), skirtMaterial, { y: -SKIRT, cast: true }));
  for (const s of [-1, 1]) group.add(mesh(new THREE.TubeGeometry(offsetCurve(curve, s * (BELT_W / 2 + 0.05), samples), samples, 0.05, 6), railMaterial, { cast: false }));
  // Legs: a pair under each frame
  const legs = Math.floor(curve.getLength() / 2.2), up = new THREE.Vector3(0, 1, 0);
  for (let i = 1; i < legs; i++) {
    const p = curve.getPointAt(i / legs);
    const side = new THREE.Vector3().crossVectors(up, curve.getTangentAt(i / legs)).normalize().multiplyScalar(BELT_W / 2 - 0.08);
    for (const s of [-1, 1]) group.add(mesh(new THREE.CylinderGeometry(0.045, 0.06, BELT_Y - SKIRT, 6), postMaterial, { x: p.x + side.x * s, y: (BELT_Y - SKIRT) / 2, z: p.z + side.z * s }));
  }
  scene.add(group);
  return { curve, length: curve.getLength(), group };
}

// Inside the hub: from the end of an incoming belt, up onto the sorting turntable, round to the outgoing belt's side,
// and back down to it. The wall hides the climb; the glass dome shows the parcel riding the turntable.
export function hubCurve(from, to, hub, { deck = 2.32, ring = 2.35 } = {}) {
  const aIn = Math.atan2(from.z - hub.z, from.x - hub.x), aOut = Math.atan2(to.z - hub.z, to.x - hub.x);
  const turn = Math.atan2(Math.sin(aOut - aIn), Math.cos(aOut - aIn));
  const at = (a, r, y) => new THREE.Vector3(hub.x + Math.cos(a) * r, y, hub.z + Math.sin(a) * r);
  // Through the wall low (the wall's inner face is at 3.6), straight up behind it, then onto the turntable
  const points = [new THREE.Vector3(from.x, BELT_Y, from.z), at(aIn, 3.5, BELT_Y), at(aIn, 3.25, 1.4), at(aIn, 2.7, deck)];
  const steps = Math.max(2, Math.ceil(Math.abs(turn) / 0.3));
  for (let i = 0; i <= steps; i++) points.push(at(aIn + (turn * i) / steps, ring, deck));
  points.push(at(aOut, 2.7, deck), at(aOut, 3.25, 1.4), at(aOut, 3.5, BELT_Y), new THREE.Vector3(to.x, BELT_Y, to.z));
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
  return { curve, length: curve.getLength() };
}

export function scrollBelts(dt, speed = 1) {
  beltMap.offset.y -= dt * 0.9 * speed;
}

// The belt's 2D footprint, so trees and grass keep clear of it
export function corridor(curve, width, samples = 40) {
  const points = [];
  for (let i = 0; i <= samples; i++) { const p = curve.getPointAt(i / samples); points.push([p.x, p.z]); }
  return { points, width };
}

/* ---------- Parcels ---------- */

const crateMaterial = new THREE.MeshStandardMaterial({ map: boxTexture(), roughness: 0.85 });
const crateGeometry = rbox(0.56, 0.44, 0.56, 0.06, 2);

export function createParcels(scene) {
  const live = [];

  // route: [{ curve, length }...] ridden in order; onArrive fires at the end of the last one
  function send(route, { speed = 3.2, onHub, onArrive, tint } = {}) {
    const box = mesh(crateGeometry, tint ? crateMaterial.clone() : crateMaterial);
    if (tint) box.material.color.set(tint);
    box.visible = false;
    scene.add(box);
    live.push({ box, route, seg: 0, dist: 0, speed, onHub, onArrive, wait: 0 });
  }

  function update(dt) {
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      if (p.wait > 0) { p.wait -= dt; p.box.visible = false; continue; }
      const seg = p.route[p.seg];
      p.dist += p.speed * dt;
      if (p.dist >= seg.length) {
        p.seg += 1;
        p.dist = 0;
        if (p.seg === 1 && p.onHub) { p.onHub(); p.wait = 0.9; }
        if (p.seg >= p.route.length) {
          scene.remove(p.box);
          live.splice(i, 1);
          p.onArrive?.();
          continue;
        }
        continue;
      }
      const t = p.dist / seg.length;
      const pos = seg.curve.getPointAt(t);
      const tangent = seg.curve.getTangentAt(t);
      p.box.visible = true;
      p.box.position.set(pos.x, pos.y + 0.2, pos.z);
      p.box.rotation.y = Math.atan2(tangent.x, tangent.z);
    }
  }

  return { send, update, count: () => live.length };
}
