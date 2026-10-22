# Contributing

Thanks for helping. Issues and pull requests are welcome in English or Chinese (中文也可以).

## Set up

```bash
git clone https://github.com/ybkjs/tinyfactory && cd tinyfactory
npm install
npm run demo          # sample factory at http://127.0.0.1:4520
npm start             # your own machine
npm test && npm run check
```

Node 20 or newer. No build step: edit `web/` and reload the page, edit `src/` and restart.

## What fits

- **New sources** are the most useful contribution: see [docs/architecture.md](docs/architecture.md#sources).
- Fixes for a platform or a tool version you use.
- Scene and interface improvements that keep the miniature-park look.

Please keep to the project's principles: read-only, local by default, no telemetry, no new runtime dependencies
without a good reason, one small file per source.

## Pull requests

- Add or update a test for what you change (`test/`), and keep `npm test` and `npm run check` green.
- Interface text goes into both languages in `web/i18n.js`.
- Visual changes: include a before/after screenshot (`?weather=clear-day` makes them comparable).
- Note user-facing changes under a new heading at the top of `CHANGELOG.md`.
- Never commit personal paths, hostnames, tokens or screenshots of your own jobs; `npm run record` uses an empty home
  so pictures only show the demo.

## Reporting a bug

Run `npx tinyfactory doctor` and paste its output into the issue, with your OS, browser and what you expected.
Security problems: see [SECURITY.md](SECURITY.md) instead of opening a public issue.
