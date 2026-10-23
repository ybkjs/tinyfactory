// Example plugin: jobs that leave a file behind when they run (a backup log, a report, a "last ok" stamp).
// Each file is a line; its modification time is the last run, and the line goes red when the file is overdue.
//
//   cp heartbeat-files.mjs ~/.tinyfactory/sources/
//   ~/.tinyfactory/config.json:
//   "plugins": { "heartbeat": {
//     "backup": { "file": "/var/backups/last.log", "every": 86400, "name": "Nightly backup" },
//     "report": { "file": "~/reports/daily.html", "every": 86400 }
//   } }
//
// Plugins can't import tinyfactory's own helpers (they live outside it), so this one uses Node only.
import { statSync } from "node:fs";
import { homedir } from "node:os";

export const id = "heartbeat";

export async function collect(ctx) {
  const entries = Object.entries(ctx.config.plugins?.heartbeat || {});
  if (!entries.length) return null;
  const now = Date.now(), lines = [], runs = [];
  for (const [key, opt] of entries) {
    const file = String(opt.file || "").replace(/^~(?=$|\/)/, process.env.HOME || homedir());
    const every = Number(opt.every || 86400) * 1000;
    let mtime = 0;
    try { mtime = statSync(file).mtimeMs; } catch { /* missing: overdue */ }
    const overdue = !mtime || now - mtime > every * 1.5;
    lines.push({
      id: `heartbeat:${key}`,
      name: opt.name || key,
      description: file,
      icon: "💓",
      schedule: { type: "interval", value: every / 1000 },
      status: overdue ? "warn" : "scheduled",
      // "stalled" reads "停摆了 / stalled" in the page and in alerts
      note: overdue ? { key: "stalled", since: mtime } : null,
      last: Math.round(mtime),
      next: overdue ? 0 : Math.round(mtime + every)
    });
    if (mtime) runs.push({ id: `heartbeat:${key}:${Math.round(mtime)}`, line: `heartbeat:${key}`, at: Math.round(mtime), ok: true });
  }
  return {
    factory: { id: "heartbeat", name: { zh: "心跳文件", en: "Heartbeat files" }, building: "home", color: "#e86a8a" },
    agent: { id: "system", kind: "system" },
    lines,
    runs
  };
}
