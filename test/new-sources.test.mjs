// Task Scheduler and GitHub Actions, parsed from captured output (no Windows or network needed)
import assert from "node:assert/strict";
import { test } from "node:test";
import { runsGroup } from "../src/sources/github.mjs";
import { psDate, taskSchedule, tasksGroup } from "../src/sources/schtasks.mjs";
import { scheduleText, setLang } from "../web/i18n.js";

test("schtasks: dates from PowerShell 5 and 7, 'never' is 0", () => {
  assert.equal(psDate("/Date(1792627200000)/"), 1792627200000);
  assert.equal(psDate("2026-10-22T09:00:00+08:00"), Date.parse("2026-10-22T09:00:00+08:00"));
  assert.equal(psDate("/Date(943920000000)/"), 0);
  assert.equal(psDate(null), 0);
});

test("schtasks: triggers become schedules", () => {
  assert.deepEqual(taskSchedule([{ Kind: "MSFT_TaskDailyTrigger", Start: "2026-10-01T09:30:00" }]), { type: "calendar", value: { Hour: 9, Minute: 30 } });
  assert.deepEqual(taskSchedule([{ Kind: "MSFT_TaskTimeTrigger", Start: "2026-10-01T00:00:00", Every: "PT15M" }]), { type: "interval", value: 900 });
  assert.deepEqual(taskSchedule({ Kind: "MSFT_TaskLogonTrigger" }), { type: "text", value: "at logon" });
  assert.deepEqual(taskSchedule([]), { type: "manual" });
});

test("schtasks: status from state and last result, one task or many", () => {
  const now = Date.now();
  const one = tasksGroup({ Name: "Backup", Path: "\\", State: "Ready", Last: `/Date(${now - 3600000})/`, Next: `/Date(${now + 3600000})/`, Result: 0, Triggers: [{ Kind: "MSFT_TaskDailyTrigger", Start: "2026-10-01T03:00:00" }] });
  assert.equal(one.lines[0].id, "schtasks:Backup");
  assert.equal(one.lines[0].status, "scheduled");
  assert.equal(one.runs.length, 1);
  const many = tasksGroup([
    { Name: "Sync", Path: "\\Mine\\", State: "Ready", Last: `/Date(${now - 60000})/`, Result: 1 },
    { Name: "Old", Path: "\\", State: "Disabled", Result: 0 },
    { Name: "New", Path: "\\", State: "Ready", Last: "/Date(943920000000)/", Result: 267011 },
    { Name: "Busy", Path: "\\", State: "Running", Last: `/Date(${now})/`, Result: 267009 }
  ]);
  const status = Object.fromEntries(many.lines.map((l) => [l.id, [l.status, l.note?.code]]));
  assert.deepEqual(status["schtasks:Mine/Sync"], ["warn", "0x1"]);
  assert.deepEqual(status["schtasks:Old"], ["paused", undefined]);
  assert.deepEqual(status["schtasks:New"], ["scheduled", undefined]);
  assert.deepEqual(status["schtasks:Busy"], ["running", undefined]);
  assert.deepEqual(many.runs.map((r) => [r.line, r.ok]), [["schtasks:Mine/Sync", false]]);
  assert.equal(tasksGroup([]), null);
});

test("github: workflows become lines, finished runs parcels, failures in a row counted", () => {
  const now = Date.parse("2026-10-22T14:10:00Z");
  const run = (id, workflowName, status, conclusion, minutesAgo, event = "push") => ({ databaseId: id, workflowName, status, conclusion, event, displayTitle: "msg", headBranch: "main", createdAt: new Date(now - minutesAgo * 60000 - 60000).toISOString(), updatedAt: new Date(now - minutesAgo * 60000).toISOString() });
  const g = runsGroup("me/repo", [
    run(1, "test", "completed", "failure", 5), run(2, "test", "completed", "failure", 30), run(3, "test", "completed", "success", 60),
    run(4, "pages", "in_progress", "", 1), run(5, "pages", "completed", "success", 40),
    run(6, "nightly", "completed", "success", 120, "schedule")
  ], now);
  const lines = Object.fromEntries(g.lines.map((l) => [l.name, l]));
  assert.equal(lines.test.status, "warn");
  assert.deepEqual(lines.test.note, { key: "failing", n: 2 });
  assert.equal(lines.pages.status, "running");
  assert.equal(lines.nightly.status, "idle");
  assert.deepEqual(lines.nightly.schedule, { type: "text", value: "schedule" });
  assert.equal(g.runs.length, 5);
  assert.equal(g.runs.filter((r) => !r.ok).length, 2);
  assert.equal(g.factory.name, "me/repo");
  assert.equal(runsGroup("me/repo", []), null);
  setLang("zh");
  assert.equal(scheduleText(lines.test.schedule), "推送时");
});
