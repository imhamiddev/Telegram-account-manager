import { tg, setSetting, loadSettings, safeEqual, withSecurityHeaders } from "./lib.js";
import { invalidate, onBusinessMessage, onDeleted, logError } from "./backup.js";
import { handleApi } from "./api.js";
import { runCleanup } from "./chats.js";
import { runFollowups } from "./followups.js";
import { runMaintenance } from "./maintenance.js";

// The daily jobs run in the 03:00 UTC tick. "0 3 * * *" is still honoured for setups that keep a separate daily trigger.
export const isDailyRun = (c) => c.cron === "0 3 * * *" || (() => { const d = new Date(c.scheduledTime); return d.getUTCHours() === 3 && d.getUTCMinutes() === 0; })();

async function onCommand(env, m, origin) {
  const cmd = (m.text || "").trim().split(/\s+/)[0].split("@")[0].toLowerCase();
  const reply = (text, extra = {}) => tg(env, "sendMessage", { chat_id: m.chat.id, text, parse_mode: "HTML", ...extra });
  const isGroup = m.chat.type === "group" || m.chat.type === "supergroup";

  if (cmd === "/setgr") {
    if (!isGroup) return reply("Send this command inside the group you want to use as backup.");
    const info = await tg(env, "getChat", { chat_id: m.chat.id });
    await setSetting(env, "group_id", m.chat.id);
    await setSetting(env, "group_title", info.result?.title || "Backup group");
    await setSetting(env, "group_is_forum", info.result?.is_forum ? "1" : "0");
    invalidate();
    return reply(`✅ This group is now the backup destination.${info.result?.is_forum ? "\nTopics are available (enable them in the Mini App)." : ""}`);
  }
  if (m.chat.type !== "private") return;

  if (cmd === "/start" || cmd === "/app") {
    await tg(env, "setChatMenuButton", { chat_id: m.chat.id, menu_button: { type: "web_app", text: "Console", web_app: { url: origin } } });
    return reply("<b>Backup Console</b> is ready.", { reply_markup: { inline_keyboard: [[{ text: "Open Console", web_app: { url: origin } }]] } });
  }
  if (cmd === "/status") {
    const cfg = await loadSettings(env);
    const c = await env.DB.prepare("SELECT COUNT(*) n FROM connections WHERE is_enabled=1").first();
    return reply(`Backup group: ${cfg.group_title ?? "not set"}\nActive connections: ${c.n}\nForwarding: ${cfg.backup_enabled === "0" ? "paused" : "on"}`);
  }
}

async function handle(update, env, origin) {
  if (update.business_connection) {
    const bc = update.business_connection;
    if (String(bc.user.id) !== env.OWNER_ID) return;
    await env.DB.prepare("INSERT OR REPLACE INTO connections(id,is_enabled) VALUES(?,?)").bind(bc.id, bc.is_enabled ? 1 : 0).run();
    invalidate();
    await tg(env, "sendMessage", { chat_id: env.OWNER_ID, text: bc.is_enabled ? "✅ Bot connected to your account." : "❌ Bot disconnected from your account." });
    return;
  }
  if (update.business_message) return onBusinessMessage(env, update.business_message, false);
  if (update.edited_business_message) return onBusinessMessage(env, update.edited_business_message, true);
  if (update.deleted_business_messages) return onDeleted(env, update.deleted_business_messages);

  const m = update.message;
  if (!m || String(m.from?.id) !== env.OWNER_ID) return; // everyone else is ignored silently
  return onCommand(env, m, origin);
}

export default {
  // One cron trigger (every minute) sends due follow-ups; at 03:00 UTC the same run also removes inactive chats and prunes old counters.
  // A single trigger keeps the Worker inside the Workers Free limit of 5 cron triggers per account.
  async scheduled(controller, env, ctx) {
    ctx.waitUntil((async () => {
      try {
        await runFollowups(env);
        if (isDailyRun(controller)) {
          // independent jobs: one failing must not skip the other
          const cfg = await loadSettings(env);
          await Promise.allSettled([runCleanup(env), runMaintenance(env, cfg.tz || "Asia/Tehran")])
            .then((rs) => Promise.all(rs.filter((r) => r.status === "rejected").map((r) => logError(env, "cron", r.reason?.message))));
        }
      } catch (e) { await logError(env, "cron", e.message); }
    })());
  },
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) return handleApi(req, env, url);
    if (req.method === "POST") {
      const sent = req.headers.get("X-Telegram-Bot-Api-Secret-Token") || "";
      if (!env.WEBHOOK_SECRET || !safeEqual(sent, env.WEBHOOK_SECRET)) // constant-time; an unset secret rejects everything
        return new Response("forbidden", { status: 403 });
      const update = await req.json().catch(() => null);
      if (!update || typeof update !== "object") return new Response("bad request", { status: 400 });
      ctx.waitUntil(handle(update, env, url.origin).catch((e) => { console.error(e); return logError(env, "webhook", e.message); }));
      return new Response("ok"); // answer Telegram immediately, work continues in the background
    }
    return withSecurityHeaders(await env.ASSETS.fetch(req)); // Mini App
  },
};
