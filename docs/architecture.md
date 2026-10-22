# How tinyfactory works

```
sources (src/sources/*.mjs)          collector (src/assemble.mjs)              page (web/)
  claude, codex, openclaw,   ──►  merge groups, apply the config,   ──►  /api/state every few seconds
  cron, launchd, systemd,          turn new runs into events,             → three.js park, parcels,
  schtasks, github, webhook,       keep the last 20 runs per line           labels, panel, details
  remote, declared
```

**Principles.** Read-only: tinyfactory never changes a job. Local: it listens on `127.0.0.1` and the only outbound
request is the weather (plus GitHub, only for repos the user lists). No telemetry. One runtime dependency (three.js). A source is a single small file.

## Sources

A source is a module in `src/sources/` with an `id` and an async `collect(ctx)`:

```js
export const id = "mytool";

export async function collect(ctx) {
  // ctx.config: the user's config · ctx.memory: an object kept between polls (for "what changed since last time")
  return {
    factory: { id: "mytool", name: { zh: "我的工具", en: "My tool" }, building: "studio", color: "#5b8def" },
    agent: { id: "custom", kind: "custom", name: "My tool", color: "#c9a227", status: "idle" },
    lines: [{
      id: "mytool:nightly",                 // unique, "source:name"
      name: "Nightly export",
      icon: "📦",
      schedule: { type: "cron", value: "0 2 * * *" },
      status: "scheduled",                  // running | live | queued | warn | idle | scheduled | paused
      note: null,                           // warn needs a reason: { key: "failing", n: 3 } (see web/i18n.js notes)
      next: 0, last: 0, today: 0            // ms timestamps, runs today
    }],
    runs: [{ id: "mytool:nightly:1792627200000", line: "mytool:nightly", at: 1792627200000, ok: true }]
  };
}
```

- Return `null` when there's nothing on this machine (not installed, wrong OS). Return an array of groups to add
  several factories.
- `runs` may include history: the collector counts each run id once, keeps the last 20 per line for the detail card,
  and only turns runs that happen while it's watching into parcels. Make ids stable (derive them from the line and
  the time), so the same run seen twice counts once.
- Never write anything. Shell out with `run()` from `src/util.mjs` (it has a timeout and returns `null` on failure);
  read files with `readJson` / `readText` / `readTail`.
- Add the module to `SOURCES` in `src/collect.mjs`, a "why nothing" hint to `WHERE` in `src/doctor.mjs`, a fixture
  under `test/fixtures/home` and a test in `test/sources.test.mjs`.

Good next sources: n8n, Cursor background agents, Home Assistant automations, GitLab CI. `schtasks.mjs` (parsing PowerShell JSON) and `github.mjs` (an opt-in source that shells out to a CLI and caches) are short examples to start from.

## The collector

`createCollector({ config, sources })` in `src/assemble.mjs` runs every source (in parallel, each failure isolated),
then `assemble()` applies `hide`, `rename`, `assign` and `factories`, fills in known agents, and counts statuses. It
is free of Node APIs, so the online demo runs it in the browser with the demo source.

`src/collect.mjs` adds the real sources; `src/server.mjs` serves `/api/state`, `/api/event` and `/api/weather`;
`bin/tinyfactory.mjs` is the CLI; `src/config.mjs` loads and checks the config; `src/doctor.mjs` explains what was found.

## The page

| File | |
|---|---|
| `web/main.js` | Renderer, camera, day and night, weather, parcels, people, labels, picking, the main loop |
| `web/layout.js` | Where factories, the hub and agents go, sized by the data |
| `web/world.js` | Ground, paths, belts, trees, flowers, the crews and strollers |
| `web/structures.js` | Buildings, machines, the hub, agent platforms and characters, people |
| `web/flow.js` | Conveyor belts, the route across the hub, parcels |
| `web/ui.js` | Cards, the task list and details, finder, activity, toolbar |
| `web/i18n.js` | Chinese and English text, schedule and time wording |
| `web/bake.js` | Merges static meshes into a few draw calls |
| `web/static.js` | The online demo: runs the collector in the page instead of calling a server |

Everything is procedural (no model files). Static meshes are merged after the park is built; moving things carry
`userData.dynamic`. Shadows refresh every third frame; the frame rate is capped at 30 (12 in a background window) and
quality steps down when a machine struggles.

## Tests

`npm test` runs `node --test` (sources against fixtures, the collector, the config, the server end to end, the online
demo build, layout and wording). `npm run check` parses every file and checks the manifest and changelog.
`npm run coverage` prints coverage. `npm run record` re-records the README pictures (needs Chrome and ffmpeg).
