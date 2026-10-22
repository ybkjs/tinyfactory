// crontab -l of the current user
import { run } from "../util.mjs";

export const id = "cron";
const SPECIAL = { "@hourly": "0 * * * *", "@daily": "0 0 * * *", "@midnight": "0 0 * * *", "@weekly": "0 0 * * 0", "@monthly": "0 0 1 * *", "@yearly": "0 0 1 1 *", "@annually": "0 0 1 1 *" };

export function hash(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// Turn a command into a short readable name: the script's file name if there is one
export function commandName(command) {
  // "cd /srv && make deploy > log" → "make deploy": the last step is the interesting one
  const step = command.split(/&&|;/).pop().replace(/\s[>|&].*$|\s*[>|].*$/, "").trim();
  const tokens = step.split(/\s+/);
  const script = tokens.find((t) => /\.(sh|py|js|mjs|rb|php|pl)$/.test(t)) || tokens.find((t) => t.includes("/"));
  const base = script ? script.split("/").pop().replace(/\.[a-z]+$/, "") : tokens.slice(0, 2).join(" ");
  return base.length > 32 ? `${base.slice(0, 31)}…` : base;
}

export function parseCrontab(text) {
  const lines = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || /^[A-Za-z_][A-Za-z0-9_]*=/.test(line)) continue;
    let expr, command;
    const special = line.match(/^(@\w+)\s+(.+)$/);
    if (special) {
      if (special[1] === "@reboot") continue;
      expr = SPECIAL[special[1]];
      command = special[2];
    } else {
      const parts = line.split(/\s+/);
      if (parts.length < 6) continue;
      expr = parts.slice(0, 5).join(" ");
      command = parts.slice(5).join(" ");
    }
    if (!expr) continue;
    lines.push({ id: `cron:${hash(line)}`, name: commandName(command), icon: "⏰", schedule: { type: "cron", value: expr }, status: "scheduled", command });
  }
  return lines;
}

export async function collect() {
  const text = await run("crontab", ["-l"]);
  if (!text) return null;
  const lines = parseCrontab(text);
  if (!lines.length) return null;
  return {
    factory: { id: "cron", name: { zh: "crontab 定时任务", en: "crontab jobs" }, building: "shop", color: "#4caf7a" },
    agent: { id: "system", kind: "system", name: { zh: "本机脚本", en: "Local scripts" }, sub: { zh: "cron / launchd / systemd", en: "cron / launchd / systemd" }, color: "#4caf7a", status: "idle" },
    lines: lines.map(({ command, ...line }) => line),
    runs: []
  };
}
