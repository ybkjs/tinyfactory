// Overlay: factory/line list, top counters, clock & weather, toolbar, 3D labels
import { cityName, lang, lineStatus, nameOf, scheduleText, t } from "./i18n.js";

const $ = (sel) => document.querySelector(sel);
const narrow = () => matchMedia("(max-width: 760px), (max-aspect-ratio: 4/5)").matches;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const ICONS = {
  home: '<path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z"/>',
  left: '<path d="M4 12a8 8 0 1 0 2.3-5.6"/><path d="M4 4v4h4"/>',
  right: '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v4h-4"/>',
  in: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4M8.5 11h5M11 8.5v5"/>',
  out: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4M8.5 11h5"/>',
  tag: '<path d="M4 6h10l6 6-6 6H4z"/>',
  list: '<path d="M5 7h14M5 12h14M5 17h9"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
  share: '<path d="M12 4v11M7.5 8.5L12 4l4.5 4.5"/><path d="M5 13v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5"/>'
};
const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

export function createUI({ onTool, cities }) {
  const tools = [["home", "home", "reset"], ["left", "left", "left"], ["right", "right", "right"], ["in", "zoomIn", "in"], ["out", "zoomOut", "out"], ["tag", "labels", "labels"], ["list", "tasks", "panel"], ["sun", "weather", "weather"], ["share", "share", "share"]];
  const previews = [["realtime", "live"], ["clearDay", "clear-day"], ["dusk", "dusk"], ["night", "night"], ["rain", "rain"], ["snow", "snow"], ["snowNight", "snow-night"]];
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  document.body.insertAdjacentHTML("beforeend", `
    <div class="card brand">
      <div class="brand-icon">🏭</div>
      <div><div class="brand-title" id="brand-title">tinyfactory · ${t("title")}</div><div class="brand-sub"><i class="dot live"></i><span id="mode">${t("live")}</span></div></div>
    </div>
    <div class="card stats">
      <div><b id="s-running" class="c-running">0</b><span>${t("running")}</span></div>
      <div><b id="s-queued" class="c-queued">0</b><span>${t("queued")}</span></div>
      <div><b id="s-warn" class="c-warn">0</b><span>${t("warn")}</span></div>
      <div><b id="s-done">0</b><span>${t("doneToday")}</span></div>
    </div>
    <div class="card clock"><div id="c-time">--:--</div><div id="c-date"></div><div id="c-weather"></div></div>
    <div class="card panel" id="panel"></div>
    <div class="labels" id="labels"></div>
    <div class="toolbar">
      ${tools.map(([i, k, a]) => `<button data-act="${a}" title="${t(k)}" aria-label="${t(k)}" class="${a === "in" || a === "out" ? "wide-only" : ""}${a === "out" || a === "weather" ? " group-end" : ""}">${icon(i)}<span>${t(k)}</span></button>`).join("")}
    </div>
    <div class="weather-menu" id="weather-menu">
      <div class="menu-title">${t("city")}</div>
      <div class="city-row">${cities.map((c) => `<button data-city="${esc(c.id)}">${esc(cityName(c))}</button>`).join("")}</div>
      <div class="menu-title">${t("preview")}</div>
      ${previews.map(([k, v]) => `<button data-weather="${v}">${t(k)}</button>`).join("")}
    </div>
    <div class="card empty" id="empty" hidden></div>
    <div class="card cta" id="cta" hidden></div>
  `);
  const menu = $("#weather-menu");
  // Mid-size windows: the task list starts folded so it doesn't squeeze the park (the camera frames for this too)
  if (!narrow() && innerWidth <= 1100) { $("#panel").classList.add("hidden"); $('[data-act="panel"]').classList.add("off"); }
  for (const b of document.querySelectorAll(".toolbar > button")) b.addEventListener("click", () => {
    const act = b.dataset.act;
    if (act === "labels") {
      // Three steps: the lines worth a look (default) → every line → none
      const next = { key: "all", all: "off", off: "key" }[document.body.dataset.labels || "key"];
      document.body.dataset.labels = next;
      document.body.classList.toggle("no-labels", next === "off");
      b.classList.toggle("off", next === "off");
      b.querySelector("span").textContent = t(next === "all" ? "labelsAll" : "labels");
    }
    // Phones: the list is a sheet over the bottom of the scene, closed until asked for
    else if (act === "panel" && narrow()) document.body.classList.toggle("sheet");
    else if (act === "panel") { $("#panel").classList.toggle("hidden"); b.classList.toggle("off"); }
    else if (act === "weather") { menu.classList.remove("from-clock"); menu.classList.toggle("open"); }
    else onTool(act);
  });
  for (const b of document.querySelectorAll("[data-city]")) b.addEventListener("click", () => onTool("city", b.dataset.city));
  $(".clock").addEventListener("click", () => { menu.classList.add("from-clock"); menu.classList.toggle("open"); });
  for (const b of document.querySelectorAll("[data-weather]")) b.addEventListener("click", () => { menu.classList.remove("open"); onTool("weather", b.dataset.weather); });
  document.body.addEventListener("click", (e) => {
    const b = e.target.closest("[data-copy]");
    if (!b) return;
    navigator.clipboard?.writeText(b.dataset.copy).then(() => { b.textContent = t("copied"); setTimeout(() => { b.textContent = t("copy"); }, 1600); }).catch(() => {});
  });
  $("#panel").addEventListener("click", (e) => {
    const row = e.target.closest("[data-line]");
    if (!row) return;
    document.body.classList.remove("sheet");
    onTool("focus", row.dataset.line);
  });

  const labelEls = new Map();
  function label(id, html, kind) {
    let el = labelEls.get(id);
    if (!el) {
      el = document.createElement("div");
      el.className = `tag ${kind}`;
      $("#labels").appendChild(el);
      labelEls.set(id, el);
    }
    // Measure only when the content changes, so frames never force a layout
    if (el._html !== html) { el.innerHTML = html; el._html = html; el._w = el.offsetWidth; el._h = el.offsetHeight; }
    return el;
  }

  function render(state) {
    if (state.title) $("#brand-title").textContent = `${state.title} · ${t("title")}`;
    $("#mode").textContent = state.demo ? t("demo") : state.stale ? t("stale") : t("live");
    $(".brand-sub .dot").className = `dot ${state.demo ? "queued" : state.stale ? "warn" : "live"}`;
    const c = state.counts || {};
    $("#s-running").textContent = c.running || 0;
    $("#s-queued").textContent = c.queued || 0;
    $("#s-warn").textContent = c.warn || 0;
    $("#s-done").textContent = c.done || 0;

    const agentName = new Map(state.agents.map((a) => [a.id, a]));
    const groups = state.factories.map((f) => {
      const busy = f.lines.filter((l) => l.status === "running").length;
      return `<div class="group">
        <div class="group-head"><i class="dot" style="background:${f.color || "#999"}"></i><b>${esc(nameOf(f.name))}</b><span class="muted">${t("lines", f.lines.length)}${busy ? ` · ${t("busy", busy)}` : ""}</span></div>
        ${f.lines.map((l) => {
          const a = agentName.get(l.agent);
          const cls = l.status === "scheduled" ? "hollow" : l.status;
          const right = l.status === "scheduled" ? "muted" : `c-${l.status}`;
          return `<div class="row" data-line="${esc(l.id)}">
            <i class="dot ${cls}"></i>
            <div class="row-main"><div class="row-top"><span class="row-name">${esc(nameOf(l.name))}</span><span class="${right}">${esc(lineStatus(l))}</span></div>
            <div class="row-sub">${esc(scheduleText(l.schedule))} → <span class="chip"><i style="background:${a?.color || "#999"}"></i>${esc(nameOf(a?.name || l.agent))}</span>${l.today ? `<span class="muted"> · ${t("today", l.today)}</span>` : ""}</div></div>
          </div>`;
        }).join("")}
      </div>`;
    }).join("");
    const agents = state.agents.map((a) => `<div class="row"><i class="dot ${a.status === "running" ? "running" : a.status === "warn" ? "warn" : "idle"}"></i><div class="row-main"><div class="row-top"><span class="row-name">${esc(nameOf(a.name))}</span><span class="c-${a.status || "idle"}">${a.status === "running" ? t("processing") : a.status === "warn" ? t("warn") : t("standby")}</span></div>
      <div class="row-sub"><span class="chip"><i style="background:${a.color}"></i>${esc(nameOf(a.sub || ""))}</span><span class="muted"> ${t("doneN", a.done || 0)}</span></div></div></div>`).join("");
    $("#panel").innerHTML = `${groups}${state.agents.length ? `<div class="group"><div class="group-head agent-head">${t("agents")}</div>${agents}</div>` : ""}`;

    const empty = $("#empty");
    if (!state.factories.length && !state.demo) {
      // What was looked for and where, then the two ways to get a first line on the map
      const where = { claude: "~/.claude/jobs", codex: "~/.codex/automations", openclaw: "~/.openclaw/cron", cron: "crontab -l", launchd: "~/Library/LaunchAgents", systemd: "systemctl list-timers" };
      const skip = { launchd: state.platform && state.platform !== "darwin", systemd: state.platform && state.platform !== "linux", cron: state.platform === "win32" };
      const looked = (state.scanned || []).filter((s) => where[s.id] && !skip[s.id]);
      const curl = `curl -X POST ${location.origin}/api/event -H 'content-type: application/json' -d '{"line":"backup","status":"done"}'`;
      const html = `<h3>${t("emptyTitle")}</h3>
        ${looked.length ? `<div class="looked"><div class="muted">${t("emptyLooked")}</div>${looked.map((s) => `<div class="looked-row"><i class="dot ${s.found ? "live" : ""}"></i><b>${esc(t("sources")[s.id])}</b><code>${esc(where[s.id])}</code></div>`).join("")}</div>` : ""}
        <div class="muted start-title">${t("emptyStart")}</div>
        <div class="step"><span class="num">1</span><div>${t("emptyDemo")} <code class="inline">--demo</code></div></div>
        <div class="step"><span class="num">2</span><div>${t("emptyWebhook")}<div class="snippet"><code>${esc(curl)}</code><button data-copy="${esc(curl)}">${t("copy")}</button></div></div></div>`;
      if (empty._html !== html) { empty.innerHTML = html; empty._html = html; }
      empty.hidden = false;
    } else empty.hidden = true;

    // Online demo: how to get the real thing on your own computer
    const cta = $("#cta");
    if (state.online && cta.hidden) {
      const { install, repo } = state.online;
      cta.innerHTML = `<div class="cta-full"><div class="cta-head"><b>${t("onlineTitle")}</b><a href="${esc(repo)}" target="_blank" rel="noopener">GitHub ↗</a></div>
        <div class="snippet"><code>${esc(install)}</code><button data-copy="${esc(install)}">${t("copy")}</button></div></div>
        <a class="cta-short" href="${esc(repo)}" target="_blank" rel="noopener">${t("onlineShort")}</a>`;
      cta.hidden = false;
      document.body.classList.add("online");
    }
  }

  function setCity(id) {
    for (const b of document.querySelectorAll("[data-city]")) b.classList.toggle("on", b.dataset.city === id);
  }

  function renderClock(now, city, weather) {
    const d = new Date(now);
    const week = t("week");
    $("#c-time").textContent = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    $("#c-date").textContent = lang === "zh" ? `${d.getMonth() + 1}月${d.getDate()}日 周${week[d.getDay()]}` : `${week[d.getDay()]}, ${d.toLocaleDateString("en", { month: "short", day: "numeric" })}`;
    $("#c-weather").textContent = weather ? `${weather.emoji} ${city} · ${weather.text}${weather.temp !== undefined ? ` ${Math.round(weather.temp)}°` : ""}` : city;
  }

  return { render, renderClock, setCity, label, labelEls };
}
