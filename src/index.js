import { tg, setSetting, loadSettings } from "./lib.js";
import { invalidate, onBusinessMessage, onDeleted, logError } from "./backup.js";
import { handleApi } from "./api.js";

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
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) return handleApi(req, env, url);
    if (req.method === "POST") {
      if (req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET)
        return new Response("forbidden", { status: 403 });
      const update = await req.json();
      ctx.waitUntil(handle(update, env, url.origin).catch((e) => { console.error(e); return logError(env, "webhook", e.message); }));
      return new Response("ok"); // answer Telegram immediately, work continues in the background
    }
    return env.ASSETS.fetch(req); // Mini App
  },
};
