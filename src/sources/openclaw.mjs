// OpenClaw cron jobs: ~/.openclaw/cron/jobs.json
import { home, readJson } from "../util.mjs";

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
  const failing = lines.filter((l) => l.status === "warn").length;
  return {
    factory: { id: "openclaw", name: { zh: "OpenClaw 定时任务", en: "OpenClaw jobs" }, building: "studio", color: "#e0533d" },
    agent: { id: "openclaw", kind: "openclaw", name: "OpenClaw", sub: { zh: "网关", en: "gateway" }, color: "#e0533d", status: failing ? "warn" : "idle", done: 0 },
    lines,
    runs
  };
}
