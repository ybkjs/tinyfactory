# Security

## Supported versions

Fixes go into the latest release. Please upgrade before reporting.

## What tinyfactory exposes

- A local HTTP server on `127.0.0.1` by default. Binding to another address requires a token, checked on every
  `/api/*` request.
- `/api/state` reveals job names and schedules from this machine; `/api/event` lets anyone who can reach it add lines.
  Keep the default host, or use a token and an SSH tunnel as described in [docs/config.md](docs/config.md#several-machines).
- It reads local files and runs read-only commands (`crontab -l`, `launchctl list`, `plutil -convert json -o -`, `systemctl list-units` / `show`, `journalctl`,
  `sqlite3 -readonly`, PowerShell `Get-ScheduledTask` on Windows, `gh run list` for repos you list). It never writes outside `~/.tinyfactory`.
- The only outbound request is the weather lookup to Open-Meteo. If you list repositories under `github`, it also asks GitHub about them through your own `gh` CLI.

## Reporting a vulnerability

Please report privately through GitHub: [report a vulnerability](https://github.com/ybkjs/tinyfactory/security/advisories/new).
Include what you found, how to reproduce it and the version. You should hear back within a week. Please don't open a
public issue for security problems.
