import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { hashPin, verifyPin, signUnlock, checkUnlock, redact, safeEqual, verifyInitData, nowSec, withSecurityHeaders, CSP } from "../src/lib.js";

test("pin hashing: correct PIN verifies, wrong PIN does not", async () => {
  const stored = await hashPin("4821");
  assert.match(stored, /^[0-9a-f]{32}:[0-9a-f]{64}$/);
  assert.equal(await verifyPin("4821", stored), true);
  assert.equal(await verifyPin("4822", stored), false);
  assert.equal(await verifyPin("4821", ""), false);
  assert.equal(await verifyPin("4821", "garbage"), false);
});

test("pin hashing: same PIN gets a different salt every time", async () => {
  assert.notEqual(await hashPin("1111"), await hashPin("1111"));
});

test("unlock token: valid, tampered, expired and wrong-key tokens", async () => {
  const env = { BOT_TOKEN: "123:abc" };
  const token = await signUnlock(env, 60);
  assert.equal(await checkUnlock(env, token), true);

  const [exp, sig] = token.split(".");
  assert.equal(await checkUnlock(env, `${Number(exp) + 999}.${sig}`), false); // expiry changed
  assert.equal(await checkUnlock(env, `${exp}.${"0".repeat(64)}`), false);    // bad signature
  assert.equal(await checkUnlock({ BOT_TOKEN: "other" }, token), false);       // different bot
  assert.equal(await checkUnlock(env, await signUnlock(env, -5)), false);      // expired
  assert.equal(await checkUnlock(env, ""), false);
  assert.equal(await checkUnlock(env, undefined), false);
});

test("redact: the bot token never survives in an error text", () => {
  const env = { BOT_TOKEN: "123:SECRET" };
  assert.equal(redact(env, new Error("fetch failed for https://api.telegram.org/bot123:SECRET/sendMessage")), "Error: fetch failed for https://api.telegram.org/bot***/sendMessage");
  assert.equal(redact({}, "plain"), "plain");
  assert.equal(redact(env, null), "");
});

test("safeEqual: equal strings match, different length or content do not", () => {
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("abc", "abcd"), false);
  assert.equal(safeEqual("", ""), true);
});

// ---- Mini App initData ----
const ENV = { BOT_TOKEN: "123456:TESTTOKEN", OWNER_ID: "42" };
function signed(fields) {
  const params = new URLSearchParams(fields);
  const dcs = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secret = createHmac("sha256", "WebAppData").update(ENV.BOT_TOKEN).digest();
  params.set("hash", createHmac("sha256", secret).update(dcs).digest("hex"));
  return params.toString();
}
const user = (id) => JSON.stringify({ id, first_name: "T" });

test("initData: a valid, fresh, owner-signed payload is accepted", async () => {
  const u = await verifyInitData(ENV, signed({ user: user(42), auth_date: String(nowSec()) }));
  assert.equal(u?.id, 42);
});

test("initData: tampering, another user, stale or missing auth_date are rejected", async () => {
  assert.equal(await verifyInitData(ENV, signed({ user: user(7), auth_date: String(nowSec()) })), null, "not the owner");
  assert.equal(await verifyInitData(ENV, signed({ user: user(42), auth_date: String(nowSec() - 90000) })), null, "older than 24h");
  assert.equal(await verifyInitData(ENV, signed({ user: user(42) })), null, "no auth_date");
  assert.equal(await verifyInitData(ENV, signed({ user: user(42), auth_date: "soon" })), null, "garbage auth_date");
  assert.equal(await verifyInitData(ENV, signed({ user: user(42), auth_date: String(nowSec() + 3600) })), null, "from the future");
  const ok = signed({ user: user(42), auth_date: String(nowSec()) });
  assert.equal(await verifyInitData(ENV, ok.replace("T", "X")), null, "tampered");
  assert.equal(await verifyInitData(ENV, ""), null);
});
