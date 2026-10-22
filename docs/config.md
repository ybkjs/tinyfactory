# Configuration

Everything is optional. tinyfactory reads `~/.tinyfactory/config.json` (or the file given with `--config`).
A file that isn't valid JSON stops tinyfactory with the line and column of the mistake; unknown keys and wrong
types are printed as warnings. `npx tinyfactory doctor` checks the file without starting anything.

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

## Line ids

Every line has an id of the form `source:name`: `codex:daily-news`, `systemd:backup`, `cron:3f2a91`,
`webhook:deploy`, `remote:server:systemd:backup`. Open a line's detail in the page to see its id at the bottom.
`hide`, `rename`, `assign` and `factories[].match` take patterns with `*` wildcards.

## Keys

| Key | Type | What it does |
|---|---|---|
| `title` | string | Name shown on the hub, the brand card, the tab and the share poster. |
| `city` | string or object | Sun position and weather. A built-in city id (`beijing`, `shanghai`, `london`, `newyork`, `sf`, `tokyo`, … see `src/cities.mjs`) or `{ "name": "Home", "lat": 37.87, "lon": 112.55 }`. Default: the first city in your time zone. The city menu in the page overrides it for that browser. |
| `lang` | `"zh"` or `"en"` | Interface language. Default: your system locale. `?lang=` in the URL overrides it. |
| `port` | number | Default `4520`. |
| `host` | string | Default `127.0.0.1`. Anything else requires `token`. |
| `token` | string | Required on `/api/*` as `?token=` or `Authorization: Bearer …`. The page itself stays public: open it as `/?token=…`. |
| `interval` | number | Seconds between scans. Default 10 (4 in demo mode). |
| `hide` | string[] | Line patterns to leave out. `"cron:*"` also stops the cron source from running at all. |
| `rename` | object | Line id → display name. |
| `assign` | object | Line pattern → agent id: which agent the line's parcels go to. |
| `factories` | object[] | Group lines into your own factories: `name`, `match` (patterns), optional `id`, `building` (`shop`, `studio` or `home`), `color`. Lines matching no factory stay with their source. |
| `agents` | object | Describe or restyle agents: `{ "server": { "kind": "system", "name": "Cloud server", "sub": "systemd", "color": "#4caf7a" } }`. `kind` picks the character: `claude`, `codex`, `deepseek`, `openclaw`, `system`, `custom`. |
| `lines` | object[] | Jobs this machine can't see, shown as "not connected": `id`, `name`, `factory`, `agent`, `schedule`, `icon`. Add `"live": "<line id>"` and the stand-in disappears once that real line shows up (for example the first webhook report). |
| `remote` | object[] | Other machines running tinyfactory: `name`, `url`, `token`. Their lines join this map as `remote:<name>:<id>`. See [Several machines](#several-machines). |
| `systemd` | object | `services`: always-on units to show as live lines (for example a bot). `include`: timers to keep even though they look like distro housekeeping. |
| `launchd` | object | `include`: labels to keep even though they look like a vendor's updater (`com.google.…`). |
| `github` | object | `repos`: `["owner/repo"]`. Shows those repositories' GitHub Actions workflows (needs the GitHub CLI, `gh`, logged in; asked at most once a minute). Off unless set: it's the only source that talks to the internet. |

### Schedules

Declared lines take a `schedule` like the ones the sources produce:

```json
{ "type": "cron", "value": "0 3 * * *" }
{ "type": "interval", "value": 300 }
{ "type": "calendar", "value": { "Hour": 9, "Minute": 0 } }
{ "type": "rrule", "value": "FREQ=WEEKLY;BYDAY=FR;BYHOUR=8;BYMINUTE=0" }
{ "type": "realtime" }
{ "type": "manual" }
```

## Several machines

Your laptop can't see your server's timers. Run tinyfactory on the server too, listening on localhost with a token,
and bring it over an SSH tunnel:

```bash
# on the server (see examples/systemd/tinyfactory.service to keep it running)
npx github:ybkjs/tinyfactory --host 127.0.0.1 --port 4520 --token some-random-string --no-open
# on the laptop
ssh -N -L 4525:127.0.0.1:4520 you@your-server
```

```json
{ "remote": [{ "name": "server", "url": "http://127.0.0.1:4525", "token": "some-random-string" }] }
```

A remote that can't be reached for over a minute has its lines flagged. Its run history comes along, so detail cards
work for remote lines too.

## Page parameters

`?q=auto|low|medium|high` quality (auto: ambient occlusion and tilt-shift, dropped when the frame rate suffers) ·
`?fps=60` · `?city=` · `?lang=` · `?weather=clear-day|dusk|night|rain|snow|snow-night` (preview) · `?tilt=1`.
