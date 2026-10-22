// Windows Task Scheduler: your own scheduled tasks (Microsoft's own under \Microsoft\ are skipped), read through
// PowerShell's Get-ScheduledTask so names, dates and results don't depend on the system language.
import { platform } from "node:os";
import { run } from "../util.mjs";

export const id = "schtasks";
const SCRIPT = [
  "$ErrorActionPreference = 'SilentlyContinue'",
  "Get-ScheduledTask | Where-Object { $_.TaskPath -notlike '\\Microsoft\\*' } | ForEach-Object {",
  "  $i = $_ | Get-ScheduledTaskInfo",
  "  [pscustomobject]@{ Name = $_.TaskName; Path = $_.TaskPath; State = [string]$_.State; Description = $_.Description;",
  "    Last = $i.LastRunTime; Next = $i.NextRunTime; Result = $i.LastTaskResult;",
  "    Triggers = @($_.Triggers | ForEach-Object { [pscustomobject]@{ Kind = $_.CimClass.CimClassName; Start = $_.StartBoundary; Every = [string]$_.Repetition.Interval } }) }",
  "} | ConvertTo-Json -Depth 4 -Compress"
].join("\n");
const RUNNING = 0x41301, NEVER_RAN = 0x41303;

// PowerShell 5 writes dates as "/Date(1792627200000)/", PowerShell 7 as ISO text; "never" is a date in 1999
export function psDate(value) {
  if (!value) return 0;
  const ms = String(value).match(/Date\((-?\d+)/);
  const t = ms ? Number(ms[1]) : Date.parse(value);
  return Number.isFinite(t) && new Date(t).getFullYear() > 2000 ? t : 0;
}

// "PT15M" / "PT1H" → seconds
const isoSeconds = (s) => { const m = String(s || "").match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/); return m ? (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0) : 0; };

export function taskSchedule(triggers = []) {
  const t = [].concat(triggers)[0];
  if (!t) return { type: "manual" };
  const every = isoSeconds(t.Every);
  if (every) return { type: "interval", value: every };
  const at = String(t.Start || "").match(/T(\d{2}):(\d{2})/);
  if (/Daily/.test(t.Kind) && at) return { type: "calendar", value: { Hour: Number(at[1]), Minute: Number(at[2]) } };
  if (/Weekly/.test(t.Kind)) return { type: "rrule", value: `FREQ=WEEKLY${at ? `;BYHOUR=${Number(at[1])};BYMINUTE=${Number(at[2])}` : ""}` };
  if (/Logon/.test(t.Kind)) return { type: "text", value: "at logon" };
  if (/Boot/.test(t.Kind)) return { type: "text", value: "at startup" };
  if (/Time/.test(t.Kind)) return { type: "text", value: "once" };
  return { type: "text", value: String(t.Kind || "").replace(/^MSFT_Task|Trigger$/g, "") || "trigger" };
}

// The parsed JSON (one task comes back as an object, several as an array) → a group
export function tasksGroup(data) {
  const tasks = [].concat(data || []).filter((t) => t?.Name);
  if (!tasks.length) return null;
  const lines = [], runs = [];
  for (const t of tasks) {
    const id = `schtasks:${`${t.Path || "\\"}${t.Name}`.replace(/^\\+/, "").replace(/\\/g, "/")}`;
    const last = psDate(t.Last), next = psDate(t.Next), result = Number(t.Result);
    let status = "scheduled", note = null;
    if (t.State === "Disabled") status = "paused";
    else if (t.State === "Running" || result === RUNNING) status = "running";
    else if (t.State === "Queued") status = "queued";
    else if (last && result !== 0 && result !== NEVER_RAN) { status = "warn"; note = { key: "exitCode", code: `0x${(result >>> 0).toString(16)}` }; }
    lines.push({ id, name: t.Name, description: t.Description || undefined, icon: "🪟", schedule: taskSchedule(t.Triggers), status, note, next: status === "scheduled" ? next : 0, last, today: last >= new Date().setHours(0, 0, 0, 0) ? 1 : 0 });
    if (last && result !== RUNNING && result !== NEVER_RAN) runs.push({ id: `${id}:${last}`, line: id, at: last, ok: result === 0 });
  }
  return {
    factory: { id: "schtasks", name: { zh: "Windows 任务计划", en: "Task Scheduler" }, building: "shop", color: "#3a8ee6" },
    agent: { id: "system", kind: "system", name: { zh: "本机脚本", en: "Local scripts" }, sub: { zh: "任务计划 / cron", en: "Task Scheduler / cron" }, color: "#4caf7a", status: lines.some((l) => l.status === "running") ? "running" : "idle" },
    lines,
    runs
  };
}

// PowerShell takes a second or two to answer, so ask at most every 30 seconds
export async function collect(ctx) {
  if (platform() !== "win32") return null;
  const cached = ctx.memory.schtasks;
  if (cached && Date.now() - cached.at < 30000) return cached.group;
  const out = await run("powershell", ["-NoProfile", "-NonInteractive", "-Command", SCRIPT], { timeout: 15000 });
  let group = null;
  try { group = out?.trim() ? tasksGroup(JSON.parse(out)) : null; } catch { /* not JSON: leave it empty */ }
  ctx.memory.schtasks = { at: Date.now(), group };
  return group;
}
