// Claude Code background sessions: ~/.claude/jobs/<id>/state.json
// "state" is how the last turn ended (working | blocked | done); "tempo" = active means it is busy right now
import { home, listDir, mtime, readJson, startOfToday } from "../util.mjs";

export const id = "claude";

export async function collect(ctx) {
  const dir = home(".claude/jobs");
  const jobs = [];
  for (const name of listDir(dir)) {
    const file = `${dir}/${name}/state.json`;
    const state = readJson(file);
    if (!state?.state) continue;
    const busy = state.state === "working" || state.tempo === "active";
    jobs.push({ id: name, state: busy ? "working" : state.state, title: state.name || name, at: mtime(file) });
  }
  if (!jobs.length) return null;

  // A session that stops working between two polls (finished, or handed back to you) is one delivered parcel
  const prev = ctx.memory.claude || {};
  const runs = jobs.filter((j) => prev[j.id] === "working" && j.state !== "working").map((j) => ({ id: `claude:${j.id}:${j.at}`, line: "claude:sessions", at: j.at, ok: true }));
  ctx.memory.claude = Object.fromEntries(jobs.map((j) => [j.id, j.state]));

  const working = jobs.filter((j) => j.state === "working");
  const blocked = jobs.filter((j) => j.state === "blocked");
  const today = jobs.filter((j) => j.state === "done" && j.at >= startOfToday()).length;
  return {
    factory: { id: "claude", name: { zh: "Claude Code 工作台", en: "Claude Code desk" }, building: "home", color: "#d97757" },
    agent: { id: "claude", kind: "claude", name: "Claude Code", sub: { zh: "本机", en: "this machine" }, color: "#d97757", status: working.length ? "running" : "idle", busy: working.length, done: today },
    lines: [{
      id: "claude:sessions",
      name: { zh: "后台会话", en: "Background sessions" },
      icon: "🧑‍💻",
      schedule: { type: "manual" },
      status: working.length ? "running" : blocked.length ? "warn" : "idle",
      note: blocked.length ? { key: "waiting", n: blocked.length } : working.length ? { key: "working", n: working.length } : null,
      today,
      items: jobs.sort((a, b) => b.at - a.at).slice(0, 12).map((j) => ({ title: j.title, state: j.state, at: j.at }))
    }],
    runs
  };
}
