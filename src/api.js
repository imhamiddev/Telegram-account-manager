import { verifyInitData, loadSettings, setSetting, tg, tgStrict } from "./lib.js";
import { invalidate, logError } from "./backup.js";
import { isSafeRegex, isMatchType, lastDays } from "./rules.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const FLAGS = { backup_enabled: "1", topics_enabled: "0", close_dm: "0", sched_enabled: "0", sched_close_dm: "1", sched_autoreply: "1" };
const flagsOf = (cfg) => Object.fromEntries(Object.entries(FLAGS).map(([k, d]) => [k, (cfg[k] ?? d) === "1"]));
const groupOf = (cfg) => (cfg.group_id ? { id: cfg.group_id, title: cfg.group_title || "Backup group", is_forum: cfg.group_is_forum === "1" } : null);
const activeConnection = (env) => env.DB.prepare("SELECT id FROM connections WHERE is_enabled=1 LIMIT 1").first();
const ACCENTS = ["red", "green", "yellow", "purple", "pink", "blue", "orange"];
const DM_RULES = ["default", "keep", "close"];
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const validTz = (v) => { try { new Intl.DateTimeFormat("en", { timeZone: v }); return true; } catch { return false; } };

// Non-boolean settings: key -> [default, validator]. Anything not listed here cannot be written.
const VALUES = {
  close_dm_mode: ["all", (v) => ["all", "selected"].includes(v)],
  sched_start: ["22:00", (v) => HM.test(v)],
  sched_end: ["07:00", (v) => HM.test(v)],
  tz: ["Asia/Tehran", validTz],
};
const valuesOf = (cfg) => Object.fromEntries(Object.entries(VALUES).map(([k, [d]]) => [k, cfg[k] ?? d]));

export async function handleApi(req, env, url) {
  const auth = req.headers.get("Authorization") || "";
  const user = auth.startsWith("tma ") ? await verifyInitData(env, auth.slice(4)) : null;
  if (!user) return json({ error: "Unauthorized" }, 401);

  const p = url.pathname.replace(/^\/api/, "");
  const m = req.method;
  const body = m === "POST" ? await req.json().catch(() => ({})) : {};

  try {
    if (p === "/overview" && m === "GET") {
      const cfg = await loadSettings(env);
      const conn = await activeConnection(env);
      const alerts = [];
      if (!conn) alerts.push({ variant: "destructive", title: "Account not connected", text: "Add this bot in Telegram → Settings → Business → Chatbots." });
      if (!cfg.group_id) alerts.push({ variant: "destructive", title: "No backup group", text: "Add the bot to a group as admin and send /setgr there." });
      if (cfg.topics_enabled === "1" && cfg.group_is_forum !== "1")
        alerts.push({ variant: "warning", title: "Topics unavailable", text: "The backup group is not a forum. Enable Topics in the group settings." });
      if (cfg.backup_enabled === "0") alerts.push({ variant: "warning", title: "Forwarding paused", text: "Incoming messages are not being sent to the group." });
      return json({
        connected: !!conn, group: groupOf(cfg), flags: flagsOf(cfg), alerts,
        theme: cfg.theme || "system", accent: ACCENTS.includes(cfg.accent) ? cfg.accent : "blue",
      });
    }

    if (p === "/chats" && m === "GET") {
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 30, 1), 100);
      const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);
      const { results } = await env.DB.prepare("SELECT chat_id, name, username, muted, added, dm_rule FROM chats ORDER BY added DESC LIMIT ? OFFSET ?")
        .bind(limit, offset).all();
      return json({ items: results, next_offset: offset + results.length, has_more: results.length === limit });
    }
    if (p === "/chats/mute" && m === "POST") {
      await env.DB.prepare("UPDATE chats SET muted=? WHERE chat_id=?").bind(body.muted ? 1 : 0, Number(body.chat_id)).run();
      invalidate();
      return json({ ok: true });
    }

    if (p === "/chats/rule" && m === "POST") {
      if (!DM_RULES.includes(body.rule)) return json({ error: "Unknown rule" }, 400);
      await env.DB.prepare("UPDATE chats SET dm_rule=? WHERE chat_id=?").bind(body.rule, Number(body.chat_id)).run();
      invalidate();
      return json({ ok: true });
    }

    if (p === "/settings" && m === "GET") {
      const cfg = await loadSettings(env);
      return json({
        flags: flagsOf(cfg), values: valuesOf(cfg), group: groupOf(cfg),
        theme: cfg.theme || "system", accent: ACCENTS.includes(cfg.accent) ? cfg.accent : "blue",
      });
    }
    if (p === "/settings/value" && m === "POST") {
      const spec = VALUES[body.key];
      if (!spec) return json({ error: "Unknown setting" }, 400);
      const value = String(body.value ?? "").trim();
      if (!spec[1](value)) return json({ error: "Invalid value" }, 400);
      await setSetting(env, body.key, value);
      invalidate();
      return json({ ok: true });
    }
    if (p === "/settings" && m === "POST") {
      if (!(body.key in FLAGS)) return json({ error: "Unknown setting" }, 400);
      await setSetting(env, body.key, body.value ? "1" : "0");
      invalidate();
      const cfg = await loadSettings(env);
      const warning = body.key === "topics_enabled" && body.value && cfg.group_is_forum !== "1"
        ? "Topics need a forum group. Enable Topics in the group's settings." : null;
      return json({ ok: true, warning });
    }
    if (p === "/settings/appearance" && m === "POST") {
      if (body.theme && !["system", "light", "dark"].includes(body.theme)) return json({ error: "Unknown theme" }, 400);
      if (body.accent && !ACCENTS.includes(body.accent)) return json({ error: "Unknown accent" }, 400);
      if (body.theme) await setSetting(env, "theme", body.theme);
      if (body.accent) await setSetting(env, "accent", body.accent);
      invalidate();
      return json({ ok: true });
    }

    if (p === "/autoreplies" && m === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT keyword, reply, match_type, cooldown_min, media_type, media_url FROM autoreplies ORDER BY match_type, keyword").all();
      return json({ items: results });
    }
    if (p === "/autoreplies" && m === "POST") {
      const match_type = isMatchType(body.match_type) ? body.match_type : "exact";
      let keyword = String(body.keyword || "").trim();
      const reply = String(body.reply || "").trim();
      const cooldown_min = Math.floor(Number(body.cooldown_min) || 0);
      const media_type = body.media_type ? String(body.media_type) : null;
      const media_url = body.media_url ? String(body.media_url).trim() : null;

      if (!keyword) return json({ error: "Keyword is required" }, 400);
      if (!reply) return json({ error: "Reply text is required" }, 400);
      if (match_type === "regex") {
        if (!isSafeRegex(keyword)) return json({ error: "Invalid or unsafe regex (max 100 chars, no nested quantifiers or back-references)" }, 400);
      } else {
        keyword = keyword.toLowerCase();
      }
      if (keyword.length > 100) return json({ error: "Keyword is too long" }, 400);
      if (cooldown_min < 0 || cooldown_min > 10080) return json({ error: "Cooldown must be between 0 and 10080 minutes" }, 400);
      if (!!media_type !== !!media_url) return json({ error: "Media needs both a type and a URL" }, 400);
      if (media_type) {
        if (!["photo", "document", "video"].includes(media_type)) return json({ error: "Unknown media type" }, 400);
        if (!/^https:\/\/\S+$/.test(media_url) || media_url.length > 500) return json({ error: "Media URL must be a direct https link" }, 400);
      }
      if (reply.length > (media_type ? 1024 : 4000)) return json({ error: media_type ? "Caption is too long (max 1024)" : "Reply is too long" }, 400);

      await env.DB.prepare(
        "INSERT INTO autoreplies(keyword,reply,match_type,cooldown_min,media_type,media_url) VALUES(?,?,?,?,?,?) " +
        "ON CONFLICT(keyword) DO UPDATE SET reply=excluded.reply, match_type=excluded.match_type, cooldown_min=excluded.cooldown_min, " +
        "media_type=excluded.media_type, media_url=excluded.media_url")
        .bind(keyword, reply, match_type, cooldown_min, media_type, media_url).run();
      invalidate();
      return json({ ok: true });
    }
    if (p === "/autoreplies/delete" && m === "POST") {
      const keyword = String(body.keyword || "").trim(); // exactly as stored (regex patterns are case-sensitive)
      if (!keyword) return json({ error: "Keyword is required" }, 400);
      await env.DB.batch([
        env.DB.prepare("DELETE FROM autoreplies WHERE keyword=?").bind(keyword),
        env.DB.prepare("DELETE FROM autoreply_hits WHERE keyword=?").bind(keyword),
      ]);
      invalidate();
      return json({ ok: true });
    }
    if (p === "/stats" && m === "GET") {
      const cfg = await loadSettings(env);
      const n = [7, 14, 30].includes(Number(url.searchParams.get("days"))) ? Number(url.searchParams.get("days")) : 14;
      const days = lastDays(n, cfg.tz || "Asia/Tehran");
      const since = days[0];
      // keep the table small: counters older than ~4 months are not useful
      const prune = lastDays(120, cfg.tz || "Asia/Tehran")[0];
      const [perDay, top, tot] = await env.DB.batch([
        env.DB.prepare("SELECT day, SUM(msgs) msgs, SUM(replies) replies, SUM(deleted) deleted FROM daily_stats WHERE day >= ? GROUP BY day").bind(since),
        env.DB.prepare("SELECT s.chat_id, c.name, c.username, SUM(s.msgs) msgs FROM daily_stats s LEFT JOIN chats c ON c.chat_id = s.chat_id WHERE s.day >= ? GROUP BY s.chat_id ORDER BY msgs DESC LIMIT 5").bind(since),
        env.DB.prepare("SELECT COALESCE(SUM(msgs),0) msgs, COALESCE(SUM(replies),0) replies, COALESCE(SUM(deleted),0) deleted FROM daily_stats WHERE day >= ?").bind(since),
      ]);
      await env.DB.prepare("DELETE FROM daily_stats WHERE day < ?").bind(prune).run().catch(() => {}); // awaited: un-awaited work can be cancelled once the response is sent
      const byDay = new Map(perDay.results.map((r) => [r.day, r]));
      return json({
        days: days.map((day) => ({ day, msgs: byDay.get(day)?.msgs ?? 0, replies: byDay.get(day)?.replies ?? 0, deleted: byDay.get(day)?.deleted ?? 0 })),
        top: top.results, totals: tot.results[0], range: n,
      });
    }

    if (p === "/test" && m === "POST") {
      const cfg = await loadSettings(env);
      if (!cfg.group_id) return json({ error: "No backup group set" }, 400);
      await tgStrict(env, "sendMessage", { chat_id: cfg.group_id, text: "✅ Test message from Backup Console" });
      return json({ ok: true });
    }

    if (p === "/account" && m === "GET") {
      const conn = await activeConnection(env);
      if (!conn) return json({ connected: false });
      const r = await tg(env, "getBusinessConnection", { business_connection_id: conn.id });
      if (!r.ok) return json({ connected: false, error: r.description });
      const bc = r.result;
      return json({ connected: !!bc.is_enabled, since: bc.date, rights: bc.rights ?? { can_reply: !!bc.can_reply }, user: { name: bc.user?.first_name, username: bc.user?.username } });
    }

    return json({ error: "Not found" }, 404);
  } catch (e) {
    await logError(env, "api", `${m} ${p}: ${e.message}`);
    return json({ error: e.message || "Server error" }, 500);
  }
}
