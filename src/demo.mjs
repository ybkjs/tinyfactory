// --demo: a sample factory with simulated runs, for screenshots and for people who haven't set up any automations yet
const now = Date.now();
const H = 3600000;

export const DEMO_GROUPS = [
  {
    factory: { id: "shop", name: { zh: "我的网店", en: "My shop" }, building: "shop", color: "#e8774a" },
    agent: { id: "system", kind: "system", name: { zh: "云服务器", en: "Cloud server" }, sub: "systemd", color: "#4caf7a", status: "running" },
    lines: [
      { id: "shop:health", name: { zh: "官网健康检查", en: "Uptime check" }, icon: "❤️", schedule: { type: "interval", value: 60 }, status: "running", today: 683 },
      { id: "shop:sales", name: { zh: "销量库存监控", en: "Sales & stock" }, icon: "📈", schedule: { type: "interval", value: 300 }, status: "scheduled", next: now + 0.05 * H, today: 136 },
      { id: "shop:report", name: { zh: "每日简报", en: "Daily report" }, icon: "🗞️", schedule: { type: "calendar", value: { Hour: 9, Minute: 0 } }, status: "scheduled", next: now + 20 * H, today: 1 },
      { id: "shop:deploy", name: { zh: "同步构建发布", en: "Nightly deploy" }, icon: "🔄", schedule: { type: "calendar", value: { Hour: 4, Minute: 30 } }, status: "scheduled", next: now + 15 * H, today: 1 },
      { id: "shop:chat", name: { zh: "在线客服", en: "Live support" }, icon: "💬", schedule: { type: "realtime" }, status: "live" }
    ]
  },
  {
    factory: { id: "content", name: { zh: "内容工作室", en: "Content studio" }, building: "studio", color: "#5b8def" },
    agent: { id: "codex", kind: "codex", name: "Codex", sub: { zh: "ChatGPT 桌面版", en: "ChatGPT desktop" }, color: "#6b6cf6", status: "idle" },
    lines: [
      { id: "content:news", name: { zh: "AI 新闻晨报", en: "AI news digest" }, icon: "📰", schedule: { type: "rrule", value: "FREQ=DAILY;BYHOUR=8;BYMINUTE=0" }, status: "scheduled", next: now + 19 * H, today: 1 },
      { id: "content:weekly", name: { zh: "周五大事件", en: "Friday roundup" }, icon: "📮", schedule: { type: "rrule", value: "FREQ=WEEKLY;BYDAY=FR;BYHOUR=8;BYMINUTE=0" }, status: "warn", note: { key: "unread", n: 18 } },
      { id: "content:topics", name: { zh: "选题整理", en: "Topic ideas" }, icon: "💡", schedule: { type: "rrule", value: "FREQ=WEEKLY;BYDAY=MO;BYHOUR=10;BYMINUTE=0" }, status: "scheduled", next: now + 90 * H }
    ]
  },
  {
    factory: { id: "home", name: { zh: "我的小家", en: "Home" }, building: "home", color: "#d4a32a" },
    agent: { id: "claude", kind: "claude", name: "Claude Code", sub: { zh: "本机", en: "this machine" }, color: "#d97757", status: "running", busy: 1 },
    lines: [
      { id: "home:inbox", name: { zh: "随手记", en: "Quick capture" }, icon: "✍️", schedule: { type: "realtime" }, agent: "deepseek", status: "live", today: 3 },
      { id: "home:morning", name: { zh: "早报", en: "Morning brief" }, icon: "☀️", schedule: { type: "calendar", value: { Hour: 11, Minute: 0 } }, agent: "system", status: "scheduled", next: now + 22 * H, today: 1 },
      { id: "home:review", name: { zh: "周报复盘", en: "Weekly review" }, icon: "📒", schedule: { type: "rrule", value: "FREQ=WEEKLY;BYDAY=SU;BYHOUR=21;BYMINUTE=0" }, agent: "deepseek", status: "scheduled", next: now + 70 * H },
      { id: "home:sessions", name: { zh: "后台会话", en: "Background sessions" }, icon: "🧑‍💻", schedule: { type: "manual" }, status: "running", note: { key: "working", n: 1 } }
    ]
  },
  { factory: null, agent: { id: "deepseek", kind: "deepseek", name: "DeepSeek", sub: "V4.1 Flash", color: "#4d6bfe", status: "idle" }, lines: [] }
];

// Fake runs: one source whose collect() hands out a few random finished runs each time
export function demoSource() {
  const weights = [["shop:health", 5], ["shop:sales", 2], ["home:inbox", 2], ["home:sessions", 1], ["content:news", 1], ["home:morning", 1], ["shop:chat", 2], ["home:review", 1]];
  const total = weights.reduce((s, [, w]) => s + w, 0);
  let n = 0, seeded = false;
  // How often each demo line ran over the past hours (minutes between runs) and how often it failed
  const PAST = { "shop:health": [1, 0.01], "shop:sales": [5, 0.04], "shop:report": [1440, 0], "shop:deploy": [1440, 0], "shop:chat": [12, 0], "content:news": [1440, 0], "content:weekly": [10080, 0], "home:inbox": [45, 0], "home:morning": [1440, 0], "home:sessions": [70, 0], "content:topics": [10080, 0] };
  return {
    id: "demo",
    async collect() {
      const runs = [];
      if (!seeded) {
        // First look: a believable history so the detail cards aren't empty
        seeded = true;
        for (const [line, [every, fail]] of Object.entries(PAST)) {
          for (let k = 1; k <= 20; k++) {
            const at = Date.now() - k * every * 60000 * (0.9 + Math.random() * 0.2);
            if (at < Date.now() - 8 * 86400000) break;
            runs.push({ id: `demo:past:${line}:${k}`, line, at, ok: Math.random() >= fail });
          }
        }
      }
      const count = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < count; i++) {
        let r = Math.random() * total;
        for (const [line, w] of weights) if ((r -= w) <= 0) { runs.push({ id: `demo:${n++}`, line, at: Date.now() - Math.random() * 4000, ok: Math.random() > 0.05 }); break; }
      }
      return DEMO_GROUPS.map((g, i) => (i === 0 ? { ...g, runs } : g)).map((g) => (g.factory ? g : { ...g, factory: { id: "_", name: "", building: "home", color: "#888" } }));
    }
  };
}
