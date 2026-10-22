// End-to-end: real server on a random port, webhook in, parcel out
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { after, test } from "node:test";

const home = mkdtempSync(`${tmpdir()}/tinyfactory-server-`);
process.env.HOME = home;
const webhook = await import("../src/sources/webhook.mjs");
const { createCollector } = await import("../src/collect.mjs");
const { startServer } = await import("../src/server.mjs");
const { resolveCity } = await import("../src/cities.mjs");

const collector = createCollector({ sources: [webhook] });
await collector.refresh();
const server = await startServer({ collector, port: 0, host: "127.0.0.1", token: "", info: { demo: false, city: resolveCity("london"), lang: "en", interval: 10 }, log: () => {} });
const base = `http://127.0.0.1:${server.address().port}`;
after(() => { server.close(); rmSync(home, { recursive: true, force: true }); });

test("serves the page and three.js", async () => {
  assert.match(await (await fetch(`${base}/`)).text(), /tinyfactory/);
  assert.equal((await fetch(`${base}/vendor/three/build/three.module.js`)).status, 200);
  assert.equal((await fetch(`${base}/../package.json`)).status, 404);
});

test("webhook → state → parcel event", async () => {
  const empty = await (await fetch(`${base}/api/state`)).json();
  assert.equal(empty.factories.length, 0);
  assert.equal(empty.city.id, "london");
  const ok = await fetch(`${base}/api/event`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ line: "deploy", name: "Deploy", factory: "Ops", agent: "codex", status: "done" }) });
  assert.equal(ok.status, 200);
  await collector.refresh();
  const state = await (await fetch(`${base}/api/state`)).json();
  assert.equal(state.factories[0].name, "Ops");
  assert.equal(state.agents[0].name, "Codex");
  assert.equal(state.events.length, 1);
  assert.equal((await fetch(`${base}/api/event`, { method: "POST", body: "{}" })).status, 400);
});

test("remote: another tinyfactory merged in, with prefixed ids, parcels and declared stand-ins", async () => {
  const remote = await import("../src/sources/remote.mjs");
  const declared = await import("../src/sources/declared.mjs");
  const config = {
    remote: [{ name: "box", url: base }],
    lines: [{ id: "deploy", name: "Deploy (declared)", factory: "Ops", live: "remote:box:webhook:deploy" }, { id: "later", name: "Not yet", factory: "Ops", agent: "server" }],
    assign: { "remote:box:*": "server" },
    agents: { server: { kind: "system", name: "Server" } }
  };
  const mac = createCollector({ config, sources: [remote, declared] });
  let view = await mac.refresh();
  const names = view.factories.flatMap((f) => f.lines.map((l) => `${l.id}=${l.status}`));
  assert.ok(names.includes("remote:box:webhook:deploy=idle"));
  assert.ok(names.includes("declared:later=idle"));
  assert.ok(!names.some((n) => n.startsWith("declared:deploy")));
  assert.deepEqual(view.agents.map((a) => a.id), ["server"]);
  await fetch(`${base}/api/event`, { method: "POST", body: JSON.stringify({ line: "deploy", factory: "Ops", status: "done" }) });
  await collector.refresh();
  view = await mac.refresh();
  assert.equal(view.events.length, 1);
  assert.equal(view.events[0].line, "remote:box:webhook:deploy");
  assert.equal(view.events[0].agent, "server");
});
