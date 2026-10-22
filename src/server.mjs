// Local HTTP server: the 3D page, /api/state (what's running), /api/weather (proxy to Open-Meteo), POST /api/event (webhook).
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { CITIES } from "./cities.mjs";
import { record } from "./sources/webhook.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
// three's "exports" hides package.json: go two levels up from its entry (build/three.cjs)
const THREE_DIR = dirname(dirname(createRequire(import.meta.url).resolve("three")));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml" };

function staticFile(path) {
  if (path.startsWith("/vendor/three/")) {
    const file = join(THREE_DIR, normalize(path.slice("/vendor/three/".length)));
    return file.startsWith(THREE_DIR) ? file : null;
  }
  const web = join(ROOT, "web");
  const file = join(web, normalize(path === "/" ? "index.html" : path));
  return file.startsWith(web) ? file : null;
}

const weatherCache = new Map();
async function weather(lat, lon) {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = weatherCache.get(key);
  if (hit && Date.now() - hit.at < 15 * 60 * 1000) return hit.data;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day&timezone=auto`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const body = await res.json();
  const data = { code: body.current?.weather_code, temp: body.current?.temperature_2m };
  weatherCache.set(key, { data, at: Date.now() });
  return data;
}

// Too large: keep reading (and dropping) so the client gets a proper 413 instead of a cut connection;
// only something absurdly large is cut off
function readBody(req, limit = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0, chunks = [];
    const tooLarge = Object.assign(new Error(`report too large (over ${limit / 1024} KB)`), { status: 413 });
    req.on("data", (c) => {
      size += c.length;
      if (size > limit * 64) { reject(tooLarge); req.destroy(); }
      else if (size <= limit) chunks.push(c);
    });
    req.on("end", () => (size > limit ? reject(tooLarge) : resolve(Buffer.concat(chunks).toString("utf8"))));
    req.on("error", reject);
  });
}

export function startServer({ collector, port, host, token, info, log = console.log }) {
  const json = (res, code, body) => { res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); res.end(JSON.stringify(body)); };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://local");
    try {
      if (url.pathname.startsWith("/api/")) {
        // Anyone who can reach a non-localhost server needs the token
        if (token && url.searchParams.get("token") !== token && req.headers.authorization !== `Bearer ${token}`) return json(res, 401, { error: "token required" });
        if (url.pathname === "/api/state" && req.method === "GET") {
          // A custom city from the config ({ name, lat, lon }) joins the picker
          const cities = CITIES.some((c) => c.id === info.city?.id) ? CITIES : [info.city, ...CITIES];
          return json(res, 200, { ...(collector.state || { factories: [], agents: [], counts: {}, events: [] }), ...info, cities });
        }
        if (url.pathname === "/api/weather" && req.method === "GET") {
          const lat = Number(url.searchParams.get("lat")), lon = Number(url.searchParams.get("lon"));
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return json(res, 400, { error: "lat/lon required" });
          return json(res, 200, await weather(lat, lon));
        }
        if (url.pathname === "/api/event" && req.method === "POST") {
          const body = await readBody(req);
          let event;
          try { event = JSON.parse(body || "{}"); } catch { event = Object.fromEntries(new URLSearchParams(body)); }
          const line = record(event);
          collector.refresh().catch(() => {});
          return json(res, 200, { ok: true, line: line.id });
        }
        return json(res, 404, { error: "not found" });
      }
      const file = staticFile(decodeURIComponent(url.pathname));
      if (!file || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); return res.end("not found"); }
      res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-cache" });
      createReadStream(file).pipe(res);
    } catch (error) {
      log(`error ${url.pathname}: ${error.message}`);
      if (!res.headersSent) json(res, error.status || 400, { error: error.message });
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve(server));
  });
}
