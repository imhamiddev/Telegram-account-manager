import { esc, sleep, tg, tgStrict, RateLimit, tehranStamp, displayName, nowSec } from "./lib.js";
import { shouldCloseDm, scheduleActive, buildRules, matchAutoreply, cooldownCutoff, dayKey } from "./rules.js";

// ---------- in-memory state cache (keeps the hot path free of DB reads) ----------
let cache = null, cacheAt = 0;
const TTL = 15000;

export async function getState(env) {
  if (cache && Date.now() - cacheAt < TTL) return cache;
  const [s, c, ch, t, ar] = await env.DB.batch([
    env.DB.prepare("SELECT key, value FROM settings"),
    env.DB.prepare("SELECT id, is_enabled FROM connections"),
    env.DB.prepare("SELECT chat_id, name, username, muted, dm_rule FROM chats"),
    env.DB.prepare("SELECT group_id, chat_id, thread_id FROM topics"),
    env.DB.prepare("SELECT keyword, reply, match_type, cooldown_min, media_type, media_url FROM autoreplies"),
  ]);
  cache = {
    cfg: Object.fromEntries(s.results.map((r) => [r.key, r.value])),
    conns: new Map(c.results.map((r) => [r.id, !!r.is_enabled])),
    chats: new Map(ch.results.map((r) => [r.chat_id, r])),
    topics: new Map(t.results.map((r) => [`${r.group_id}:${r.chat_id}`, r.thread_id])),
    autoreplies: buildRules(ar.results),
  };
  cacheAt = Date.now();
  return cache;
}
export const invalidate = () => { cache = null; };

export async function isOwnerConnection(env, st, id) {
  if (!id) return false;
  if (st.conns.has(id)) return st.conns.get(id);
  const r = await tg(env, "getBusinessConnection", { business_connection_id: id });
  if (r.ok && String(r.result.user.id) === env.OWNER_ID) {
    await env.DB.prepare("INSERT OR REPLACE INTO connections(id,is_enabled) VALUES(?,?)").bind(id, r.result.is_enabled ? 1 : 0).run();
    st.conns.set(id, !!r.result.is_enabled);
    return !!r.result.is_enabled;
  }
  return false;
}

// ---------- problems: always logged to D1 (shown in the console), owner pinged at most once a minute ----------
export async function logError(env, scope, message) {
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO error_log(at,scope,message) VALUES(?,?,?)").bind(nowSec(), scope, String(message ?? "").slice(0, 300)),
      env.DB.prepare("DELETE FROM error_log WHERE id NOT IN (SELECT id FROM error_log ORDER BY id DESC LIMIT 50)"),
    ]);
  } catch { /* logging must never break message handling */ }
}

let lastNotify = 0;
export async function notifyOwner(env, text, scope = "general") {
  await logError(env, scope, text);
  if (Date.now() - lastNotify < 60000) return;
  lastNotify = Date.now();
  await tg(env, "sendMessage", { chat_id: env.OWNER_ID, text: `⚠️ ${text}` });
}

// ---------- formatting ----------
function extract(m) {
  const base = { type: "other", text: m.text ?? m.caption ?? null, file_id: null, extra: null };
  if (m.text) return { ...base, type: "text" };
  if (m.photo) return { ...base, type: "photo", file_id: m.photo.at(-1).file_id };
  if (m.video) return { ...base, type: "video", file_id: m.video.file_id };
  if (m.voice) return { ...base, type: "voice", file_id: m.voice.file_id };
  if (m.audio) return { ...base, type: "audio", file_id: m.audio.file_id };
  if (m.document) return { ...base, type: "document", file_id: m.document.file_id };
  if (m.animation) return { ...base, type: "animation", file_id: m.animation.file_id };
  if (m.sticker) return { ...base, type: "sticker", file_id: m.sticker.file_id };
  if (m.video_note) return { ...base, type: "video_note", file_id: m.video_note.file_id };
  if (m.location) return { ...base, type: "location", extra: { latitude: m.location.latitude, longitude: m.location.longitude } };
  if (m.contact) return { ...base, type: "contact", extra: { phone_number: m.contact.phone_number, first_name: m.contact.first_name || "-" } };
  return base;
}

export function header(name, username, unix, label = "") {
  const { date, time } = tehranStamp(unix);
  return `${label}${esc(name || "Unknown")}\n${username ? "@" + esc(username) : "—"}\n${date}\n${time}`;
}

// Truncate raw text so the *escaped* result fits the limit
function fit(text, limit) {
  let t = String(text ?? "");
  while (esc(t).length > limit) t = t.slice(0, Math.max(0, Math.floor(t.length * 0.9)));
  return esc(t);
}

// ---------- sending ----------
async function call(env, method, body) {
  for (let i = 0; ; i++) {
    try {
      return await tgStrict(env, method, body);
    } catch (e) {
      if (e instanceof RateLimit && i < 3) { await sleep(Math.min(e.retryAfter, 20) * 1000 + 200); continue; }
      if (!(e.code >= 400 && e.code < 500) && i < 1) { await sleep(500); continue; } // one quick retry on 5xx/network
      throw e;
    }
  }
}

async function getThread(env, st, gid, chatId, name) {
  if (st.cfg.topics_enabled !== "1" || st.cfg.group_is_forum !== "1") return null;
  const key = `${gid}:${chatId}`;
  if (st.topics.has(key)) return st.topics.get(key);
  try {
    const r = await call(env, "createForumTopic", { chat_id: gid, name: (name || "Unknown").slice(0, 100) });
    st.topics.set(key, r.message_thread_id);
    await env.DB.prepare("INSERT OR REPLACE INTO topics(group_id,chat_id,thread_id) VALUES(?,?,?)").bind(gid, chatId, r.message_thread_id).run();
    return r.message_thread_id;
  } catch {
    return null; // bot can't manage topics → falls back to the General topic
  }
}

async function sendBody(env, gid, thread, p) {
  const S = (method, extra) => call(env, method, { chat_id: gid, ...(thread ? { message_thread_id: thread } : {}), ...extra });
  const h = header(p.name, p.username, p.unix, p.label);
  const room = Math.max(0, 1024 - h.length - 2);
  const cap = p.text ? `${h}\n\n${fit(p.text, room)}` : h;
  const media = { photo: "sendPhoto", video: "sendVideo", voice: "sendVoice", audio: "sendAudio", document: "sendDocument", animation: "sendAnimation" };

  if (p.type === "text") return S("sendMessage", { text: `${h}\n\n${fit(p.text, 4096 - h.length - 2)}`, parse_mode: "HTML" });
  if (media[p.type]) return S(media[p.type], { [p.type]: p.file_id, caption: cap, parse_mode: "HTML" });
  if (p.type === "notice") return S("sendMessage", { text: `${h}\n\n${esc(p.text)}`, parse_mode: "HTML" });

  await S("sendMessage", { text: h, parse_mode: "HTML" });
  const x = p.extra || {};
  if (p.type === "sticker") return S("sendSticker", { sticker: p.file_id });
  if (p.type === "video_note") return S("sendVideoNote", { video_note: p.file_id });
  if (p.type === "location") return S("sendLocation", { latitude: x.latitude, longitude: x.longitude });
  if (p.type === "contact") return S("sendContact", { phone_number: x.phone_number, first_name: x.first_name });
  return S("sendMessage", { text: "ℹ️ Unsupported message type (e.g. view-once media or poll)." });
}

async function deliver(env, st, chatId, payload) {
  const gid = st.cfg.group_id;
  let thread = await getThread(env, st, gid, chatId, payload.name);
  try {
    return await sendBody(env, gid, thread, payload);
  } catch (e) {
    if (thread && /thread not found/i.test(e.message)) {
      st.topics.delete(`${gid}:${chatId}`);
      await env.DB.prepare("DELETE FROM topics WHERE group_id=? AND chat_id=?").bind(gid, chatId).run();
      thread = await getThread(env, st, gid, chatId, payload.name);
      return await sendBody(env, gid, thread, payload);
    }
    throw e;
  }
}

// ---------- auto-reply ----------
// Sends the reply through the business connection, so it appears to come from the owner's account.
// With a cooldown, a person can trigger the same keyword only once per N minutes (claimed atomically in D1).
async function sendAutoreply(env, m, rule) {
  const base = { business_connection_id: m.business_connection_id, chat_id: m.chat.id };
  if (rule.cooldown_min > 0) {
    const now = nowSec();
    const claim = await env.DB.prepare(
      "INSERT INTO autoreply_hits(keyword,chat_id,last_at) VALUES(?,?,?) " +
      "ON CONFLICT(keyword,chat_id) DO UPDATE SET last_at=excluded.last_at WHERE autoreply_hits.last_at <= ? RETURNING 1 AS ok")
      .bind(rule.keyword, m.chat.id, now, cooldownCutoff(now, rule.cooldown_min)).first();
    if (!claim) return; // still cooling down for this person
  }
  const method = { photo: "sendPhoto", document: "sendDocument", video: "sendVideo" }[rule.media_type];
  if (method && rule.media_url) return tgStrict(env, method, { ...base, [rule.media_type]: rule.media_url, caption: rule.reply });
  return tgStrict(env, "sendMessage", { ...base, text: rule.reply });
}

// ---------- activity counters (numbers only, never content) ----------
async function bumpStats(env, st, chatId, replies, deleted) {
  await env.DB.prepare(
    "INSERT INTO daily_stats(day,chat_id,msgs,replies,deleted) VALUES(?,?,1,?,?) " +
    "ON CONFLICT(day,chat_id) DO UPDATE SET msgs=msgs+1, replies=replies+excluded.replies, deleted=deleted+excluded.deleted")
    .bind(dayKey(new Date(), st.cfg.tz || "Asia/Tehran"), chatId, replies, deleted).run();
}

// ---------- entry points ----------
export async function onBusinessMessage(env, m, edited) {
  const st = await getState(env);
  if (!(await isOwnerConnection(env, st, m.business_connection_id))) return;
  if (String(m.from?.id) === env.OWNER_ID) return; // your own messages are not backed up

  const chat = st.chats.get(m.chat.id);
  if (chat?.muted) return;

  const name = displayName(m.from), username = m.from?.username ?? null;
  const tasks = [];
  let replied = 0, deleted = 0;
  if (st.cfg.group_id && st.cfg.backup_enabled !== "0") {
    const x = extract(m);
    tasks.push(
      deliver(env, st, m.chat.id, { ...x, name, username, unix: m.edit_date || m.date, label: edited ? "✏️ Edited\n" : "" })
        .catch((e) => notifyOwner(env, `Backup failed: ${e.message}`, "backup")));
  }
  if (!chat) {
    st.chats.set(m.chat.id, { chat_id: m.chat.id, name, username, muted: 0 });
    tasks.push(env.DB.prepare("INSERT OR IGNORE INTO chats(chat_id,name,username,muted,added) VALUES(?,?,?,0,?)")
      .bind(m.chat.id, name, username, nowSec()).run());
  }

  // Auto-reply (exact / contains / regex), skipped for edits and outside the schedule.
  if (!edited && scheduleActive(st.cfg, "autoreply")) {
    const rule = matchAutoreply(st.autoreplies, m.text ?? m.caption);
    if (rule) tasks.push(sendAutoreply(env, m, rule).then((sent) => { if (sent) replied = 1; })
      .catch((e) => notifyOwner(env, `Auto-reply failed: ${e.message}`, "auto-reply")));
  }

  // Close DM: delete the incoming message for both sides immediately after it's handled above.
  if (shouldCloseDm(st.cfg, chat) && scheduleActive(st.cfg, "close_dm")) {
    tasks.push(
      tgStrict(env, "deleteMessage", { business_connection_id: m.business_connection_id, chat_id: m.chat.id, message_id: m.message_id })
        .then(() => { deleted = 1; })
        .catch((e) => notifyOwner(env, `Close DM: couldn't delete a message (${e.message})`, "close-dm")));
  }

  await Promise.all(tasks);
  if (!edited) await bumpStats(env, st, m.chat.id, replied, deleted).catch((e) => notifyOwner(env, `Stats update failed: ${e.message}`, "stats"));
}

export async function onDeleted(env, d) {
  const st = await getState(env);
  if (!(await isOwnerConnection(env, st, d.business_connection_id))) return;
  if (!st.cfg.group_id || st.cfg.backup_enabled === "0") return;
  const chat = st.chats.get(d.chat.id);
  if (chat?.muted) return;
  const name = chat?.name || displayName(d.chat), username = chat?.username ?? d.chat.username ?? null;
  const n = d.message_ids.length;
  await deliver(env, st, d.chat.id, {
    type: "notice", name, username, unix: nowSec(), label: "🗑 Deleted\n",
    text: `${n} message${n > 1 ? "s were" : " was"} deleted in this chat.`,
  }).catch((e) => notifyOwner(env, `Backup failed: ${e.message}`, "backup"));
}
