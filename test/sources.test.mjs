// Sources read from $HOME, so point HOME at a fixture copy before importing them
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const home = mkdtempSync(`${tmpdir()}/tinyfactory-home-`);
cpSync(fileURLToPath(new URL("./fixtures/home", import.meta.url)), home, { recursive: true });
process.env.HOME = home;
const claude = await import("../src/sources/claude.mjs");
const codex = await import("../src/sources/codex.mjs");
const openclaw = await import("../src/sources/openclaw.mjs");
const webhook = await import("../src/sources/webhook.mjs");
const { createCollector } = await import("../src/collect.mjs");
const { doctor } = await import("../src/doctor.mjs");
after(() => rmSync(home, { recursive: true, force: true }));

test("claude: busy and waiting sessions", async () => {
  const ctx = { config: {}, memory: {} };
  const g = await claude.collect(ctx);
  assert.equal(g.lines[0].status, "running");
  assert.deepEqual(g.lines[0].note, { key: "waiting", n: 1 });
  assert.equal(g.agent.busy, 1);
  // A finished session counts as a run of the line
  assert.equal(g.runs.length, 1);
  assert.equal(g.runs[0].line, "claude:sessions");
});

test("openclaw: failing and paused jobs", async () => {
  const g = await openclaw.collect({ config: {}, memory: {} });
  assert.deepEqual(g.lines.map((l) => [l.name, l.status]), [["Morning digest", "warn"], ["Old job", "paused"]]);
  assert.deepEqual(g.lines[0].note, { key: "failing", n: 12, reason: "auth" });
  // The run log fills in the history; the latest run (also in jobs.json) appears once
  const ids = g.runs.map((r) => r.id);
  assert.equal(new Set(ids).size, 3);
  assert.deepEqual(g.runs.filter((r) => r.id === "openclaw:j1:1792285860900").map((r) => r.ok), [true]);
});

test("codex: automations from toml even without the app database", async () => {
  const g = await codex.collect({ config: {}, memory: {} });
  assert.equal(g.lines.length, 1);
  assert.equal(g.lines[0].name, "Daily news");
  assert.deepEqual(g.lines[0].schedule, { type: "rrule", value: "FREQ=DAILY;BYHOUR=8;BYMINUTE=0" });
});

test("webhook: reports become lines, finished runs become parcels", async () => {
  const collector = createCollector({ sources: [webhook] });
  webhook.record({ line: "backup", name: "Nightly backup", status: "start" });
  let state = await collector.refresh();
  assert.equal(state.factories[0].lines[0].status, "running");
  assert.equal(state.events.length, 0);
  webhook.record({ line: "backup", status: "done" });
  state = await collector.refresh();
  assert.equal(state.factories[0].lines[0].status, "idle");
  assert.equal(state.factories[0].lines[0].today, 1);
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].agent, "custom");
  assert.throws(() => webhook.record({ status: "done" }), /line is required/);
});

test("doctor: says what each source found and why not, fails on a broken config", async () => {
  const lines = [];
  const code = await doctor({ configPath: `${home}/missing.json`, version: "test", out: (l) => lines.push(l) });
  const text = lines.join("\n");
  assert.equal(code, 0);
  assert.match(text, /✓ claude +1 line/);
  assert.match(text, /✓ codex +1 line/);
  assert.match(text, /✓ openclaw +2 lines/);
  assert.match(text, /remote +nothing — no "remote" machines/);
  assert.match(text, /On the map: \d+ factories/);
  const { writeFileSync } = await import("node:fs");
  writeFileSync(`${home}/broken.json`, '{ "title": }');
  const out = [];
  assert.equal(await doctor({ configPath: `${home}/broken.json`, version: "test", out: (l) => out.push(l) }), 1);
  assert.match(out.join("\n"), /isn't valid JSON at line 1/);
});
