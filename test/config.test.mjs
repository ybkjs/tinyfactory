// Config: a broken file says where, typos and wrong types come back as warnings, a missing file is fine
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { checkConfig, loadConfig } from "../src/config.mjs";

const dir = mkdtempSync(join(tmpdir(), "tinyfactory-config-"));
after(() => rmSync(dir, { recursive: true, force: true }));
const file = (name, text) => { const p = join(dir, name); writeFileSync(p, text); return p; };

test("config: a missing or empty file is an empty config", () => {
  assert.deepEqual(loadConfig(join(dir, "nope.json")), { config: {}, warnings: [], error: null, found: false });
  assert.equal(loadConfig(file("empty.json", "  \n")).error, null);
});

test("config: broken JSON reports the line and column", () => {
  const { error, config } = loadConfig(file("bad.json", '{\n  "title": "x",\n  "hide": ["a"]\n  "port": 4520\n}\n'));
  assert.match(error, /line 4, column 3/);
  assert.match(error, /\^/);
  assert.deepEqual(config, {});
});

test("config: mistakes V8 gives no position for still get a line and column", () => {
  for (const [text, line, column] of [['{ "title": }', 1, 12], ['{\n  "a": 1,\n}', 3, 1], ['{\n  "a": tru\n}', 2, 8], ['{ "a": "x" } extra', 1, 14], ["{\n  'a': 1\n}", 2, 3]]) {
    const { error } = loadConfig(file("v8.json", text));
    assert.match(error, new RegExp(`line ${line}, column ${column}`), `${JSON.stringify(text)} → ${error}`);
  }
});

test("config: typos and wrong types are warnings, the rest is kept", () => {
  const { config, warnings } = checkConfig({ title: "x", hidee: [], port: "4520", remote: [{ name: "s" }], hide: [3] });
  assert.equal(config.title, "x");
  assert.ok(warnings.some((w) => w.includes('did you mean "hide"')));
  assert.ok(warnings.some((w) => w.includes('"port" should be number')));
  assert.ok(warnings.some((w) => w.includes('remote[0] needs a "url"')));
  assert.ok(warnings.some((w) => w.includes("patterns")));
  assert.deepEqual(checkConfig({ city: { name: "Somewhere", lat: 1, lon: 2 }, lines: [{ id: "a" }] }).warnings, []);
  assert.equal(checkConfig([1, 2]).warnings.length, 1);
});
