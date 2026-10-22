// Records the README media from demo mode: node scripts/record.mjs (needs Chrome and ffmpeg; CHROME=/path/to/chrome to override)
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import puppeteer from "puppeteer-core";

const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 4590;
const server = spawn(process.execPath, ["bin/tinyfactory.mjs", "--demo", "--no-open", "--port", String(PORT), "--interval", "3"], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1500));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage();
const shot = async (query, file, { width = 1600, height = 900, scale = 2, wait = 9000 } = {}) => {
  await page.setViewport({ width, height, deviceScaleFactor: scale });
  await page.goto(`http://127.0.0.1:${PORT}/?${query}`, { waitUntil: "load" });
  await new Promise((r) => setTimeout(r, wait));
  await page.screenshot({ path: file });
  console.log("saved", file);
};
mkdirSync("docs", { recursive: true });
await shot("weather=clear-day&q=high&lang=zh", "docs/screenshot.png");
await shot("weather=clear-day&q=high&lang=en", "docs/screenshot-en.png");
await shot("weather=snow-night&q=high&lang=zh", "docs/snow-night.png");
await shot("weather=dusk&q=high&lang=en", "docs/dusk.png");

// GIF: ~7 s of frames from a live page
const frames = "docs/.frames";
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames);
await page.setViewport({ width: 1200, height: 675, deviceScaleFactor: 1.5 });
await page.goto(`http://127.0.0.1:${PORT}/?weather=clear-day&lang=en&fps=30`, { waitUntil: "load" });
await new Promise((r) => setTimeout(r, 9000));
for (let i = 0; i < 84; i++) {
  await page.screenshot({ path: `${frames}/${String(i).padStart(3, "0")}.png` });
  await new Promise((r) => setTimeout(r, 40));
}
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "12", "-i", `${frames}/%03d.png`, "-vf", "scale=900:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=192[p];[b][p]paletteuse=dither=sierra2_4a", "docs/demo.gif"]);
rmSync(frames, { recursive: true, force: true });
console.log("saved docs/demo.gif");
await browser.close();
server.kill();
