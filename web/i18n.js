// Interface language (zh / en): labels, schedules, statuses. Names coming from sources may be { zh, en } or a plain string.
const params = new URLSearchParams(globalThis.location?.search || "");
export let lang = params.get("lang") || "zh";
export function setLang(value) { if (value === "zh" || value === "en") lang = value; }

const T = {
  zh: {
    title: "自动化监控", live: "实时 · 每 10 秒更新", demo: "演示模式 · 包裹是模拟的", stale: "数据源暂时连不上",
    running: "运行中", queued: "排队", warn: "需留意", doneToday: "今日完成", lines: (n) => `${n} 条产线`, busy: (n) => `${n} 条在忙`,
    idle: "待机", liveStatus: "在线", paused: "已停用", standby: "待命", processing: "处理中", agents: "Agent", today: (n) => `今日 ${n}`, doneN: (n) => `今日完成 ${n}`,
    home: "全景", left: "左转", right: "右转", zoomIn: "拉近", zoomOut: "拉远", labels: "名牌", labelsAll: "全部名牌", tour: "巡游", tasks: "全部任务", weather: "天气", share: "分享",
    city: "城市", preview: "天气预览", realtime: "实时", clearDay: "晴 · 白天", dusk: "傍晚", night: "夜晚", rain: "下雨", snow: "下雪", snowNight: "雪夜",
    hub: "中台", inTransit: (n) => `在转 ${n} 件`, more: (n) => `另有 ${n} 条`,
    emptyTitle: "这台电脑上还没找到自动化", emptyLooked: "已经找过这些地方：", emptyStart: "两种开始方式",
    onlineTitle: "装到电脑上，看你自己的任务", onlineShort: "在线演示 · 装到你的电脑上看自己的任务 →",
    emptyDemo: "先看看效果：重新运行时加上", emptyWebhook: "让任意脚本跑完报个到，它就会变成一条产线：", copy: "复制", copied: "已复制",
    sources: { claude: "Claude Code 后台会话", codex: "Codex 自动化", openclaw: "OpenClaw 定时任务", cron: "crontab", launchd: "launchd 用户任务", systemd: "systemd 定时器" },
    every: "每", minutes: "分钟", hours: "小时", daily: "每天", weekdays: "工作日", weekly: "每周", monthly: "每月", manual: "随时", realtimeSched: "实时", webhook: "收到就跑",
    week: ["日", "一", "二", "三", "四", "五", "六"], tomorrow: "明天", next: "下次",
    notes: {
      waiting: (n) => `${n} 个在等你回复`, working: (n) => `${n} 个在忙`, unread: (n) => `${n} 期没看`, stalled: () => "停摆了", failing: (n) => `连续失败 ${n} 次`,
      lastFailed: () => "上次失败", exitCode: (_, x) => `退出码 ${x.code}`, notLoaded: () => "没加载", failed: (_, x) => `失败（${x.result}）`, down: () => "没在运行", notConnected: () => "未接入", remoteDown: (_, x) => `连不上 ${x.name}`
    },
    weatherText: { clear: "晴", partly: "多云", cloudy: "阴", fog: "雾", rain: "雨", storm: "雷雨", snow: "雪" },
    shareTitle: "我的 AI 微缩工厂",
    allTasks: "全部任务", status: "状态", lastRun: "上次运行", nextRun: "下次运行", todayRuns: "今日", timesN: (n) => `${n} 次`,
    recentRuns: (n) => `最近 ${n} 次`, successRate: "成功率", noRuns: "还没有运行记录", latest: "最新", busyNow: "正在处理", linesHere: "负责的产线",
    hubTitle: "中台", hubText: "所有产线的包裹先送到这里分拣，再交给对应的 agent。", activity: "最近动态", noActivity: "新的运行会出现在这里",
    justNow: "刚刚", minAgo: (n) => `${n} 分钟前`, hourAgo: (n) => `${n} 小时前`, dayAgo: (n) => `${n} 天前`, yesterday: "昨天", today2: "今天", agentsN: (n) => `${n} 个 agent`, linesWord: "产线", failedRun: "失败", find: "查找产线或 agent", findHint: "↑↓ 选择 · 回车打开 · Esc 关闭", noMatch: "没有找到", last24h: "最近 24 小时", now: "现在"
  },
  en: {
    title: "Automation monitor", live: "Live · refreshes every 10s", demo: "Demo · parcels are simulated", stale: "Some sources unreachable",
    running: "Running", queued: "Queued", warn: "Attention", doneToday: "Done today", lines: (n) => `${n} line${n === 1 ? "" : "s"}`, busy: (n) => `${n} busy`,
    idle: "Idle", liveStatus: "Online", paused: "Paused", standby: "Standby", processing: "Working", agents: "Agents", today: (n) => `${n} today`, doneN: (n) => `${n} done today`,
    home: "Home", left: "Left", right: "Right", zoomIn: "Zoom in", zoomOut: "Zoom out", labels: "Labels", labelsAll: "All labels", tour: "Tour", tasks: "Tasks", weather: "Weather", share: "Share",
    city: "City", preview: "Preview", realtime: "Live", clearDay: "Sunny day", dusk: "Dusk", night: "Night", rain: "Rain", snow: "Snow", snowNight: "Snowy night",
    hub: "Hub", inTransit: (n) => `${n} in transit`, more: (n) => `+${n} more`,
    emptyTitle: "No automations on this machine yet", emptyLooked: "Looked in:", emptyStart: "Two ways to start",
    onlineTitle: "Run it on your own machine", onlineShort: "Online demo · run it on your computer →",
    emptyDemo: "See what it looks like: run it again with", emptyWebhook: "Have any script report in, and it becomes a line:", copy: "Copy", copied: "Copied",
    sources: { claude: "Claude Code sessions", codex: "Codex automations", openclaw: "OpenClaw jobs", cron: "crontab", launchd: "launchd agents", systemd: "systemd timers" },
    every: "every", minutes: "min", hours: "h", daily: "daily", weekdays: "weekdays", weekly: "weekly", monthly: "monthly", manual: "on demand", realtimeSched: "always on", webhook: "on event",
    week: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], tomorrow: "tomorrow", next: "next",
    notes: {
      waiting: (n) => `${n} waiting for you`, working: (n) => `${n} working`, unread: (n) => `${n} unread`, stalled: () => "stalled", failing: (n) => `failed ${n}× in a row`,
      lastFailed: () => "last run failed", exitCode: (_, x) => `exit code ${x.code}`, notLoaded: () => "not loaded", failed: (_, x) => `failed (${x.result})`, down: () => "not running", notConnected: () => "not connected", remoteDown: (_, x) => `${x.name} unreachable`
    },
    weatherText: { clear: "Clear", partly: "Partly cloudy", cloudy: "Overcast", fog: "Fog", rain: "Rain", storm: "Storm", snow: "Snow" },
    shareTitle: "My AI miniature factory",
    allTasks: "All tasks", status: "Status", lastRun: "Last run", nextRun: "Next run", todayRuns: "Today", timesN: (n) => `${n} run${n === 1 ? "" : "s"}`,
    recentRuns: (n) => `Last ${n} runs`, successRate: "Success", noRuns: "No runs recorded yet", latest: "latest", busyNow: "Working on", linesHere: "Lines",
    hubTitle: "Hub", hubText: "Every line sends its parcels here to be sorted and handed to the right agent.", activity: "Activity", noActivity: "New runs show up here",
    justNow: "just now", minAgo: (n) => `${n} min ago`, hourAgo: (n) => `${n} h ago`, dayAgo: (n) => `${n} d ago`, yesterday: "yesterday", today2: "today", agentsN: (n) => `${n} agent${n === 1 ? "" : "s"}`, linesWord: "Lines", failedRun: "failed", find: "Find a line or agent", findHint: "↑↓ choose · Enter open · Esc close", noMatch: "Nothing found", last24h: "Last 24 hours", now: "now"
  }
};

export const t = (key, ...args) => { const v = T[lang][key] ?? T.zh[key]; return typeof v === "function" ? v(...args) : v; };
export const nameOf = (n) => (n && typeof n === "object" ? n[lang] || n.zh || n.en || "" : String(n ?? ""));
export const cityName = (c) => (c ? c[lang] || c.zh || c.en || c.name : "");

const pad = (n) => String(n).padStart(2, "0");
const hm = (h, m) => `${pad(h)}:${pad(m)}`;
const DAYS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function weekdayList(days) {
  const nums = days.map((d) => (typeof d === "number" ? d : DAYS[d])).filter((d) => d !== undefined).sort();
  if (nums.length === 7) return t("daily");
  if (nums.join() === "1,2,3,4,5") return t("weekdays");
  return lang === "zh" ? `每周${nums.map((d) => T.zh.week[d]).join("、")}` : nums.map((d) => T.en.week[d]).join("/");
}

// { type: rrule | cron | interval | calendar | realtime | manual | webhook | text, value } → short text
export function scheduleText(s) {
  if (!s) return "";
  if (s.type === "manual") return t("manual");
  if (s.type === "realtime") return t("realtimeSched");
  if (s.type === "webhook") return t("webhook");
  if (s.type === "interval") {
    const sec = Number(s.value);
    if (sec < 3600) return lang === "zh" ? (sec <= 60 ? "每分钟" : `每 ${Math.round(sec / 60)} 分钟`) : (sec <= 60 ? "every minute" : `every ${Math.round(sec / 60)} min`);
    return lang === "zh" ? `每 ${Math.round(sec / 3600)} 小时` : `every ${Math.round(sec / 3600)}h`;
  }
  if (s.type === "calendar") {
    const v = s.value || {};
    const time = v.Hour !== undefined ? hm(v.Hour, v.Minute || 0) : "";
    if (v.Weekday !== undefined) return `${weekdayList([v.Weekday % 7])} ${time}`.trim();
    if (v.Day !== undefined) return lang === "zh" ? `每月 ${v.Day} 号 ${time}` : `monthly day ${v.Day} ${time}`;
    if (v.Hour === undefined && v.Minute !== undefined) return lang === "zh" ? `每小时第 ${v.Minute} 分` : `hourly at :${pad(v.Minute)}`;
    return `${t("daily")} ${time}`;
  }
  if (s.type === "rrule") {
    const r = Object.fromEntries(String(s.value).split(";").map((p) => p.split("=")));
    const time = r.BYHOUR !== undefined ? hm(Number(r.BYHOUR.split(",")[0]), Number((r.BYMINUTE || "0").split(",")[0])) : "";
    const interval = Number(r.INTERVAL || 1);
    if (r.FREQ === "MINUTELY") return scheduleText({ type: "interval", value: interval * 60 });
    if (r.FREQ === "HOURLY") return interval % 24 === 0 && time ? `${t("daily")} ${time}` : scheduleText({ type: "interval", value: interval * 3600 });
    if (r.FREQ === "DAILY") return `${t("daily")} ${time}`.trim();
    if (r.FREQ === "WEEKLY") return `${r.BYDAY ? weekdayList(r.BYDAY.split(",")) : t("weekly")} ${time}`.trim();
    if (r.FREQ === "MONTHLY") return `${t("monthly")} ${time}`.trim();
    return s.value;
  }
  if (s.type === "cron") {
    const [min, hour, dom, mon, dow] = String(s.value).split(/\s+/);
    if (min === "*" && hour === "*") return scheduleText({ type: "interval", value: 60 });
    const step = min.match(/^\*\/(\d+)$/);
    if (step && hour === "*") return scheduleText({ type: "interval", value: Number(step[1]) * 60 });
    if (/^\d+$/.test(min) && hour === "*") return lang === "zh" ? `每小时第 ${min} 分` : `hourly at :${pad(min)}`;
    if (/^\d+$/.test(min) && /^\d+$/.test(hour)) {
      const time = hm(Number(hour), Number(min));
      if (dom === "*" && mon === "*" && dow === "*") return `${t("daily")} ${time}`;
      if (dom === "*" && mon === "*") {
        const days = dow.includes("-") ? (() => { const [a, b] = dow.split("-").map(Number); return Array.from({ length: b - a + 1 }, (_, i) => a + i); })() : dow.split(",").map(Number);
        return `${weekdayList(days.map((d) => d % 7))} ${time}`;
      }
      if (/^\d+$/.test(dom) && mon === "*") return lang === "zh" ? `每月 ${dom} 号 ${time}` : `monthly day ${dom} ${time}`;
    }
    return s.value;
  }
  // Words some sources use (Task Scheduler triggers, GitHub events)
  const word = String(s.value ?? "");
  return (lang === "zh" && TEXT_ZH[word]) || word;
}
const TEXT_ZH = { "at logon": "登录时", "at startup": "开机时", once: "运行一次", schedule: "定时", "on push": "推送时", "on pull_request": "提 PR 时", "on workflow_dispatch": "手动触发", "on release": "发版时", "on schedule": "定时", trigger: "触发器" };

// next run time → "13:25" / "明天 04:30" / "周日 21:00"
export function whenText(ms, now = Date.now()) {
  if (!ms) return "";
  const d = new Date(ms), today = new Date(now);
  const time = hm(d.getHours(), d.getMinutes());
  const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date(today).setHours(0, 0, 0, 0)) / 86400000);
  if (days <= 0) return time;
  if (days === 1) return `${t("tomorrow")} ${time}`;
  if (days < 7) return lang === "zh" ? `周${T.zh.week[d.getDay()]} ${time}` : `${T.en.week[d.getDay()]} ${time}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}

// How long ago: "刚刚" / "3 分钟前" / "2 小时前" / "4 天前"
export function agoText(ms, now = Date.now()) {
  const s = Math.max(0, (now - ms) / 1000);
  if (s < 60) return t("justNow");
  if (s < 3600) return t("minAgo", Math.floor(s / 60));
  if (s < 86400) return t("hourAgo", Math.floor(s / 3600));
  return t("dayAgo", Math.floor(s / 86400));
}

// A past moment: "10:31" today, "昨天 10:31", then "10/20 10:31"
export function pastText(ms, now = Date.now()) {
  if (!ms) return "";
  const d = new Date(ms);
  const time = hm(d.getHours(), d.getMinutes());
  const days = Math.round((new Date(now).setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  if (days <= 0) return time;
  if (days === 1) return `${t("yesterday")} ${time}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}

// The short status shown next to a line
export function lineStatus(line) {
  if (line.note) {
    const fn = T[lang].notes[line.note.key] || T.zh.notes[line.note.key];
    if (fn) return fn(line.note.n, line.note);
  }
  if (line.status === "scheduled") return line.next ? `${t("next")} ${whenText(line.next)}` : scheduleText(line.schedule);
  return { running: t("running"), live: t("liveStatus"), warn: t("warn"), queued: t("queued"), idle: t("idle"), paused: t("paused") }[line.status] || "";
}

// Open-Meteo weather code → kind for the scene + text for the card
export function describeWeather(code, temp) {
  let kind = "clear", key = "clear", emoji = "☀️";
  if ([71, 73, 75, 77, 85, 86].includes(code)) [kind, key, emoji] = ["snow", "snow", "🌨️"];
  else if (code >= 95) [kind, key, emoji] = ["rain", "storm", "⛈️"];
  else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) [kind, key, emoji] = ["rain", "rain", "🌧️"];
  else if (code === 45 || code === 48) [kind, key, emoji] = ["cloudy", "fog", "🌫️"];
  else if (code === 3) [kind, key, emoji] = ["cloudy", "cloudy", "☁️"];
  else if (code === 1 || code === 2) [kind, key, emoji] = ["clear", "partly", "⛅"];
  return { kind, text: T[lang].weatherText[key], emoji, temp };
}
