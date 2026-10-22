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
    ctx.fillStyle = "#6f9a3c";
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 260; i++) {
      const x = rand() * s, y = rand() * s, r = range(40, 140);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const tone = pick(["#7fa846", "#668f36", "#86ad4c", "#5f8a33", "#79a242"]);
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

// Square paving for factory yards: each tile slightly different, with grout
export function tileTexture(base = "#d9c3a5", { tiles = 8, grout = "#b9a68c" } = {}) {
  return canvasTexture(512, (ctx, s) => {
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
}

// Round plaza: rings of stone tiles (CylinderGeometry cap UVs map to a disc)
export function radialTileTexture(base = "#e3e1dc", { rings = 9, grout = "#bdbab3" } = {}) {
  return canvasTexture(1024, (ctx, s) => {
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
}

// Belt surface: dark with cross stripes (scrolling the offset makes it move)
export function beltTexture() {
  return canvasTexture(128, (ctx, s) => {
    ctx.fillStyle = "#3d4250";
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = "#4b5161";
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
export const weatherUniforms = { snow: { value: 0 }, wet: { value: 0 } };
export function snowy(material, strength = 1) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSnow = weatherUniforms.snow;
    shader.uniforms.uSnowStrength = { value: strength };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vSnowNormal;")
      .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\nvSnowNormal = normalize(mat3(modelMatrix) * objectNormal);\n#ifdef USE_INSTANCING\nvSnowNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);\n#endif");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vSnowNormal;\nuniform float uSnow;\nuniform float uSnowStrength;")
      .replace("#include <color_fragment>", "#include <color_fragment>\nfloat snowMask = smoothstep(0.35, 0.8, vSnowNormal.y) * uSnow * uSnowStrength;\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.95, 1.0), snowMask);");
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
