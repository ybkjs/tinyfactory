// The online demo: the build has everything the page imports, and the shared modules run without Node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = mkdtempSync(join(tmpdir(), "tinyfactory-site-"));
after(() => rmSync(out, { recursive: true, force: true }));
execFileSync(process.execPath, [join(root, "scripts/build-site.mjs"), out], { stdio: "ignore" });

test("site: page, demo flag, link preview and every three.js import", () => {
  const page = readFileSync(join(out, "index.html"), "utf8");
  assert.match(page, /window\.TINYFACTORY_STATIC = true/);
  assert.match(page, /og:image/);
  assert.ok(existsSync(join(out, "vendor/three/build/three.module.min.js")));
  for (const file of ["main.js", "bake.js", "util.js", "world.js"]) {
    for (const [, path] of readFileSync(join(out, file), "utf8").matchAll(/from "three\/addons\/([^"]+)"/g)) assert.ok(existsSync(join(out, "vendor/three/examples/jsm", path)), path);
  }
  assert.doesNotMatch(readFileSync(join(out, "src/assemble.js"), "utf8"), /\.mjs"/);
});

test("site: the demo factory runs from the built modules alone", async () => {
  writeFileSync(join(out, "package.json"), '{ "type": "module" }');
  const { createCollector } = await import(pathToFileURL(join(out, "src/assemble.js")).href);
  const { demoSource } = await import(pathToFileURL(join(out, "src/demo.js")).href);
  const { CITIES } = await import(pathToFileURL(join(out, "src/cities.js")).href);
  const state = await createCollector({ sources: [demoSource()] }).refresh();
  assert.equal(state.factories.length, 3);
  assert.ok(state.agents.some((a) => a.id === "deepseek"));
  assert.ok(CITIES.length > 10);
});

test("collector: remembers which sources found something (for the empty screen)", async () => {
  const { createCollector } = await import("../src/assemble.mjs");
  const empty = { id: "a", collect: async () => null };
  const full = { id: "b", collect: async () => ({ factory: { id: "f", name: "F" }, agent: null, lines: [{ id: "b:1", name: "one", status: "idle" }], runs: [] }) };
  const state = await createCollector({ sources: [empty, full] }).refresh();
  assert.deepEqual(state.scanned, [{ id: "a", found: false }, { id: "b", found: true }]);
});

test("collector: keeps the last runs of each line, history included", async () => {
  const { createCollector } = await import("../src/assemble.mjs");
  const now = Date.now();
  let runs = Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, line: "x:1", at: now - (30 - i) * 60000, ok: i !== 28 }));
  const source = { id: "x", collect: async () => ({ factory: { id: "f", name: "F" }, agent: null, lines: [{ id: "x:1", name: "one", status: "idle" }], runs }) };
  const collector = createCollector({ sources: [source] });
  let state = await collector.refresh();
  assert.equal(state.history["x:1"].length, 20);
  assert.equal(state.history["x:1"].at(-2).ok, false);
  assert.equal(state.events.length, 0);
  runs = [{ id: "new", line: "x:1", at: now, ok: true }];
  state = await collector.refresh();
  assert.equal(state.history["x:1"].at(-1).at, now);
  assert.equal(state.events.length, 1);
});
