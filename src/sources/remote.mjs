// Other machines running tinyfactory: pull their /api/state and merge it into this map.
//   "remote": [{ "name": "server", "url": "http://127.0.0.1:4525", "token": "…" }]
// Line ids become remote:<name>:<their id>, so config rules can target them ("remote:server:systemd:*").
// Reach a server through an SSH tunnel (ssh -N -L 4525:127.0.0.1:4520 you@server) rather than opening a port.
export const id = "remote";
const STALE_AFTER = 60 * 1000;

async function pull(remote) {
  const url = `${remote.url.replace(/\/$/, "")}/api/state${remote.token ? `?token=${encodeURIComponent(remote.token)}` : ""}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`${remote.name}: HTTP ${res.status}`);
  return res.json();
}

export async function collect(ctx) {
  const remotes = ctx.config.remote || [];
  if (!remotes.length) return null;
  ctx.memory.remote ||= {};
  const groups = [];
  for (const remote of remotes) {
    const name = remote.name || new URL(remote.url).host;
    const cache = ctx.memory.remote[name] ||= { state: null, at: 0 };
    try {
      cache.state = await pull({ ...remote, name });
      cache.at = Date.now();
    } catch { /* keep the last good state for a while */ }
    if (!cache.state) continue;
    const down = Date.now() - cache.at > STALE_AFTER;
    const prefix = (id) => `remote:${name}:${id}`;
    for (const f of cache.state.factories || []) {
      groups.push({
        factory: { ...f, id: prefix(f.id), lines: undefined },
        agent: null,
        lines: f.lines.map((l) => ({ ...l, id: prefix(l.id), ...(down ? { status: "warn", note: { key: "remoteDown", name } } : {}) })),
        runs: []
      });
    }
    // Their agents join the pool (only the ones still used after config rules stay on the map)
    for (const a of cache.state.agents || []) groups.push({ factory: null, agent: a, lines: [], runs: [] });
    // Their history and their new events, keyed by line and time so a run that shows up in both counts once
    const run = (line, at, ok) => ({ id: prefix(`run:${line}:${at}`), line: prefix(line), at, ok });
    const past = Object.entries(cache.state.history || {}).flatMap(([line, list]) => list.map((r) => run(line, r.at, r.ok)));
    if (!down) groups.push({ factory: null, agent: null, lines: [], runs: [...past, ...(cache.state.events || []).map((e) => run(e.line, e.at, e.ok))] });
  }
  return groups;
}
