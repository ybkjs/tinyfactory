<div align="center">

# 🏭 tinyfactory

**Your AI automations as a living miniature factory.**

One command finds the Claude Code, Codex, OpenClaw, cron, launchd and systemd jobs on your machine.
Every automation becomes a production line; every run becomes a parcel riding the belt to the agent doing the work.

[![test](https://github.com/ybkjs/tinyfactory/actions/workflows/test.yml/badge.svg)](https://github.com/ybkjs/tinyfactory/actions/workflows/test.yml)
[![release](https://img.shields.io/github/v/release/ybkjs/tinyfactory)](https://github.com/ybkjs/tinyfactory/releases)
[![node](https://img.shields.io/badge/node-%E2%89%A520-3c873a)](package.json)
[![license](https://img.shields.io/github/license/ybkjs/tinyfactory)](LICENSE)

**[Live demo](https://ybkjs.github.io/tinyfactory/)** (works on phones) · [Docs](docs/) · [Changelog](CHANGELOG.md) · English · [中文](README.md)

![tinyfactory](docs/demo.gif)

</div>

## Why

Once automations pile up, you lose track of how many you have, and of which ones quietly died.
Before building tinyfactory, the author audited their own machine and found 4 scheduled jobs that had been failing for months (expired auth, 197 failures in a row) without anyone noticing. tinyfactory is that audit, left running.

A list could tell you that, but nobody checks a list every day. A little factory that moves is something you actually look at.

Inspired by [@Khazix0918's automation pipeline visualization](https://x.com/Khazix0918/status/2112838884510048647). tinyfactory is an independent open-source take, focused on *install it and see your own factory*.

## Quick start

```bash
npx github:ybkjs/tinyfactory            # scan this machine and open your factory
npx github:ybkjs/tinyfactory --demo     # look at a sample factory first
```

Requires Node.js 20+ and git. Your browser opens `http://127.0.0.1:4520/`.

## What it discovers

| Source | Reads | Shows |
|---|---|---|
| Claude Code background sessions | `~/.claude/jobs/*/state.json` | working, waiting for you, finished today |
| Codex automations (ChatGPT desktop) | `~/.codex/automations/`, `~/.codex/sqlite/codex-dev.db` | schedule, next run, each run, unread results, stalled jobs |
| OpenClaw cron jobs | `~/.openclaw/cron/jobs.json` | schedule, consecutive failures, paused |
| crontab | `crontab -l` | every scheduled command |
| macOS launchd | `~/Library/LaunchAgents/*.plist` (scheduled ones) | schedule, last exit code |
| Linux systemd | `systemctl` timers | schedule, next run, runs today, failures |
| Anything else | `POST /api/event` | whatever you report |
| tinyfactory on another machine | its `/api/state` | jobs on a server or NAS on the same map (see below) |

Everything is **read-only**. Sources that aren't there are skipped silently.

## Put any script on the map

```bash
curl -X POST localhost:4520/api/event -H 'content-type: application/json' \
  -d '{"line":"backup","name":"Nightly backup","factory":"Ops","status":"start"}'
curl -X POST localhost:4520/api/event -d '{"line":"backup","status":"done"}'
curl -X POST localhost:4520/api/event -d '{"line":"backup","status":"fail","msg":"disk full"}'
```

Fields: `line` (required id), `name`, `factory`, `agent` (`claude` / `codex` / `deepseek` / `openclaw` / `system` / `custom`), `status` (`start` / `done` / `fail`), `msg`.
Every `done` or `fail` sends a parcel to that agent. n8n, GitHub Actions, Python, chat bots — anything that can send an HTTP request.

## Several machines, one map

Your laptop can't see your server's cron jobs. Run tinyfactory on the server too (listening on localhost only) and bring it over an SSH tunnel:

```bash
# on the server
npx github:ybkjs/tinyfactory --host 127.0.0.1 --port 4520 --token some-random-string --no-open
# on the laptop: forward the server's 4520 to local 4525
ssh -N -L 4525:127.0.0.1:4520 you@your-server
```

```json
{ "remote": [{ "name": "server", "url": "http://127.0.0.1:4525", "token": "some-random-string" }] }
```

Remote line ids become `remote:server:<id>`, so `rename` / `assign` / `factories` work on them. If a remote is unreachable for over a minute its lines are flagged.

## Config (optional)

`~/.tinyfactory/config.json`:

```json
{
  "title": "My AI factory",
  "city": "london",
  "lang": "en",
  "hide": ["launchd:*updater*"],
  "rename": { "systemd:backup": "Nightly backup" },
  "assign": { "systemd:*-report": "deepseek" },
  "factories": [
    { "name": "My shop", "match": ["systemd:shop-*", "cron:*"], "building": "shop", "color": "#e8774a" }
  ],
  "systemd": { "services": ["my-bot"] }
}
```

Line ids look like `source:name` (e.g. `codex:daily-news`, `systemd:backup`).
`hide` / `rename` / `assign` / `factories.match` accept `*` wildcards. `building` is `shop`, `studio` or `home`.
`lines` puts jobs this machine can't see (a cloud server, a SaaS scheduler) on the map as "not connected":
`{ "id": "backup", "name": "Nightly backup", "factory": "My shop", "agent": "system", "schedule": { "type": "cron", "value": "0 3 * * *" } }`

Full reference: [docs/config.md](docs/config.md) · a complete example: [examples/config.example.json](examples/config.example.json).

## In the scene

- **Real time and weather** for your city: the sun moves, lamps and windows light up at night, rain and snow follow the real sky ([Open-Meteo](https://open-meteo.com/)). Switch cities or preview dusk / night / snowy night from the top-right card.
- **Readable status**: green = running, red = needs attention (failing, stalled, unread results), hollow = waiting for its next run.
- **Click to see how it's doing**: click a machine, an agent, the hub, a label or a line in the list. The camera flies there and the panel shows its status, schedule, last and next run, runs today, and the last 20 runs (green ok, red failed) with the success rate. On wide screens an activity card lists runs as they arrive. A failed run ships a parcel with a red lid.
- **People at work**: each factory yard has workers in hard hats; when a line runs, one walks over and works the machine, and a line that runs continuously keeps someone beside it. The agents blink and come alive while they work.
- **Labels in three steps**: by default only lines that are running, online or need attention carry a label; the Labels button switches to all, then off.
- **Share poster**: the Share button turns the current view into a poster with a title, the date and today's numbers; phones open the system share sheet.
- **Visible from a background tab**: when a line needs attention the tab title reads "(1) …" and the icon gets a red dot.
- **Quick finder**: press `/` or ⌘K (or tap search on phones), type part of a name, Enter flies there.
- **Keys**: H home, ← → turn, + − zoom, L labels, T task list, Esc closes a detail.
- Drag to rotate, right-drag to pan, scroll or pinch to zoom; click a line in the list to fly to it.

| Dusk | Snowy night |
|---|---|
| ![dusk](docs/dusk.jpg) | ![snow night](docs/snow-night.jpg) |

## Privacy

Listens on `127.0.0.1` only, uploads nothing, no telemetry, never modifies your jobs. The only outbound request is the weather lookup (your chosen city's coordinates to Open-Meteo). To expose it on a network you must pass `--token`.

## CLI

```
npx github:ybkjs/tinyfactory           scan this machine and open the factory
npx github:ybkjs/tinyfactory --demo    sample factory with simulated runs
npx github:ybkjs/tinyfactory doctor    what each source found here, and why not

--port <n>  --host <addr>  --city <name>  --lang <zh|en>  --config <file>
--interval <s>  --token <secret>  --no-open  --verbose  --version
```

A config file with a mistake stops with its line and column instead of being ignored; misspelled keys get a
"did you mean". Page parameters: `?q=auto|low|medium|high`, `?fps=60`, `?city=`, `?lang=`, `?weather=dusk|night|rain|snow|snow-night`.

## Docs

- [Configuration](docs/config.md): every key, line ids, schedules, several machines
- [HTTP API](docs/api.md): reporting runs, the `/api/state` format
- [Architecture and adding a source](docs/architecture.md)
- [Examples](examples/): keep it running with systemd or launchd, a full config

## Performance

Quality is `auto` by default: soft ambient occlusion and tilt-shift, switched off for good on a machine that can't keep
24 fps. Capped at 30 fps, 12 fps in a background window. Smooth on an 8 GB MacBook; use `?q=low` on older machines.

## FAQ

**It's empty, or a tool's jobs are missing.** Run `npx github:ybkjs/tinyfactory doctor`: it says what each source found and why not.

**Can it show my server's jobs?** Yes: run it there too (localhost, with a token) and bring it over an SSH tunnel, see above.

**Does it change my jobs or send data anywhere?** No. Read-only and local; the only outbound request is the weather.

**A detail card has no history.** systemd timers, Codex, OpenClaw and Claude Code sessions bring their past runs; cron
and launchd keep no run log, so history builds up while the dashboard runs. Webhook lines keep theirs.

**I want another tool on the map.** See [adding a source](docs/architecture.md#sources), or [open an issue](https://github.com/ybkjs/tinyfactory/issues/new/choose) saying where it keeps its jobs.

## Contributing

```bash
git clone https://github.com/ybkjs/tinyfactory && cd tinyfactory
npm install && npm run demo
npm test && npm run check
```

Issues and pull requests welcome, in English or Chinese: [contributing](CONTRIBUTING.md) · [code of conduct](CODE_OF_CONDUCT.md) · [security](SECURITY.md).

## Credits

Idea: [@Khazix0918](https://x.com/Khazix0918/status/2112838884510048647) · Rendering: [three.js](https://threejs.org/) · Weather: [Open-Meteo](https://open-meteo.com/).
Characters are generic designs, no official logos are used; product names belong to their owners.

## License

[MIT](LICENSE)
