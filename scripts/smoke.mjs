// Integration smoke test against a LOCAL Worker + local D1. No real Telegram calls are made (they fail and get logged,
// which also exercises the error path). Run `npm run dev:test` in one terminal, then `npm run smoke` in another.
import { createHmac } from "node:crypto";
import { execSync } from "node:child_process";
const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:8787", TOKEN = "123456:TESTTOKEN", OWNER = 7654150612;

// fresh local database with every migration applied + a fake business connection and backup group
execSync("npx wrangler d1 migrations apply business_bot --local", { stdio: "ignore" });
execSync(`npx wrangler d1 execute business_bot --local --command "DELETE FROM settings; DELETE FROM chats; DELETE FROM autoreplies; DELETE FROM autoreply_hits; DELETE FROM daily_stats; DELETE FROM flood; DELETE FROM error_log; DELETE FROM connections; INSERT INTO connections(id,is_enabled) VALUES('c1',1); INSERT INTO settings(key,value) VALUES('group_id','-100123'),('group_title','Test group'),('backup_enabled','1');"`, { stdio: "ignore" });
const initData = (() => {
  const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: OWNER, first_name: "Owner" }) });
  const dcs = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secret = createHmac("sha256", "WebAppData").update(TOKEN).digest();
  p.set("hash", createHmac("sha256", secret).update(dcs).digest("hex"));
  return p.toString();
})();
let unlock = null, pass = 0, fail = 0;
const api = async (method, path, body) => {
  const r = await fetch(BASE + "/api" + path, { method, headers: { Authorization: "tma " + initData, "content-type": "application/json", ...(unlock ? { "X-Unlock": unlock } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const hook = (m) => fetch(BASE + "/", { method: "POST", headers: { "X-Telegram-Bot-Api-Secret-Token": "s3cret", "content-type": "application/json" }, body: JSON.stringify({ update_id: Date.now(), business_message: { business_connection_id: "c1", ...m } }) });
const msg = (chat, text, id = Math.floor(Math.random() * 1e6)) => ({ message_id: id, date: Math.floor(Date.now() / 1000), chat: { id: chat, type: "private", first_name: "U" + chat }, from: { id: chat, first_name: "U" + chat }, text });
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log((cond ? "PASS " : "FAIL ") + name + (cond ? "" : "  -> " + extra)); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let r = await api("GET", "/lock/status"); ok("lock status (no pin)", r.status === 200 && r.body.enabled === false, JSON.stringify(r));
r = await api("GET", "/settings"); ok("settings has values", r.body.values?.close_dm_mode === "all" && r.body.flags?.sched_enabled === false, JSON.stringify(r.body));
r = await api("POST", "/settings/value", { key: "close_dm_mode", value: "selected" }); ok("set close_dm_mode", r.status === 200);
r = await api("POST", "/settings/value", { key: "close_dm_mode", value: "bogus" }); ok("reject bad close_dm_mode", r.status === 400);
r = await api("POST", "/settings/value", { key: "pin_hash", value: "x" }); ok("cannot write pin_hash via values", r.status === 400);
r = await api("POST", "/settings/value", { key: "sched_start", value: "25:00" }); ok("reject bad time", r.status === 400);
r = await api("POST", "/settings/value", { key: "tz", value: "Mars/Base" }); ok("reject bad tz", r.status === 400);

r = await api("POST", "/autoreplies", { keyword: "سلام", reply: "علیک سلام", match_type: "exact", cooldown_min: 5 }); ok("add exact rule w/ cooldown", r.status === 200, JSON.stringify(r.body));
r = await api("POST", "/autoreplies", { keyword: "(a+)+$", reply: "x", match_type: "regex" }); ok("reject unsafe regex", r.status === 400);
r = await api("POST", "/autoreplies", { keyword: "^order\\s*\\d+$", reply: "ok", match_type: "regex" }); ok("add regex rule", r.status === 200, JSON.stringify(r.body));
r = await api("POST", "/autoreplies", { keyword: "pic", reply: "look", media_type: "photo", media_url: "http://insecure/x.jpg" }); ok("reject non-https media", r.status === 400);
r = await api("POST", "/autoreplies", { keyword: "pic", reply: "look", media_type: "photo", media_url: "https://example.com/x.jpg" }); ok("add media rule", r.status === 200, JSON.stringify(r.body));
r = await api("GET", "/autoreplies"); ok("list rules (3)", r.body.items?.length === 3 && r.body.items.some((i) => i.match_type === "regex"), JSON.stringify(r.body));

// webhook traffic (Telegram is unreachable here, so sends fail and get logged: that exercises the error path too)
await hook(msg(555, "سلام")); await hook(msg(555, "سلام")); await hook(msg(555, "hello"));
await wait(2500);
r = await api("GET", "/stats?days=7");
ok("stats counted 3 msgs", r.body.totals?.msgs === 3, JSON.stringify(r.body.totals));
ok("stats top chat", r.body.top?.[0]?.chat_id === 555, JSON.stringify(r.body.top));
ok("stats has 7 days incl. today", r.body.days?.length === 7 && r.body.days.at(-1).msgs === 3, JSON.stringify(r.body.days?.at(-1)));
r = await api("GET", "/chats?limit=10"); ok("chat created with dm_rule default", r.body.items?.[0]?.dm_rule === "default", JSON.stringify(r.body));
r = await api("POST", "/chats/rule", { chat_id: 555, rule: "keep" }); ok("set chat rule keep", r.status === 200);
r = await api("POST", "/chats/rule", { chat_id: 555, rule: "nope" }); ok("reject bad chat rule", r.status === 400);

// delete a whole chat (topic + every row). Chat 999 has a seeded topic; Telegram is unreachable so the topic delete fails first.
await hook(msg(999, "bye")); await wait(2000);
execSync(`npx wrangler d1 execute business_bot --local --command "INSERT OR REPLACE INTO topics(group_id,chat_id,thread_id) VALUES(-100123,999,42);"`, { stdio: "ignore" });
r = await api("POST", "/chats/delete", { chat_id: "abc" }); ok("reject bad chat id on delete", r.status === 400);
r = await api("POST", "/chats/delete", { chat_id: 999 }); ok("delete asks for force when topic can't be deleted", r.status === 409 && r.body.topic_failed === true, JSON.stringify(r));
r = await api("GET", "/chats?limit=50"); ok("chat still listed after refused delete", r.body.items.some((c) => c.chat_id === 999));
r = await api("POST", "/chats/delete", { chat_id: 999, force: true }); ok("force delete removes chat", r.status === 200 && r.body.ok === true, JSON.stringify(r));
r = await api("GET", "/chats?limit=50"); ok("deleted chat no longer listed", !r.body.items.some((c) => c.chat_id === 999));
r = await api("GET", "/stats?days=7"); ok("deleted chat stats erased", !r.body.top.some((c) => c.chat_id === 999), JSON.stringify(r.body.top));
await hook(msg(998, "plain")); await wait(2000);
r = await api("POST", "/chats/delete", { chat_id: 998 }); ok("delete chat without topic needs no force", r.status === 200 && r.body.topic_failed === false, JSON.stringify(r));

// flood guard
await api("POST", "/settings", { key: "flood_enabled", value: true });
await api("POST", "/settings/value", { key: "flood_max", value: "3" });
await api("POST", "/settings/value", { key: "flood_window", value: "60" });
await wait(16000); // settings cache TTL is 15s
for (let i = 0; i < 5; i++) await hook(msg(777, "spam " + i));
await wait(2500);
r = await api("GET", "/chats?limit=10"); const c777 = r.body.items.find((c) => c.chat_id === 777);
ok("flooding chat auto-muted", c777?.muted === 1, JSON.stringify(c777));
// trusted chat is exempt from flooding
for (let i = 0; i < 6; i++) await hook(msg(555, "burst " + i));
await wait(2500);
r = await api("GET", "/chats?limit=10"); ok("trusted chat NOT muted by flood", r.body.items.find((c) => c.chat_id === 555)?.muted === 0);

// health + errors
r = await api("GET", "/health"); ok("health responds with checks", r.status === 200 && r.body.checks?.length === 5, JSON.stringify(r.body).slice(0, 300));
ok("errors were logged (telegram unreachable)", r.body.errors?.length > 0 && r.body.errors.every((e) => e.scope && e.message), JSON.stringify(r.body.errors?.slice(0, 2)));
r = await api("POST", "/errors/clear"); ok("clear errors", r.status === 200);

// PIN lock
r = await api("POST", "/lock/set", { pin: "12" }); ok("reject short pin", r.status === 400);
r = await api("POST", "/lock/set", { pin: "4821" }); ok("set pin returns token", r.status === 200 && !!r.body.token, JSON.stringify(r.body));
const good = r.body.token;
unlock = null;
r = await api("GET", "/overview"); ok("locked: 423 without token", r.status === 423);
r = await api("GET", "/lock/status"); ok("lock status reachable while locked", r.status === 200 && r.body.enabled === true && r.body.unlocked === false);
unlock = good; r = await api("GET", "/overview"); ok("unlocked with token", r.status === 200);
unlock = good.replace(/.$/, (c) => (c === "0" ? "1" : "0")); r = await api("GET", "/overview"); ok("tampered token rejected", r.status === 423);
unlock = null;
r = await api("POST", "/lock/verify", { pin: "0000" }); ok("wrong pin -> 403 w/ attempts", r.status === 403 && /4 attempts/.test(r.body.error), JSON.stringify(r.body));
r = await api("POST", "/lock/verify", { pin: "4821" }); ok("right pin -> token", r.status === 200 && !!r.body.token);
unlock = r.body.token;
for (let i = 0; i < 5; i++) r = await api("POST", "/lock/verify", { pin: "9999" });
ok("5 wrong pins -> lockout", r.status === 403 && /Locked for 5 minutes/.test(r.body.error), JSON.stringify(r.body));
r = await api("POST", "/lock/verify", { pin: "4821" }); ok("locked out even with right pin (429)", r.status === 429, JSON.stringify(r.body));
r = await api("POST", "/lock/disable", { pin: "0000" }); ok("disable needs right pin", r.status === 403);
r = await api("POST", "/lock/disable", { pin: "4821" }); ok("disable with right pin", r.status === 200);
unlock = null; r = await api("GET", "/overview"); ok("no pin -> open again", r.status === 200);
r = await api("GET", "/settings"); ok("settings never leaks pin hash", !JSON.stringify(r.body).includes("pin_hash"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
