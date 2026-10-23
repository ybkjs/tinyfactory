// Alerts: when a line starts to need attention, or gets better again, post a message to a chat bot or any webhook.
//   "alerts": [{ "url": "https://open.feishu.cn/open-apis/bot/v2/hook/…", "secret": "…" }]
// Only changes are sent: a line has to stay in its new state for two scans, warnings already there at startup
// aren't sent (only their recovery), several changes at once go out as one message, and each target hears from
// tinyfactory at most every 30 seconds. Nothing is sent unless alerts are configured.
import { createHmac } from "node:crypto";
import { lineStatus, nameOf, setLang } from "../web/i18n.js";

const KINDS = [
  ["feishu", /(^|\.)(feishu\.cn|larksuite\.com)$/],
  ["dingtalk", /(^|\.)dingtalk\.com$/],
  ["wecom", /^qyapi\.weixin\.qq\.com$/],
  ["slack", /^hooks\.slack\.com$/],
  ["discord", /(^|\.)discord(app)?\.com$/]
];
export function kindOf(target) {
  if (target.kind) return target.kind;
  try { const host = new URL(target.url).hostname; return KINDS.find(([, re]) => re.test(host))?.[0] || "generic"; } catch { return "generic"; }
}

// "feishu · open.feishu.cn" — never the path, which holds the bot's token
export function describeTarget(target) {
  let host = "?";
  try { host = new URL(target.url).hostname; } catch { /* shown as ? */ }
  return `${target.name ? `${target.name} · ` : ""}${kindOf(target)} · ${host}${target.secret ? " (signed)" : ""}`;
}

// The HTTP request for one target: each chat app wants its own shape, Feishu and DingTalk can be signed
export function buildRequest(target, text, changes = [], at = Date.now()) {
  const kind = kindOf(target);
  let url = target.url, body;
  if (kind === "feishu") {
    body = { msg_type: "text", content: { text } };
    if (target.secret) {
      const timestamp = String(Math.floor(at / 1000));
      body = { timestamp, sign: createHmac("sha256", `${timestamp}\n${target.secret}`).update("").digest("base64"), ...body };
    }
  } else if (kind === "dingtalk") {
    body = { msgtype: "text", text: { content: text } };
    if (target.secret) {
      const sign = createHmac("sha256", target.secret).update(`${at}\n${target.secret}`).digest("base64");
      url += `${url.includes("?") ? "&" : "?"}timestamp=${at}&sign=${encodeURIComponent(sign)}`;
    }
  } else if (kind === "wecom") body = { msgtype: "text", text: { content: text } };
  else if (kind === "slack") body = { text };
  else if (kind === "discord") body = { content: text };
  else body = { source: "tinyfactory", text, changes };
  return { url, body };
}

async function post({ url, body }) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
  const reply = await res.text();
  // Chat apps answer 200 with an error code in the body
  let error = null;
  try { const j = JSON.parse(reply); if (j.code && j.code !== 0) error = j.msg || `code ${j.code}`; else if (j.errcode && j.errcode !== 0) error = j.errmsg || `errcode ${j.errcode}`; } catch { /* not JSON */ }
  if (!res.ok) error = `HTTP ${res.status}${reply ? `: ${reply.slice(0, 120)}` : ""}`;
  return { ok: !error, status: res.status, error };
}

const WORDS = {
  zh: { failing: "需要留意", recovered: "恢复正常", more: (n) => `……还有 ${n} 条`, test: "tinyfactory 测试消息：告警通道是通的 ✅" },
  en: { failing: "needs attention", recovered: "back to normal", more: (n) => `…and ${n} more`, test: "tinyfactory test message: alerts work ✅" }
};

export function formatMessage(changes, { title = "", lang = "zh" } = {}) {
  setLang(lang);
  const w = WORDS[lang] || WORDS.zh;
  const shown = changes.slice(0, 15).map((c) => {
    const where = c.factory ? ` · ${c.factory}` : "";
    return c.kind === "failing" ? `🔴 ${c.name}${where}：${c.note || w.failing}` : `🟢 ${c.name}${where}：${w.recovered}`;
  });
  if (changes.length > 15) shown.push(w.more(changes.length - 15));
  return `🏭 ${title || "tinyfactory"}\n${shown.join("\n")}`.replace(/：/g, lang === "zh" ? "：" : ": ");
}

export function createAlerts({ targets = [], title = "", lang = "zh", send = post, log = () => {}, cooldown = 30000, now = () => Date.now() } = {}) {
  const lines = new Map();           // line id → { warn, streak, alerted }
  const pending = [];
  let primed = false, last = -Infinity;   // the first message never waits

  async function flush() {
    if (!pending.length || now() - last < cooldown) return;
    const changes = pending.splice(0);
    last = now();
    const text = formatMessage(changes, { title, lang });
    await Promise.all(targets.map(async (target) => {
      try {
        const r = await send(buildRequest(target, text, changes, now()));
        if (!r.ok) log(`alert to ${describeTarget(target)} failed: ${r.error}`);
      } catch (e) { log(`alert to ${describeTarget(target)} failed: ${e.message}`); }
    }));
  }

  // Called after every scan with the collector's state
  async function check(state) {
    if (!targets.length || !state) return;
    setLang(lang);
    for (const f of state.factories || []) {
      for (const line of f.lines) {
        const warn = line.status === "warn";
        let s = lines.get(line.id);
        // First look: what's already wrong is known (its recovery will be sent), nothing is sent now
        // A line that shows up later (a remote coming back, say) waits two scans like any other change
        if (!s) { s = { warn, streak: primed ? 0 : 2, alerted: !primed && warn }; lines.set(line.id, s); if (!primed) continue; }
        s.streak = s.warn === warn ? s.streak + 1 : 1;
        s.warn = warn;
        const change = { line: line.id, name: nameOf(line.name), factory: nameOf(f.name), status: line.status, at: now() };
        if (warn && !s.alerted && s.streak >= 2) { s.alerted = true; pending.push({ ...change, kind: "failing", note: lineStatus(line) + (line.note?.msg ? (lang === "zh" ? `（${line.note.msg}）` : ` (${line.note.msg})`) : "") }); }
        else if (!warn && s.alerted && s.streak >= 2) { s.alerted = false; pending.push({ ...change, kind: "recovered" }); }
      }
    }
    primed = true;
    await flush();
  }

  return { check, flush, get pending() { return pending.length; } };
}

// tinyfactory notify-test: one message to every target, with what each answered
export async function sendTest(targets, { lang = "zh", send = post } = {}) {
  const text = (WORDS[lang] || WORDS.zh).test;
  return Promise.all(targets.map(async (target) => {
    try { return { target: describeTarget(target), ...(await send(buildRequest(target, text, [], Date.now()))) }; } catch (e) { return { target: describeTarget(target), ok: false, error: e.message }; }
  }));
}
