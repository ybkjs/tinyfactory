// macOS LaunchAgents with a schedule (StartInterval / StartCalendarInterval). Vendor updaters are skipped.
import { platform } from "node:os";
import { home, listDir, run } from "../util.mjs";

export const id = "launchd";
const VENDOR = /^(com\.apple|com\.google|com\.microsoft|com\.adobe|com\.openai|com\.dropbox|com\.spotify|com\.oracle|org\.mozilla|us\.zoom|com\.tencent|com\.baidu|com\.alibaba|com\.bytedance)\./i;

export async function collect(ctx) {
  if (platform() !== "darwin") return null;
  const dir = home("Library/LaunchAgents");
  const files = listDir(dir).filter((f) => f.endsWith(".plist"));
  if (!files.length) return null;
  const list = (await run("launchctl", ["list"])) || "";
  const status = new Map(list.split("\n").slice(1).map((l) => l.split("\t")).filter((p) => p.length === 3).map(([pid, code, label]) => [label, { pid: pid === "-" ? 0 : Number(pid), code: Number(code) }]));
  const lines = [];
  for (const file of files) {
    const json = await run("plutil", ["-convert", "json", "-o", "-", `${dir}/${file}`]);
    if (!json) continue;
    let p;
    try { p = JSON.parse(json); } catch { continue; }
    if (!p?.Label || (!p.StartInterval && !p.StartCalendarInterval)) continue;
    if (VENDOR.test(p.Label) && !(ctx.config.launchd?.include || []).includes(p.Label)) continue;
    const st = status.get(p.Label);
    const schedule = p.StartInterval ? { type: "interval", value: p.StartInterval } : { type: "calendar", value: [].concat(p.StartCalendarInterval)[0] };
    let s = st ? "scheduled" : "paused", note = st ? null : { key: "notLoaded" };
    if (st?.pid) s = "running";
    else if (st && st.code !== 0) { s = "warn"; note = { key: "exitCode", code: st.code }; }
    lines.push({ id: `launchd:${p.Label}`, name: p.Label.split(".").slice(-2).join("."), icon: "🍎", schedule, status: s, note });
  }
  if (!lines.length) return null;
  return {
    factory: { id: "launchd", name: { zh: "macOS 定时任务", en: "macOS launchd jobs" }, building: "shop", color: "#4caf7a" },
    agent: { id: "system", kind: "system", name: { zh: "本机脚本", en: "Local scripts" }, sub: { zh: "cron / launchd / systemd", en: "cron / launchd / systemd" }, color: "#4caf7a", status: lines.some((l) => l.status === "running") ? "running" : "idle" },
    lines,
    runs: []
  };
}
