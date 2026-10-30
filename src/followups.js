import { tgStrict, loadSettings, nowSec } from "./lib.js";
import { scheduleActive } from "./rules.js";
import { notifyOwner } from "./backup.js";

// An owner message right after our own auto-reply may be that reply echoed back; it must not cancel the follow-up.
export const ECHO_GRACE_SEC = 10;
export const BATCH = 20;

// Called after an auto-reply was sent: one pending follow-up per chat (a new one replaces the old).
export async function scheduleFollowup(env, m, rule) {
  if (!(rule.followup_min > 0) || !rule.followup_text) return;
  const now = nowSec();
  await env.DB.prepare("INSERT OR REPLACE INTO followups(chat_id,connection_id,text,created_at,due_at) VALUES(?,?,?,?,?)")
    .bind(m.chat.id, m.business_connection_id, rule.followup_text, now, now + rule.followup_min * 60).run();
}

// The owner wrote in the chat themselves: nobody is "unanswered" any more.
export const cancelFollowup = (env, chatId) =>
  env.DB.prepare("DELETE FROM followups WHERE chat_id=? AND created_at <= ?").bind(chatId, nowSec() - ECHO_GRACE_SEC).run();

// Cron (every minute): send follow-ups that fell due. Each one is claimed with DELETE ... RETURNING so it is sent once.
export async function runFollowups(env) {
  const now = nowSec();
  const { results } = await env.DB.prepare("SELECT chat_id FROM followups WHERE due_at <= ? ORDER BY due_at LIMIT ?").bind(now, BATCH).all();
  if (!results.length) return 0;
  const cfg = await loadSettings(env);
  let sent = 0;
  for (const { chat_id } of results) {
    const row = await env.DB.prepare("DELETE FROM followups WHERE chat_id=? AND due_at <= ? RETURNING connection_id, text").bind(chat_id, now).first();
    if (!row) continue; // another run already took it
    const chat = await env.DB.prepare("SELECT muted FROM chats WHERE chat_id=?").bind(chat_id).first();
    if (!chat || chat.muted || !scheduleActive(cfg, "autoreply")) continue; // muted, deleted, or outside the schedule: drop it
    try {
      await tgStrict(env, "sendMessage", { business_connection_id: row.connection_id, chat_id, text: row.text });
      sent++;
    } catch (e) {
      await notifyOwner(env, `Follow-up failed: ${e.message}`, "follow-up");
    }
  }
  return sent;
}
