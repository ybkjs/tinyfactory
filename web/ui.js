// Overlay: factory/line list, top counters, clock & weather, toolbar, 3D labels
import { agoText, cityName, lang, lineStatus, nameOf, pastText, scheduleText, t, whenText } from "./i18n.js";

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
  share: '<path d="M12 4v11M7.5 8.5L12 4l4.5 4.5"/><path d="M5 13v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>',
  tour: '<circle cx="12" cy="12" r="8"/><path d="M10.2 8.8l5 3.2-5 3.2z"/>'
};
// Keyboard shortcuts shown in the button tooltips (handled in main.js)
const KEYS = { reset: "H", left: "←", right: "→", in: "+", out: "−", labels: "L", panel: "T", tour: "P" };
const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

export function createUI({ onTool, cities }) {
  const tools = [["home", "home", "reset"], ["left", "left", "left"], ["right", "right", "right"], ["in", "zoomIn", "in"], ["out", "zoomOut", "out"], ["tag", "labels", "labels"], ["list", "tasks", "panel"], ["sun", "weather", "weather"], ["tour", "tour", "tour"], ["share", "share", "share"]];
  const previews = [["realtime", "live"], ["clearDay", "clear-day"], ["dusk", "dusk"], ["night", "night"], ["rain", "rain"], ["snow", "snow"], ["snowNight", "snow-night"]];
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  document.body.insertAdjacentHTML("beforeend", `
    <div class="card brand">
      <div class="brand-icon">🏭</div>
      <div><div class="brand-title" id="brand-title">tinyfactory · ${t("title")}</div><div class="brand-sub"><i class="dot live"></i><span id="mode">${t("live")}</span></div></div>
      <button class="brand-search" id="open-finder" title="${t("find")} (/)" aria-label="${t("find")}">${icon("search")}</button>
    </div>
    <div class="finder" id="finder" hidden>
      <div class="card finder-box">
        <div class="finder-input">${icon("search")}<input id="finder-input" type="search" autocomplete="off" spellcheck="false" placeholder="${t("find")}"></div>
        <div class="finder-list" id="finder-list"></div>
        <div class="finder-hint">${t("findHint")}</div>
      </div>
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
      ${tools.map(([i, k, a]) => `<button data-act="${a}" title="${t(k)}${KEYS[a] ? ` (${KEYS[a]})` : ""}" aria-label="${t(k)}" class="${["in", "out", "tour"].includes(a) ? "wide-only" : ""}${a === "out" || a === "weather" ? " group-end" : ""}">${icon(i)}<span>${t(k)}</span></button>`).join("")}
    </div>
    <div class="weather-menu" id="weather-menu">
      <div class="menu-title">${t("city")}</div>
      <div class="city-row">${cities.map((c) => `<button data-city="${esc(c.id)}">${esc(cityName(c))}</button>`).join("")}</div>
      <div class="menu-title">${t("preview")}</div>
      ${previews.map(([k, v]) => `<button data-weather="${v}">${t(k)}</button>`).join("")}
    </div>
    <div class="card feed" id="feed"></div>
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
  // The panel drills down: a row opens its detail, the back button returns to the list
  $("#panel").addEventListener("click", (e) => {
    if (e.target.closest("[data-back]")) return select(null);
    const row = e.target.closest("[data-line], [data-agent]");
    if (!row) return;
    if (row.dataset.line) onTool("pick", `line:${row.dataset.line}`);
    else onTool("pick", `agent:${row.dataset.agent}`);
  });
  $("#feed").addEventListener("click", (e) => { const row = e.target.closest("[data-line]"); if (row) onTool("pick", `line:${row.dataset.line}`); });
  // Labels in the scene are clickable too
  $("#labels").addEventListener("click", (e) => { const tag = e.target.closest("[data-pick]"); if (tag) onTool("pick", tag.dataset.pick); });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && selected && finder.hidden) select(null); });

  // Quick finder: type part of a name, Enter flies to it
  const finder = $("#finder"), input = $("#finder-input"), results = $("#finder-list");
  let found = [], cursor = 0;
  function openFinder() {
    if (!last?.factories.length) return;
    finder.hidden = false;
    input.value = "";
    search();
    input.focus();
  }
  const closeFinder = () => { finder.hidden = true; input.blur(); };
  function search() {
    const q = input.value.trim().toLowerCase();
    const both = (n) => (n && typeof n === "object" ? `${n.zh || ""} ${n.en || ""}` : String(n ?? "")).toLowerCase();
    const items = [
      ...last.factories.flatMap((f) => f.lines.map((l) => ({ key: `line:${l.id}`, name: nameOf(l.name), sub: nameOf(f.name), dot: l.status === "scheduled" ? "hollow" : l.status, text: `${both(l.name)} ${l.id} ${both(f.name)}` }))),
      ...last.agents.map((a) => ({ key: `agent:${a.id}`, name: nameOf(a.name), sub: "Agent", sq: a.color, text: `${both(a.name)} ${a.id}` }))
    ];
    found = (q ? items.filter((it) => it.text.toLowerCase().includes(q)) : items).slice(0, 8);
    cursor = 0;
    paint();
  }
  function paint() {
    results.innerHTML = found.length ? found.map((it, i) => `<div class="finder-row${i === cursor ? " on" : ""}" data-i="${i}">${it.sq ? `<i class="sq" style="background:${it.sq}"></i>` : `<i class="dot ${it.dot}"></i>`}<b>${esc(it.name)}</b><span>${esc(it.sub)}</span></div>`).join("") : `<div class="finder-empty">${t("noMatch")}</div>`;
  }
  const choose = (i) => { const it = found[i]; if (!it) return; closeFinder(); onTool("pick", it.key); };
  input.addEventListener("input", search);
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); cursor = (cursor + (e.key === "ArrowDown" ? 1 : -1) + found.length) % Math.max(1, found.length); paint(); }
    else if (e.key === "Enter") { e.preventDefault(); choose(cursor); }
    else if (e.key === "Escape") { e.preventDefault(); closeFinder(); }
  });
  results.addEventListener("click", (e) => { const row = e.target.closest("[data-i]"); if (row) choose(Number(row.dataset.i)); });
  finder.addEventListener("click", (e) => { if (e.target === finder) closeFinder(); });
  $("#open-finder").addEventListener("click", openFinder);

  let selected = null, last = null;
  function select(sel) {
    selected = sel;
    if (sel) {
      // Make sure the panel is showing: the sheet on phones, unfolded elsewhere
      if (narrow()) document.body.classList.add("sheet");
      else { $("#panel").classList.remove("hidden"); $('[data-act="panel"]').classList.remove("off"); }
    }
    onTool("selected", sel);
    if (last) render(last);
  }

  const labelEls = new Map();
  function label(id, html, kind, pick) {
    let el = labelEls.get(id);
    if (!el) {
      el = document.createElement("div");
      el.className = `tag ${kind}`;
      if (pick) el.dataset.pick = pick;
      $("#labels").appendChild(el);
      labelEls.set(id, el);
    }
    // Measure only when the content changes, so frames never force a layout
    if (el._html !== html) { el.innerHTML = html; el._html = html; el._w = el.offsetWidth; el._h = el.offsetHeight; }
    return el;
  }

  function render(state) {
    last = state;
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
    const list = `${groups}${state.agents.length ? `<div class="group"><div class="group-head agent-head">${t("agents")}</div>${agents}</div>` : ""}`;
    const detail = selected && detailHtml(selected, state);
    if (selected && !detail) selected = null;
    const panelHtml = detail || list;
    if ($("#panel")._html !== panelHtml) { $("#panel").innerHTML = panelHtml; $("#panel")._html = panelHtml; }
    $("#panel").classList.toggle("detail-open", Boolean(detail));
    renderFeed(state);

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

  // Detail views: a line (status, schedule, last/next run, the last runs as bars), an agent, a factory, the hub
  function detailHtml(sel, state) {
    const lines = state.factories.flatMap((f) => f.lines.map((l) => ({ ...l, factory: f })));
    const agentById = new Map(state.agents.map((a) => [a.id, a]));
    const back = `<button class="back" data-back>‹ ${t("allTasks")}</button>`;
    const fact = (k, v) => `<div class="fact"><span>${k}</span><b>${v}</b></div>`;
    const lineRow = (l) => `<div class="row" data-line="${esc(l.id)}"><i class="dot ${l.status === "scheduled" ? "hollow" : l.status}"></i><div class="row-main"><div class="row-top"><span class="row-name">${esc(nameOf(l.name))}</span><span class="${l.status === "scheduled" ? "muted" : `c-${l.status}`}">${esc(lineStatus(l))}</span></div></div></div>`;
    if (sel.kind === "line") {
      const l = lines.find((x) => x.id === sel.id);
      if (!l) return null;
      const a = agentById.get(l.agent);
      const runs = state.history?.[l.id] || [];
      const lastAt = Math.max(l.last || 0, runs.at(-1)?.at || 0);
      const ok = runs.filter((r) => r.ok).length;
      const bars = Array.from({ length: 20 }, (_, i) => {
        const r = runs[runs.length - 20 + i];
        return r ? `<i class="${r.ok ? "ok" : "bad"}" title="${esc(pastText(r.at))}${r.ok ? "" : ` · ${t("failedRun")}`}"></i>` : "<i></i>";
      }).join("");
      return `${back}
        <div class="detail-title"><i class="dot ${l.status === "scheduled" ? "hollow" : l.status}"></i><b>${esc(nameOf(l.name))}</b></div>
        <div class="detail-sub"><i class="sq" style="background:${l.factory.color}"></i>${esc(nameOf(l.factory.name))} · ${esc(scheduleText(l.schedule))} → <span class="chip"><i style="background:${a?.color || "#999"}"></i>${esc(nameOf(a?.name || l.agent))}</span></div>
        <div class="facts">
          ${fact(t("status"), `<span class="${l.status === "scheduled" ? "" : `c-${l.status}`}">${esc(lineStatus(l)) || "—"}</span>`)}
          ${fact(t("lastRun"), lastAt ? `${esc(pastText(lastAt))} <small>${esc(agoText(lastAt))}</small>` : "—")}
          ${fact(t("nextRun"), l.next ? esc(whenText(l.next)) : "—")}
          ${fact(t("todayRuns"), esc(t("timesN", l.today || 0)))}
        </div>
        <div class="runs-head"><span>${esc(t("recentRuns", Math.min(20, runs.length) || 20))}</span>${runs.length ? `<span>${t("successRate")} ${Math.round((ok / runs.length) * 100)}%</span>` : ""}</div>
        ${runs.length ? `<div class="runs">${bars}</div><div class="runs-axis"><span>${esc(pastText(runs[Math.max(0, runs.length - 20)].at))}</span><span>${t("latest")}</span></div>` : `<div class="muted runs-empty">${t("noRuns")}</div>`}
        ${timeline(l, runs)}
        ${l.description ? `<p class="detail-desc">${esc(l.description)}</p>` : ""}
        <code class="line-id">${esc(l.id)}</code>`;
    }
    if (sel.kind === "agent") {
      const a = agentById.get(sel.id);
      if (!a) return null;
      const mine = lines.filter((l) => l.agent === a.id);
      return `${back}
        <div class="detail-title"><i class="sq" style="background:${a.color}"></i><b>${esc(nameOf(a.name))}</b></div>
        <div class="detail-sub">${esc(nameOf(a.sub || ""))}</div>
        <div class="facts">
          ${fact(t("status"), `<span class="c-${a.status || "idle"}">${a.status === "running" ? t("processing") : a.status === "warn" ? t("warn") : t("standby")}</span>`)}
          ${fact(t("doneToday"), esc(String(a.done || 0)))}
          ${a.busy ? fact(t("busyNow"), esc(String(a.busy))) : ""}
        </div>
        <div class="runs-head"><span>${t("linesHere")} · ${mine.length}</span></div>
        ${mine.map(lineRow).join("")}`;
    }
    if (sel.kind === "factory") {
      const f = state.factories.find((x) => x.id === sel.id);
      if (!f) return null;
      return `${back}
        <div class="detail-title"><i class="sq" style="background:${f.color}"></i><b>${esc(nameOf(f.name))}</b></div>
        <div class="detail-sub">${t("lines", f.lines.length)}</div>
        ${f.lines.map((l) => lineRow({ ...l, factory: f })).join("")}`;
    }
    if (sel.kind === "hub") {
      const c = state.counts || {};
      return `${back}
        <div class="detail-title"><i class="sq" style="background:#ff8a3d"></i><b>${esc(state.title || "tinyfactory")}</b> <span class="muted">${t("hubTitle")}</span></div>
        <p class="detail-desc">${t("hubText")}</p>
        <div class="facts">
          ${fact(t("linesWord"), esc(String(lines.length)))}
          ${fact("Agent", esc(String(state.agents.length)))}
          ${fact(t("doneToday"), esc(String(c.done || 0)))}
          ${fact(t("warn"), `<span class="${c.warn ? "c-warn" : ""}">${c.warn || 0}</span>`)}
        </div>
        <div class="runs-head"><span>${t("activity")}</span></div>
        ${feedRows(state, 8) || `<div class="muted runs-empty">${t("noActivity")}</div>`}`;
    }
    return null;
  }

  // When it ran over the last 24 hours, as ticks on a ruler (skipped for lines that run every few minutes: the bars say it all)
  function timeline(l, runs) {
    const now = Date.now(), from = now - 86400000;
    const recent = runs.filter((r) => r.at > from);
    const frequent = l.schedule?.type === "interval" && l.schedule.value <= 600;
    if (!recent.length || frequent) return "";
    const ticks = recent.map((r) => `<i class="${r.ok ? "ok" : "bad"}" style="left:${(((r.at - from) / 86400000) * 100).toFixed(2)}%" title="${esc(pastText(r.at))}"></i>`).join("");
    // Faint marks every six hours of the clock
    const marks = [];
    const d = new Date(from);
    d.setMinutes(0, 0, 0);
    while (d.getTime() < now) { d.setHours(d.getHours() + 1); if (d.getHours() % 6 === 0 && d.getTime() < now) marks.push(`<b style="left:${(((d.getTime() - from) / 86400000) * 100).toFixed(2)}%"><span>${String(d.getHours()).padStart(2, "0")}:00</span></b>`); }
    return `<div class="runs-head"><span>${t("last24h")}</span><span>${esc(t("timesN", recent.length))}</span></div>
      <div class="timeline">${marks.join("")}<b class="now" style="left:100%"><span>${t("now")}</span></b>${ticks}</div>`;
  }

  // The latest runs, newest first
  function feedRows(state, n) {
    const lineById = new Map(state.factories.flatMap((f) => f.lines.map((l) => [l.id, l])));
    const agentById = new Map(state.agents.map((a) => [a.id, a]));
    return (state.events || []).slice(-n).reverse().map((e) => {
      const l = lineById.get(e.line), a = agentById.get(e.agent);
      if (!l) return "";
      return `<div class="feed-row" data-line="${esc(e.line)}"><i class="dot ${e.ok === false ? "warn" : "live"}"></i><span class="feed-name">${esc(nameOf(l.name))}</span><span class="feed-agent">→ ${esc(nameOf(a?.name || e.agent))}</span><span class="feed-time">${esc(agoText(e.at))}</span></div>`;
    }).join("");
  }
  function renderFeed(state) {
    const feed = $("#feed");
    const html = `<div class="feed-head">${t("activity")}</div>${feedRows(state, 6) || `<div class="muted feed-empty">${t("noActivity")}</div>`}`;
    if (feed._html !== html) { feed.innerHTML = html; feed._html = html; }
    feed.hidden = !state.factories.length;
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

  return { render, renderClock, setCity, label, labelEls, select, openFinder, get selected() { return selected; } };
}
