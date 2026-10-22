// Anything else reports in over HTTP:
//   curl -X POST localhost:4520/api/event -H 'content-type: application/json' -d '{"line":"backup","status":"done"}'
// Fields: line (required), name, factory, agent, status = start | done | fail, msg. Lines are kept in ~/.tinyfactory/webhook.json.
import { mkdirSync, writeFileSync } from "node:fs";
import { home, readJson, startOfToday } from "../util.mjs";

export const id = "webhook";
const FILE = home(".tinyfactory/webhook.json");
const AGENT_KINDS = new Set(["claude", "codex", "openclaw", "system", "deepseek", "custom"]);
let store = null;

function load() {
  if (!store) store = readJson(FILE) || { lines: {}, runs: [] };
  return store;
}
function save() {
  try { mkdirSync(home(".tinyfactory"), { recursive: true }); writeFileSync(FILE, JSON.stringify(store)); } catch { /* read-only home: keep in memory */ }
}

export function record(event) {
  const s = load();
  const key = String(event.line || "").trim().slice(0, 64);
  if (!key) throw new Error("line is required");
  const status = ["start", "done", "fail"].includes(event.status) ? event.status : "done";
  const now = Date.now();
  const line = s.lines[key] || { id: `webhook:${key}`, name: key, factory: "Webhook", agent: "custom", today: 0, day: 0 };
  if (event.name) line.name = String(event.name).slice(0, 40);
  if (event.factory) line.factory = String(event.factory).slice(0, 40);
  if (event.agent) line.agent = String(event.agent).slice(0, 24);
  if (line.day !== startOfToday()) { line.day = startOfToday(); line.today = 0; }
  line.state = status;
  line.msg = event.msg ? String(event.msg).slice(0, 200) : "";
  line.at = now;
  if (status !== "start") {
    line.today += 1;
    s.runs.push({ id: `webhook:${key}:${now}`, line: line.id, at: now, ok: status === "done" });
    s.runs = s.runs.slice(-300);
  }
  s.lines[key] = line;
  save();
  return line;
}

export async function collect() {
  const s = load();
  const all = Object.values(s.lines);
  if (!all.length) return null;
  // One group per factory name used by the reports
  const groups = new Map();
  for (const l of all) {
    if (!groups.has(l.factory)) groups.set(l.factory, []);
    groups.get(l.factory).push(l);
  }
  return [...groups.entries()].map(([factory, lines], i) => {
    const agentId = AGENT_KINDS.has(lines[0].agent) ? lines[0].agent : "custom";
    return {
      factory: { id: `webhook:${factory}`, name: factory === "Webhook" ? { zh: "我的脚本", en: "My scripts" } : factory, building: ["home", "shop", "studio"][i % 3], color: "#c9a227" },
      // Agents are filled in from KNOWN_AGENTS by assemble(); only the busy flag comes from here
      agent: { id: agentId, kind: agentId, status: lines.some((l) => l.state === "start" && (AGENT_KINDS.has(l.agent) ? l.agent : "custom") === agentId) ? "running" : "idle" },
      lines: lines.map((l) => ({
        id: l.id, name: l.name, icon: "📦", schedule: { type: "webhook" }, agent: AGENT_KINDS.has(l.agent) ? l.agent : "custom",
        status: l.state === "start" ? "running" : l.state === "fail" ? "warn" : "idle",
        note: l.state === "fail" ? { key: "lastFailed", msg: l.msg } : null,
        last: l.at, today: l.day === startOfToday() ? l.today : 0
      })),
      runs: s.runs.filter((r) => lines.some((l) => l.id === r.line))
    };
  });
}
