// The part of collecting that needs no Node: merging source groups with the config, and turning runs into parcel events.
// Shared by the local server (collect.mjs) and the online demo page.

// "codex:*" style globs used by config (hide / factories.match)
export function globMatch(pattern, value) {
  const re = new RegExp(`^${pattern.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
  return re.test(value);
}

const HISTORY = 20;          // runs kept per line for the detail card
const HIGH_FREQUENCY = 600; // lines that run every ≤10 min don't count toward "done today"
// Defaults for agents a line can point at without anyone describing them (e.g. a webhook saying agent: "deepseek")
export const KNOWN_AGENTS = {
  claude: { kind: "claude", name: "Claude Code", sub: { zh: "本机", en: "this machine" }, color: "#d97757" },
  codex: { kind: "codex", name: "Codex", sub: { zh: "ChatGPT 桌面版", en: "ChatGPT desktop" }, color: "#6b6cf6" },
  openclaw: { kind: "openclaw", name: "OpenClaw", sub: { zh: "网关", en: "gateway" }, color: "#e0533d" },
  deepseek: { kind: "deepseek", name: "DeepSeek", sub: "API", color: "#4d6bfe" },
  system: { kind: "system", name: { zh: "本机脚本", en: "Local scripts" }, sub: "cron / launchd / systemd", color: "#4caf7a" },
  custom: { kind: "custom", name: { zh: "自定义", en: "Custom" }, sub: "webhook", color: "#c9a227" },
  github: { kind: "custom", name: "GitHub Actions", sub: "CI", color: "#57606a" }
};

function intervalSeconds(schedule) {
  if (schedule?.type === "interval") return schedule.value;
  if (schedule?.type === "cron") {
    const m = String(schedule.value).match(/^\*\/(\d+) \* \* \* \*$/);
    if (m) return Number(m[1]) * 60;
    if (/^\* \* \* \* \*$/.test(schedule.value)) return 60;
  }
  return Infinity;
}

// groups: [{ factory, agent, lines, runs }] from the sources → the state the browser draws
export function assemble(groups, config = {}) {
  const agents = new Map();
  for (const g of groups) {
    const a = g.agent;
    if (!a?.id) continue;
    // The same agent can come from several sources (cron + launchd → "system"): the first full definition wins, counts add up
    const prev = agents.get(a.id);
    const base = prev?.name ? prev : { ...prev, ...a };
    const running = prev?.status === "running" || a.status === "running";
    agents.set(a.id, { ...base, status: running ? "running" : base.status || "idle", busy: (prev?.busy || 0) + (a.busy || 0), done: (prev?.done || 0) + (a.done || 0) });
  }
  for (const [id, extra] of Object.entries(config.agents || {})) agents.set(id, { kind: "custom", color: "#888", status: "idle", ...agents.get(id), ...extra, id });

  const hidden = (id) => (config.hide || []).some((p) => globMatch(p, id));
  const custom = (config.factories || []).map((f) => ({ id: f.id || f.name, name: f.name, color: f.color || "#c9a227", building: f.building || "shop", match: [...(f.match || []), ...(config.lines || []).filter((l) => l.factory === f.name).map((l) => `declared:${l.id}`)], lines: [] }));
  const factories = [];
  // A declared line steps aside once the live line it stands in for shows up
  const liveIds = new Set(groups.flatMap((g) => g.lines.map((l) => l.id)));
  for (const g of groups) {
    const factory = { ...g.factory, lines: [] };
    for (const line of g.lines) {
      if (hidden(line.id) || (line.live && liveIds.has(line.live))) continue;
      const l = { ...line, agent: line.agent || g.agent?.id || "custom" };
      if (config.rename?.[l.id]) l.name = config.rename[l.id];
      for (const [pattern, agent] of Object.entries(config.assign || {})) if (globMatch(pattern, l.id)) l.agent = agent;
      const target = custom.find((f) => f.match.some((p) => globMatch(p, l.id)));
      (target || factory).lines.push(l);
    }
    if (factory.lines.length) factories.push(factory);
  }
  const all = [...custom.filter((f) => f.lines.length).map(({ match, ...f }) => f), ...factories];
  // Agents with no lines and no activity are left out of the scene
  const used = new Set(all.flatMap((f) => f.lines.map((l) => l.agent)));
  for (const id of used) {
    const known = KNOWN_AGENTS[id] || { kind: "custom", name: id, color: "#888" };
    const a = agents.get(id);
    if (!a) agents.set(id, { id, status: "idle", ...known });
    else if (!a.name) agents.set(id, { ...known, ...a, name: known.name, color: a.color || known.color, sub: a.sub || known.sub });
  }
  const agentList = [...agents.values()].filter((a) => used.has(a.id) || a.busy);
  for (const a of agentList) if (all.some((f) => f.lines.some((l) => l.agent === a.id && l.status === "running"))) a.status = "running";

  const lines = all.flatMap((f) => f.lines);
  return {
    factories: all,
    agents: agentList,
    counts: {
      running: lines.filter((l) => l.status === "running").length,
      queued: lines.filter((l) => l.status === "queued").length,
      warn: lines.filter((l) => l.status === "warn").length,
      done: lines.filter((l) => intervalSeconds(l.schedule) > HIGH_FREQUENCY).reduce((sum, l) => sum + (l.today || 0), 0)
    }
  };
}

export function createCollector({ config = {}, log = () => {}, sources }) {
  const ctx = { config, memory: {} };
  const seen = new Set();
  const events = [];
  // The last few runs of every line, history included, for the detail card
  const history = new Map();
  let seq = 0, primed = false, state = null;

  async function refresh() {
    // A source hidden as a whole ("cron:*") isn't asked at all: no point running crontab every few seconds to throw it away
    const skipped = (s) => (config.hide || []).includes(`${s.id}:*`);
    const results = await Promise.all(sources.map((s) => (skipped(s) ? null : s.collect(ctx).catch((error) => { log(`${s.id}: ${error.message}`); return null; }))));
    const groups = results.flat().filter(Boolean);
    const view = assemble(groups, config);
    const agentOf = new Map(view.factories.flatMap((f) => f.lines.map((l) => [l.id, l.agent])));
    for (const run of groups.flatMap((g) => g.runs || [])) {
      if (seen.has(run.id)) continue;
      seen.add(run.id);
      if (!history.has(run.line)) history.set(run.line, []);
      const list = history.get(run.line);
      list.push({ at: run.at, ok: run.ok !== false });
      if (list.length > HISTORY * 2) { list.sort((a, b) => a.at - b.at); list.splice(0, list.length - HISTORY); }
      // Only runs that happen while we're watching become parcels; history stays history
      if (primed && agentOf.has(run.line) && run.at > Date.now() - 10 * 60 * 1000) events.push({ id: ++seq, line: run.line, agent: agentOf.get(run.line), at: run.at, ok: run.ok });
    }
    events.splice(0, Math.max(0, events.length - 100));
    primed = true;
    const scanned = sources.map((s, i) => ({ id: s.id, found: Boolean(results[i] && (!Array.isArray(results[i]) || results[i].length)) }));
    const recent = Object.fromEntries([...agentOf.keys()].filter((id) => history.has(id)).map((id) => [id, history.get(id).sort((a, b) => a.at - b.at).slice(-HISTORY)]));
    state = { ...view, events: [...events], history: recent, scanned, generatedAt: Date.now() };
    return state;
  }

  return { refresh, get state() { return state; } };
}
