// Small helpers shared by the sources. Everything here is read-only.
import { execFile } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const HOME = homedir();
export const home = (...parts) => join(HOME, ...parts);

export function run(cmd, args, { timeout = 5000 } = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => resolve(error ? null : stdout));
  });
}

export function readJson(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

export function readText(path) {
  try { return readFileSync(path, "utf8"); } catch { return null; }
}

export function listDir(path) {
  try { return readdirSync(path); } catch { return []; }
}

export function mtime(path) {
  try { return statSync(path).mtimeMs; } catch { return 0; }
}

export const exists = existsSync;

// sqlite3 CLI in read-only mode (ships with macOS). Returns rows or null when unavailable.
export async function sqlite(db, sql) {
  if (!existsSync(db)) return null;
  const out = await run("sqlite3", ["-readonly", "-json", `file:${db}?mode=ro`, sql]);
  if (out === null) return null;
  try { return out.trim() ? JSON.parse(out) : []; } catch { return null; }
}

// Minimal TOML reader for flat key = value files (Codex automation.toml). Handles strings, triple-quoted strings, numbers, booleans.
export function parseFlatToml(text) {
  const result = {};
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    let value = rawValue.trim();
    if (value.startsWith('"""')) {
      let body = value.slice(3);
      while (!body.includes('"""') && i + 1 < lines.length) body += `\n${lines[++i]}`;
      result[key] = body.slice(0, body.indexOf('"""'));
    } else if (value.startsWith('"')) {
      try { result[key] = JSON.parse(value.slice(0, value.lastIndexOf('"') + 1)); } catch { result[key] = value.replace(/^"|"$/g, ""); }
    } else if (value === "true" || value === "false") result[key] = value === "true";
    else if (/^-?\d+(\.\d+)?$/.test(value)) result[key] = Number(value);
    else result[key] = value;
  }
  return result;
}

export const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

// "codex:*" style globs used by config (hide / factories.match)
export function globMatch(pattern, value) {
  const re = new RegExp(`^${pattern.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
  return re.test(value);
}

// Normalise timestamps that may be seconds or milliseconds
export const ms = (t) => (!t ? 0 : t < 1e12 ? t * 1000 : t);
