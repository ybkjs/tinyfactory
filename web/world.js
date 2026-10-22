// Builds the park from a layout: grass, paths, pond, woods, factories, hub, agent platforms, conveyor belts
import * as THREE from "three";
import { SimplexNoise } from "three/addons/math/SimplexNoise.js";
import { belt, corridor } from "./flow.js";
import { agentPlatform, bench, factory, hub, lampPost } from "./structures.js";
import { grassTexture, gravelTexture, mat, mesh, pick, rand, range, rippleNormals, snowy } from "./util.js";

const PORT_R = 3.9;

export function buildWorld(scene, layout) {
  const HUB = layout.hub;
  const zones = { rects: [], circles: [], corridors: [] };

  // Grass
  const ground = mesh(new THREE.PlaneGeometry(280, 280), snowy(new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 0.95 })), { cast: false });
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Hub
  const hubGroup = hub(HUB);
  scene.add(hubGroup);
  zones.circles.push([HUB.x, HUB.z, HUB.radius]);

  // Factories
  const factories = layout.factories.map((def) => {
    const g = factory(def);
    scene.add(g);
    zones.rects.push([def.x, def.z, def.w, def.d]);
    return g;
  });

  // Agent platforms
  const agents = new Map();
  for (const def of layout.agents) {
    const g = agentPlatform(def);
    scene.add(g);
    agents.set(def.id, g);
    zones.circles.push([def.x, def.z, def.radius]);
  }

  // Machine → hub belts: ports spread evenly around the left side of the hub
  const starts = [];
  for (const f of factories) {
    for (const m of f.userData.machines) {
      const p = new THREE.Vector3().copy(m.position).add(f.position).add(new THREE.Vector3(0.95, 0, 0));
      starts.push({ m, p, angle: Math.atan2(p.z - HUB.z, p.x - HUB.x) });
    }
  }
  // Angles in 0..2π so the left side sits around π
  for (const s of starts) if (s.angle < 0) s.angle += Math.PI * 2;
  starts.sort((a, b) => a.angle - b.angle);
  // Ports fan out around the left side of the hub; many lines squeeze closer together
  const spread = starts.length > 1 ? Math.min(0.15, 2.6 / (starts.length - 1)) : 0;
  const mid = starts.length ? starts.reduce((sum, s) => sum + s.angle, 0) / starts.length : Math.PI;
  const lines = new Map();
  starts.forEach((s, i) => {
    const a = mid + (i - (starts.length - 1) / 2) * spread;
    const port = new THREE.Vector3(HUB.x + Math.cos(a) * PORT_R, 0, HUB.z + Math.sin(a) * PORT_R);
    const inward = new THREE.Vector3(-Math.cos(a), 0, -Math.sin(a));
    const b = belt(scene, s.p, new THREE.Vector3(1, 0, 0), port, inward);
    zones.corridors.push(corridor(b.curve, 1.6));
    lines.set(s.m.userData.line.id, { machine: s.m, belt: b, line: s.m.userData.line });
  });

  // Hub → agent belts
  const outBelts = new Map();
  for (const def of layout.agents) {
    const a = Math.atan2(def.z - HUB.z, def.x - HUB.x);
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const port = new THREE.Vector3(HUB.x, 0, HUB.z).addScaledVector(dir, PORT_R);
    const toHub = new THREE.Vector3(HUB.x - def.x, 0, HUB.z - def.z).normalize();
    const end = new THREE.Vector3(def.x, 0, def.z).addScaledVector(toHub, def.radius * 0.62 + 0.45);
    const b = belt(scene, port, dir, end, toHub.clone().negate());
    zones.corridors.push(corridor(b.curve, 1.6));
    outBelts.set(def.id, b);
  }

  // Paths
  const paths = [
    [[-1, 60], [-4, 34], [-5.5, 24], [-3.5, 12], [-1.2, 7.2]],
    [[1.2, -7.2], [3, -13], [0, -24], [-6, -36], [-9, -60]]
  ];
  const gravel = gravelTexture();
  const pathCurves = [];
  for (const pts of paths) {
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0.03, z)));
    pathCurves.push(curve);
    const geometry = flatRibbon(curve, 2.3, 120);
    const material = snowy(new THREE.MeshStandardMaterial({ map: gravel, roughness: 1 }));
    scene.add(mesh(geometry, material, { cast: false }));
    zones.corridors.push(corridor(curve, 3.2, 60));
  }

  // Pond (only when the layout left room for it)
  let water = null;
  if (layout.pond) {
    const { x: px, z: pz, r: pr } = layout.pond;
    // Gentle ripples: a tiling normal map that main.js scrolls
    const ripples = rippleNormals(new SimplexNoise({ random: rand }));
    water = mesh(new THREE.CircleGeometry(pr, 64), new THREE.MeshPhysicalMaterial({ color: "#3d8c8f", roughness: 0.08, metalness: 0.05, clearcoat: 1, transparent: true, opacity: 0.92, envMapIntensity: 1.2, normalMap: ripples, normalScale: new THREE.Vector2(0.35, 0.35) }), { x: px, y: 0.06, z: pz, cast: false });
    water.rotation.x = -Math.PI / 2;
    scene.add(water);
    const bed = mesh(new THREE.CircleGeometry(pr + 0.25, 64), mat("#5d6b55"), { x: px, y: 0.035, z: pz, cast: false });
    bed.rotation.x = -Math.PI / 2;
    scene.add(bed);
    const rock = new THREE.DodecahedronGeometry(0.35, 0);
    const rocks = new THREE.InstancedMesh(rock, mat("#a6a59c"), 46);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), v3 = new THREE.Vector3();
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2 + range(-0.05, 0.05), r = pr + range(0.05, 0.45);
      q.setFromEuler(new THREE.Euler(rand() * 3, rand() * 3, rand() * 3));
      s3.set(range(0.6, 1.3), range(0.35, 0.7), range(0.6, 1.2));
      m4.compose(v3.set(px + Math.cos(a) * r, 0.08, pz + Math.sin(a) * r), q, s3);
      rocks.setMatrixAt(i, m4);
    }
    rocks.castShadow = rocks.receiveShadow = true;
    scene.add(rocks);
    const pad = new THREE.CylinderGeometry(0.34, 0.34, 0.03, 14);
    for (let i = 0; i < 12; i++) {
      const a = rand() * Math.PI * 2, r = rand() * (pr - 0.8);
      scene.add(mesh(pad, mat(pick(["#4f8a3a", "#5c9a44", "#447a33"])), { x: px + Math.cos(a) * r, y: 0.08, z: pz + Math.sin(a) * r, cast: false }));
      if (i % 4 === 0) scene.add(mesh(new THREE.SphereGeometry(0.1, 8, 6), mat("#f6b8cc"), { x: px + Math.cos(a) * r, y: 0.15, z: pz + Math.sin(a) * r }));
    }
    zones.circles.push([px, pz, pr + 0.6]);
  }

  // Street lamps and benches
  for (const [x, z] of [[-3.8, 9.5], [-5.2, 20], [2.4, -11], [-0.6, -20], [-30, -19], [33, -0.5], [-7.5, -3.5], [7.5, 3.5], [6, -7], [-6.5, 7]]) scene.add(lampPost(x, z));
  for (const [x, z, ry] of [[-1.2, 10.5, Math.PI / 2], [4.6, 12, -0.6], [-2.5, -16, 0.4]]) scene.add(bench(x, z, ry - 0.0));

  // Woods, bushes, grass, flowers
  const blocked = makeBlocked(zones);
  plantTrees(scene, blocked);
  plantBorders(scene, pathCurves, blocked, layout);
  scatterGrass(scene, blocked);

  return { ground, water, hub: hubGroup, factories, agents, lines, outBelts };
}

function flatRibbon(curve, width, samples) {
  const positions = [], uvs = [], indices = [];
  const length = curve.getLength(), up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= samples; i++) {
    const t = i / samples, p = curve.getPointAt(t);
    const side = new THREE.Vector3().crossVectors(up, curve.getTangentAt(t)).normalize().multiplyScalar(width / 2);
    positions.push(p.x - side.x, p.y, p.z - side.z, p.x + side.x, p.y, p.z + side.z);
    uvs.push(0, (t * length) / width, 1, (t * length) / width);
    if (i < samples) { const k = i * 2; indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makeBlocked(zones) {
  const segs = [];
  for (const c of zones.corridors) {
    for (let i = 0; i < c.points.length - 1; i++) {
      const [ax, az] = c.points[i], [bx, bz] = c.points[i + 1];
      segs.push({ ax, az, bx, bz, w: c.width / 2, minx: Math.min(ax, bx) - c.width, maxx: Math.max(ax, bx) + c.width, minz: Math.min(az, bz) - c.width, maxz: Math.max(az, bz) + c.width });
    }
  }
  return (x, z, margin = 0) => {
    for (const [cx, cz, w, d] of zones.rects) if (Math.abs(x - cx) < w / 2 + margin && Math.abs(z - cz) < d / 2 + margin) return true;
    for (const [cx, cz, r] of zones.circles) if ((x - cx) ** 2 + (z - cz) ** 2 < (r + margin) ** 2) return true;
    for (const s of segs) {
      if (x < s.minx - margin || x > s.maxx + margin || z < s.minz - margin || z > s.maxz + margin) continue;
      const dx = s.bx - s.ax, dz = s.bz - s.az;
      const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / (dx * dx + dz * dz || 1)));
      if ((x - s.ax - dx * t) ** 2 + (z - s.az - dz * t) ** 2 < (s.w + margin) ** 2) return true;
    }
    return false;
  };
}

// Puffy tree crowns: an icosphere kneaded with noise
function blobGeometry(seedOffset) {
  const geometry = new THREE.IcosahedronGeometry(1, 2);
  const noise = new SimplexNoise({ random: rand });
  const p = geometry.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = noise.noise3d(v.x * 1.6 + seedOffset, v.y * 1.6, v.z * 1.6) * 0.16 + noise.noise3d(v.x * 4, v.y * 4 + seedOffset, v.z * 4) * 0.05;
    v.multiplyScalar(1 + n);
    v.y *= 0.88;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  // Normals from the original sphere: a lumpy outline but soft, cotton-ball shading
  const normal = geometry.attributes.normal;
  // Vertex colours: darker underneath and in the dips, sunlit on top, so every crown reads as a soft volume
  const colors = new Float32Array(p.count * 3);
  for (let i = 0; i < normal.count; i++) {
    v.fromBufferAttribute(p, i);
    const dip = v.length() - 1;
    v.normalize();
    normal.setXYZ(i, v.x, v.y * 0.9 + 0.1, v.z);
    const shade = THREE.MathUtils.clamp(0.58 + 0.52 * THREE.MathUtils.smoothstep(v.y, -0.85, 0.95) + dip * 0.9 + (noise.noise3d(v.x * 9, v.y * 9, v.z * 9 + seedOffset) * 0.05), 0.45, 1.15);
    colors.set([shade, shade, shade * 0.97], i * 3);
  }
  normal.needsUpdate = true;
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function plantTrees(scene, blocked) {
  const spots = [];
  const cell = 2.1, grid = new Map();
  const near = (x, z, r) => {
    const gx = Math.floor(x / cell), gz = Math.floor(z / cell);
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) for (const [sx, sz] of grid.get(`${gx + i},${gz + j}`) || []) if ((sx - x) ** 2 + (sz - z) ** 2 < r * r) return true;
    return false;
  };
  for (let k = 0; k < 9000 && spots.length < 700; k++) {
    const x = range(-70, 70), z = range(-55, 42);
    // Sparse in the middle, dense at the edges: the park sits inside a forest
    const edge = Math.max(Math.abs(x) / 34, Math.abs(z + 4) / 26);
    if (rand() > Math.min(1, edge ** 2.2 + 0.08)) continue;
    if (blocked(x, z, 1.4)) continue;
    const size = range(0.8, 1.5) * (edge > 1 ? 1.15 : 0.95);
    if (near(x, z, 1.7 * size)) continue;
    spots.push([x, z, size]);
    const key = `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push([x, z]);
  }
  const blobs = [blobGeometry(0), blobGeometry(7.3), blobGeometry(13.1)];
  const greens = ["#4f8a2e", "#5c9a35", "#3f7a28", "#6aa83c", "#4a8530", "#76b043"];
  const autumn = ["#e0a23a", "#d9822b", "#e8b84a", "#c9682a"];
  const leafMat = mat("#ffffff", { rough: 0.85, vertexColors: true }), barkMat = mat("#6b4a33");
  const trunkGeo = new THREE.CylinderGeometry(0.11, 0.17, 1, 6);
  // 24 m chunks: chunks outside the camera or shadow frustum are skipped whole
  const CHUNK = 24, chunks = new Map();
  for (const spot of spots) {
    const key = `${Math.floor(spot[0] / CHUNK)},${Math.floor(spot[1] / CHUNK)}`;
    if (!chunks.has(key)) chunks.set(key, []);
    chunks.get(key).push(spot);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), v3 = new THREE.Vector3(), color = new THREE.Color();
  for (const list of chunks.values()) {
    const foliage = blobs.map((g) => {
      const im = new THREE.InstancedMesh(g, leafMat, list.length * 3);
      im.castShadow = im.receiveShadow = true;
      im.count = 0;
      return im;
    });
    const trunks = new THREE.InstancedMesh(trunkGeo, barkMat, list.length);
    trunks.castShadow = true;
    list.forEach(([x, z, size], i) => {
      const h = 0.9 * size;
      m4.compose(v3.set(x, h / 2, z), q.identity(), s3.set(size, h, size));
      trunks.setMatrixAt(i, m4);
      const base = rand() < 0.16 ? pick(autumn) : pick(greens);
      // More, smaller clumps: fluffier crowns
      const clumps = 4 + Math.floor(rand() * 3);
      for (let c = 0; c < clumps; c++) {
        const im = pick(foliage);
        if (im.count >= list.length * 3) continue;
        const r = size * range(0.5, 0.8);
        const a = rand() * Math.PI * 2, off = c === 0 ? 0 : size * range(0.35, 0.6);
        q.setFromEuler(new THREE.Euler(0, rand() * 6, 0));
        m4.compose(v3.set(x + Math.cos(a) * off, h + size * 0.55 + (c === 0 ? size * 0.35 : range(-0.1, 0.3) * size), z + Math.sin(a) * off), q, s3.set(r, r, r));
        im.setMatrixAt(im.count, m4);
        im.setColorAt(im.count, color.set(base).offsetHSL(range(-0.015, 0.015), range(-0.05, 0.05), range(-0.06, 0.05)));
        im.count += 1;
      }
    });
    for (const im of [...foliage, trunks]) {
      if (!im.count) continue;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
      scene.add(im);
    }
  }

  // Bushes hug the yards and platforms
  const bushes = new THREE.InstancedMesh(blobs[1], mat("#ffffff", { vertexColors: true }), 260);
  let n = 0;
  for (let k = 0; k < 4000 && n < 260; k++) {
    const x = range(-40, 40), z = range(-30, 30);
    if (blocked(x, z, 0.3) || !blocked(x, z, 1.6)) continue;
    const r = range(0.35, 0.6);
    m4.compose(v3.set(x, r * 0.6, z), q.identity(), s3.set(r * 1.2, r, r * 1.2));
    bushes.setMatrixAt(n, m4);
    bushes.setColorAt(n, color.set(pick(["#3f7a28", "#4f8a2e", "#5c9a35"])));
    n += 1;
  }
  bushes.count = n;
  bushes.castShadow = bushes.receiveShadow = true;
  scene.add(bushes);
}

// Bushes and lavender along both sides of the paths and around the hub, the platforms and the pond
function plantBorders(scene, curves, blocked, layout) {
  const spots = [];
  for (const curve of curves) {
    const len = curve.getLength();
    for (let d = 0.6; d < len; d += 1.15) {
      const p = curve.getPointAt(d / len), t = curve.getTangentAt(d / len);
      for (const side of [-1, 1]) {
        const off = side * (1.95 + rand() * 0.35);
        spots.push([p.x - t.z * off, p.z + t.x * off]);
      }
    }
  }
  const ring = (x, z, r) => { const n = Math.round((Math.PI * 2 * r) / 1.25); for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + rand() * 0.2; spots.push([x + Math.cos(a) * r, z + Math.sin(a) * r]); } };
  ring(layout.hub.x, layout.hub.z, layout.hub.radius + 0.8);
  for (const a of layout.agents) ring(a.x, a.z, a.radius + 0.75);
  if (layout.pond) ring(layout.pond.x, layout.pond.z, layout.pond.r + 1.1);

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), v3 = new THREE.Vector3(), color = new THREE.Color();
  const bushes = new THREE.InstancedMesh(blobGeometry(21.7), mat("#ffffff", { rough: 0.85, vertexColors: true }), spots.length);
  const spike = new THREE.ConeGeometry(0.06, 0.42, 5);
  spike.translate(0, 0.21, 0);
  const lavender = new THREE.InstancedMesh(spike, mat("#ffffff", { rough: 0.8, snow: 0.5 }), spots.length * 10);
  const blossom = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 6, 5), mat("#ffffff", { snow: 0.5 }), spots.length * 4);
  let nb = 0, nl = 0, nf = 0;
  for (const [x, z] of spots) {
    if (blocked(x, z, 0.25)) continue;
    if (rand() < 0.6) {
      const r = range(0.32, 0.52);
      q.setFromEuler(new THREE.Euler(0, rand() * 6, 0));
      m4.compose(v3.set(x, r * 0.62, z), q, s3.set(r * 1.25, r, r * 1.25));
      bushes.setMatrixAt(nb, m4);
      bushes.setColorAt(nb++, color.set(pick(["#4f8a2e", "#5c9a35", "#467f2a", "#64a33b"])));
      // Some bushes are in bloom
      if (rand() < 0.35) {
        const tone = pick(["#fff4f7", "#ffc2d6", "#ffe08a"]);
        for (let i = 0; i < 4; i++) {
          const a = rand() * Math.PI * 2, d = r * range(0.5, 0.95);
          m4.compose(v3.set(x + Math.cos(a) * d, r * range(0.75, 1.15), z + Math.sin(a) * d), q.identity(), s3.set(1, 1, 1));
          blossom.setMatrixAt(nf, m4);
          blossom.setColorAt(nf++, color.set(tone));
        }
      }
    } else {
      for (let i = 0; i < 9; i++) {
        const a = rand() * Math.PI * 2, d = rand() * 0.32;
        q.setFromEuler(new THREE.Euler(range(-0.18, 0.18), 0, range(-0.18, 0.18)));
        m4.compose(v3.set(x + Math.cos(a) * d, 0, z + Math.sin(a) * d), q, s3.set(1, range(0.8, 1.35), 1));
        lavender.setMatrixAt(nl, m4);
        lavender.setColorAt(nl++, color.set(pick(["#8f78cf", "#a48ad8", "#7d68bf", "#9a84d6"])));
      }
    }
  }
  for (const [im, n] of [[bushes, nb], [lavender, nl], [blossom, nf]]) {
    im.count = n;
    im.castShadow = im === bushes;
    im.receiveShadow = true;
    if (n) scene.add(im);
  }
}

function scatterGrass(scene, blocked) {
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), v3 = new THREE.Vector3(), color = new THREE.Color();
  const tuft = new THREE.InstancedMesh(new THREE.ConeGeometry(0.07, 0.34, 4), mat("#ffffff", { snow: 0.6 }), 9000);
  let n = 0;
  for (let k = 0; k < 20000 && n < 9000; k++) {
    const x = range(-45, 45), z = range(-34, 32);
    if (blocked(x, z, 0.1)) continue;
    q.setFromEuler(new THREE.Euler(range(-0.25, 0.25), rand() * 6, range(-0.25, 0.25)));
    const s = range(0.7, 1.5);
    m4.compose(v3.set(x, 0.12 * s, z), q, s3.set(s, s, s));
    tuft.setMatrixAt(n, m4);
    tuft.setColorAt(n, color.set(pick(["#5f8f32", "#6f9f3b", "#7fae45", "#557f2c"])));
    n += 1;
  }
  tuft.count = n;
  tuft.receiveShadow = true;
  scene.add(tuft);

  // Patches of lavender and wild flowers
  const flower = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 6, 5), mat("#ffffff", { snow: 0.5 }), 2600);
  n = 0;
  for (let patch = 0; patch < 70 && n < 2600; patch++) {
    const cx = range(-42, 42), cz = range(-32, 30);
    if (blocked(cx, cz, 0.6)) continue;
    const tone = rand() < 0.6 ? ["#8f78cf", "#a48ad8", "#7d68bf"] : ["#f4f1ea", "#f7d35c", "#f2a7c3"];
    for (let i = 0; i < 40 && n < 2600; i++) {
      const x = cx + range(-1.4, 1.4), z = cz + range(-1.4, 1.4);
      if (blocked(x, z, 0.1)) continue;
      m4.compose(v3.set(x, range(0.12, 0.3), z), q.identity(), s3.set(1, range(1, 2.2), 1));
      flower.setMatrixAt(n, m4);
      flower.setColorAt(n, color.set(pick(tone)));
      n += 1;
    }
  }
  flower.count = n;
  scene.add(flower);
}
