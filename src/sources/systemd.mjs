// Linux systemd timers (plus always-on services listed in config.systemd.services). Distro housekeeping timers are skipped.
import { platform } from "node:os";
import { run } from "../util.mjs";

export const id = "systemd";
const HOUSEKEEPING = /^(systemd-|apt-|dpkg-|man-db|logrotate|fstrim|e2scrub|motd-news|dnf-|fwupd|snapd|update-notifier|plocate|mlocate|unbound-|raid-check|sysstat|ua-|phpsessionclean|anacron|atop|pmlogger|pmie|sa-update|mdcheck|apport|exim|clamav|certbot)/;
const journalCache = new Map();

// "key=value" blocks separated by blank lines → objects
export function parseShow(text) {
  return text.trim().split(/\n\s*\n/).map((block) => Object.fromEntries(block.split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])));
}

// "@1792640000" (--timestamp=unix) or "Thu 2026-10-22 11:15:39 CST" → ms
export function parseStamp(value) {
  if (!value || value === "n/a" || value === "0") return 0;
  const unix = value.match(/@(\d+)/);
  if (unix) return Number(unix[1]) * 1000;
  const plain = value.match(/(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/);
  return plain ? Date.parse(`${plain[1]}T${plain[2]}`) : 0;
}

// TimersCalendar={ OnCalendar=*-*-* 09:00:00 ; next_elapse=... } / TimersMonotonic={ OnUnitActiveUSec=5min ; ... }
export function timerSchedule(t) {
  const cal = (t.TimersCalendar || "").match(/OnCalendar=([^;]+?)\s*;/);
  if (cal) {
    const daily = cal[1].match(/^\*-\*-\* (\d{2}):(\d{2})/);
    return daily ? { type: "calendar", value: { Hour: Number(daily[1]), Minute: Number(daily[2]) } } : { type: "text", value: cal[1] };
  }
  // The repeat interval is OnUnitActive/OnUnitInactive; OnBoot/OnStartup only say when the first run happens
  const text = t.TimersMonotonic || "";
  const mono = text.match(/OnUnit(?:Active|Inactive)USec=([^;]+?)\s*;/) || text.match(/On(?:Boot|Startup)USec=([^;]+?)\s*;/);
  if (mono) {
    const m = mono[1].match(/(?:(\d+)h)?\s*(?:(\d+)min)?\s*(?:(\d+)s)?/);
    const sec = (Number(m?.[1] || 0) * 3600) + (Number(m?.[2] || 0) * 60) + Number(m?.[3] || 0);
    if (sec) return { type: "interval", value: sec };
  }
  return { type: "text", value: "timer" };
}

async function todayCount(unit) {
  const cached = journalCache.get(unit);
  if (cached && Date.now() - cached.at < 60000) return cached.n;
  // "today" = local midnight as journalctl sees it (an ISO string would be read as local time and shift by the UTC offset)
  const out = await run("journalctl", ["-u", unit, "--since", "today", "-o", "cat", "--no-pager"], { timeout: 8000 });
  const n = out ? (out.match(/^Finished /gm) || out.match(/Deactivated successfully/g) || []).length : 0;
  journalCache.set(unit, { n, at: Date.now() });
  return n;
}

export async function collect(ctx) {
  if (platform() !== "linux") return null;
  const listed = await run("systemctl", ["list-units", "--type=timer", "--all", "--no-legend", "--plain", "--no-pager"]);
  if (listed === null) return null;
  const include = ctx.config.systemd?.include || [];
  const timers = listed.split("\n").map((l) => l.trim().split(/\s+/)[0]).filter((u) => u?.endsWith(".timer")).filter((u) => include.includes(u.replace(/\.timer$/, "")) || !HOUSEKEEPING.test(u));
  const services = ctx.config.systemd?.services || [];
  if (!timers.length && !services.length) return null;

  const props = ["Id", "Unit", "Description", "NextElapseUSecRealtime", "LastTriggerUSec", "TimersCalendar", "TimersMonotonic"];
  const timerInfo = timers.length ? parseShow((await run("systemctl", ["show", "--timestamp=unix", ...timers, ...props.flatMap((p) => ["-p", p])])) || (await run("systemctl", ["show", ...timers, ...props.flatMap((p) => ["-p", p])])) || "") : [];
  const units = [...timerInfo.map((t) => t.Unit).filter(Boolean), ...services.map((s) => (s.endsWith(".service") ? s : `${s}.service`))];
  const serviceProps = ["Id", "Description", "Result", "ActiveState", "SubState", "Type", "ExecMainExitTimestamp"];
  const svcInfo = units.length ? parseShow((await run("systemctl", ["show", "--timestamp=unix", ...units, ...serviceProps.flatMap((p) => ["-p", p])])) || "") : [];
  const svc = new Map(svcInfo.map((s) => [s.Id, s]));

  const prev = ctx.memory.systemd || {};
  const memory = {};
  const runs = [];
  const lines = [];
  for (const t of timerInfo) {
    const s = svc.get(t.Unit) || {};
    const name = t.Unit.replace(/\.service$/, "");
    const exit = parseStamp(s.ExecMainExitTimestamp);
    memory[name] = exit;
    if (prev[name] && exit && exit !== prev[name]) runs.push({ id: `systemd:${name}:${exit}`, line: `systemd:${name}`, at: exit, ok: s.Result === "success" });
    let status = "scheduled", note = null;
    if (s.ActiveState === "activating" || s.ActiveState === "active" && s.Type === "oneshot") status = "running";
    else if (s.Result && s.Result !== "success") { status = "warn"; note = { key: "failed", result: s.Result }; }
    lines.push({ id: `systemd:${name}`, name: ctx.config.rename?.[`systemd:${name}`] || name, description: s.Description || t.Description, icon: "⚙️", schedule: timerSchedule(t), status, note, next: parseStamp(t.NextElapseUSecRealtime), last: exit || parseStamp(t.LastTriggerUSec), today: await todayCount(t.Unit) });
  }
  for (const unit of services) {
    const id = unit.replace(/\.service$/, "");
    const s = svc.get(`${id}.service`) || {};
    lines.push({ id: `systemd:${id}`, name: id, description: s.Description, icon: "💬", schedule: { type: "realtime" }, status: s.ActiveState === "active" ? "live" : "warn", note: s.ActiveState === "active" ? null : { key: "down", state: s.ActiveState || "unknown" } });
  }
  ctx.memory.systemd = memory;
  return {
    factory: { id: "systemd", name: { zh: "服务器定时任务", en: "systemd timers" }, building: "shop", color: "#4caf7a" },
    agent: { id: "system", kind: "system", name: { zh: "本机脚本", en: "Local scripts" }, sub: { zh: "cron / launchd / systemd", en: "cron / launchd / systemd" }, color: "#4caf7a", status: lines.some((l) => l.status === "running") ? "running" : "idle", done: lines.reduce((sum, l) => sum + (l.today || 0), 0) },
    lines,
    runs
  };
}
