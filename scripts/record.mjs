// Records the README media from demo mode: node scripts/record.mjs (needs Chrome and ffmpeg; CHROME=/path/to/chrome to override)
// The demo server runs with an empty HOME, so your own config (title, city) never ends up in the pictures.
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 4590;
const home = mkdtempSync(join(tmpdir(), "tinyfactory-record-"));
const server = spawn(process.execPath, ["bin/tinyfactory.mjs", "--demo", "--no-open", "--port", String(PORT), "--interval", "3"], { stdio: "ignore", env: { ...process.env, HOME: home } });
await new Promise((r) => setTimeout(r, 1500));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage();
const shot = async (query, file) => {
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1.5 });
  await page.goto(`http://127.0.0.1:${PORT}/?${query}`, { waitUntil: "load" });
  await new Promise((r) => setTimeout(r, 9000));
  await page.screenshot({ path: file, type: "jpeg", quality: 86 });
  console.log("saved", file);
};
mkdirSync("docs", { recursive: true });
await shot("weather=clear-day&q=high&lang=zh", "docs/screenshot.jpg");
await shot("weather=clear-day&q=high&lang=en", "docs/screenshot-en.jpg");
await shot("weather=snow-night&q=high&lang=zh", "docs/snow-night.jpg");
await shot("weather=dusk&q=high&lang=en", "docs/dusk.jpg");

// GIF: ~7 s of the live page through the browser's screencast, so parcels move at their real speed
const frames = "docs/.frames";
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames);
await page.setViewport({ width: 1200, height: 675, deviceScaleFactor: 1 });
await page.goto(`http://127.0.0.1:${PORT}/?weather=clear-day&lang=en&fps=30`, { waitUntil: "load" });
await new Promise((r) => setTimeout(r, 9000));
const cdp = await page.createCDPSession();
const list = [];
let recording = true;
cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
  if (!recording) return;
  const file = `${frames}/${String(list.length).padStart(4, "0")}.jpg`;
  writeFileSync(file, Buffer.from(data, "base64"));
  list.push({ file, t: metadata.timestamp });
  await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, everyNthFrame: 1 });
await new Promise((r) => setTimeout(r, 7000));
recording = false;
await cdp.send("Page.stopScreencast");
// Screencast timestamps can arrive slightly out of order: sort, and never let a frame last less than 1 ms
list.sort((a, b) => a.t - b.t);
const concat = list.map((f, i) => `file '${f.file.replace("docs/", "")}'\nduration ${Math.max(0.001, (list[i + 1]?.t ?? f.t + 1 / 12) - f.t).toFixed(4)}`).join("\n") + `\nfile '${list.at(-1).file.replace("docs/", "")}'\n`;
writeFileSync("docs/.frames.txt", concat);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", "docs/.frames.txt", "-vf", "fps=10,scale=900:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle", "docs/demo.gif"]);
rmSync(frames, { recursive: true, force: true });
rmSync("docs/.frames.txt", { force: true });
console.log("saved docs/demo.gif");
await browser.close();
server.kill();
rmSync(home, { recursive: true, force: true });
