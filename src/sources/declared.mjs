// Lines you declare in the config for things tinyfactory can't see from this machine (a cloud server, a SaaS job).
// They show up on the map as "not connected" until a live source reports the same id.
//   "lines": [{ "id": "shop-health", "name": "Uptime check", "factory": "My shop", "agent": "server", "schedule": { "type": "interval", "value": 60 } }]
export const id = "declared";

export async function collect(ctx) {
  const list = ctx.config.lines || [];
  if (!list.length) return null;
  const groups = new Map();
  for (const l of list) {
    const factory = l.factory || "Declared";
    if (!groups.has(factory)) groups.set(factory, []);
    groups.get(factory).push(l);
  }
  return [...groups.entries()].map(([factory, lines], i) => {
    const meta = (ctx.config.factories || []).find((f) => f.name === factory) || {};
    return {
      factory: { id: `declared:${factory}`, name: factory, building: meta.building || ["shop", "home", "studio"][i % 3], color: meta.color || "#9aa3ad" },
      agent: null,
      lines: lines.map((l) => ({
        id: `declared:${l.id}`,
        name: l.name || l.id,
        icon: l.icon || "📦",
        agent: l.agent || "custom",
        schedule: l.schedule || { type: "manual" },
        status: "idle",
        note: { key: "notConnected" }
      })),
      runs: []
    };
  });
}
