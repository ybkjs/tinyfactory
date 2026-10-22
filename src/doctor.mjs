// tinyfactory doctor: what each source found on this machine, and why not when it found nothing.
// Read-only like everything else; meant to be pasted into an issue.
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { platform } from "node:os";
import { assemble, SOURCES } from "./collect.mjs";
import { loadConfig } from "./config.mjs";
import { home, run } from "./util.mjs";

const os = platform();
// Why a source may come back empty: [check, hint when the check fails]
const WHERE = {
  claude: () => [existsSync(home(".claude/jobs")), "no ~/.claude/jobs (Claude Code background sessions live there)"],
  codex: () => [existsSync(home(".codex/automations")), "no ~/.codex/automations (create an automation in the ChatGPT desktop app)"],
  openclaw: () => [existsSync(home(".openclaw/cron/jobs.json")), "no ~/.openclaw/cron/jobs.json"],
  cron: async () => [Boolean((await run("crontab", ["-l"]))?.trim()), os === "win32" ? "no crontab on Windows" : "crontab -l is empty"],
  launchd: () => [os === "darwin", "macOS only"],
  systemd: () => [os === "linux", "Linux only"],
  webhook: () => [false, "no reports yet: POST /api/event from any script"],
  remote: () => [false, "no \"remote\" machines in the config"],
  declared: () => [false, "no \"lines\" in the config"]
};

const pad = (s, n) => String(s).padEnd(n);
function portFree(port, host) {
  return new Promise((resolve) => {
    const server = createServer().once("error", () => resolve(false)).once("listening", () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
}

export async function doctor({ configPath, version, out = console.log }) {
  out(`\n  tinyfactory ${version} doctor\n`);
  const major = Number(process.versions.node.split(".")[0]);
  out(`  ${major >= 20 ? "✓" : "✗"} Node      v${process.versions.node}${major >= 20 ? "" : "  (tinyfactory needs Node 20 or newer)"}`);
  const { config, warnings, error, found } = loadConfig(configPath);
  if (error) out(`  ✗ Config    ${error}`);
  else out(`  ${found ? "✓" : "·"} Config    ${configPath}${found ? "" : "  (none, that's fine: everything is optional)"}`);
  for (const w of warnings) out(`      ! ${w}`);
  out(`  · System    ${os} ${process.arch}\n`);

  out("  Sources");
  const ctx = { config, memory: {} };
  const groups = [];
  for (const source of SOURCES) {
    if ((config.hide || []).includes(`${source.id}:*`)) { out(`  - ${pad(source.id, 10)} hidden by the config ("${source.id}:*")`); continue; }
    let result;
    try { result = await source.collect(ctx); } catch (e) { out(`  ✗ ${pad(source.id, 10)} error: ${e.message}`); continue; }
    const list = [result].flat().filter(Boolean);
    groups.push(...list);
    const lines = list.reduce((n, g) => n + (g.lines?.length || 0), 0);
    if (lines) { out(`  ✓ ${pad(source.id, 10)} ${lines} line${lines === 1 ? "" : "s"}`); continue; }
    const [ok, hint] = await (WHERE[source.id]?.() ?? [false, "nothing found"]);
    out(`  · ${pad(source.id, 10)} nothing${ok ? "" : ` — ${hint}`}`);
  }
  const view = assemble(groups, config);
  const total = view.factories.reduce((n, f) => n + f.lines.length, 0);
  out(`\n  On the map: ${view.factories.length} factories · ${total} lines · ${view.agents.length} agents${view.counts.warn ? ` · ${view.counts.warn} need attention` : ""}`);

  const port = Number(config.port || 4520), host = config.host || "127.0.0.1";
  const free = await portFree(port, host);
  out(`  ${free ? "✓" : "·"} Port ${port} ${free ? "is free" : `is in use: tinyfactory may already be running at http://127.0.0.1:${port}/`}`);
  if (host !== "127.0.0.1" && host !== "localhost" && !config.token) out(`  ✗ host is ${host} but there's no token: tinyfactory will refuse to start`);
  out(total ? "" : "\n  Nothing to show yet. Try  npx tinyfactory --demo  or report a run:  curl -X POST http://127.0.0.1:4520/api/event -d '{\"line\":\"backup\"}'\n");
  return error ? 1 : 0;
}
