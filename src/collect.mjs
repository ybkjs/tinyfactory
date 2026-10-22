// Runs every source on this machine; assemble.mjs merges them with the user's config into what the browser draws.
import * as claude from "./sources/claude.mjs";
import * as codex from "./sources/codex.mjs";
import * as cron from "./sources/cron.mjs";
import * as declared from "./sources/declared.mjs";
import * as launchd from "./sources/launchd.mjs";
import * as openclaw from "./sources/openclaw.mjs";
import * as remote from "./sources/remote.mjs";
import * as systemd from "./sources/systemd.mjs";
import * as webhook from "./sources/webhook.mjs";
import { createCollector as collector } from "./assemble.mjs";

export const SOURCES = [claude, codex, openclaw, cron, launchd, systemd, webhook, remote, declared];
export { assemble, KNOWN_AGENTS } from "./assemble.mjs";

// Same as assemble.mjs, with every source on this machine by default
export function createCollector(options = {}) {
  return collector({ sources: SOURCES, ...options });
}
