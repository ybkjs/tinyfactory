# Changelog

## Unreleased

- **Tour mode** for a screen that's always on: a slow orbit of the park that flies to each new run for a few seconds (toolbar button, P, or `?tour=1`); any drag, click or camera key hands the camera back.
- **Night interface**: after dusk the cards, labels and toolbar turn dark so they don't glare over the lit-up park, and turn light again in the morning.
- **Faster first view**: the minified three.js (half the download), post-processing switched on just after the first frames, low-detail crowns for the forest beyond the park and lighter flowers (about a fifth fewer triangles every frame).

## 0.3.0 — 2026-10-22

Two new sources, real history from the first look, a monitor you notice from another tab, and the groundwork of a
mature project: a doctor, clear config errors, docs, and CI on Linux, macOS and Windows.

**Sources**
- **Windows Task Scheduler**: your own scheduled tasks (Microsoft's skipped) through PowerShell, with schedule, next and last run, and the last result.
- **GitHub Actions** (opt-in, `"github": { "repos": ["owner/repo"] }`): each workflow is a line, each finished run a parcel, failures in a row go red; asked through your `gh` at most once a minute.
- **systemd runs come from the journal.** Each poll reads what was logged since the last one, so a timer that runs every minute no longer loses runs between polls, and the first look brings back the last weeks (falls back to exit timestamps when the journal can't be read).
- **More history out of the box**: finished Claude Code sessions of the last two weeks, and the last runs from each OpenClaw job's run log.
- A source hidden as a whole (`"hide": ["cron:*"]`) isn't polled at all, so `crontab -l` no longer fills the system log every few seconds.
- Codex automation files written with Windows line endings are read correctly.

**In the page**
- **Quick finder**: press `/` or ⌘K (or the search button) and type part of a name; Enter flies to it and opens its detail.
- **Last 24 hours** on a line's detail: a ruler with a tick for every run (lines that run every few minutes keep just the bars).
- **Tab badge**: "(1) tinyfactory" and a red dot on the icon while something needs attention.
- **Share poster** with a title card, the date and today's numbers; the system share sheet on phones.
- **Keyboard shortcuts**: H home, arrows turn, + − zoom, L labels, T task list (shown in the button tooltips).
- **Loading screen** while the 3D view gets ready, with a message when the browser can't show WebGL.
- **Cloud shadows** drift over the park on sunny days; yards, plazas and platforms take snow and cloud shadows like the lawn.

**Running it**
- **`tinyfactory doctor`** lists what each source found on this machine and why not, checks the config, Node and the port: paste it into an issue.
- **A broken config is an error**, with the line and column and a pointer, instead of being silently ignored; unknown keys get a "did you mean", wrong types a warning. `--version` prints the version.
- Reports over 16 KB get a proper `413` instead of a cut connection.

**The project**
- **Docs**: configuration reference, HTTP API, architecture and adding a source (`docs/`); examples for systemd, launchd and a full config (`examples/`).
- Contributing guide, code of conduct, security policy, issue forms and a pull request template.
- **CI** on Linux, macOS and Windows with Node 20, 22 and 24, a syntax and manifest check, coverage, and a release workflow: a version tag publishes the GitHub release from this changelog (and npm, once a token is set). Dependabot, grouped and monthly.

## 0.2.0 — 2026-10-22

The factory you can read: click anything to see how it's doing.

**See what's going on**
- Click a machine, an agent, the hub, a label, or a line in the list: the camera flies there and the panel shows its detail. A line shows its status, schedule, last and next run, runs today, and its last 20 runs as green and red bars with the success rate. An agent shows what it's working on and the lines it serves; the hub shows the latest activity. The pointer turns into a hand over things you can click; Esc, the back button or a click on empty ground closes the detail.
- An activity card (bottom right on wide screens) lists the latest runs as they arrive.
- The collector keeps the last 20 runs of every line, history from before tinyfactory started included, and sends them as `history` in `/api/state`.
- A run that failed ships a parcel with a red lid.
- Parcels no longer vanish into the hub: they climb onto the sorting turntable under the glass dome, ride round to their agent's side and leave on its belt.

**People and characters**
- Workers in hard hats of their factory's colour walk over and work a machine when its line runs; a line that runs continuously keeps someone beside it. Strollers on the paths, gulls in the sky.
- The agents got eyes with catchlights that blink, cheeks, smiles and more detail (Claude Code's pixel face, Codex's terminal face with a blinking cursor, DeepSeek's fins, a face screen for the server).

**Looks**
- Belts and paths face the camera (they were culled, so belts looked like wires and paths were invisible); conveyors have side skirts, rails and paired legs, and meet the hub with a fixed gap.
- Soft ambient occlusion and tilt-shift are on by default and switch off on their own when a machine can't keep the frame rate.
- Shingled roofs, a brick base on the shop, framed windows, door canopies and a ring of lights on the hub, kerbs along the paths, bushes in bloom and lavender, a rippling pond, shaded tree crowns.
- The camera frames the buildings themselves, so the park fills the screen. Labels in three steps: by default only lines worth a look, then all, then none.

**Everywhere**
- Phones and portrait tablets: a compact top bar, icon toolbar, the task list and details as a bottom sheet, pinch to zoom.
- Readable nights, golden-hour dusk, a moon on clear nights.
- An empty state that lists where tinyfactory looked and how to get a first line on the map.
- An online demo that runs entirely in the browser: https://ybkjs.github.io/tinyfactory/
- Node 20 or newer.

## 0.1.0 — 2026-10-22

First release: Claude Code, Codex, OpenClaw, cron, launchd, systemd and webhooks as a 3D miniature factory, with remote machines and declared lines.
