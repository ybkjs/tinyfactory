// Plugins: files in a folder or listed in the config load as sources; broken ones are reported, not fatal
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { loadPlugins } from "../src/plugins.mjs";

const root = mkdtempSync(join(tmpdir(), "tinyfactory-plugins-"));
after(() => rmSync(root, { recursive: true, force: true }));
const dir = join(root, "sources");
mkdirSync(dir);
writeFileSync(join(dir, "good.mjs"), 'export const id = "hello";\nexport async function collect() { return { factory: { id: "hello", name: "Hello" }, agent: null, lines: [{ id: "hello:one", name: "One", status: "idle" }], runs: [] }; }\n');
writeFileSync(join(dir, "no-collect.mjs"), 'export const id = "nothing";\n');
writeFileSync(join(dir, "broken.mjs"), "export const id = ;\n");
writeFileSync(join(dir, "taken.mjs"), 'export const id = "cron";\nexport async function collect() { return null; }\n');
writeFileSync(join(dir, "notes.txt"), "not a source");
writeFileSync(join(root, "extra.mjs"), 'export const id = "extra";\nexport async function collect() { return null; }\n');

test("plugins: the folder and config.sources load; broken, incomplete and clashing files are reported", async () => {
  const problems = [];
  const plugins = await loadPlugins({ config: { sources: ["./extra.mjs"] }, configPath: join(root, "config.json"), dir, taken: ["cron"], log: (m) => problems.push(m) });
  assert.deepEqual(plugins.map((p) => p.id).sort(), ["extra", "hello"]);
  assert.equal(problems.length, 3);
  assert.ok(problems.some((p) => p.includes("already taken")));
  assert.ok(problems.some((p) => p.includes('exports "id" and "collect(ctx)"')));
  const group = await plugins.find((p) => p.id === "hello").collect({ config: {}, memory: {} });
  assert.equal(group.lines[0].id, "hello:one");
  assert.deepEqual(await loadPlugins({ dir: join(root, "missing") }), []);
});

test("example plugin: heartbeat files go red when overdue", async () => {
  const fresh = join(root, "fresh.log"), stale = join(root, "stale.log");
  writeFileSync(fresh, "ok");
  writeFileSync(stale, "ok");
  const old = (Date.now() - 3 * 86400000) / 1000;
  utimesSync(stale, old, old);
  const heartbeat = await import("../examples/plugins/heartbeat-files.mjs");
  const g = await heartbeat.collect({ config: { plugins: { heartbeat: { fresh: { file: fresh, every: 86400 }, stale: { file: stale, every: 86400 }, gone: { file: join(root, "nope") } } } } });
  const status = Object.fromEntries(g.lines.map((l) => [l.id, l.status]));
  assert.deepEqual(status, { "heartbeat:fresh": "scheduled", "heartbeat:stale": "warn", "heartbeat:gone": "warn" });
  assert.equal(g.runs.length, 2);
});
