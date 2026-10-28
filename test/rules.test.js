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

import { matchAutoreply, buildRules, isSafeRegex, cooldownCutoff } from "../src/rules.js";

const rules = buildRules([
  { keyword: "سلام", reply: "علیک سلام", match_type: "exact" },
  { keyword: "price", reply: "see pricing", match_type: "contains" },
  { keyword: "^order\\s*#?\\d{3,}$", reply: "got your order", match_type: "regex" },
]);

test("auto-reply: exact matches only the whole message", () => {
  assert.equal(matchAutoreply(rules, "سلام")?.reply, "علیک سلام");
  assert.equal(matchAutoreply(rules, "  سلام  ")?.reply, "علیک سلام");
  assert.equal(matchAutoreply(rules, "سلام چطوری"), null);
  assert.equal(matchAutoreply(rules, "به همه سلام"), null);
});

test("auto-reply: exact is case-insensitive", () => {
  const r = buildRules([{ keyword: "hello", reply: "hi", match_type: "exact" }]);
  assert.equal(matchAutoreply(r, "HeLLo")?.reply, "hi");
});

test("auto-reply: contains matches inside a sentence", () => {
  assert.equal(matchAutoreply(rules, "what is the PRICE of this?")?.reply, "see pricing");
  assert.equal(matchAutoreply(rules, "no match here"), null);
});

test("auto-reply: regex matches pattern", () => {
  assert.equal(matchAutoreply(rules, "order #12345")?.reply, "got your order");
  assert.equal(matchAutoreply(rules, "order 12")?.reply, undefined);
});

test("auto-reply: empty or missing text never matches", () => {
  assert.equal(matchAutoreply(rules, ""), null);
  assert.equal(matchAutoreply(rules, "   "), null);
  assert.equal(matchAutoreply(rules, undefined), null);
});

test("auto-reply: exact rules win over contains/regex", () => {
  const r = buildRules([
    { keyword: "hi", reply: "contains-hit", match_type: "contains" },
    { keyword: "hi", reply: "x", match_type: "regex" },
    { keyword: "hi there", reply: "exact-hit", match_type: "exact" },
  ]);
  assert.equal(matchAutoreply(r, "hi there")?.reply, "exact-hit");
});

test("auto-reply: unsafe or broken regex rules are ignored, not fatal", () => {
  const r = buildRules([
    { keyword: "(a+)+$", reply: "bad", match_type: "regex" },
    { keyword: "([", reply: "broken", match_type: "regex" },
    { keyword: "ok", reply: "fine", match_type: "exact" },
  ]);
  assert.equal(r.length, 1);
  assert.equal(matchAutoreply(r, "ok")?.reply, "fine");
});

test("regex safety check", () => {
  assert.equal(isSafeRegex("^hello$"), true);
  assert.equal(isSafeRegex("(a+)+"), false);
  assert.equal(isSafeRegex("(.*)*x"), false);
  assert.equal(isSafeRegex("(a)\\1"), false);
  assert.equal(isSafeRegex("x".repeat(101)), false);
  assert.equal(isSafeRegex(""), false);
  assert.equal(isSafeRegex("["), false);
});

test("cooldown cutoff", () => {
  assert.equal(cooldownCutoff(1000, 0), 1000);
  assert.equal(cooldownCutoff(1000, 5), 700);
  assert.equal(cooldownCutoff(1000, -3), 1000);
  assert.equal(cooldownCutoff(1000, "x"), 1000);
});

import { dayKey, lastDays } from "../src/rules.js";

test("stats: dayKey respects the time zone", () => {
  const d = new Date("2026-10-27T22:00:00Z"); // 01:30 next day in Tehran
  assert.equal(dayKey(d, "UTC"), "2026-10-27");
  assert.equal(dayKey(d, "Asia/Tehran"), "2026-10-28");
});

test("stats: lastDays returns n consecutive days ending today", () => {
  const days = lastDays(7, "UTC", new Date("2026-10-27T12:00:00Z"));
  assert.deepEqual(days, ["2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27"]);
});

test("stats: lastDays has no duplicates across a month boundary", () => {
  const days = lastDays(5, "UTC", new Date("2026-11-02T00:30:00Z"));
  assert.equal(new Set(days).size, 5);
  assert.equal(days.at(-1), "2026-11-02");
  assert.equal(days[0], "2026-10-29");
});

import { parseWordList, findBannedWord, floodExceeded, isTrusted } from "../src/rules.js";

test("spam: word list parsing handles newlines, commas, Persian comma, case and duplicates", () => {
  assert.deepEqual(parseWordList("Casino, BET\nbet،  free money ;"), ["casino", "bet", "free money"]);
  assert.deepEqual(parseWordList(""), []);
  assert.deepEqual(parseWordList(undefined), []);
  assert.deepEqual(parseWordList("x".repeat(51)), []);
});

test("spam: finds banned words anywhere, case-insensitive", () => {
  const words = parseWordList("casino\nکلاهبرداری");
  assert.equal(findBannedWord(words, "Play at the CASINO now"), "casino");
  assert.equal(findBannedWord(words, "این یک کلاهبرداری است"), "کلاهبرداری");
  assert.equal(findBannedWord(words, "hello there"), null);
  assert.equal(findBannedWord(words, ""), null);
  assert.equal(findBannedWord([], "casino"), null);
});

test("spam: flood trips only above the limit", () => {
  assert.equal(floodExceeded(10, 10), false);
  assert.equal(floodExceeded(11, 10), true);
});

test("spam: only 'keep' chats are trusted", () => {
  assert.equal(isTrusted({ dm_rule: "keep" }), true);
  assert.equal(isTrusted({ dm_rule: "default" }), false);
  assert.equal(isTrusted(undefined), false);
});
