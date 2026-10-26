export const esc = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class RateLimit extends Error {
  constructor(seconds) { super("Rate limited"); this.retryAfter = seconds; }
}
export class TgError extends Error {
  constructor(description, code) { super(description); this.code = code; }
}

const api = (env, method) => `https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`;

// Throws on failure
export async function tgStrict(env, method, body) {
  const r = await fetch(api(env, method), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (j.ok) return j.result;
  if (j.error_code === 429) throw new RateLimit(j.parameters?.retry_after ?? 5);
  throw new TgError(j.description || `Telegram error (${r.status})`, j.error_code || r.status);
}

// Never throws; returns the raw API response
export async function tg(env, method, body) {
  try {
    const r = await fetch(api(env, method), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return await r.json();
  } catch (e) {
    return { ok: false, description: String(e) };
  }
}

export async function loadSettings(env) {
  const { results } = await env.DB.prepare("SELECT key, value FROM settings").all();
  return Object.fromEntries(results.map((r) => [r.key, r.value]));
}
export const setSetting = (env, k, v) =>
  env.DB.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .bind(k, String(v)).run();

export const displayName = (u = {}) =>
  [u.first_name, u.last_name].filter(Boolean).join(" ") || "Unknown";

// ---- Tehran time (UTC+3:30, no DST) ----
const part = (parts, t) => parts.find((x) => x.type === t).value;
export function tehranStamp(unix) {
  const d = new Date((unix || Math.floor(Date.now() / 1000)) * 1000);
  const dp = new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", {
    timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const tp = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  return {
    date: `${part(dp, "year")}/${part(dp, "month")}/${part(dp, "day")}`,
    time: `${part(tp, "hour")}:${part(tp, "minute")}:${part(tp, "second")}`,
  };
}
export const nowSec = () => Math.floor(Date.now() / 1000);

// ---- Mini App auth (Telegram initData) ----
export async function verifyInitData(env, initData) {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return null;
    params.delete("hash");
    const dcs = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
    const enc = new TextEncoder();
    const hmac = async (key, data) =>
      new Uint8Array(await crypto.subtle.sign("HMAC",
        await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), data));
    const secret = await hmac(enc.encode("WebAppData"), enc.encode(env.BOT_TOKEN));
    const hex = [...(await hmac(secret, enc.encode(dcs)))].map((b) => b.toString(16).padStart(2, "0")).join("");
    if (hex.length !== hash.length) return null;
    let diff = 0;
    for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ hash.charCodeAt(i);
    if (diff !== 0) return null;
    if (nowSec() - Number(params.get("auth_date")) > 86400) return null;
    const user = JSON.parse(params.get("user") || "{}");
    return String(user.id) === env.OWNER_ID ? user : null;
  } catch {
    return null;
  }
}
