// Linux systemd timers (plus always-on services listed in config.systemd.services). Distro housekeeping timers are skipped.
import { platform } from "node:os";
import { run } from "../util.mjs";

export const id = "systemd";
const HOUSEKEEPING = /^(systemd-|apt-|dpkg-|man-db|logrotate|fstrim|e2scrub|motd-news|dnf-|fwupd|snapd|update-notifier|plocate|mlocate|unbound-|raid-check|sysstat|ua-|phpsessionclean|anacron|atop|pmlogger|pmie|sa-update|mdcheck|apport|exim|clamav|certbot)/;
const journalCache = new Map();

// "key=value" blocks separated by blank lines → objects. A key can repeat (one TimersMonotonic line per trigger), so values are joined.
export function parseShow(text) {
  return text.trim().split(/\n\s*\n/).map((block) => {
    const out = {};
    for (const line of block.split("\n")) {
      const i = line.indexOf("=");
      if (i < 0) continue;
      const key = line.slice(0, i), value = line.slice(i + 1);
      out[key] = key in out ? `${out[key]} ${value}` : value;
    }
    return out;
  });
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

// journalctl -o short-unix lines → finished runs: "Finished …" is a success, "Failed with result" a failure
export function parseJournal(text) {
  const runs = [];
  for (const line of String(text || "").split("\n")) {
    const m = line.match(/^(\d+(?:\.\d+)?) \S+ systemd\[1\]: (.*)$/);
    if (!m) continue;
    if (m[2].startsWith("Finished ")) runs.push({ at: Math.floor(Number(m[1])) * 1000, ok: true });
    else if (m[2].includes("Failed with result")) runs.push({ at: Math.floor(Number(m[1])) * 1000, ok: false });
  }
  return runs.sort((a, b) => a.at - b.at);
}

// Runs from the journal since the last look, so none slip by between two polls; the first look also brings back
// the last weeks for the detail card. null when the journal can't be read (then exit timestamps are used instead).
async function journalRuns(unit, since) {
  const args = since
    ? ["-u", unit, "-o", "short-unix", "--since", `@${Math.floor(since / 1000)}`, "--no-pager"]
    : ["-u", unit, "-o", "short-unix", "--since", "-21d", "-r", "-n", "600", "--no-pager"];
  const out = await run("journalctl", args, { timeout: 8000 });
  if (out === null || /insufficient permissions/i.test(out)) return null;
  const runs = parseJournal(out);
  return since ? runs : runs.slice(-20);
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

  const prev = ctx.memory.systemd || { exit: {}, journal: {} };
  const memory = { exit: {}, journal: {} };
  const runs = [];
  const lines = [];
  for (const t of timerInfo) {
    const s = svc.get(t.Unit) || {};
    const name = t.Unit.replace(/\.service$/, "");
    const exit = parseStamp(s.ExecMainExitTimestamp);
    memory.exit[name] = exit;
    // Ids use whole seconds both ways, so a run seen in the journal and by its exit time counts once
    const found = await journalRuns(t.Unit, prev.journal[name]);
    if (found) {
      for (const r of found) runs.push({ id: `systemd:${name}:${r.at}`, line: `systemd:${name}`, at: r.at, ok: r.ok });
      memory.journal[name] = Math.max(prev.journal[name] || Date.now() - 1000, ...found.map((r) => r.at));
    } else if (prev.exit[name] && exit && exit !== prev.exit[name]) runs.push({ id: `systemd:${name}:${exit}`, line: `systemd:${name}`, at: exit, ok: s.Result === "success" });
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
