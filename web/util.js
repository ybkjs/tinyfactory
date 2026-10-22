// Scene helpers: procedural textures, shared materials, snow cover, seeded random
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

// Seeded random so the park looks the same on every load
let seed = 20261022;
export function rand() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}
export const range = (a, b) => a + (b - a) * rand();
export const pick = (list) => list[Math.floor(rand() * list.length)];

export function canvasTexture(size, draw, { repeat = 1, srgb = true } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 8;
  return texture;
}

const shade = (hex, amount) => {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amount);
  return `#${c.getHexString()}`;
};

// Grass: large soft patches plus fine speckles
export function grassTexture() {
  return canvasTexture(1024, (ctx, s) => {
    ctx.fillStyle = "#76a243";
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 260; i++) {
      const x = rand() * s, y = rand() * s, r = range(40, 140);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const tone = pick(["#86b04d", "#6c963a", "#8fb655", "#668f37", "#7fa947", "#93b85a"]);
      g.addColorStop(0, tone + "aa");
      g.addColorStop(1, tone + "00");
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 26000; i++) {
      ctx.fillStyle = pick(["#5a8330", "#8ab650", "#6c963a", "#97bf5a", "#4f7a2b"]);
      ctx.globalAlpha = range(0.25, 0.7);
      ctx.fillRect(rand() * s, rand() * s, range(1, 3), range(2, 5));
    }
    ctx.globalAlpha = 1;
  }, { repeat: 14 });
}

// Gravel path
export function gravelTexture() {
  return canvasTexture(512, (ctx, s) => {
    ctx.fillStyle = "#cfc8b8";
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 9000; i++) {
      ctx.fillStyle = pick(["#bdb5a3", "#ddd7c9", "#b0a894", "#e6e1d6", "#a89f8b"]);
      ctx.beginPath();
      ctx.arc(rand() * s, rand() * s, range(0.8, 2.6), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

// Height map for paving: stones raised, grout sunk, edges rounded off (used as a bump map)
function paving(draw) {
  const bump = canvasTexture(512, (ctx, s) => { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, s, s); ctx.filter = "blur(1.5px)"; draw(ctx, s); }, { srgb: false });
  return bump;
}

// Square paving for factory yards: each tile slightly different, with grout
export function tileTexture(base = "#d9c3a5", { tiles = 8, grout = "#b9a68c" } = {}) {
  const step = 512 / tiles;
  const bump = paving((ctx) => {
    for (let i = 0; i < tiles; i++) for (let j = 0; j < tiles; j++) {
      const v = 200 + Math.floor(rand() * 55);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(i * step + 3, j * step + 3, step - 6, step - 6);
    }
  });
  const texture = canvasTexture(512, (ctx, s) => {
    ctx.fillStyle = grout;
    ctx.fillRect(0, 0, s, s);
    const step = s / tiles, gap = 3;
    for (let i = 0; i < tiles; i++) {
      for (let j = 0; j < tiles; j++) {
        ctx.fillStyle = shade(base, range(-0.05, 0.04));
        ctx.fillRect(i * step + gap / 2, j * step + gap / 2, step - gap, step - gap);
      }
    }
  });
  texture.userData.bump = bump;
  return texture;
}

// Round plaza: rings of stone tiles (CylinderGeometry cap UVs map to a disc)
export function radialTileTexture(base = "#e3e1dc", { rings = 9, grout = "#bdbab3" } = {}) {
  const stones = (ctx, s, fill) => {
    const c = s / 2, ringW = c / rings;
    for (let r = 0; r < rings; r++) {
      const inner = r * ringW + 2, outer = (r + 1) * ringW - 2;
      const count = Math.max(6, Math.round((2 * Math.PI * (r + 0.5) * ringW) / ringW / 1.1));
      for (let k = 0; k < count; k++) {
        const a0 = (k / count) * Math.PI * 2 + 0.01, a1 = ((k + 1) / count) * Math.PI * 2 - 0.01;
        ctx.beginPath();
        ctx.arc(c, c, outer, a0, a1);
        ctx.arc(c, c, Math.max(inner, 0), a1, a0, true);
        ctx.closePath();
        ctx.fillStyle = fill();
        ctx.fill();
      }
    }
  };
  const bump = canvasTexture(1024, (ctx, s) => { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, s, s); ctx.filter = "blur(2px)"; stones(ctx, s, () => { const v = 190 + Math.floor(rand() * 65); return `rgb(${v},${v},${v})`; }); }, { srgb: false, repeat: 1 });
  const texture = canvasTexture(1024, (ctx, s) => {
    const c = s / 2;
    ctx.fillStyle = grout;
    ctx.fillRect(0, 0, s, s);
    const ringW = c / rings;
    for (let r = 0; r < rings; r++) {
      const inner = r * ringW + 2, outer = (r + 1) * ringW - 2;
      const count = Math.max(6, Math.round((2 * Math.PI * (r + 0.5) * ringW) / ringW / 1.1));
      for (let k = 0; k < count; k++) {
        const a0 = (k / count) * Math.PI * 2 + 0.01, a1 = ((k + 1) / count) * Math.PI * 2 - 0.01;
        ctx.beginPath();
        ctx.arc(c, c, outer, a0, a1);
        ctx.arc(c, c, Math.max(inner, 0), a1, a0, true);
        ctx.closePath();
        ctx.fillStyle = shade(base, range(-0.06, 0.03));
        ctx.fill();
      }
    }
  }, { repeat: 1 });
  texture.userData.bump = bump;
  return texture;
}

// Belt surface: dark with cross stripes (scrolling the offset makes it move)
export function beltTexture() {
  return canvasTexture(128, (ctx, s) => {
    ctx.fillStyle = "#3a4152";
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = "#525a6d";
    for (let i = 0; i < 4; i++) ctx.fillRect(0, i * (s / 4), s, s / 10);
  });
}

// Cardboard box
export function boxTexture() {
  return canvasTexture(128, (ctx, s) => {
    ctx.fillStyle = "#c99a62";
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = "#e3c590";
    ctx.fillRect(s * 0.42, 0, s * 0.16, s);
    ctx.strokeStyle = "#a97d4a";
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, s - 4, s - 4);
  }, { repeat: 1 });
}

// Signs and machine screens with text
export function labelTexture(text, { bg = "#fff8ec", fg = "#3a3530", width = 512, height = 128, font = 64, emoji = "" } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = fg;
  ctx.font = `600 ${font}px "PingFang SC", "Hiragino Sans GB", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji ? `${emoji} ${text}` : text, width / 2, height / 2 + 4);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/* ---------- Snow: patch materials so upward faces turn white as snow builds up ---------- */
// Soft blobs for cloud shadows drifting over the park (tiles seamlessly; main.js scrolls it and sets the strength)
function cloudTexture() {
  // Its own random sequence, so adding clouds doesn't move a single tree of the seeded park
  let seed = 7;
  const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const range = (a, b) => a + (b - a) * rand();
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 9; i++) {
      const x = rand() * s, y = rand() * s, r = range(28, 62);
      // Draw each blob in the 9 tiles around, so it wraps across the edges
      for (const dx of [-s, 0, s]) for (const dy of [-s, 0, s]) {
        for (let k = 0; k < 5; k++) {
          const cx = x + dx + range(-r, r) * 0.6, cy = y + dy + range(-r, r) * 0.4, cr = r * range(0.5, 0.9);
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
          g.addColorStop(0, "rgba(255,255,255,0.55)");
          g.addColorStop(1, "rgba(255,255,255,0)");
          ctx.fillStyle = g;
          ctx.fillRect(cx - cr, cy - cr, cr * 2, cr * 2);
        }
      }
    }
  }, { srgb: false });
}
export const weatherUniforms = { snow: { value: 0 }, wet: { value: 0 }, cloudMap: { value: typeof document === "undefined" ? null : cloudTexture() }, cloudOffset: { value: new THREE.Vector2() }, cloudStrength: { value: 0 } };
export function snowy(material, strength = 1) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSnow = weatherUniforms.snow;
    shader.uniforms.uSnowStrength = { value: strength };
    shader.uniforms.uCloudMap = weatherUniforms.cloudMap;
    shader.uniforms.uCloudOffset = weatherUniforms.cloudOffset;
    shader.uniforms.uCloudStrength = weatherUniforms.cloudStrength;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vSnowNormal;\nvarying vec2 vCloudUv;")
      .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\nvSnowNormal = normalize(mat3(modelMatrix) * objectNormal);\n#ifdef USE_INSTANCING\nvSnowNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);\n#endif")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvec4 cloudWorld = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\ncloudWorld = instanceMatrix * cloudWorld;\n#endif\ncloudWorld = modelMatrix * cloudWorld;\nvCloudUv = cloudWorld.xz * 0.011;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vSnowNormal;\nvarying vec2 vCloudUv;\nuniform float uSnow;\nuniform float uSnowStrength;\nuniform sampler2D uCloudMap;\nuniform vec2 uCloudOffset;\nuniform float uCloudStrength;")
      .replace("#include <color_fragment>", "#include <color_fragment>\nfloat snowMask = smoothstep(0.35, 0.8, vSnowNormal.y) * uSnow * uSnowStrength;\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.95, 1.0), snowMask);\nif (uCloudStrength > 0.001) diffuseColor.rgb *= 1.0 - texture2D(uCloudMap, vCloudUv + uCloudOffset).r * uCloudStrength;");
  };
  material.customProgramCacheKey = () => `snowy-${strength}`;
  return material;
}

export function mat(color, { rough = 0.82, metal = 0, snow = 1, ...rest } = {}) {
  return snowy(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...rest }), snow);
}

export function rbox(w, h, d, r = 0.12, segments = 3) {
  return new RoundedBoxGeometry(w, h, d, segments, Math.min(r, w / 2, h / 2, d / 2));
}

export function mesh(geometry, material, { x = 0, y = 0, z = 0, ry = 0, cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

// Triangular prism for gable roofs: width w, height h, depth d, ridge along z
export function gableGeometry(w, h, d) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2 });
  geometry.translate(0, 0, -d / 2);
  return geometry;
}

/* ---------- Building surfaces: shingles, bricks (light tones, tinted by the material colour) and rippling water ---------- */

// Roof shingles in rows, each row offset by half a shingle; rows run along the ridge
export function shingleTexture() {
  const rows = 8, cols = 6;
  const draw = (height) => (ctx, s) => {
    const rh = s / rows, cw = s / cols;
    ctx.fillStyle = height ? "#000" : "#8f8f8f";
    ctx.fillRect(0, 0, s, s);
    for (let r = 0; r < rows; r++) for (let c = -1; c <= cols; c++) {
      const x = c * cw + (r % 2 ? cw / 2 : 0), y = r * rh;
      const v = height ? 150 + Math.floor(rand() * 60) : 205 + Math.floor(rand() * 45);
      const g = ctx.createLinearGradient(0, y, 0, y + rh);
      g.addColorStop(0, `rgb(${Math.round(v * 0.82)},${Math.round(v * 0.82)},${Math.round(v * 0.82)})`);
      g.addColorStop(1, `rgb(${v},${v},${v})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(x + 2, y + 1, cw - 4, rh - 2, [0, 0, cw * 0.35, cw * 0.35]);
      ctx.fill();
    }
  };
  const texture = canvasTexture(512, draw(false), { repeat: 0.9 });
  texture.userData.bump = canvasTexture(512, draw(true), { repeat: 0.9, srgb: false });
  // The roof's UVs run across the slope; turn the rows to lie along the ridge
  for (const t of [texture, texture.userData.bump]) { t.center.set(0.5, 0.5); t.rotation = Math.PI / 2; }
  return texture;
}

// Bricks in running bond with pale mortar; repeat is set per wall
export function brickTexture() {
  const rows = 16, cols = 8;
  const draw = (height) => (ctx, s) => {
    const rh = s / rows, cw = s / cols;
    ctx.fillStyle = height ? "#000" : "#e9e4da";
    ctx.fillRect(0, 0, s, s);
    for (let r = 0; r < rows; r++) for (let c = -1; c <= cols; c++) {
      const v = height ? 170 + Math.floor(rand() * 70) : 175 + Math.floor(rand() * 60);
      ctx.fillStyle = height ? `rgb(${v},${v},${v})` : `rgb(${v},${Math.round(v * 0.93)},${Math.round(v * 0.88)})`;
      ctx.fillRect(c * cw + (r % 2 ? cw / 2 : 0) + 2, r * rh + 2, cw - 4, rh - 4);
    }
  };
  const texture = canvasTexture(512, draw(false));
  texture.userData.bump = canvasTexture(512, draw(true), { srgb: false });
  return texture;
}

// Normal map of gentle ripples for ponds (scroll its offset to make the water move)
export function rippleNormals(noise) {
  const size = 256, height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x / size) * Math.PI * 2, v = (y / size) * Math.PI * 2;
    // Sample on a torus so the map tiles seamlessly
    height[y * size + x] = noise.noise4d(Math.cos(u) * 1.6, Math.sin(u) * 1.6, Math.cos(v) * 1.6, Math.sin(v) * 1.6) * 0.6
      + noise.noise4d(Math.cos(u) * 4, Math.sin(u) * 4, Math.cos(v) * 4 + 7, Math.sin(v) * 4) * 0.25;
  }
  return canvasTexture(size, (ctx) => {
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const h = (dx, dy) => height[((y + dy + size) % size) * size + ((x + dx + size) % size)];
      const nx = (h(-1, 0) - h(1, 0)) * 3, ny = (h(0, -1) - h(0, 1)) * 3, l = Math.hypot(nx, ny, 1);
      const i = (y * size + x) * 4;
      img.data[i] = ((nx / l) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / l) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, { repeat: 2.5, srgb: false });
}
