<div align="center">

# 🏭 tinyfactory

**Your AI automations as a living miniature factory.**

One command finds the Claude Code, Codex, OpenClaw, cron, launchd and systemd jobs on your machine.
Every automation becomes a production line; every run becomes a parcel riding the belt to the agent doing the work.

English · [中文](README.md)

![tinyfactory](docs/demo.gif)

</div>

## Why

Once automations pile up, you lose track of how many you have, and of which ones quietly died.
Before building tinyfactory, the author audited their own machine and found 4 scheduled jobs that had been failing for months (expired auth, 197 failures in a row) without anyone noticing. tinyfactory is that audit, left running.

A list could tell you that, but nobody checks a list every day. A little factory that moves is something you actually look at.

Inspired by [@Khazix0918's automation pipeline visualization](https://x.com/Khazix0918/status/2112838884510048647). tinyfactory is an independent open-source take, focused on *install it and see your own factory*.

## Quick start

```bash
npx tinyfactory            # scan this machine and open your factory
npx tinyfactory --demo     # look at a sample factory first
```

Requires Node.js 18+. Your browser opens `http://127.0.0.1:4520/`.

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

## In the scene

- **Real time and weather** for your city: the sun moves, lamps and windows light up at night, rain and snow follow the real sky ([Open-Meteo](https://open-meteo.com/)). Switch cities or preview dusk / night / snowy night from the top-right card.
- **Readable status**: green = running, red = needs attention (failing, stalled, unread results), hollow = waiting for its next run.
- **Share** saves the current view as a PNG.
- Drag to rotate, right-drag to pan, scroll to zoom; click a line in the list to fly to it.

| Dusk | Snowy night |
|---|---|
| ![dusk](docs/dusk.jpg) | ![snow night](docs/snow-night.jpg) |

## Privacy

Listens on `127.0.0.1` only, uploads nothing, no telemetry, never modifies your jobs. The only outbound request is the weather lookup (your chosen city's coordinates to Open-Meteo). To expose it on a network you must pass `--token`.

## CLI

```
--demo  --port <n>  --host <addr>  --city <name>  --lang <zh|en>
--config <file>  --interval <s>  --token <secret>  --no-open
```

Page parameters: `?q=low|high`, `?fps=60`, `?tilt=1`, `?city=`, `?lang=`, `?weather=dusk|night|rain|snow|snow-night`.

## Performance

Native resolution, capped at 30 fps, 12 fps when the window isn't focused, and it steps down automatically if your machine struggles. Smooth on an 8 GB MacBook; use `?q=low` on older machines.

## Add a source

A source is one file in `src/sources/` exporting `collect(ctx)` that returns `{ factory, agent, lines, runs }` — see the Chinese README or any existing source. PRs welcome: GitHub Actions, n8n, Cursor, Windows Task Scheduler…

## Develop

```bash
git clone https://github.com/bai-429/tinyfactory && cd tinyfactory
npm install && npm run demo
npm test
```

## Credits

Idea: [@Khazix0918](https://x.com/Khazix0918/status/2112838884510048647) · Rendering: [three.js](https://threejs.org/) · Weather: [Open-Meteo](https://open-meteo.com/).
Characters are generic designs, no official logos are used; product names belong to their owners.

## License

[MIT](LICENSE)
