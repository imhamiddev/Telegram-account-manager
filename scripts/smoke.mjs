// Integration smoke test against a LOCAL Worker + local D1. No real Telegram calls are made (they fail and get logged,
// which also exercises the error path). Run `npm run dev:test` in one terminal, then `npm run smoke` in another.
import { createHmac } from "node:crypto";
import { execSync } from "node:child_process";
import http from "node:http";
const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:8787", TOKEN = "123456:TESTTOKEN", OWNER = 7654150612;

// fresh local database with every migration applied + a fake business connection and backup group
execSync("npx wrangler d1 migrations apply business_bot --local", { stdio: "ignore" });
execSync(`npx wrangler d1 execute business_bot --local --command "DELETE FROM settings; DELETE FROM chats; DELETE FROM autoreplies; DELETE FROM autoreply_hits; DELETE FROM daily_stats; DELETE FROM flood; DELETE FROM followups; DELETE FROM error_log; DELETE FROM connections; INSERT INTO connections(id,is_enabled) VALUES('c1',1); INSERT INTO settings(key,value) VALUES('group_id','-100123'),('group_title','Test group'),('backup_enabled','1');"`, { stdio: "ignore" });
const initData = (() => {
  const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: OWNER, first_name: "Owner" }) });
  const dcs = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secret = createHmac("sha256", "WebAppData").update(TOKEN).digest();
  p.set("hash", createHmac("sha256", secret).update(dcs).digest("hex"));
  return p.toString();
})();

// Fake Telegram on :8788 (the Worker is started with TG_API pointing here). Every method fails like an unauthorised token
// unless a test enables it with fake.set(method), so the "Telegram unreachable" behaviour is still covered by default.
const fake = {
  calls: [], rules: new Map(),
  set(method, res = true) { this.rules.set(method, res); },
  clear() { this.rules.clear(); this.calls.length = 0; },
  last(method) { return [...this.calls].reverse().find((c) => c.method === method); },
};
http.createServer(async (req, res) => {
  let raw = ""; for await (const chunk of req) raw += chunk;
  const method = req.url.split("/").pop(); let body = {}; try { body = JSON.parse(raw); } catch { /* ignore */ }
  fake.calls.push({ method, body });
  const rule = fake.rules.get(method);
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(rule === true ? { ok: true, result: true } : rule || { ok: false, error_code: 401, description: "Unauthorized" }));
}).listen(8788);
const sql = (q) => execSync(`npx wrangler d1 execute business_bot --local --command "${q}"`, { stdio: "ignore" });
const count = (q) => JSON.parse(execSync(`npx wrangler d1 execute business_bot --local --json --command "${q}"`, { encoding: "utf8" }))[0].results[0].n;
const ownerMsg = (chat, text) => ({ message_id: Math.floor(Math.random() * 1e6), date: Math.floor(Date.now() / 1000), chat: { id: chat, type: "private", first_name: "U" + chat }, from: { id: OWNER, first_name: "Owner" }, text });
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

// organise: label + note, filter, search, sort, pin
r = await api("POST", "/chats/meta", { chat_id: 555, label: "VIP", note: "pays on time" }); ok("set label and note", r.status === 200);
r = await api("POST", "/chats/meta", { chat_id: 555, label: "x".repeat(30) }); ok("reject too-long label", r.status === 400);
r = await api("GET", "/chats?label=VIP"); ok("filter by label", r.body.items?.length === 1 && r.body.items[0].chat_id === 555 && r.body.items[0].note === "pays on time", JSON.stringify(r.body.items));
r = await api("GET", "/chats?limit=10"); ok("labels listed with counts", r.body.labels?.some((l) => l.label === "VIP" && l.n === 1), JSON.stringify(r.body.labels));
r = await api("GET", "/chats?q=U555"); ok("search by name", r.body.items?.length === 1 && r.body.items[0].chat_id === 555, JSON.stringify(r.body.items));
r = await api("GET", "/chats?q=%25"); ok("search escapes % wildcard", r.body.items?.length === 0, JSON.stringify(r.body.items));
r = await api("GET", "/chats?limit=10"); ok("last_at is tracked", r.body.items.every((c) => c.last_at > 0), JSON.stringify(r.body.items));
await hook(msg(996, "hi")); await wait(2000);
r = await api("POST", "/chats/pin", { chat_id: 996, pinned: true }); ok("pin a chat", r.status === 200);
r = await api("GET", "/chats?sort=name&limit=10"); ok("pinned chat sorts first", r.body.items?.[0]?.chat_id === 996 && r.body.items[0].pinned === 1, JSON.stringify(r.body.items?.[0]));
r = await api("POST", "/chats/pin", { chat_id: 996, pinned: false }); r = await api("GET", "/chats?sort=name&limit=10");
ok("sort by name A-Z", r.body.items.map((c) => c.name).join() === [...r.body.items.map((c) => c.name)].sort((x, y) => x.localeCompare(y, "en", { sensitivity: "base" })).join(), JSON.stringify(r.body.items.map((c) => c.name)));

// auto-reply scopes: one chat, active hours, id-based edit/delete, follow-up validation
const n0 = (await api("GET", "/autoreplies")).body.items.length;
r = await api("POST", "/autoreplies", { keyword: "price", reply: "global price" }); ok("add global rule", r.status === 200 && r.body.id > 0, JSON.stringify(r));
r = await api("POST", "/autoreplies", { keyword: "price", reply: "vip price", chat_id: 555 }); const vipId = r.body.id; ok("same keyword for one chat is a separate rule", r.status === 200 && vipId > 0, JSON.stringify(r));
r = await api("POST", "/autoreplies", { keyword: "price", reply: "vip price v2", chat_id: 555 }); ok("same keyword + chat overwrites instead of duplicating", r.status === 200 && r.body.id === vipId, JSON.stringify(r));
r = await api("POST", "/autoreplies", { keyword: "x", reply: "y", chat_id: 424242 }); ok("reject a rule for an unknown chat", r.status === 400);
r = await api("POST", "/autoreplies", { keyword: "x", reply: "y", hours_start: "09:00" }); ok("reject half-set hours", r.status === 400);
r = await api("POST", "/autoreplies", { keyword: "x", reply: "y", hours_start: "9am", hours_end: "17:00" }); ok("reject malformed hours", r.status === 400);
r = await api("POST", "/autoreplies", { keyword: "late", reply: "i am asleep", hours_start: "22:00", hours_end: "07:00" }); const lateId = r.body.id; ok("add rule with active hours", r.status === 200 && lateId > 0, JSON.stringify(r));
r = await api("POST", "/autoreplies", { keyword: "x", reply: "y", followup_min: 30 }); ok("reject follow-up without text", r.status === 400);
r = await api("POST", "/autoreplies", { keyword: "x", reply: "y", followup_min: 20000, followup_text: "z" }); ok("reject follow-up delay over a week", r.status === 400);
r = await api("POST", "/autoreplies", { id: lateId, keyword: "late", reply: "back at 7", hours_start: "22:00", hours_end: "07:00", followup_min: 15, followup_text: "still here?" }); ok("edit a rule by id (with follow-up)", r.status === 200 && r.body.id === lateId);
r = await api("GET", "/autoreplies"); const vip = r.body.items.find((i) => i.id === vipId), late = r.body.items.find((i) => i.id === lateId);
ok("list shows chat name, hours and follow-up", vip?.chat_name === "U555" && vip.reply === "vip price v2" && late?.hours_start === "22:00" && late.reply === "back at 7" && late.followup_min === 15 && late.followup_text === "still here?", JSON.stringify([vip, late]));
r = await api("POST", "/autoreplies/delete", { id: vipId }); await api("POST", "/autoreplies/delete", { id: lateId }); r = await api("GET", "/autoreplies");
ok("delete by id removes only that rule", r.body.items.length === n0 + 1 && r.body.items.some((i) => i.keyword === "price" && i.chat_id === null));
r = await api("POST", "/autoreplies/delete", { id: r.body.items.find((i) => i.keyword === "price").id });

// bulk delete, auto cleanup of inactive chats, topic counter
await hook(msg(901, "a")); await hook(msg(902, "b")); await hook(msg(903, "c")); await hook(msg(904, "d")); await wait(2500);
r = await api("POST", "/chats/delete-many", { chat_ids: [] }); ok("bulk delete rejects an empty selection", r.status === 400);
r = await api("POST", "/chats/delete-many", { chat_ids: [901, 902, "x"] }); ok("bulk delete removes the picked chats", r.status === 200 && r.body.deleted === 2 && r.body.failed.length === 0, JSON.stringify(r));
r = await api("GET", "/chats?limit=100"); ok("bulk deleted chats are gone, others stay", !r.body.items.some((c) => [901, 902].includes(c.chat_id)) && r.body.items.some((c) => c.chat_id === 903));
r = await api("POST", "/settings/value", { key: "cleanup_days", value: "6" }); ok("reject cleanup below 7 days", r.status === 400);
r = await api("POST", "/settings/value", { key: "cleanup_days", value: "30" }); ok("set cleanup days", r.status === 200);
r = await api("POST", "/cleanup/run"); ok("cleanup does nothing while disabled", r.status === 200 && r.body.skipped === true, JSON.stringify(r.body));
await api("POST", "/settings", { key: "cleanup_enabled", value: true });
sql("UPDATE chats SET last_at = strftime('%s','now') - 100*86400 WHERE chat_id IN (903,904); UPDATE chats SET pinned = 1 WHERE chat_id = 904;");
r = await api("POST", "/cleanup/run"); ok("cleanup removes the inactive chat", r.status === 200 && r.body.removed === 1 && r.body.failed === 0, JSON.stringify(r.body));
r = await api("GET", "/chats?limit=100"); ok("inactive chat deleted, pinned inactive chat kept", !r.body.items.some((c) => c.chat_id === 903) && r.body.items.some((c) => c.chat_id === 904));
await api("POST", "/settings", { key: "cleanup_enabled", value: false });
sql("INSERT OR REPLACE INTO topics(group_id,chat_id,thread_id) VALUES(-100123,904,77);");
await api("POST", "/settings/value", { key: "topic_limit", value: "1" });
r = await api("GET", "/health"); const tc = r.body.checks?.find((c) => c.id === "topics"); ok("topic counter shows a warning at the limit", tc?.status === "fail" && /1 of 1/.test(tc.detail), JSON.stringify(tc));
sql("DELETE FROM topics WHERE chat_id = 904; UPDATE chats SET pinned = 0 WHERE chat_id = 904;");
await api("POST", "/settings/value", { key: "topic_limit", value: "0" });
r = await api("POST", "/chats/delete", { chat_id: 904 });

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

// Close DM must use deleteBusinessMessages (plain deleteMessage can't see business chats)
await hook(msg(600, "warm up")); await wait(1500);
await api("POST", "/chats/rule", { chat_id: 600, rule: "close" });
await api("POST", "/settings", { key: "close_dm", value: true });
fake.clear(); fake.set("deleteBusinessMessages");
await hook(msg(600, "closeme", 4242)); await wait(2000);
const del = fake.last("deleteBusinessMessages");
ok("Close DM calls deleteBusinessMessages with connection + message ids", del?.body.business_connection_id === "c1" && JSON.stringify(del.body.message_ids) === "[4242]" && del.body.chat_id === undefined, JSON.stringify(del));
ok("Close DM never uses plain deleteMessage", !fake.calls.some((c) => c.method === "deleteMessage"));
const before = fake.calls.filter((c) => c.method === "deleteBusinessMessages").length;
await hook(msg(601, "normal chat")); await wait(1500);
ok("Close DM leaves chats without the 'close' rule alone (selected mode)", fake.calls.filter((c) => c.method === "deleteBusinessMessages").length === before);
fake.set("deleteBusinessMessages", { ok: false, error_code: 400, description: "Bad Request: not enough rights to delete messages" });
await hook(msg(600, "again")); await wait(1500);
r = await api("GET", "/health"); ok("missing delete right produces a helpful hint", r.body.errors?.some((e) => /allow the bot to delete messages/.test(e.message)), JSON.stringify(r.body.errors?.[0]));
await api("POST", "/settings", { key: "close_dm", value: false });

// deleting a chat's topic: success, already gone, and refused
fake.clear(); fake.set("deleteForumTopic");
await hook(msg(905, "t")); await wait(1200); sql("INSERT OR REPLACE INTO topics(group_id,chat_id,thread_id) VALUES(-100123,905,55);");
r = await api("POST", "/chats/delete", { chat_id: 905 });
ok("deleting a chat deletes its forum topic", r.status === 200 && r.body.topics_deleted === 1 && r.body.topic_failed === false && JSON.stringify(fake.last("deleteForumTopic")?.body) === JSON.stringify({ chat_id: -100123, message_thread_id: 55 }), JSON.stringify([r, fake.last("deleteForumTopic")]));
fake.set("deleteForumTopic", { ok: false, error_code: 400, description: "Bad Request: message thread not found" });
await hook(msg(906, "t")); await wait(1200); sql("INSERT OR REPLACE INTO topics(group_id,chat_id,thread_id) VALUES(-100123,906,56);");
r = await api("POST", "/chats/delete", { chat_id: 906 }); ok("a topic that is already gone is not an error", r.status === 200 && r.body.topic_failed === false, JSON.stringify(r));
fake.set("deleteForumTopic", { ok: false, error_code: 400, description: "Bad Request: not enough rights to delete a forum topic" });
await hook(msg(907, "t")); await wait(1200); sql("INSERT OR REPLACE INTO topics(group_id,chat_id,thread_id) VALUES(-100123,907,57);");
r = await api("POST", "/chats/delete", { chat_id: 907 }); ok("a refused topic delete keeps the chat", r.status === 409 && r.body.topic_failed === true && count("SELECT COUNT(*) n FROM chats WHERE chat_id=907") === 1, JSON.stringify(r));
r = await api("POST", "/chats/delete", { chat_id: 907, force: true }); ok("force removes it anyway", r.status === 200 && r.body.topic_failed === true && count("SELECT COUNT(*) n FROM topics WHERE chat_id=907") === 0, JSON.stringify(r));

// follow-up messages
fake.clear(); fake.set("sendMessage");
r = await api("POST", "/autoreplies", { keyword: "ping", reply: "pong", followup_min: 1, followup_text: "still there?" }); const fuRule = r.body.id;
await hook(msg(555, "ping")); await wait(2000);
const pong = fake.calls.find((c) => c.method === "sendMessage" && c.body.text === "pong");
ok("auto-reply goes out through the business connection", pong?.body.text === "pong" && pong.body.business_connection_id === "c1" && pong.body.chat_id === 555, JSON.stringify(pong));
ok("a follow-up is scheduled one minute later", count("SELECT COUNT(*) n FROM followups WHERE chat_id=555 AND due_at - created_at = 60") === 1);
await hook(ownerMsg(555, "right after (echo)")); await wait(1200);
ok("an owner message right after the reply (echo) doesn't cancel it", count("SELECT COUNT(*) n FROM followups WHERE chat_id=555") === 1);
sql("UPDATE followups SET created_at = created_at - 100 WHERE chat_id=555;");
await hook(ownerMsg(555, "on it")); await wait(1200);
ok("the owner answering cancels the follow-up", count("SELECT COUNT(*) n FROM followups WHERE chat_id=555") === 0);
await hook(msg(555, "ping")); await wait(2000);
sql("UPDATE followups SET due_at = strftime('%s','now') - 1 WHERE chat_id=555;");
fake.calls.length = 0;
r = await fetch(BASE + "/__scheduled?cron=*+*+*+*+*"); await wait(2000);
ok("the cron sends a due follow-up once", r.status === 200 && fake.calls.filter((c) => c.method === "sendMessage" && c.body.text === "still there?").length === 1 && count("SELECT COUNT(*) n FROM followups") === 0, JSON.stringify(fake.calls));
await fetch(BASE + "/__scheduled?cron=*+*+*+*+*"); await wait(1000);
ok("it is not sent twice", fake.calls.filter((c) => c.body.text === "still there?").length === 1);
sql("INSERT OR REPLACE INTO followups(chat_id,connection_id,text,created_at,due_at) VALUES(555,'c1','muted one',1,2);");
await api("POST", "/chats/mute", { chat_id: 555, muted: true }); fake.calls.length = 0;
await fetch(BASE + "/__scheduled?cron=*+*+*+*+*"); await wait(1500);
ok("a follow-up for a muted chat is dropped, not sent", !fake.calls.some((c) => c.body.text === "muted one") && count("SELECT COUNT(*) n FROM followups") === 0);
await api("POST", "/chats/mute", { chat_id: 555, muted: false });
await api("POST", "/autoreplies/delete", { id: fuRule });
fake.clear();

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
