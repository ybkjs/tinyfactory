// Alerts: only real changes are sent, grouped, rate-limited; each chat app gets its own message shape
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { test } from "node:test";
import { buildRequest, createAlerts, describeTarget, formatMessage, kindOf, sendTest } from "../src/alerts.mjs";

const state = (statuses) => ({ factories: [{ name: "Shop", lines: Object.entries(statuses).map(([id, status]) => ({ id, name: id, status, note: status === "warn" ? { key: "failing", n: 3 } : null })) }] });

test("alerts: nothing at startup, a change needs two scans, recovery is sent, several changes go out together", async () => {
  const sent = [];
  let clock = 0;
  const alerts = createAlerts({ targets: [{ url: "https://hooks.slack.com/services/x" }], title: "Mine", lang: "en", send: async (r) => (sent.push(r), { ok: true }), cooldown: 30000, now: () => clock });
  await alerts.check(state({ a: "warn", b: "scheduled", c: "scheduled" }));
  assert.equal(sent.length, 0, "warnings already there at startup are not sent");
  clock += 60000; await alerts.check(state({ a: "warn", b: "warn", c: "warn" }));
  assert.equal(sent.length, 0, "one scan isn't enough");
  clock += 60000; await alerts.check(state({ a: "warn", b: "warn", c: "warn" }));
  assert.equal(sent.length, 1);
  assert.match(sent[0].body.text, /🏭 Mine\n🔴 b · Shop: failed 3× in a row\n🔴 c · Shop: failed 3× in a row/);
  clock += 60000; await alerts.check(state({ a: "scheduled", b: "warn", c: "warn" }));
  clock += 60000; await alerts.check(state({ a: "scheduled", b: "warn", c: "warn" }));
  assert.equal(sent.length, 2);
  assert.match(sent[1].body.text, /🟢 a · Shop: back to normal/, "a was known to be failing, so its recovery is news");
  // A flap shorter than two scans sends nothing
  clock += 60000; await alerts.check(state({ a: "warn", b: "warn", c: "warn" }));
  clock += 60000; await alerts.check(state({ a: "scheduled", b: "warn", c: "warn" }));
  clock += 60000; await alerts.check(state({ a: "scheduled", b: "warn", c: "warn" }));
  assert.equal(sent.length, 2);
});

test("alerts: changes inside the cooldown wait and go out together", async () => {
  const sent = [];
  let clock = 0;
  const alerts = createAlerts({ targets: [{ url: "https://example.com/hook" }], send: async (r) => (sent.push(r), { ok: true }), cooldown: 30000, now: () => clock });
  await alerts.check(state({ a: "idle", b: "idle" }));
  clock = 1000; await alerts.check(state({ a: "warn", b: "idle" }));
  clock = 2000; await alerts.check(state({ a: "warn", b: "idle" }));
  assert.equal(sent.length, 1);
  clock = 3000; await alerts.check(state({ a: "warn", b: "warn" }));
  clock = 4000; await alerts.check(state({ a: "warn", b: "warn" }));
  assert.equal(sent.length, 1, "still cooling down");
  assert.equal(alerts.pending, 1);
  clock = 40000; await alerts.check(state({ a: "warn", b: "warn" }));
  assert.equal(sent.length, 2);
  assert.equal(sent[1].body.changes[0].line, "b");
  assert.equal(sent[1].body.source, "tinyfactory");
});

test("alerts: message shapes and signatures for each chat app", () => {
  const at = 1792627200000;
  assert.equal(kindOf({ url: "https://open.feishu.cn/open-apis/bot/v2/hook/abc" }), "feishu");
  assert.equal(kindOf({ url: "https://oapi.dingtalk.com/robot/send?access_token=x" }), "dingtalk");
  assert.equal(kindOf({ url: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=x" }), "wecom");
  assert.equal(kindOf({ url: "https://discord.com/api/webhooks/1/x" }), "discord");
  assert.equal(kindOf({ url: "https://example.com/x", kind: "slack" }), "slack");
  const feishu = buildRequest({ url: "https://open.feishu.cn/open-apis/bot/v2/hook/abc", secret: "s3" }, "hi", [], at);
  assert.equal(feishu.body.msg_type, "text");
  assert.equal(feishu.body.timestamp, "1792627200");
  assert.equal(feishu.body.sign, createHmac("sha256", "1792627200\ns3").update("").digest("base64"));
  const ding = buildRequest({ url: "https://oapi.dingtalk.com/robot/send?access_token=x", secret: "s3" }, "hi", [], at);
  assert.match(ding.url, /\?access_token=x&timestamp=1792627200000&sign=/);
  assert.equal(decodeURIComponent(ding.url.split("sign=")[1]), createHmac("sha256", "s3").update(`${at}\ns3`).digest("base64"));
  assert.deepEqual(buildRequest({ url: "https://qyapi.weixin.qq.com/x" }, "hi").body, { msgtype: "text", text: { content: "hi" } });
  assert.deepEqual(buildRequest({ url: "https://discord.com/api/webhooks/1/x" }, "hi").body, { content: "hi" });
  // The token in the URL path never shows in descriptions
  assert.equal(describeTarget({ url: "https://open.feishu.cn/open-apis/bot/v2/hook/secret-token", secret: "x" }), "feishu · open.feishu.cn (signed)");
  assert.match(formatMessage(Array.from({ length: 18 }, (_, i) => ({ kind: "failing", name: `l${i}`, note: "x" })), { lang: "zh" }), /……还有 3 条/);
});

test("alerts: notify-test posts to a real endpoint and reads chat-app error codes", async () => {
  const got = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c)).on("end", () => {
      got.push(JSON.parse(body));
      res.setHeader("content-type", "application/json");
      res.end(req.url.includes("bad") ? '{"code":19021,"msg":"sign match fail"}' : '{"code":0}');
    });
  }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const results = await sendTest([{ url: `${base}/ok`, kind: "feishu" }, { url: `${base}/bad`, kind: "feishu" }], { lang: "en" });
    assert.deepEqual(results.map((r) => r.ok), [true, false]);
    assert.equal(results[1].error, "sign match fail");
    assert.match(got[0].content.text, /alerts work/);
  } finally { server.close(); }
});
