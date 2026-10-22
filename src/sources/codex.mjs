// Codex (ChatGPT desktop) automations: ~/.codex/automations/*/automation.toml + run history in ~/.codex/sqlite/codex-dev.db
import { home, listDir, mtime, ms, parseFlatToml, readText, sqlite, startOfToday } from "../util.mjs";

export const id = "codex";
const DAY = 86400000;

export async function collect() {
  const dir = home(".codex/automations");
  const defs = new Map();
  for (const name of listDir(dir)) {
    const text = readText(`${dir}/${name}/automation.toml`);
    if (!text) continue;
    const t = parseFlatToml(text);
    defs.set(t.id || name, { id: t.id || name, name: t.name || name, status: t.status || "ACTIVE", rrule: t.rrule || "" });
  }
  const db = home(".codex/sqlite/codex-dev.db");
  const rows = (await sqlite(db, "select id, name, status, rrule, next_run_at, last_run_at from automations")) || [];
  for (const r of rows) defs.set(r.id, { ...defs.get(r.id), id: r.id, name: r.name, status: r.status, rrule: r.rrule, next: ms(r.next_run_at), last: ms(r.last_run_at) });
  if (!defs.size) return null;

  const runRows = (await sqlite(db, "select thread_id, automation_id, status, created_at from automation_runs order by created_at desc limit 300")) || [];
  const now = Date.now(), today = startOfToday();
  const lines = [...defs.values()].map((d) => {
    const mine = runRows.filter((r) => r.automation_id === d.id);
    const unread = mine.filter((r) => r.status === "PENDING_REVIEW").length;
    const last = Math.max(d.last || 0, ...mine.map((r) => ms(r.created_at)));
    let status = "scheduled", note = null;
    if (d.status === "PAUSED" || d.status === "DELETED") status = "paused";
    else if (d.next && d.next < now - DAY) { status = "warn"; note = { key: "stalled", since: d.next }; }
    else if (unread >= 3) { status = "warn"; note = { key: "unread", n: unread }; }
    // Heartbeat automations post into one thread instead of creating runs, so last_run_at counts too
    const todayRuns = Math.max(mine.filter((r) => ms(r.created_at) >= today).length, last >= today ? 1 : 0);
    return { id: `codex:${d.id}`, name: d.name, icon: "📰", schedule: { type: "rrule", value: d.rrule }, status, note, next: status === "scheduled" ? d.next : 0, last, today: todayRuns };
  });
  const runs = runRows.map((r) => ({ id: `codex:${r.thread_id}`, line: `codex:${r.automation_id}`, at: ms(r.created_at), ok: r.status !== "FAILED" }));

  // Is Codex busy right now? A session file written in the last 90 seconds means yes.
  const d = new Date();
  const dayDir = home(".codex/sessions", String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0"));
  const sessions = listDir(dayDir);
  const busy = sessions.filter((f) => now - mtime(`${dayDir}/${f}`) < 90000).length;
  return {
    factory: { id: "codex", name: { zh: "Codex 自动化", en: "Codex automations" }, building: "studio", color: "#6b6cf6" },
    agent: { id: "codex", kind: "codex", name: "Codex", sub: { zh: "ChatGPT 桌面版", en: "ChatGPT desktop" }, color: "#6b6cf6", status: busy ? "running" : "idle", busy, done: lines.reduce((s, l) => s + l.today, 0) + sessions.length },
    lines,
    runs
  };
}
