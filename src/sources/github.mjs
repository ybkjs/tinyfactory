// GitHub Actions, only for the repositories listed in the config: { "github": { "repos": ["owner/repo"] } }.
// Each workflow is a line and each finished run a parcel. It asks through the GitHub CLI (`gh`), so it uses the
// account you're already logged into and nothing is sent anywhere unless you list repos.
import { run } from "../util.mjs";

export const id = "github";
const EVERY = 60000;   // ask GitHub at most once a minute per repository
const FIELDS = "databaseId,workflowName,displayTitle,status,conclusion,createdAt,updatedAt,event,headBranch";

// `gh run list --json …` for one repository → a group (one factory per repository)
export function runsGroup(repo, list, now = Date.now()) {
  if (!Array.isArray(list) || !list.length) return null;
  const today = new Date(now).setHours(0, 0, 0, 0);
  const byWorkflow = new Map();
  for (const r of list) {
    if (!r?.workflowName) continue;
    if (!byWorkflow.has(r.workflowName)) byWorkflow.set(r.workflowName, []);
    byWorkflow.get(r.workflowName).push(r);
  }
  const lines = [], runs = [];
  for (const [name, all] of byWorkflow) {
    const list = all.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const lineId = `github:${repo}:${name}`;
    const done = list.filter((r) => r.status === "completed");
    const latest = done[0];
    let status = "idle", note = null;
    if (list.some((r) => r.status === "in_progress")) status = "running";
    else if (list.some((r) => ["queued", "waiting", "pending", "requested"].includes(r.status))) status = "queued";
    else if (latest && ["failure", "timed_out", "startup_failure"].includes(latest.conclusion)) {
      // Count the failures in a row from the latest
      const streak = done.findIndex((r) => !["failure", "timed_out", "startup_failure"].includes(r.conclusion));
      status = "warn";
      note = streak === 1 || (streak === -1 && done.length === 1) ? { key: "lastFailed" } : { key: "failing", n: streak === -1 ? done.length : streak };
    }
    const events = [...new Set(list.map((r) => r.event))];
    lines.push({
      id: lineId, name, icon: "🐙",
      description: latest ? `${latest.displayTitle} · ${latest.headBranch}` : undefined,
      schedule: { type: "text", value: events.includes("schedule") ? "schedule" : `on ${events[0] || "push"}` },
      status, note,
      last: latest ? Date.parse(latest.updatedAt) : 0,
      today: done.filter((r) => Date.parse(r.updatedAt) >= today).length
    });
    for (const r of done) runs.push({ id: `github:${repo}:${r.databaseId}`, line: lineId, at: Date.parse(r.updatedAt), ok: ["success", "skipped", "neutral"].includes(r.conclusion) });
  }
  if (!lines.length) return null;
  return {
    factory: { id: `github:${repo}`, name: repo, building: "studio", color: "#6e7681" },
    agent: { id: "github", kind: "custom", name: "GitHub Actions", sub: "CI", color: "#57606a", status: lines.some((l) => l.status === "running") ? "running" : "idle" },
    lines,
    runs
  };
}

export async function collect(ctx) {
  const repos = (ctx.config.github?.repos || []).filter((r) => /^[\w.-]+\/[\w.-]+$/.test(r));
  if (!repos.length) return null;
  ctx.memory.github ||= {};
  const groups = [];
  for (const repo of repos) {
    const cache = ctx.memory.github[repo];
    if (!cache || Date.now() - cache.at > EVERY) {
      const out = await run("gh", ["run", "list", "-R", repo, "-L", "40", "--json", FIELDS], { timeout: 15000 });
      let list = null;
      try { list = out ? JSON.parse(out) : null; } catch { /* keep the last good answer */ }
      ctx.memory.github[repo] = { at: Date.now(), group: list ? runsGroup(repo, list) : cache?.group || null };
    }
    if (ctx.memory.github[repo].group) groups.push(ctx.memory.github[repo].group);
  }
  return groups.length ? groups : null;
}
