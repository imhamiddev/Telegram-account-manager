import { tg, sleep, loadSettings, nowSec } from "./lib.js";
import { invalidate, notifyOwner } from "./backup.js";

const GONE = /thread not found|topic.*(not found|invalid|deleted)/i;

// Removes a chat completely: its forum topic in the backup group (with every message in it) and all its rows.
// Without `force`, a topic Telegram refuses to delete (e.g. missing "Delete messages" right) keeps the chat so nothing is orphaned.
export async function deleteChat(env, chatId, { force = false } = {}) {
  const { results: topics } = await env.DB.prepare("SELECT group_id, thread_id FROM topics WHERE chat_id=?").bind(chatId).all();
  const failed = [];
  for (const t of topics) {
    const req = { chat_id: t.group_id, message_thread_id: t.thread_id };
    let r = await tg(env, "deleteForumTopic", req);
    if (!r.ok && r.error_code === 429) { // rate limited: wait once, then try again
      await sleep(Math.min(r.parameters?.retry_after ?? 2, 5) * 1000);
      r = await tg(env, "deleteForumTopic", req);
    }
    if (!r.ok && !GONE.test(r.description || "")) failed.push(r.description || "Telegram error");
  }
  if (failed.length && !force) return { ok: false, topic_failed: true, error: `Couldn't delete the topic: ${failed[0]}` };
  await env.DB.batch([
    env.DB.prepare("DELETE FROM topics WHERE chat_id=?").bind(chatId),
    env.DB.prepare("DELETE FROM autoreply_hits WHERE chat_id=?").bind(chatId),
    env.DB.prepare("DELETE FROM followups WHERE chat_id=?").bind(chatId),
    env.DB.prepare("DELETE FROM daily_stats WHERE chat_id=?").bind(chatId),
    env.DB.prepare("DELETE FROM flood WHERE chat_id=?").bind(chatId),
    env.DB.prepare("DELETE FROM chats WHERE chat_id=?").bind(chatId),
  ]);
  invalidate();
  return { ok: true, topics_deleted: topics.length - failed.length, topic_failed: failed.length > 0 };
}

export const CLEANUP_BATCH = 20; // per run, so one night never floods Telegram with deletions

// Auto cleanup: removes chats with no activity for N days. Pinned chats are never touched.
export async function runCleanup(env) {
  const cfg = await loadSettings(env);
  if (cfg.cleanup_enabled !== "1") return { removed: 0, failed: 0, skipped: true };
  const days = Math.min(Math.max(Number(cfg.cleanup_days) || 30, 7), 365);
  const cutoff = nowSec() - days * 86400;
  const { results } = await env.DB.prepare(
    "SELECT chat_id FROM chats WHERE pinned=0 AND COALESCE(last_at, added) < ? ORDER BY COALESCE(last_at, added) ASC LIMIT ?")
    .bind(cutoff, CLEANUP_BATCH).all();
  let removed = 0, failed = 0, firstError = "";
  for (const c of results) {
    const r = await deleteChat(env, c.chat_id);
    if (r.ok) removed++; else { failed++; firstError ||= r.error; }
  }
  if (failed) await notifyOwner(env, `Auto cleanup: ${failed} chat(s) could not be removed (${firstError})`, "cleanup");
  if (removed) await tg(env, "sendMessage", { chat_id: env.OWNER_ID, text: `🧹 Auto cleanup removed ${removed} inactive chat(s) (no messages for ${days}+ days).` });
  return { removed, failed, skipped: false };
}
