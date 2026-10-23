// Your own sources without touching tinyfactory: every .js / .mjs file in ~/.tinyfactory/sources/, plus any paths
// listed under "sources" in the config (relative to the config file). A plugin exports `id` and `collect(ctx)` like
// the built-in sources (docs/architecture.md) and reads its options from config.plugins[id].
import { dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { HOME, home, listDir } from "./util.mjs";

export async function loadPlugins({ config = {}, configPath = home(".tinyfactory/config.json"), dir = home(".tinyfactory/sources"), taken = [], log = () => {} } = {}) {
  const fromDir = listDir(dir).filter((f) => /\.m?js$/.test(f)).sort().map((f) => join(dir, f));
  const fromConfig = (Array.isArray(config.sources) ? config.sources : []).map((p) => {
    const path = String(p).replace(/^~(?=$|[\\/])/, HOME);
    return isAbsolute(path) ? path : resolve(dirname(configPath), path);
  });
  const ids = new Set(taken), plugins = [];
  for (const file of [...new Set([...fromDir, ...fromConfig])]) {
    try {
      const mod = await import(pathToFileURL(file).href);
      if (!mod.id || typeof mod.collect !== "function") { log(`${file}: a source exports "id" and "collect(ctx)"`); continue; }
      if (ids.has(mod.id)) { log(`${file}: the id "${mod.id}" is already taken`); continue; }
      ids.add(mod.id);
      plugins.push({ id: mod.id, collect: mod.collect, file });
    } catch (e) {
      log(`${file}: ${e.message.split("\n")[0]}`);
    }
  }
  return plugins;
}
