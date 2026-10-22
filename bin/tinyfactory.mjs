#!/usr/bin/env node
// npx tinyfactory [--demo] [--port 4520] [--host 127.0.0.1] [--city beijing] [--lang zh|en] [--config path] [--no-open] [--token secret]
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { platform } from "node:os";
import { resolveCity } from "../src/cities.mjs";
import { createCollector, SOURCES } from "../src/collect.mjs";
import { demoSource } from "../src/demo.mjs";
import { startServer } from "../src/server.mjs";
import { home, readJson } from "../src/util.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback; };

if (flag("help") || flag("h")) {
  console.log(`tinyfactory — your AI agent automations as a 3D miniature factory

  npx tinyfactory              scan this machine and open the factory
  npx tinyfactory --demo       sample factory with simulated runs

  --port <n>       default 4520
  --host <addr>    default 127.0.0.1 (use --token when exposing it)
  --city <name>    weather & sun position, e.g. beijing, shanghai, london
  --lang <zh|en>   interface language (default: system)
  --config <file>  default ~/.tinyfactory/config.json
  --no-open        don't open the browser
  --token <secret> require ?token= on /api/*
  --interval <s>   how often to rescan (default 10, demo 4)`);
  process.exit(0);
}

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const configPath = option("config", home(".tinyfactory/config.json"));
const config = readJson(configPath) || {};
const demo = flag("demo");
const port = Number(option("port", config.port || 4520));
const host = option("host", config.host || "127.0.0.1");
const token = option("token", config.token || (host === "127.0.0.1" || host === "localhost" ? "" : null));
if (token === null) { console.error("Refusing to listen on a public address without --token."); process.exit(1); }

const collector = createCollector({ config, sources: demo ? [demoSource()] : SOURCES, log: (m) => flag("verbose") && console.log(`[source] ${m}`) });
await collector.refresh();
const interval = Number(option("interval", config.interval || (demo ? 4 : 10)));
setInterval(() => collector.refresh().catch(() => {}), interval * 1000);

const city = resolveCity(option("city", config.city));
const lang = option("lang", config.lang || (Intl.DateTimeFormat().resolvedOptions().locale.startsWith("zh") ? "zh" : "en"));
const info = { title: config.title || "", demo, version, city, lang, interval };
try {
  await startServer({ collector, port, host, token, info });
} catch (error) {
  console.error(error.code === "EADDRINUSE" ? `Port ${port} is busy. Try --port ${port + 1}` : error.message);
  process.exit(1);
}

const url = `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}/${token ? `?token=${token}` : ""}`;
const s = collector.state;
console.log(`\n  🏭 tinyfactory ${version}${demo ? " (demo)" : ""}\n  ${url}\n`);
console.log(`  ${s.factories.length} factories · ${s.factories.reduce((n, f) => n + f.lines.length, 0)} lines · ${s.agents.length} agents`);
if (!demo && !s.factories.length) console.log("  Nothing found yet. Try --demo, or report runs from any script:");
console.log(`  curl -X POST ${url.replace(/\/(\?.*)?$/, "")}/api/event -H 'content-type: application/json' -d '{"line":"backup","status":"done"}'\n`);

if (!flag("no-open")) {
  const opener = platform() === "darwin" ? "open" : platform() === "win32" ? "explorer" : "xdg-open";
  spawn(opener, [url], { stdio: "ignore", detached: true }).on("error", () => {}).unref();
}
