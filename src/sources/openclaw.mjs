// OpenClaw cron jobs: ~/.openclaw/cron/jobs.json, with each job's run log in ~/.openclaw/cron/runs/<job id>.jsonl
import { home, readJson, readTail } from "../util.mjs";

export const id = "openclaw";

export async function collect() {
  const data = readJson(home(".openclaw/cron/jobs.json"));
  if (!data?.jobs?.length) return null;
  const lines = data.jobs.map((job) => {
    const s = job.state || {};
    let status = "scheduled", note = null;
    if (job.enabled === false) status = "paused";
    else if ((s.consecutiveErrors || 0) >= 3) { status = "warn"; note = { key: "failing", n: s.consecutiveErrors, reason: s.lastErrorReason || "" }; }
    else if (s.lastRunStatus === "error") { status = "warn"; note = { key: "lastFailed" }; }
    return {
      id: `openclaw:${job.id}`,
      name: job.name || job.id,
      icon: "🦞",
      schedule: job.schedule?.kind === "cron" ? { type: "cron", value: job.schedule.expr } : { type: "text", value: JSON.stringify(job.schedule || {}) },
      status, note,
      next: status === "scheduled" ? s.nextRunAtMs || 0 : 0,
      last: s.lastRunAtMs || 0
    };
  });
  const runs = data.jobs.filter((j) => j.state?.lastRunAtMs).map((j) => ({ id: `openclaw:${j.id}:${j.state.lastRunAtMs}`, line: `openclaw:${j.id}`, at: j.state.lastRunAtMs, ok: j.state.lastRunStatus === "ok" }));
  // The last runs from each job's log (same ids as above, so the latest isn't counted twice)
  for (const job of data.jobs) {
    const log = readTail(home(".openclaw/cron/runs", `${job.id}.jsonl`), 32 * 1024);
    if (!log) continue;
    const entries = log.split("\n").map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((e) => e?.action === "finished" && (e.runAtMs || e.ts));
    for (const e of entries.slice(-20)) runs.push({ id: `openclaw:${job.id}:${e.runAtMs || e.ts}`, line: `openclaw:${job.id}`, at: e.runAtMs || e.ts, ok: e.status === "ok" });
  }
  const failing = lines.filter((l) => l.status === "warn").length;
  return {
    factory: { id: "openclaw", name: { zh: "OpenClaw 定时任务", en: "OpenClaw jobs" }, building: "studio", color: "#e0533d" },
    agent: { id: "openclaw", kind: "openclaw", name: "OpenClaw", sub: { zh: "网关", en: "gateway" }, color: "#e0533d", status: failing ? "warn" : "idle", done: 0 },
    lines,
    runs
  };
}
