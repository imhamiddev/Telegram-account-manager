import { esc, tg, sendDocument, tehranStamp, tehranDayStart, nowSec } from "./lib.js";

export function rangeBounds(range) {
  const now = nowSec();
  const t0 = tehranDayStart(now);
  switch (range) {
    case "today": return [t0, now + 1];
    case "yesterday": return [t0 - 86400, t0];
    case "7d": return [t0 - 6 * 86400, now + 1];
    case "30d": return [t0 - 29 * 86400, now + 1];
    default: return [0, now + 1];
  }
}

export async function buildReport(env, range) {
  const [from, to] = rangeBounds(range);
  const q = (sql, ...a) => env.DB.prepare(sql).bind(...a);
  const tot = await q(
    `SELECT COUNT(*) n, COUNT(DISTINCT chat_id) senders, COALESCE(SUM(edited),0) edited,
            COALESCE(SUM(deleted),0) deleted, COALESCE(SUM(backup_status='failed'),0) failed
     FROM messages WHERE date>=? AND date<?`, from, to).first();
  const top = (await q(
    `SELECT MAX(sender_name) name, MAX(sender_username) username, COUNT(*) n
     FROM messages WHERE date>=? AND date<? GROUP BY chat_id ORDER BY n DESC LIMIT 5`, from, to).all()).results;
  const types = (await q(
    `SELECT type, COUNT(*) n FROM messages WHERE date>=? AND date<? GROUP BY type ORDER BY n DESC`, from, to).all()).results;

  const title = range === "yesterday" ? "Yesterday" : range === "today" ? "Today" : range;
  const day = tehranStamp(from).date;
  const lines = [
    `📊 <b>${esc(title)} report</b> · ${day}`,
    "",
    `Messages: <b>${tot.n}</b>  (edited ${tot.edited}, deleted ${tot.deleted})`,
    `Unique senders: <b>${tot.senders}</b>`,
    `Failed backups: <b>${tot.failed}</b>`,
  ];
  if (types.length) lines.push("", "Types: " + types.map((t) => `${esc(t.type)} ${t.n}`).join(" · "));
  if (top.length) {
    lines.push("", "<b>Top senders</b>");
    top.forEach((t, i) => lines.push(`${i + 1}. ${esc(t.name || "Unknown")}${t.username ? " @" + esc(t.username) : ""} — ${t.n}`));
  }
  if (!tot.n) lines.push("", "No messages in this period.");
  return lines.join("\n");
}

export async function sendReport(env, range) {
  const text = await buildReport(env, range);
  return tg(env, "sendMessage", { chat_id: env.OWNER_ID, text, parse_mode: "HTML" });
}

// ---------- export ----------
const MAX_ROWS = 20000;
const cell = (v) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // CSV formula-injection guard
  return `"${s.replace(/"/g, '""')}"`;
};

export async function exportToOwner(env, format, range) {
  const [from, to] = rangeBounds(range);
  const rows = [];
  let last = 0;
  while (rows.length < MAX_ROWS) {
    const { results } = await env.DB.prepare(
      `SELECT id, chat_id, sender_id, sender_name, sender_username, type, text, date, edited, deleted, backup_status
       FROM messages WHERE date>=? AND date<? AND id>? ORDER BY id LIMIT 2000`).bind(from, to, last).all();
    if (!results.length) break;
    rows.push(...results);
    last = results.at(-1).id;
  }
  if (!rows.length) return { ok: false, description: "No messages in this range." };

  const stamp = tehranStamp(nowSec()).date.replaceAll("/", "-");
  const out = rows.map((r) => {
    const t = tehranStamp(r.date);
    return { ...r, jalali_date: t.date, tehran_time: t.time };
  });
  let content, mime, name;
  if (format === "json") {
    content = JSON.stringify(out, null, 2); mime = "application/json"; name = `messages-${range}-${stamp}.json`;
  } else {
    const cols = ["id", "jalali_date", "tehran_time", "chat_id", "sender_id", "sender_name", "sender_username", "type", "text", "edited", "deleted", "backup_status"];
    content = [cols.join(","), ...out.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n");
    mime = "text/csv"; name = `messages-${range}-${stamp}.csv`;
  }
  const cap = `Export · ${rows.length} messages${rows.length >= MAX_ROWS ? ` (capped at ${MAX_ROWS})` : ""}`;
  return sendDocument(env, env.OWNER_ID, name, content, mime, cap);
}
