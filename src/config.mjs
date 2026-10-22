// Reads ~/.tinyfactory/config.json. A broken file is an error with its line and column (not silently ignored),
// and keys that look like typos or have the wrong type come back as warnings.
import { existsSync, readFileSync } from "node:fs";

const SHAPE = {
  title: "string", city: "string|object", lang: "string", port: "number", host: "string", token: "string", interval: "number",
  hide: "array", rename: "object", assign: "object", factories: "array", agents: "object", lines: "array", remote: "array", systemd: "object", github: "object", launchd: "object"
};

// Where JSON goes wrong, as a character index. V8 only reports a position for some mistakes, so walk the text:
// a small JSON reader that stops at the first thing that can't be there.
function errorIndex(text) {
  let i = 0;
  const ws = () => { while (/\s/.test(text[i] ?? "")) i++; };
  const fail = () => { throw i; };
  const string = () => {
    if (text[i] !== '"') fail();
    for (i++; i < text.length; i++) {
      if (text[i] === "\\") i++;
      else if (text[i] === '"') { i++; return; }
      else if (text[i] === "\n") fail();
    }
    fail();
  };
  const value = () => {
    ws();
    const c = text[i];
    if (c === "{") {
      i++; ws();
      if (text[i] === "}") { i++; return; }
      for (;;) { ws(); string(); ws(); if (text[i] !== ":") fail(); i++; value(); ws(); if (text[i] === ",") { i++; continue; } if (text[i] === "}") { i++; return; } fail(); }
    }
    if (c === "[") {
      i++; ws();
      if (text[i] === "]") { i++; return; }
      for (;;) { value(); ws(); if (text[i] === ",") { i++; continue; } if (text[i] === "]") { i++; return; } fail(); }
    }
    if (c === '"') return string();
    const m = text.slice(i).match(/^(-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?|true|false|null)/);
    if (!m) fail();
    i += m[0].length;
  };
  try { value(); ws(); return i < text.length ? i : null; } catch (at) { return typeof at === "number" ? Math.min(at, text.length) : null; }
}

// Line and column of a JSON.parse error: from V8's message when it has one, else from errorIndex
function position(text, message) {
  const lc = message.match(/line (\d+) column (\d+)/);
  if (lc) return { line: Number(lc[1]), column: Number(lc[2]) };
  const at = message.match(/position (\d+)/);
  const index = at ? Number(at[1]) : errorIndex(text);
  if (index === null) return null;
  const before = text.slice(0, index).split("\n");
  return { line: before.length, column: before.at(-1).length + 1 };
}

// Edit distance, for "did you mean"
function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

const typeOf = (v) => (Array.isArray(v) ? "array" : v === null ? "null" : typeof v);

export function checkConfig(config) {
  const warnings = [];
  if (typeOf(config) !== "object") return { config: {}, warnings: ["the file should hold a JSON object ({ … })"] };
  for (const [key, value] of Object.entries(config)) {
    const want = SHAPE[key];
    if (!want) {
      const near = Object.keys(SHAPE).map((k) => [k, distance(key.toLowerCase(), k.toLowerCase())]).sort((a, b) => a[1] - b[1])[0];
      warnings.push(near && near[1] <= 2 ? `unknown key "${key}" — did you mean "${near[0]}"?` : `unknown key "${key}" (ignored)`);
    } else if (!want.split("|").includes(typeOf(value))) warnings.push(`"${key}" should be ${want.replace("|", " or ")}, not ${typeOf(value)}`);
  }
  for (const [i, r] of (Array.isArray(config.remote) ? config.remote : []).entries()) if (!r?.url) warnings.push(`remote[${i}] needs a "url"`);
  for (const [i, l] of (Array.isArray(config.lines) ? config.lines : []).entries()) if (!l?.id) warnings.push(`lines[${i}] needs an "id"`);
  for (const [i, f] of (Array.isArray(config.factories) ? config.factories : []).entries()) if (!f?.name) warnings.push(`factories[${i}] needs a "name"`);
  for (const p of Array.isArray(config.hide) ? config.hide : []) if (typeof p !== "string") warnings.push(`"hide" holds patterns like "cron:*", found ${typeOf(p)}`);
  for (const r of Array.isArray(config.github?.repos) ? config.github.repos : []) if (!/^[\w.-]+\/[\w.-]+$/.test(String(r))) warnings.push(`github.repos: "${r}" should look like "owner/repo"`);
  return { config, warnings };
}

// { config, warnings, error, found }: a missing file is fine (empty config); a broken one is an error to report
export function loadConfig(path) {
  if (!existsSync(path)) return { config: {}, warnings: [], error: null, found: false };
  let text;
  try { text = readFileSync(path, "utf8"); } catch (e) { return { config: {}, warnings: [], error: `can't read ${path}: ${e.message}`, found: true }; }
  if (!text.trim()) return { config: {}, warnings: [], error: null, found: true };
  try {
    return { ...checkConfig(JSON.parse(text)), error: null, found: true };
  } catch (e) {
    const at = position(text, e.message);
    const line = at ? text.split("\n")[at.line - 1] : "";
    const where = at ? ` at line ${at.line}, column ${at.column}` : "";
    const pointer = at ? `\n    ${line}\n    ${" ".repeat(Math.max(0, at.column - 1))}^` : "";
    const reason = e.message.replace(/ in JSON at position \d+.*$/, "").replace(/, ".*" is not valid JSON$/s, "");
    return { config: {}, warnings: [], error: `${path} isn't valid JSON${where}: ${reason}${pointer}`, found: true };
  }
}
