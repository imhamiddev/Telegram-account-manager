// Runs the real Mini App (public/app.js) inside jsdom against a LOCAL Worker: every tab, the auto-reply editor,
// the PIN lock flow and the 423 re-lock path. Needs seeded data: `npm run dev:test`, then `npm run smoke`, then `npm run smoke:ui`.
import { JSDOM } from "jsdom";
import fs from "node:fs";
import { createHmac } from "node:crypto";
const ROOT = new URL("..", import.meta.url).pathname;
const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:8787", TOKEN = "123456:TESTTOKEN", OWNER = 7654150612;
const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: OWNER, first_name: "Owner" }) });
const dcs = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
p.set("hash", createHmac("sha256", createHmac("sha256", "WebAppData").update(TOKEN).digest()).update(dcs).digest("hex"));
const initData = p.toString();

const html = fs.readFileSync(ROOT + "public/index.html", "utf8").replace(/<script[^>]*>[\s\S]*?<\/script>/g, "");
const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: BASE + "/" });
const w = dom.window, errors = [];
w.addEventListener("error", (e) => errors.push("window error: " + e.message));
w.Telegram = { WebApp: { initData, ready() {}, expand() {}, disableVerticalSwipes() {}, colorScheme: "dark", onEvent() {}, setHeaderColor() {}, setBackgroundColor() {}, HapticFeedback: { notificationOccurred() {}, selectionChanged() {} } } };
w.fetch = (u, o) => fetch(new URL(u, BASE).href, o);
w.IntersectionObserver = class { constructor(cb) { this.cb = cb; } observe() { setTimeout(() => this.cb([{ isIntersecting: true }]), 10); } disconnect() {} };
w.matchMedia = () => ({ matches: true, addEventListener() {} });
w.HTMLElement.prototype.scrollTo = function () {};
w.eval(fs.readFileSync(ROOT + "public/app.js", "utf8"));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const text = () => w.document.querySelector("main")?.textContent ?? "";
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log((cond ? "PASS " : "FAIL ") + name + (cond ? "" : "  -> " + String(extra).slice(0, 200))); };
const clickNav = async (label) => { [...w.document.querySelectorAll(".nav button")].find((b) => b.textContent.trim() === label).click(); await wait(2500); };

await wait(3000);
ok("overview: System health card", text().includes("System health"), text());
ok("overview: Activity card with bars", text().includes("Activity") && w.document.querySelectorAll(".bar").length === 14, w.document.querySelectorAll(".bar").length);
ok("overview: health rows render", w.document.querySelectorAll(".health-row").length >= 5);
w.document.querySelectorAll(".seg button")[0].click(); await wait(1200);
ok("activity: switch to 7d", w.document.querySelectorAll(".bar").length === 7);
w.document.querySelector(".bar").click();
ok("activity: tapping a bar shows details", /messages/.test(w.document.querySelector(".chart-caption").textContent));

await clickNav("Chats");
ok("chats: rows render with rule selector", w.document.querySelectorAll(".item select").length > 0 && !text().includes("Couldn't load"), text());
const sel = w.document.querySelector(".item select"); sel.value = "keep"; sel.dispatchEvent(new w.Event("change")); await wait(800);
ok("chats: changing rule saves (no error toast)", !w.document.querySelector(".toast.error"));

// label + note sheet
w.document.querySelector(".item.static .tap").click(); await wait(300);
const labIn = w.document.querySelector(".sheet input[maxlength=\"24\"]");
ok("chats: tapping a chat opens the label/note sheet", !!labIn, text());
if (labIn) {
  labIn.value = "Customer"; w.document.querySelector(".sheet textarea").value = "call back Monday";
  [...w.document.querySelectorAll(".sheet button")].find((b) => /^Save$/.test(b.textContent.trim()))?.click(); await wait(1200);
  ok("chats: label and note appear on the row", /Customer/.test(text()) && /call back Monday/.test(text()), text());
}
ok("chats: sort and label filter selects render", w.document.querySelectorAll(".toolbar-row select").length >= 2);

// delete chat: trash button opens a confirm sheet; the refused-topic path offers "remove anyway"
const rowsBefore = w.document.querySelectorAll(".item.static").length;
const trash = w.document.querySelector(".item.static [data-act=\"delete\"]");
ok("chats: row has a delete button", !!trash);
if (trash) {
  trash.click(); await wait(300);
  ok("chats: delete opens a confirm sheet", /Delete this chat/.test(w.document.querySelector(".sheet")?.textContent || ""), text());
  [...w.document.querySelectorAll(".sheet button")].find((b) => /Delete everything/.test(b.textContent))?.click(); await wait(1500);
  const sheetText = w.document.querySelector(".sheet")?.textContent || "";
  const removed = w.document.querySelectorAll(".item.static").length < rowsBefore;
  if (!removed) {
    ok("chats: refused topic delete offers remove-anyway", /Remove anyway/.test(sheetText), sheetText);
    [...w.document.querySelectorAll(".sheet button")].find((b) => /Remove from database only/.test(b.textContent))?.click(); await wait(1500);
  }
  ok("chats: row disappears after deleting", w.document.querySelectorAll(".item.static").length < rowsBefore);
}

await clickNav("Account");
ok("account: loads", !text().includes("Couldn't load"), text());

await clickNav("Settings");
for (const t of ["Appearance", "Console lock", "Close DM applies to", "Schedule", "Spam protection", "Auto-reply"]) ok("settings: " + t, text().includes(t), t);
const mode = [...w.document.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.value === "selected"));
mode.value = "selected"; mode.dispatchEvent(new w.Event("change")); await wait(800);
ok("settings: Close DM mode saves", !w.document.querySelector(".toast.error"));
const btn = (label) => [...w.document.querySelectorAll("button")].find((b) => b.textContent.trim() === label);
btn("Manage auto-replies").click(); await wait(1500);
ok("auto-replies sheet opens with editor + rules", /Add or edit a rule/.test(w.document.body.textContent) && w.document.querySelectorAll(".kw-row").length >= 1, w.document.body.textContent.slice(-300));
const kw = w.document.querySelector(".sheet input[placeholder^='Keyword']"); kw.value = "ui-test"; 
w.document.querySelector(".sheet textarea").value = "reply from ui";
const ms = w.document.querySelector(".sheet select"); ms.value = "contains"; ms.dispatchEvent(new w.Event("change"));
btn("Save rule").click(); await wait(1200);
ok("auto-reply: saved via UI shows in list", [...w.document.querySelectorAll(".kw-row .kw")].some((e) => e.textContent === "ui-test"));

// PIN lock via UI
w.document.querySelector(".sheet .btn-ghost")?.click(); await wait(500);
btn("Set a PIN").click(); await wait(300);
const pins = w.document.querySelectorAll(".sheet input[type=password]"); pins[0].value = "2468"; pins[1].value = "2468";
btn("Save PIN").click(); await wait(1500);
ok("lock: PIN saved, status On", /On/.test([...w.document.querySelectorAll(".card")].find((c) => c.textContent.includes("Console lock")).textContent), "");
await clickNav("Overview");
ok("lock: still usable with token after setting PIN", text().includes("System health"), text());
// simulate expiry -> server answers 423 -> lock screen should appear and then accept the PIN
const nav = [...w.document.querySelectorAll(".nav button")].find((b) => b.textContent.trim() === "Chats");
const origFetch = w.fetch; let first = true;
w.fetch = (u, o) => { if (first && String(u).includes("/api/chats")) { first = false; return Promise.resolve(new Response(JSON.stringify({ error: "Locked", locked: true }), { status: 423 })); } return origFetch(u, o); };
nav.click(); await wait(800);
ok("lock: lock screen appears on 423", !!w.document.querySelector(".lock-screen"));
for (const d of "2468") [...w.document.querySelectorAll(".key")].find((k) => k.textContent === d).click();
w.document.querySelector(".key.ok").click(); await wait(2500);
ok("lock: correct PIN dismisses screen and retries request", !w.document.querySelector(".lock-screen") && w.document.querySelectorAll(".item").length > 0, text());

// turn PIN off again so the DB is clean
await clickNav("Settings");
btn("Turn off").click(); await wait(300);
w.document.querySelector(".sheet input[type=password]").value = "2468";
[...w.document.querySelectorAll(".sheet button")].find((b) => b.textContent.trim() === "Turn off").click(); await wait(1200);
ok("lock: turned off via UI", /Off/.test([...w.document.querySelectorAll(".card")].find((c) => c.textContent.includes("Console lock")).textContent));

ok("no uncaught window errors", errors.length === 0, errors.join(" | "));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
