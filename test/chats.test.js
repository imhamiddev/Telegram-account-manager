import test from "node:test";
import assert from "node:assert/strict";
import { deleteChat } from "../src/chats.js";

// Minimal fake D1 that records every statement.
function fakeEnv() {
  const sql = [];
  const stmt = (q) => ({ bind: () => ({ q, all: async () => ({ results: [] }) }) });
  return { sql, env: { DB: { prepare: (q) => { sql.push(q); return stmt(q); }, batch: async (list) => list.map((s) => s.q) } } };
}

test("deleteChat with keep: deletes only the topic rows; chat and counters stay", async () => {
  const { env, sql } = fakeEnv();
  const r = await deleteChat(env, 42, { keep: true });
  assert.equal(r.ok, true);
  assert.equal(r.kept, true);
  const all = sql.join("\n");
  assert.match(all, /DELETE FROM topics/);
  assert.doesNotMatch(all, /DELETE FROM chats/);
  assert.doesNotMatch(all, /DELETE FROM daily_stats/);
  assert.doesNotMatch(all, /DELETE FROM flood/);
});

test("deleteChat without keep: removes the chat row too (auto cleanup)", async () => {
  const { env, sql } = fakeEnv();
  const r = await deleteChat(env, 42);
  assert.equal(r.ok, true);
  assert.match(sql.join("\n"), /DELETE FROM chats/);
});
