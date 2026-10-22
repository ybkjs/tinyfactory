import assert from "node:assert/strict";
import { test } from "node:test";
import { assemble } from "../src/collect.mjs";
import { commandName, parseCrontab } from "../src/sources/cron.mjs";
import { parseJournal, parseShow, parseStamp, timerSchedule } from "../src/sources/systemd.mjs";
import { globMatch, ms, parseFlatToml } from "../src/util.mjs";
import { lineStatus, scheduleText, setLang } from "../web/i18n.js";

test("flat TOML with triple-quoted strings", () => {
  const t = parseFlatToml('name = "Daily news"\nprompt = """\nline one\nline two\n"""\nstatus = "ACTIVE"\nversion = 1\n');
  assert.equal(t.name, "Daily news");
  assert.equal(t.prompt, "\nline one\nline two\n");
  assert.equal(t.status, "ACTIVE");
  assert.equal(t.version, 1);
});

test("helpers", () => {
  assert.ok(globMatch("codex:*", "codex:daily"));
  assert.ok(!globMatch("codex:*", "cron:abc"));
  assert.equal(ms(1773536400), 1773536400000);
  assert.equal(ms(1792713733000), 1792713733000);
});

test("crontab parsing", () => {
  const lines = parseCrontab("# comment\nMAILTO=me\n*/5 * * * * /usr/local/bin/backup.sh > /dev/null 2>&1\n@daily python3 /home/me/report.py\n@reboot /bin/true\n0 4 * * 1-5 cd /srv && make deploy\n");
  assert.deepEqual(lines.map((l) => [l.name, l.schedule.value]), [["backup", "*/5 * * * *"], ["report", "0 0 * * *"], ["make deploy", "0 4 * * 1-5"]]);
  assert.equal(commandName("node /opt/app/sync.mjs --all"), "sync");
});

test("systemd show output", () => {
  const blocks = parseShow("Id=site-health.timer\nUnit=site-health.service\nTimersMonotonic={ OnUnitActiveUSec=1min ; next_elapse=0 }\nTimersMonotonic={ OnBootUSec=2min ; next_elapse=2min }\n\nId=site-report.timer\nUnit=site-report.service\nTimersCalendar={ OnCalendar=*-*-* 09:00:00 ; next_elapse=@1792713600 }\n");
  assert.equal(blocks.length, 2);
  assert.deepEqual(timerSchedule(blocks[0]), { type: "interval", value: 60 });
  assert.deepEqual(timerSchedule(blocks[1]), { type: "calendar", value: { Hour: 9, Minute: 0 } });
  assert.equal(parseStamp("@1792640000"), 1792640000000);
  assert.equal(parseStamp("n/a"), 0);
  // Journal: a success per "Finished", a failure per "Failed with result"; other lines ignored
  const runs = parseJournal("1792678482.768469 host systemd[1]: Finished fk1-sales.service - Sales.\n1792678482.756699 host systemd[1]: fk1-sales.service: Deactivated successfully.\n1792678182.1 host node[812]: Finished nothing\n1792677882.5 host systemd[1]: fk1-sales.service: Failed with result 'exit-code'.\n");
  assert.deepEqual(runs, [{ at: 1792677882000, ok: false }, { at: 1792678482000, ok: true }]);
});

test("assemble: hide, rename, assign, regroup, known agents, counts", () => {
  const groups = [
    { factory: { id: "systemd", name: "systemd" }, agent: { id: "system", kind: "system", name: "Local scripts", color: "#4caf7a" }, lines: [
      { id: "systemd:health", name: "health", schedule: { type: "interval", value: 60 }, status: "scheduled", today: 600 },
      { id: "systemd:report", name: "report", schedule: { type: "calendar", value: { Hour: 9 } }, status: "warn", today: 1 },
      { id: "systemd:noise", name: "noise", schedule: { type: "interval", value: 60 }, status: "scheduled" }
    ] },
    { factory: { id: "webhook:x", name: "x" }, agent: { id: "deepseek", kind: "deepseek" }, lines: [{ id: "webhook:a", name: "a", agent: "deepseek", schedule: { type: "webhook" }, status: "running", today: 2 }] }
  ];
  const view = assemble(groups, {
    hide: ["systemd:noise"],
    rename: { "systemd:health": "Uptime" },
    assign: { "systemd:report": "deepseek" },
    factories: [{ name: "My shop", match: ["systemd:*"] }]
  });
  assert.deepEqual(view.factories.map((f) => [f.name, f.lines.map((l) => l.name)]), [["My shop", ["Uptime", "report"]], ["x", ["a"]]]);
  assert.equal(view.factories[0].lines[1].agent, "deepseek");
  const deepseek = view.agents.find((a) => a.id === "deepseek");
  assert.equal(deepseek.name, "DeepSeek");
  assert.equal(deepseek.status, "running");
  // the every-minute health check doesn't inflate "done today"
  assert.deepEqual(view.counts, { running: 1, queued: 0, warn: 1, done: 3 });
});

test("schedule and status text", () => {
  setLang("zh");
  assert.equal(scheduleText({ type: "rrule", value: "FREQ=DAILY;BYHOUR=8;BYMINUTE=0" }), "每天 08:00");
  assert.equal(scheduleText({ type: "rrule", value: "FREQ=WEEKLY;BYDAY=FR;BYHOUR=8;BYMINUTE=0" }), "每周五 08:00");
  assert.equal(scheduleText({ type: "rrule", value: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU;BYHOUR=9;BYMINUTE=0" }), "每天 09:00");
  assert.equal(scheduleText({ type: "cron", value: "*/5 * * * *" }), "每 5 分钟");
  assert.equal(scheduleText({ type: "cron", value: "30 4 * * 1-5" }), "工作日 04:30");
  assert.equal(scheduleText({ type: "interval", value: 60 }), "每分钟");
  assert.equal(lineStatus({ status: "warn", note: { key: "unread", n: 18 } }), "18 期没看");
  setLang("en");
  assert.equal(scheduleText({ type: "cron", value: "0 9 * * *" }), "daily 09:00");
  assert.equal(scheduleText({ type: "calendar", value: { Hour: 21, Minute: 0, Weekday: 0 } }), "Sun 21:00");
  assert.equal(lineStatus({ status: "warn", note: { key: "failing", n: 12 } }), "failed 12× in a row");
  setLang("zh");
});
