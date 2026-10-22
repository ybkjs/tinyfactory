// Merge meshes that never move, grouped by material: hundreds of draw calls become a few dozen.
// Moving things (machine lamps, gears, turntable, characters, pallets) carry userData.dynamic and are skipped with their children; so are transparent and multi-material meshes.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

function signature(m) {
  return [m.type, m.color?.getHex(), m.roughness, m.metalness, m.map?.uuid, m.emissive?.getHex(), m.emissiveIntensity, m.side, m.customProgramCacheKey?.() ?? ""].join("|");
}

function isDynamic(o) {
  for (let p = o; p; p = p.parent) if (p.userData?.dynamic) return true;
  return false;
}

export function bakeStatic(scene) {
  scene.updateMatrixWorld(true);
  const groups = new Map();
  const victims = [];
  scene.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material) || o.material.transparent || isDynamic(o)) return;
    const key = `${signature(o.material)}|${o.castShadow}|${o.receiveShadow}`;
    if (!groups.has(key)) groups.set(key, { material: o.material, cast: o.castShadow, receive: o.receiveShadow, geometries: [] });
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.clearGroups();
    g.applyMatrix4(o.matrixWorld);
    groups.get(key).geometries.push(g);
    victims.push(o);
  });
  for (const o of victims) o.parent.remove(o);
  let made = 0;
  for (const { material, cast, receive, geometries } of groups.values()) {
    const merged = mergeGeometries(geometries, false);
    if (!merged) continue;
    const m = new THREE.Mesh(merged, material);
    m.castShadow = cast;
    m.receiveShadow = receive;
    m.matrixAutoUpdate = false;
    scene.add(m);
    made += 1;
  }
  return { merged: victims.length, into: made };
}
