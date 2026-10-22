// The page's pure parts: layout geometry and time wording
import assert from "node:assert/strict";
import { test } from "node:test";
import { computeLayout } from "../web/layout.js";
import { agoText, pastText, setLang, whenText } from "../web/i18n.js";
import { DEMO_GROUPS } from "../src/demo.mjs";
import { assemble } from "../src/assemble.mjs";

test("layout: factories stacked without overlap, agents on the right, finite bounds", () => {
  const state = assemble(DEMO_GROUPS.map((g) => ({ ...g, runs: [] })));
  const layout = computeLayout(state);
  assert.equal(layout.factories.length, 3);
  const sorted = [...layout.factories].sort((a, b) => a.z - b.z);
  for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i].z - sorted[i].d / 2 >= sorted[i - 1].z + sorted[i - 1].d / 2, "factories overlap");
  for (const a of layout.agents) assert.ok(a.x > layout.hub.radius, "agent left of the hub");
  for (const v of Object.values(layout.bounds)) assert.ok(Number.isFinite(v));
  // An empty machine still gets a park
  assert.ok(Number.isFinite(computeLayout({ factories: [], agents: [] }).bounds.minX));
});

test("time wording", () => {
  setLang("zh");
  const now = new Date(2026, 9, 22, 10, 30).getTime();
  assert.equal(agoText(now - 20 * 1000, now), "刚刚");
  assert.equal(agoText(now - 5 * 60000, now), "5 分钟前");
  assert.equal(agoText(now - 3 * 3600000, now), "3 小时前");
  assert.equal(pastText(new Date(2026, 9, 22, 9, 5).getTime(), now), "09:05");
  assert.equal(pastText(new Date(2026, 9, 21, 23, 0).getTime(), now), "昨天 23:00");
  assert.equal(whenText(new Date(2026, 9, 23, 4, 30).getTime(), now), "明天 04:30");
  setLang("en");
  assert.equal(agoText(now - 2 * 86400000, now), "2 d ago");
  setLang("zh");
});
