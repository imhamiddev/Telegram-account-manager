import test from "node:test";
import assert from "node:assert/strict";
import { hashPin, verifyPin, signUnlock, checkUnlock } from "../src/lib.js";

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
