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
