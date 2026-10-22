# HTTP API

tinyfactory serves the page and a small JSON API on `http://127.0.0.1:4520` by default. When a `token` is set,
every `/api/*` request needs it as `?token=…` or `Authorization: Bearer …`; otherwise it answers `401`.

## Report a run: `POST /api/event`

Any script can put itself on the map. The first report creates the line; later ones update it.

```bash
curl -X POST http://127.0.0.1:4520/api/event \
  -H 'content-type: application/json' \
  -d '{"line":"backup","name":"Nightly backup","factory":"Ops","agent":"system","status":"done"}'
```

Form posts work too (`line=backup&status=done`).

| Field | | |
|---|---|---|
| `line` | required | Id of the line, up to 64 characters. It shows up as `webhook:<line>`. |
| `name` | | Display name, up to 40 characters. |
| `factory` | | Factory to put it in (default "My scripts"), up to 40 characters. |
| `agent` | | `claude`, `codex`, `deepseek`, `openclaw`, `system` or `custom` (default). |
| `status` | | `start` (the line shows as running), `done` (default) or `fail`. `done` and `fail` count as a run and send a parcel. |
| `msg` | | A note, up to 200 characters. |

Answers `{ "ok": true, "line": "webhook:backup" }`, `400` without a `line`, `413` for a body over 16 KB.
Lines and the last 300 runs are kept in `~/.tinyfactory/webhook.json`.

Wrap a cron job so it reports both outcomes:

```bash
0 3 * * * /path/backup.sh && curl -s -d line=backup -d status=done http://127.0.0.1:4520/api/event || curl -s -d line=backup -d status=fail http://127.0.0.1:4520/api/event
```

## What's on the map: `GET /api/state`

```jsonc
{
  "factories": [{
    "id": "systemd", "name": { "zh": "…", "en": "systemd timers" }, "building": "shop", "color": "#4caf7a",
    "lines": [{
      "id": "systemd:backup", "name": "backup", "icon": "⚙️", "agent": "system",
      "schedule": { "type": "calendar", "value": { "Hour": 3, "Minute": 0 } },
      "status": "scheduled",        // running | live | queued | warn | idle | scheduled | paused
      "note": null,                 // e.g. { "key": "failing", "n": 12 } for warn
      "next": 1792713600000, "last": 1792627200000, "today": 1
    }]
  }],
  "agents": [{ "id": "system", "kind": "system", "name": "…", "color": "#4caf7a", "status": "idle", "busy": 0, "done": 3 }],
  "counts": { "running": 0, "queued": 0, "warn": 0, "done": 3 },
  "events": [{ "id": 42, "line": "systemd:backup", "agent": "system", "at": 1792627200000, "ok": true }],
  "history": { "systemd:backup": [{ "at": 1792627200000, "ok": true }] },
  "scanned": [{ "id": "systemd", "found": true }],
  "generatedAt": 1792627205000,
  "title": "", "demo": false, "version": "0.3.0", "lang": "en", "interval": 10, "platform": "linux",
  "city": { "id": "london", "lat": 51.507, "lon": -0.128 }, "cities": []
}
```

- Names are a string or `{ "zh", "en" }`. Times are milliseconds since the epoch.
- `events` are runs seen while tinyfactory was watching (the page turns each one into a parcel); `history` keeps the
  last 20 runs of every line, including ones from before it started (journal, run logs, databases).
- `counts.done` leaves out lines that run every 10 minutes or more often, so a health check doesn't drown the number.

## Weather: `GET /api/weather?lat=…&lon=…`

`{ "code": 3, "temp": 12.4 }`, proxied from [Open-Meteo](https://open-meteo.com/) and cached for 15 minutes.
This is the only request tinyfactory makes to the outside world.
