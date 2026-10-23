// Builds the online demo for GitHub Pages: node scripts/build-site.mjs [outdir=site]
// The page from web/, the pure modules it shares with the server (assemble, demo data, cities), and only the parts of three.js it imports.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT = resolve(ROOT, process.argv[2] || "site");
const SITE_URL = process.env.SITE_URL || "https://ybkjs.github.io/tinyfactory/";
const THREE = dirname(dirname(createRequire(import.meta.url).resolve("three")));

rmSync(OUT, { recursive: true, force: true });
cpSync(join(ROOT, "web"), OUT, { recursive: true });

// Shared modules, renamed to .js so any static host serves them as JavaScript
mkdirSync(join(OUT, "src"));
for (const name of ["assemble", "demo", "cities"]) {
  const code = readFileSync(join(ROOT, "src", `${name}.mjs`), "utf8");
  if (/from "node:/.test(code)) throw new Error(`src/${name}.mjs imports a Node module and can't run in the page`);
  writeFileSync(join(OUT, "src", `${name}.js`), code.replace(/from "\.\/([\w-]+)\.mjs"/g, 'from "./$1.js"'));
}

// three.js: the core build, then every addon the page imports and whatever those import in turn
const copy = (rel) => { mkdirSync(dirname(join(OUT, "vendor/three", rel)), { recursive: true }); cpSync(join(THREE, rel), join(OUT, "vendor/three", rel)); };
copy("build/three.module.min.js");   // half the size of the readable build
copy("LICENSE");
const queue = [];
for (const file of ["main.js", "bake.js", "util.js", "world.js", "structures.js", "flow.js"]) {
  for (const [, path] of readFileSync(join(ROOT, "web", file), "utf8").matchAll(/from "three\/addons\/([^"]+)"/g)) queue.push(`examples/jsm/${path}`);
}
const done = new Set();
while (queue.length) {
  const rel = queue.pop();
  if (done.has(rel)) continue;
  done.add(rel);
  copy(rel);
  for (const [, dep] of readFileSync(join(THREE, rel), "utf8").matchAll(/from\s+['"](\.{1,2}\/[^'"]+)['"]/g)) queue.push(join(dirname(rel), dep));
}

// The page: demo flag, a title and link previews for people sharing it
const description = "Watch your AI agent automations run as a cozy 3D miniature factory. 把 Claude Code、Codex、cron 里的自动化变成一座 3D 微缩工厂。";
const head = [
  "<title>tinyfactory · online demo</title>",
  `<meta name="description" content="${description}">`,
  '<meta property="og:title" content="tinyfactory">',
  `<meta property="og:description" content="${description}">`,
  `<meta property="og:image" content="${SITE_URL}og.jpg">`,
  `<meta property="og:url" content="${SITE_URL}">`,
  '<meta name="twitter:card" content="summary_large_image">',
  "<script>window.TINYFACTORY_STATIC = true</script>"
].map((l) => `  ${l}`).join("\n");
const page = readFileSync(join(OUT, "index.html"), "utf8").replace("  <title>tinyfactory</title>", head);
writeFileSync(join(OUT, "index.html"), page);
if (existsSync(join(ROOT, "docs/screenshot.jpg"))) cpSync(join(ROOT, "docs/screenshot.jpg"), join(OUT, "og.jpg"));
writeFileSync(join(OUT, ".nojekyll"), "");
console.log(`built ${OUT} (${done.size} three.js addon files)`);
