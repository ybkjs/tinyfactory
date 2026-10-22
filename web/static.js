// Online demo (GitHub Pages, built by scripts/build-site.mjs): there is no server, so the demo factory runs in the page
// and the weather comes straight from Open-Meteo. The local app never loads this file.
import { CITIES, defaultCity } from "./src/cities.js";
import { createCollector } from "./src/assemble.js";
import { demoSource } from "./src/demo.js";

const collector = createCollector({ sources: [demoSource()] });
const info = {
  title: "",
  demo: true,
  online: { install: "npx github:ybkjs/tinyfactory", repo: "https://github.com/ybkjs/tinyfactory" },
  city: defaultCity(),
  lang: (navigator.language || "").toLowerCase().startsWith("zh") ? "zh" : "en",
  interval: 4,
  cities: CITIES
};

export async function fetchState() {
  return { ...(await collector.refresh()), ...info };
}

export async function fetchWeather(lat, lon) {
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`, { signal: AbortSignal.timeout(9000) });
  const body = await res.json();
  return { code: body.current?.weather_code, temp: body.current?.temperature_2m };
}
