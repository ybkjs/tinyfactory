// npm run check: every JavaScript file parses, the config and package manifest are sane. No dependencies.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".git", "site", "fixtures"].includes(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(m?js)$/.test(name)) files.push(path);
  }
})(root);
let failed = 0;
for (const file of files) {
  try { execFileSync(process.execPath, ["--check", file], { stdio: "pipe" }); } catch (e) { failed += 1; console.error(String(e.stderr || e.message)); }
}
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
for (const key of ["name", "version", "bin", "files", "engines", "license"]) if (!pkg[key]) { failed += 1; console.error(`package.json is missing "${key}"`); }
const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
if (!changelog.includes(`## ${pkg.version} `)) { failed += 1; console.error(`CHANGELOG.md has no section for ${pkg.version}`); }
console.log(`${files.length} files checked${failed ? `, ${failed} problem${failed === 1 ? "" : "s"}` : ", all good"}`);
process.exit(failed ? 1 : 0);
