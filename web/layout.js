// Where things go: factories stacked on the left, the hub in the middle, agents on an arc to the right.
// Sizes follow the data, so a machine with 2 automations and one with 30 both get a tidy park.
const HUB = { x: 0, z: 0, radius: 7.2 };
const MAX_DEPTH = 52;        // total height of the factory column
const MAX_MACHINES = 10;     // per factory; the rest are listed in the panel
const COLORS = ["#e8774a", "#5b8def", "#d4a32a", "#4caf7a", "#b07cd8", "#e0533d"];

export function computeLayout(state) {
  const factories = state.factories.map((f, i) => ({ ...f, color: f.color || COLORS[i % COLORS.length], visible: f.lines.slice(0, MAX_MACHINES), hiddenCount: Math.max(0, f.lines.length - MAX_MACHINES) }));
  const totalMachines = factories.reduce((n, f) => n + f.visible.length, 0);
  // Squeeze the spacing when there are many lines so the column still fits
  const spacing = Math.max(1.55, Math.min(2.3, (MAX_DEPTH - factories.length * 5.5) / Math.max(1, totalMachines)));
  for (const f of factories) {
    f.w = 12;
    f.d = Math.max(8, Math.min(26, f.visible.length * spacing + 3.2));
  }
  const gap = factories.length > 3 ? 2 : 3;
  const column = factories.reduce((sum, f) => sum + f.d, 0) + gap * Math.max(0, factories.length - 1);
  let z = -column / 2 + 2;
  factories.forEach((f, i) => {
    // A gentle curve: factories near the middle sit a bit closer to the hub
    const t = factories.length > 1 ? i / (factories.length - 1) - 0.5 : 0;
    f.x = -20.5 - Math.abs(t) * 3.5;
    f.z = z + f.d / 2;
    z += f.d + gap;
  });

  const agents = state.agents.map((a) => ({ ...a, radius: a.kind === "system" ? 4.3 : 4.7 }));
  const k = agents.length;
  const spread = k <= 1 ? 0 : Math.min(2.6, 0.58 * (k - 1));
  const R = 21 + Math.max(0, k - 4) * 1.5;
  agents.forEach((a, i) => {
    const angle = k <= 1 ? 0 : -spread / 2 + (spread * i) / (k - 1);
    a.x = Math.cos(angle) * R + 1;
    a.z = Math.sin(angle) * R;
  });

  // The pond sits bottom-centre when nothing else is there
  const pond = { x: 1.5, z: 16, r: 4.2 };
  const clear = agents.every((a) => Math.hypot(a.x - pond.x, a.z - pond.z) > a.radius + pond.r + 1.5) && factories.every((f) => f.x + f.w / 2 < pond.x - pond.r - 2);
  const xs = [...factories.flatMap((f) => [f.x - f.w / 2, f.x + f.w / 2]), ...agents.flatMap((a) => [a.x - a.radius, a.x + a.radius]), -HUB.radius, HUB.radius];
  const zs = [...factories.flatMap((f) => [f.z - f.d / 2, f.z + f.d / 2]), ...agents.flatMap((a) => [a.z - a.radius, a.z + a.radius]), -HUB.radius, HUB.radius, ...(clear ? [pond.z + pond.r] : [])];
  return {
    hub: HUB,
    factories,
    agents,
    pond: clear ? pond : null,
    bounds: { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) }
  };
}

// Structure fingerprint: when it changes the scene is rebuilt
export function signature(state) {
  return JSON.stringify([state.factories.map((f) => [f.id, f.lines.slice(0, MAX_MACHINES).map((l) => l.id)]), state.agents.map((a) => a.id)]);
}
