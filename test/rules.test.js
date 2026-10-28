import test from "node:test";
import assert from "node:assert/strict";
import { shouldCloseDm } from "../src/rules.js";

test("Close DM: off means never delete", () => {
  assert.equal(shouldCloseDm({ close_dm: "0" }, { dm_rule: "close" }), false);
  assert.equal(shouldCloseDm({}, null), false);
});

test("Close DM: mode 'all' deletes everyone except whitelisted chats", () => {
  const cfg = { close_dm: "1", close_dm_mode: "all" };
  assert.equal(shouldCloseDm(cfg, { dm_rule: "default" }), true);
  assert.equal(shouldCloseDm(cfg, undefined), true);
  assert.equal(shouldCloseDm(cfg, { dm_rule: "keep" }), false);
});

test("Close DM: mode defaults to 'all' when unset", () => {
  assert.equal(shouldCloseDm({ close_dm: "1" }, { dm_rule: "default" }), true);
});

test("Close DM: mode 'selected' deletes only chats marked 'close'", () => {
  const cfg = { close_dm: "1", close_dm_mode: "selected" };
  assert.equal(shouldCloseDm(cfg, { dm_rule: "close" }), true);
  assert.equal(shouldCloseDm(cfg, { dm_rule: "default" }), false);
  assert.equal(shouldCloseDm(cfg, undefined), false);
  assert.equal(shouldCloseDm(cfg, { dm_rule: "keep" }), false);
});

import { inWindow, scheduleActive, isValidHM, minutesInZone } from "../src/rules.js";

test("schedule: same-day window", () => {
  assert.equal(inWindow("09:00", "17:00", 9 * 60), true);
  assert.equal(inWindow("09:00", "17:00", 16 * 60 + 59), true);
  assert.equal(inWindow("09:00", "17:00", 17 * 60), false);
  assert.equal(inWindow("09:00", "17:00", 3 * 60), false);
});

test("schedule: window wrapping past midnight (night hours)", () => {
  assert.equal(inWindow("22:00", "07:00", 23 * 60), true);
  assert.equal(inWindow("22:00", "07:00", 2 * 60), true);
  assert.equal(inWindow("22:00", "07:00", 7 * 60), false);
  assert.equal(inWindow("22:00", "07:00", 12 * 60), false);
});

test("schedule: start == end means all day", () => {
  assert.equal(inWindow("08:00", "08:00", 0), true);
  assert.equal(inWindow("08:00", "08:00", 1439), true);
});

test("schedule: HH:MM validation", () => {
  assert.equal(isValidHM("07:30"), true);
  assert.equal(isValidHM("24:00"), false);
  assert.equal(isValidHM("7:30"), false);
  assert.equal(isValidHM("07:60"), false);
});

test("schedule: time zone conversion (Tehran is UTC+3:30)", () => {
  const d = new Date("2026-10-27T19:00:00Z");
  assert.equal(minutesInZone(d, "UTC"), 19 * 60);
  assert.equal(minutesInZone(d, "Asia/Tehran"), 22 * 60 + 30);
});

test("schedule: disabled or not applied to a feature -> always active", () => {
  const noon = new Date("2026-10-27T12:00:00Z");
  assert.equal(scheduleActive({}, "close_dm", noon), true);
  assert.equal(scheduleActive({ sched_enabled: "0", sched_start: "22:00", sched_end: "07:00" }, "close_dm", noon), true);
  const cfg = { sched_enabled: "1", sched_start: "22:00", sched_end: "07:00", tz: "UTC", sched_autoreply: "0" };
  assert.equal(scheduleActive(cfg, "autoreply", noon), true);
});

test("schedule: enabled -> feature only runs inside the window", () => {
  const cfg = { sched_enabled: "1", sched_start: "22:00", sched_end: "07:00", tz: "UTC" };
  assert.equal(scheduleActive(cfg, "close_dm", new Date("2026-10-27T23:30:00Z")), true);
  assert.equal(scheduleActive(cfg, "close_dm", new Date("2026-10-27T03:00:00Z")), true);
  assert.equal(scheduleActive(cfg, "close_dm", new Date("2026-10-27T12:00:00Z")), false);
});

test("schedule: honors the configured time zone", () => {
  // 19:00Z = 22:30 in Tehran -> inside a 22:00-07:00 night window there, outside it in UTC
  const now = new Date("2026-10-27T19:00:00Z");
  const base = { sched_enabled: "1", sched_start: "22:00", sched_end: "07:00" };
  assert.equal(scheduleActive({ ...base, tz: "Asia/Tehran" }, "close_dm", now), true);
  assert.equal(scheduleActive({ ...base, tz: "UTC" }, "close_dm", now), false);
});
