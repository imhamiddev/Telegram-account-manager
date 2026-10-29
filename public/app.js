(() => {
  const tg = window.Telegram?.WebApp;
  try { tg?.ready(); tg?.expand(); tg?.disableVerticalSwipes?.(); } catch {}

  // ---------- theme + accent ----------
  // themeMode: "system" (follow Telegram/OS) | "light" | "dark" (manual override, persisted server-side)
  let themeMode = "system";
  let accent = "blue";
  function isSystemDark() {
    return (tg?.colorScheme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) === "dark";
  }
  function applyTheme() {
    const dark = themeMode === "dark" || (themeMode === "system" && isSystemDark());
    document.documentElement.classList.toggle("dark", dark);
    try { tg?.setHeaderColor?.(dark ? "#09090b" : "#ffffff"); tg?.setBackgroundColor?.(dark ? "#09090b" : "#ffffff"); } catch {}
  }
  function applyAccent() {
    document.documentElement.setAttribute("data-accent", accent);
  }
  applyTheme();
  applyAccent();
  tg?.onEvent?.("themeChanged", () => { if (themeMode === "system") applyTheme(); });

  // ---------- tiny DOM helper (text is always inserted as text nodes, never HTML) ----------
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (["value", "checked", "disabled", "selected"].includes(k)) el[k] = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  // ---------- icons (lucide, static markup only) ----------
  const ICONS = {
    dashboard: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
    messages: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    account: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662"/>',
    settings: '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    pin: '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    loader: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    system: '<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8M12 17v4"/>',
    reply: '<path d="M9 17 4 12l5-5"/><path d="M4 12h10a5 5 0 0 1 5 5v2"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  };
  function icon(name, cls = "") {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("class", "i " + cls);
    s.innerHTML = ICONS[name]; // static strings only
    return s;
  }

  // ---------- shadcn-style components ----------
  const Card = (title, desc, content, opts = {}) =>
    h("div", { class: "card" },
      (title || desc) && h("div", { class: "card-header" },
        title && h("div", { class: "row between" }, h("h3", { class: "card-title" }, title), opts.action),
        desc && h("p", { class: "card-description" }, desc)),
      content && h("div", { class: "card-content" + (opts.flush ? " flush" : "") }, content));

  const Badge = (text, variant = "secondary") => h("span", { class: `badge badge-${variant}` }, text);

  function Btn(label, { variant = "default", size = "", ic, onclick, block, disabled } = {}) {
    const b = h("button", { type: "button", class: `btn btn-${variant}${size ? " btn-" + size : ""}${block ? " btn-block" : ""}`, disabled },
      ic && icon(ic), label);
    if (onclick) b.addEventListener("click", async () => {
      b.disabled = true;
      const old = b.firstChild;
      const sp = icon("loader", "spin");
      if (ic) b.replaceChild(sp, old); else b.prepend(sp);
      try { await onclick(); } catch (e) { toast(e.message || "Something went wrong", "error"); }
      sp.replaceWith(ic ? icon(ic) : document.createComment(""));
      b.disabled = false;
    });
    return b;
  }

  function Switch(checked, onChange) {
    const b = h("button", { type: "button", role: "switch", "aria-checked": String(!!checked), class: "switch" }, h("span", { class: "switch-thumb" }));
    b.addEventListener("click", async () => {
      const next = b.getAttribute("aria-checked") !== "true";
      b.setAttribute("aria-checked", String(next));
      b.disabled = true;
      try { await onChange(next); } catch (e) { b.setAttribute("aria-checked", String(!next)); toast(e.message, "error"); }
      b.disabled = false;
    });
    return b;
  }

  const Field = (label, input) => h("div", { class: "field" }, h("label", { class: "label" }, label), input);
  const Select = (options, value, onchange) =>
    h("select", { class: "select", onchange: (e) => onchange(e.target.value) },
      options.map(([v, l]) => h("option", { value: v, selected: v === value }, l)));
  const Skeleton = (hgt = 80) => h("div", { class: "skeleton", style: `height:${hgt}px` });
  const Empty = (t) => h("div", { class: "empty" }, t);

  function Alert({ variant, title, text }) {
    return h("div", { class: `alert alert-${variant}` }, icon("alert"), h("div", {}, h("div", { class: "t" }, title), h("div", { class: "d" }, text)));
  }

  // Remove an element once its exit animation ends, with a timer fallback so it can never get stuck
  // (animations may not run: reduced motion, background tabs, very old WebViews).
  function removeAfterAnimation(el, ms = 260) {
    let done = false;
    const go = () => { if (!done) { done = true; el.remove(); } };
    el.addEventListener("animationend", go, { once: true });
    setTimeout(go, ms);
  }

  function toast(msg, kind = "") {
    let box = document.querySelector(".toasts");
    if (!box) { box = h("div", { class: "toasts" }); document.body.append(box); }
    const t = h("div", { class: "toast " + kind }, msg);
    box.append(t);
    try { tg?.HapticFeedback?.notificationOccurred(kind === "error" ? "error" : "success"); } catch {}
    setTimeout(() => {
      t.classList.add("leaving");
      removeAfterAnimation(t);
    }, 2800);
  }

  function openSheet(...content) {
    const close = () => {
      ov.classList.add("closing");
      removeAfterAnimation(ov);
    };
    const ov = h("div", { class: "overlay", onclick: (e) => e.target === ov && close() },
      h("div", { class: "sheet" }, h("div", { class: "grab" }), content.map((c) => (typeof c === "function" ? c(close) : c))));
    document.body.append(ov);
    return close;
  }

  // ---------- formatting ----------
  const pf = new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" });
  const tf = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const pick = (parts, t) => parts.find((x) => x.type === t)?.value ?? "";
  function fmtDate(ts) {
    try { const p = pf.formatToParts(new Date(ts * 1000)); return `${pick(p, "year")}/${pick(p, "month")}/${pick(p, "day")}`; }
    catch { return new Date(ts * 1000).toISOString().slice(0, 10); }
  }
  const fmtTime = (ts) => tf.format(new Date(ts * 1000));
  const fmtWhen = (ts) => `${fmtDate(ts)} · ${fmtTime(ts)}`;
  const initials = (n) => (n || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const prettyRight = (k) => k.replace(/^can_/, "").replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());

  // ---------- API ----------
  let unlockToken = null;   // in memory only: closing the console always locks it again
  let lockEnabled = false;
  let unlockPromise = null;

  async function api(path, { method = "GET", body } = {}, retried = false) {
    const headers = { Authorization: "tma " + (tg?.initData || ""), "content-type": "application/json" };
    if (unlockToken) headers["X-Unlock"] = unlockToken;
    const r = await fetch("/api" + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (r.status === 423 && !retried) { // the session expired or the PIN was just enabled: ask again, then retry once
      unlockToken = null;
      await requestUnlock();
      return api(path, { method, body }, true);
    }
    if (!r.ok) { const e = new Error(j.error || r.statusText); e.data = j; throw e; }
    return j;
  }

  // Full-screen PIN pad. Resolves once the server accepts the PIN (single-flight: many failed calls share one prompt).
  function requestUnlock() {
    if (unlockPromise) return unlockPromise;
    unlockPromise = new Promise((resolve) => {
      let pin = "";
      const dots = h("div", { class: "pin-dots" });
      const msg = h("div", { class: "pin-msg" }, "Enter your PIN");
      const drawDots = () => dots.replaceChildren(...Array.from({ length: Math.max(4, pin.length) }, (_, i) => h("span", { class: "pin-dot" + (i < pin.length ? " filled" : "") })));
      const press = (d) => { if (pin.length < 8) { pin += d; drawDots(); try { tg?.HapticFeedback?.selectionChanged(); } catch {} } };
      const submit = async () => {
        if (pin.length < 4) return;
        try {
          const r = await api("/lock/verify", { method: "POST", body: { pin } });
          unlockToken = r.token;
          screen.classList.add("closing");
          removeAfterAnimation(screen);
          unlockPromise = null;
          resolve();
        } catch (e) {
          msg.textContent = e.message;
          dots.classList.remove("shake"); void dots.offsetWidth; dots.classList.add("shake");
          try { tg?.HapticFeedback?.notificationOccurred("error"); } catch {}
          pin = ""; drawDots();
        }
      };
      const key = (label, onclick, cls = "") => h("button", { type: "button", class: "key " + cls, onclick }, label);
      const pad = h("div", { class: "keypad" },
        ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => key(String(n), () => press(String(n)))),
        key(icon("x"), () => { pin = ""; drawDots(); }, "ghost"),
        key("0", () => press("0")),
        key(icon("check"), submit, "ok"));
      const screen = h("div", { class: "lock-screen" }, h("div", { class: "lock-title" }, "Backup Console"), msg, dots, pad);
      drawDots();
      document.body.append(screen);
    });
    return unlockPromise;
  }

  // Re-lock when the console was in the background for a while.
  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (lockEnabled && hiddenAt && Date.now() - hiddenAt > 30000) { unlockToken = null; requestUnlock(); }
  });

  // ---------- views ----------
  // System health: db latency, webhook, connection, recent errors and the deployed version.
  function healthCard() {
    const body = h("div", { class: "stack" }, Skeleton(110));
    const state = h("span", {});
    const STATUS = { ok: ["Healthy", "success"], warn: ["Needs attention", "warning"], fail: ["Problem", "destructive"] };

    async function load() {
      try {
        const d = await api("/health");
        const [label, variant] = STATUS[d.overall];
        state.replaceChildren(Badge(label, variant));
        const errList = h("div", { class: "err-list", style: "display:none" },
          ...(d.errors.length ? d.errors.map((e) => h("div", { class: "err-item" },
            h("div", { class: "row between" }, Badge(e.scope, "secondary"), h("span", { class: "muted-num" }, fmtWhen(e.at))),
            h("div", { class: "err-msg" }, e.message))) : [Empty("No errors logged. 🎉")]),
          d.errors.length ? Btn("Clear log", { variant: "outline", size: "sm", ic: "trash", onclick: async () => { await api("/errors/clear", { method: "POST" }); toast("Cleared"); await load(); } }) : null);
        const toggle = Btn(`Recent errors (${d.errors.length})`, { variant: "ghost", size: "sm", block: true, onclick: () => {
          const open = errList.style.display === "none";
          errList.style.display = open ? "" : "none";
        } });
        body.replaceChildren(
          ...d.checks.map((c) => h("div", { class: "health-row" },
            h("span", { class: "dot " + c.status }), h("span", { class: "grow" }, c.label), h("span", { class: "muted-num" }, c.detail))),
          d.version ? h("div", { class: "health-row ver" }, h("span", { class: "dot idle" }), h("span", { class: "grow" }, "Deployed version"),
            h("span", { class: "muted-num mono" }, `${d.version.id}${d.version.deployed ? " · " + fmtWhen(d.version.deployed) : ""}`)) : null,
          toggle, errList);
      } catch (e) { body.replaceChildren(Alert({ variant: "destructive", title: "Health check failed", text: e.message })); }
    }
    load();
    return Card("System health", null, body, { action: h("div", { class: "row" }, state, Btn("", { variant: "ghost", size: "sm", ic: "refresh", onclick: load })) });
  }

  // Messages-per-day bar chart + top chats. Numbers only; no message content is ever stored.
  function activityCard() {
    let range = 14;
    const fmtDay = (day) => pf.format(new Date(day + "T12:00:00Z"));
    const caption = h("div", { class: "chart-caption" }, "Tap a bar for details");
    const chart = h("div", { class: "chart" });
    const totals = h("div", { class: "stat-row" });
    const top = h("div", { class: "top-list" });
    const seg = h("div", { class: "seg" }, [7, 14, 30].map((n) =>
      h("button", { type: "button", "data-n": String(n), "aria-pressed": String(n === range), onclick: () => load(n) }, n + "d")));
    const stat = (label, value) => h("div", { class: "stat" }, h("b", {}, String(value)), h("span", {}, label));

    async function load(n) {
      range = n;
      seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.n === String(n))));
      try {
        const d = await api("/stats?days=" + n);
        const max = Math.max(1, ...d.days.map((x) => x.msgs));
        chart.replaceChildren(...d.days.map((x, i) => {
          const bar = h("button", { type: "button", class: "bar", "aria-label": `${fmtDay(x.day)}: ${x.msgs} messages`,
            style: `--h:${x.msgs ? Math.max((x.msgs / max) * 100, 5) : 1.5}%;animation-delay:${i * 14}ms` });
          bar.addEventListener("click", () => {
            chart.querySelectorAll(".bar").forEach((b) => b.removeAttribute("aria-current"));
            bar.setAttribute("aria-current", "true");
            caption.textContent = `${fmtDay(x.day)} · ${x.msgs} messages · ${x.replies} replies · ${x.deleted} deleted`;
          });
          return bar;
        }));
        caption.textContent = "Tap a bar for details";
        totals.replaceChildren(stat("Messages", d.totals.msgs), stat("Auto-replies", d.totals.replies), stat("Deleted", d.totals.deleted));
        const topMax = Math.max(1, ...d.top.map((t) => t.msgs));
        top.replaceChildren(...(d.top.length ? [h("div", { class: "label" }, "Most active chats"), ...d.top.map((t) =>
          h("div", { class: "top-item" },
            h("div", { class: "avatar" }, initials(t.name)),
            h("div", { class: "grow" },
              h("div", { class: "row between" }, h("span", { class: "name" }, t.name || "Unknown"), h("span", { class: "muted-num" }, t.msgs)),
              h("div", { class: "top-track" }, h("div", { class: "top-bar", style: `--w:${(t.msgs / topMax) * 100}%` })))))] : [Empty("No activity yet. Counters start with the next message.")]));
      } catch (e) { caption.textContent = e.message; }
    }
    load(range);
    return Card("Activity", "Incoming messages per day", h("div", { class: "stack" }, totals, chart, caption, top), { action: seg });
  }

  async function viewOverview(root) {
    const d = await api("/overview");
    themeMode = d.theme || "system"; accent = d.accent || "blue";
    applyTheme(); applyAccent();
    root.replaceChildren(
      ...d.alerts.map(Alert),
      Card("Status", "Live configuration", h("div", { class: "stack" },
        h("div", { class: "row between" }, "Account", Badge(d.connected ? "Connected" : "Not connected", d.connected ? "success" : "destructive")),
        h("div", { class: "row between" }, "Backup group", d.group ? Badge(d.group.title, "outline") : Badge("Not set", "destructive")),
        h("div", { class: "row between" }, "Forwarding", Badge(d.flags.backup_enabled ? "On" : "Paused", d.flags.backup_enabled ? "success" : "warning")),
        h("div", { class: "row between" }, "Topic per sender", Badge(d.flags.topics_enabled ? (d.group?.is_forum ? "On" : "Needs forum") : "Off", d.flags.topics_enabled && d.group?.is_forum ? "success" : "secondary")))),
      healthCard(),
      activityCard(),
      Card("Privacy", null, h("p", { class: "card-description" }, "Messages are forwarded straight to the backup group. No message content is stored anywhere; the database only holds settings, chat names and activity counters (numbers only).")));
  }

  async function viewChats(root) {
    // Server-side search, sort and label filter; pages load lazily as the user scrolls.
    const PAGE = 30;
    let items = [], offset = 0, hasMore = true, loading = false, gen = 0;
    let q = "", sort = "recent", label = "", labels = [];
    let selecting = false;
    const picked = new Set();

    const bulk = h("div", { class: "bulkbar" });
    const list = h("div", { class: "list" });
    const sentinel = h("div", { class: "load-more" }, icon("loader"));
    const card = Card(null, null, h("div", {}, list, sentinel), { flush: true });
    const filters = h("div", { class: "toolbar-row" });

    function rowFor(c) {
      const pinBtn = Btn("", { variant: "ghost", size: "sm", ic: "pin", onclick: async () => {
        await api("/chats/pin", { method: "POST", body: { chat_id: c.chat_id, pinned: !c.pinned } });
        toast(c.pinned ? "Unpinned" : "Pinned to the top");
        reload();
      } });
      pinBtn.dataset.act = "pin";
      const delBtn = Btn("", { variant: "ghost", size: "sm", ic: "trash", onclick: () => confirmDelete(c) });
      delBtn.dataset.act = "delete";
      if (selecting) {
        const on = picked.has(c.chat_id);
        return h("div", { class: "item static selectable" + (on ? " picked" : ""), onclick: () => toggle(c) },
          h("span", { class: "check" + (on ? " on" : "") }, on ? icon("check") : null),
          h("div", { class: "body" }, h("div", { class: "name" }, c.pinned ? icon("pin", "pin-i") : null, c.name || "Unknown"),
            h("div", { class: "meta" }, `${c.username ? "@" + c.username + " · " : ""}active ${fmtDate(c.last_at || c.added)}`),
            c.label ? h("div", { class: "badges" }, Badge("🏷 " + c.label, "outline")) : null));
      }
      return h("div", { class: "item static" }, h("div", { class: "avatar" }, initials(c.name)),
        h("div", { class: "body" },
          h("div", { class: "tap", onclick: () => editSheet(c) },
            h("div", { class: "name" }, c.pinned ? icon("pin", "pin-i") : null, c.name || "Unknown"),
            h("div", { class: "meta" }, `${c.username ? "@" + c.username + " · " : ""}active ${fmtDate(c.last_at || c.added)}`),
            (c.label || c.muted) ? h("div", { class: "badges" }, c.label ? Badge("🏷 " + c.label, "outline") : null, c.muted ? Badge("Not backed up", "warning") : null) : null,
            c.note ? h("div", { class: "note" }, c.note) : null),
          Select([["default", "Close DM: default"], ["keep", "🛡 Never delete"], ["close", "🗑 Always delete"]], c.dm_rule || "default", async (rule) => {
            await api("/chats/rule", { method: "POST", body: { chat_id: c.chat_id, rule } });
            c.dm_rule = rule;
            toast(rule === "keep" ? "Whitelisted: never auto-deleted" : rule === "close" ? "Always deleted when Close DM is on" : "Follows the global rule");
          })),
        h("div", { class: "row-actions" },
          Switch(!c.muted, async (on) => {
            await api("/chats/mute", { method: "POST", body: { chat_id: c.chat_id, muted: !on } });
            c.muted = on ? 0 : 1;
            toast(on ? "Backup enabled" : "Chat muted");
            redraw();
          }),
          h("div", { class: "act-row" }, pinBtn, delBtn)));
    }

    // Label + note + pin for one chat.
    function editSheet(c) {
      openSheet((close) => {
        const lab = h("input", { class: "input", maxlength: "24", placeholder: "e.g. Customer", value: c.label || "", list: "label-options" });
        const opts = h("datalist", { id: "label-options" }, labels.map((l) => h("option", { value: l.label })));
        const note = h("textarea", { class: "input textarea", maxlength: "500", placeholder: "Private note, only you see it" }, c.note || "");
        return h("div", { class: "stack" },
          h("h3", { class: "card-title" }, c.name || "Unknown"),
          Field("Label", h("div", {}, lab, opts)),
          Field("Note", note),
          Btn("Save", { block: true, onclick: async () => {
            await api("/chats/meta", { method: "POST", body: { chat_id: c.chat_id, label: lab.value, note: note.value } });
            toast("Saved"); close(); reload();
          } }));
      });
    }

    // Deletes the chat's topic in the group and every row for it. If Telegram refuses, the owner can still force-remove it.
    function confirmDelete(c) {
      openSheet((close) => {
        const body = h("div", { class: "stack" });
        const done = () => { close(); toast("Chat deleted"); reload(); };
        const ask = (force, note) => body.replaceChildren(
          h("h3", { class: "card-title" }, force ? "Remove anyway?" : "Delete this chat?"),
          h("p", { class: "card-description" }, note || `"${c.name || "Unknown"}" is removed from the list and its topic in the backup group is deleted with every message inside it. Its stats are erased too. If this person writes again, a new topic is created.`),
          Btn(force ? "Remove from database only" : "Delete everything", { variant: "destructive", block: true, onclick: async () => {
            try { await api("/chats/delete", { method: "POST", body: { chat_id: c.chat_id, force } }); done(); }
            catch (e) {
              if (e.data?.topic_failed && !force) return ask(true, `${e.message}. Make sure the bot is an admin with "Delete messages". You can remove the chat from the database anyway, then delete the topic by hand.`);
              throw e;
            }
          } }),
          Btn("Cancel", { variant: "outline", block: true, onclick: () => close() }));
        ask(false);
        return body;
      });
    }

    function toggle(c) { if (picked.has(c.chat_id)) picked.delete(c.chat_id); else picked.add(c.chat_id); redraw(); }
    function drawBulk() {
      bulk.style.display = selecting ? "flex" : "none";
      bulk.replaceChildren(
        h("span", { class: "bulk-count" }, `${picked.size} selected`),
        Btn("All", { variant: "outline", size: "sm", onclick: () => { items.forEach((c) => picked.add(c.chat_id)); redraw(); } }),
        Btn("Delete", { variant: "destructive", size: "sm", ic: "trash", disabled: !picked.size, onclick: () => confirmBulk() }));
    }
    // Deletes the picked chats in batches of 10 (topics first), reporting progress. Failures stay selected.
    function confirmBulk() {
      const ids = [...picked];
      openSheet((close) => {
        const body = h("div", { class: "stack" });
        const run = async (force) => {
          let deleted = 0; const failed = [];
          for (let i = 0; i < ids.length; i += 10) {
            const r = await api("/chats/delete-many", { method: "POST", body: { chat_ids: ids.slice(i, i + 10), force } });
            deleted += r.deleted; failed.push(...r.failed);
            if (ids.length > 10) toast(`Deleted ${deleted} of ${ids.length}…`);
          }
          picked.clear(); failed.forEach((f) => picked.add(f.chat_id));
          close();
          if (failed.length) toast(`${deleted} deleted, ${failed.length} failed: ${failed[0].error}`, "error"); else toast(`${deleted} chats deleted`);
          if (!failed.length) selecting = false;
          drawBulk(); reload();
        };
        body.replaceChildren(
          h("h3", { class: "card-title" }, `Delete ${ids.length} chat${ids.length === 1 ? "" : "s"}?`),
          h("p", { class: "card-description" }, "Their topics in the backup group are deleted with every message inside, and their stats are erased. Chats whose topic can't be deleted stay selected so you can retry."),
          Btn("Delete everything", { variant: "destructive", block: true, onclick: () => run(false) }),
          Btn("Cancel", { variant: "outline", block: true, onclick: () => close() }));
        return body;
      });
    }
    function drawFilters() {
      filters.replaceChildren(
        Btn(selecting ? "Cancel" : "Select", { variant: "outline", size: "sm", onclick: () => { selecting = !selecting; picked.clear(); drawFilters(); drawBulk(); redraw(); } }),
        Select([["recent", "Last active"], ["added", "Newest first"], ["name", "Name A–Z"]], sort, (v) => { sort = v; reload(); }),
        labels.length ? Select([["", "All labels"], ...labels.map((l) => [l.label, `${l.label} (${l.n})`])], label, (v) => { label = v; reload(); }) : null);
    }
    function redraw() {
      list.replaceChildren(...(items.length ? items.map(rowFor) : (loading ? [] : [Empty(q || label ? "No chats match." : "No chats yet. They appear after their first message.")])));
      sentinel.style.display = hasMore ? "flex" : "none";
    }
    async function loadMore() {
      if (loading || !hasMore) return;
      loading = true; redraw();
      const g = gen;
      const qs = new URLSearchParams({ limit: PAGE, offset, sort, q, label });
      const d = await api(`/chats?${qs}`);
      if (g !== gen) return; // a newer search/sort replaced this request
      if (d.labels) { labels = d.labels; if (label && !labels.some((l) => l.label === label)) label = ""; drawFilters(); }
      items.push(...d.items);
      offset = d.next_offset; hasMore = d.has_more;
      loading = false; redraw();
    }
    function reload() { gen++; items = []; offset = 0; hasMore = true; loading = false; redraw(); return loadMore().catch((e) => toast(e.message, "error")); }

    const io = new IntersectionObserver((entries) => { if (entries[0].isIntersecting) loadMore().catch((e) => toast(e.message, "error")); }, { root: null, rootMargin: "200px" });
    io.observe(sentinel);

    let timer;
    root.replaceChildren(
      h("div", { class: "search" }, icon("search"), h("input", { class: "input", placeholder: "Search chats…", oninput: (e) => { clearTimeout(timer); timer = setTimeout(() => { q = e.target.value.trim(); reload(); }, 300); } })),
      filters,
      bulk,
      h("p", { class: "card-description" }, "Turn a chat off to stop forwarding its messages. Tap a name to add a label or note. Changes apply within about 15 seconds."),
      card);
    drawFilters(); drawBulk();
    await loadMore();
  }

  async function viewAccount(root) {
    const d = await api("/account");
    root.replaceChildren(
      !d.connected && Alert({ variant: "destructive", title: "Not connected", text: d.error || "Add this bot in Telegram → Settings → Business → Chatbots." }),
      Card("Connection", "Telegram Business chatbot",
        d.connected ? h("div", { class: "stack" },
          h("div", { class: "row between" }, "Status", Badge("Connected", "success")),
          d.user?.name && h("div", { class: "row between" }, "Account", h("span", {}, d.user.name + (d.user.username ? " @" + d.user.username : ""))),
          d.since && h("div", { class: "row between" }, "Connected since", h("span", {}, fmtDate(d.since))),
          h("div", { class: "sep" }),
          h("div", { class: "label" }, "Permissions granted"),
          h("div", { class: "rights" }, Object.entries(d.rights || {}).map(([k, v]) =>
            h("div", { class: "right" }, prettyRight(k), h("span", { class: v ? "ok" : "no" }, icon(v ? "check" : "x")))))) : Empty("Waiting for connection")));
  }

  const ACCENTS = ["red", "green", "yellow", "purple", "pink", "blue", "orange"];

  function appearanceCard() {
    const mkThemeOpt = (val, label, ic) => {
      const btn = h("button", { type: "button", class: "theme-opt", "data-active": String(themeMode === val) }, icon(ic), label);
      btn.dataset.val = val;
      btn.addEventListener("click", async () => {
        themeMode = val; applyTheme();
        card.querySelectorAll(".theme-opt").forEach((b) => b.setAttribute("data-active", String(b.dataset.val === val)));
        await api("/settings/appearance", { method: "POST", body: { theme: val } });
      });
      return btn;
    };
    const SWATCH = { red: "#ef4444", green: "#16a34a", yellow: "#eab308", purple: "#9333ea", pink: "#ec4899", blue: "#2563eb", orange: "#f97316" };
    const mkAccentDot = (name) => {
      const dot = h("button", { type: "button", class: "accent-dot", "data-active": String(accent === name), style: `background:${SWATCH[name]}`, "aria-label": name }, icon("check"));
      dot.addEventListener("click", async () => {
        accent = name; applyAccent();
        card.querySelectorAll(".accent-dot").forEach((b) => b.setAttribute("data-active", String(b.dataset.name === name)));
        await api("/settings/appearance", { method: "POST", body: { accent: name } });
      });
      dot.dataset.name = name;
      return dot;
    };
    const card = Card("Appearance", "Theme and accent color for the console", h("div", { class: "stack" },
      h("div", { class: "theme-row" }, mkThemeOpt("system", "System", "system"), mkThemeOpt("light", "Light", "sun"), mkThemeOpt("dark", "Dark", "moon")),
      h("div", { class: "sep" }),
      h("div", { class: "label" }, "Accent color"),
      h("div", { class: "accent-row" }, ACCENTS.map(mkAccentDot))));
    return card;
  }

  async function viewAutoreplies(root) {
    const d = await api("/autoreplies");
    const MATCH = [["exact", "Exact word"], ["contains", "Contains word"], ["regex", "Regex"]];
    const MEDIA = [["", "No media"], ["photo", "Photo"], ["document", "File"], ["video", "Video"]];
    const MLABEL = { exact: "Exact", contains: "Contains", regex: "Regex" };
    const MEDIA_LABEL = { photo: "Photo", document: "File", video: "Video" };

    const kwInput = h("input", { class: "input", placeholder: "Keyword, e.g. سلام" });
    const rpInput = h("textarea", { class: "input textarea", rows: "3", placeholder: "Reply text, e.g. علیک سلام" });
    const cdInput = h("input", { class: "input", type: "number", min: "0", max: "10080", placeholder: "0 = no cooldown" });
    const urlInput = h("input", { class: "input", placeholder: "https://… direct link to the image/file" });
    const matchSel = Select(MATCH, "exact", () => hint());
    const mediaSel = Select(MEDIA, "", () => { urlField.style.display = mediaSel.value ? "" : "none"; });
    const hintEl = h("p", { class: "card-description" });
    const HINTS = {
      exact: "Replies only when the whole message is exactly this word.",
      contains: "Replies when the message contains this word anywhere.",
      regex: "Advanced: a regular expression, e.g. ^order\\s*#?\\d+$ (case-insensitive).",
    };
    function hint() { hintEl.textContent = HINTS[matchSel.value]; }
    hint();
    const urlField = Field("Media link", urlInput);
    urlField.style.display = "none";

    const list = h("div", { class: "list" });
    function edit(r) {
      kwInput.value = r.keyword; rpInput.value = r.reply; cdInput.value = r.cooldown_min || "";
      matchSel.value = r.match_type || "exact"; mediaSel.value = r.media_type || ""; urlInput.value = r.media_url || "";
      urlField.style.display = mediaSel.value ? "" : "none"; hint();
      root.closest(".sheet")?.scrollTo({ top: 0, behavior: "smooth" });
    }
    function draw() {
      list.replaceChildren(...(d.items.length ? d.items.map((r) =>
        h("div", { class: "kw-row", onclick: () => edit(r) },
          h("div", { class: "body" },
            h("div", { class: "kw" + (r.match_type === "regex" ? " mono" : "") }, r.keyword),
            h("div", { class: "rp" }, r.reply),
            h("div", { class: "badges" },
              Badge(MLABEL[r.match_type] || "Exact", "secondary"),
              r.cooldown_min > 0 && Badge("⏱ " + r.cooldown_min + " min", "outline"),
              r.media_type && Badge("📎 " + (MEDIA_LABEL[r.media_type] || r.media_type), "outline"))),
          Btn("", { variant: "ghost", size: "sm", ic: "trash", onclick: async () => {
            await api("/autoreplies/delete", { method: "POST", body: { keyword: r.keyword } });
            d.items = d.items.filter((x) => x.keyword !== r.keyword);
            toast("Removed"); draw();
          } }))) : [Empty("No auto-replies yet.")]));
    }
    draw();
    root.replaceChildren(
      h("p", { class: "card-description" }, "When a message matches, the bot replies instantly from your account. Tap a rule to edit it."),
      Card("Add or edit a rule", null, h("div", { class: "stack" },
        Field("Match type", matchSel), hintEl,
        Field("Keyword", kwInput),
        Field("Reply", rpInput),
        Field("Cooldown (minutes, per person)", cdInput),
        Field("Attach", mediaSel),
        urlField,
        Btn("Save rule", { ic: "plus", block: true, onclick: async () => {
          const keyword = kwInput.value.trim(), reply = rpInput.value.trim();
          if (!keyword || !reply) return toast("Fill in the keyword and the reply", "error");
          const body = { keyword, reply, match_type: matchSel.value, cooldown_min: Number(cdInput.value) || 0, media_type: mediaSel.value || null, media_url: urlInput.value.trim() || null };
          await api("/autoreplies", { method: "POST", body });
          const key = body.match_type === "regex" ? keyword : keyword.toLowerCase();
          const row = { keyword: key, reply, match_type: body.match_type, cooldown_min: body.cooldown_min, media_type: body.media_type, media_url: body.media_url };
          const i = d.items.findIndex((x) => x.keyword === key);
          if (i >= 0) d.items[i] = row; else d.items.push(row);
          kwInput.value = ""; rpInput.value = ""; cdInput.value = ""; urlInput.value = ""; mediaSel.value = ""; urlField.style.display = "none";
          toast("Saved"); draw();
        } }))),
      Card("Your rules", null, list, { flush: true }));
  }

  // PIN lock for the console (the server enforces it; this card only manages it).
  function lockCard() {
    const box = h("div", { class: "stack" });
    const pinInput = (ph) => h("input", { class: "input", type: "password", inputmode: "numeric", autocomplete: "off", maxlength: "8", placeholder: ph });

    function setPinSheet() {
      openSheet((close) => {
        const a = pinInput("4 to 8 digits"), b = pinInput("Repeat the PIN");
        return h("div", { class: "stack" },
          h("h3", { class: "card-title" }, lockEnabled ? "Change PIN" : "Set a PIN"),
          Field("New PIN", a), Field("Repeat PIN", b),
          Btn("Save PIN", { block: true, onclick: async () => {
            if (a.value !== b.value) throw new Error("The PINs don't match");
            const r = await api("/lock/set", { method: "POST", body: { pin: a.value } });
            unlockToken = r.token; lockEnabled = true;
            toast("PIN saved"); close(); render();
          } }));
      });
    }
    function disableSheet() {
      openSheet((close) => {
        const cur = pinInput("Current PIN");
        return h("div", { class: "stack" },
          h("h3", { class: "card-title" }, "Turn off PIN lock"),
          Field("Current PIN", cur),
          Btn("Turn off", { variant: "destructive", block: true, onclick: async () => {
            await api("/lock/disable", { method: "POST", body: { pin: cur.value } });
            unlockToken = null; lockEnabled = false;
            toast("PIN lock is off"); close(); render();
          } }));
      });
    }
    function render() {
      box.replaceChildren(
        h("div", { class: "row between" }, "Status", Badge(lockEnabled ? "On" : "Off", lockEnabled ? "success" : "secondary")),
        lockEnabled
          ? h("div", { class: "grid2" }, Btn("Change PIN", { variant: "outline", onclick: setPinSheet }), Btn("Turn off", { variant: "outline", onclick: disableSheet }))
          : Btn("Set a PIN", { block: true, onclick: setPinSheet }));
    }
    render();
    return Card("Console lock", "Ask for a PIN when the console opens and after 30 seconds in the background", box);
  }

  // Spam filter + flood guard. Chats marked "Never delete" in the Chats tab are exempt from both.
  function spamCard(d, toggle) {
    const words = h("textarea", { class: "input textarea", rows: "3", placeholder: "One word or phrase per line (or comma separated)" });
    words.value = d.values.spam_words || "";
    const num = (key, min, max) => h("input", { class: "input", type: "number", min: String(min), max: String(max), value: d.values[key],
      onchange: async (e) => {
        try { await api("/settings/value", { method: "POST", body: { key, value: e.target.value } }); toast("Saved"); }
        catch (err) { toast(err.message, "error"); e.target.value = d.values[key]; }
      } });
    return Card("Spam protection", "Chats set to “Never delete” are exempt", h("div", { class: "stack" },
      h("div", { class: "list" },
        toggle("spam_enabled", "Delete messages with banned words", "Removed for both sides, right away"),
        toggle("flood_enabled", "Auto-mute flooding chats", "Stops backing up and replying to a chat that spams")),
      Field("Banned words", words),
      Btn("Save words", { variant: "outline", block: true, onclick: async () => {
        await api("/settings/value", { method: "POST", body: { key: "spam_words", value: words.value } });
        d.values.spam_words = words.value; toast("Saved");
      } }),
      h("div", { class: "grid2" },
        Field("Max messages", num("flood_max", 3, 100)),
        Field("Per seconds", num("flood_window", 10, 600)))));
  }

  // Close DM / auto-reply only run inside this daily window (can wrap past midnight, e.g. 22:00 to 07:00)
  function scheduleCard(d, toggle) {
    const TZ = [["Asia/Tehran", "Tehran"], ["UTC", "UTC"], ["Europe/Istanbul", "Istanbul"], ["Asia/Dubai", "Dubai"], ["Europe/Berlin", "Berlin"], ["Europe/London", "London"], ["America/New_York", "New York"]];
    const save = (key) => async (e) => {
      try { await api("/settings/value", { method: "POST", body: { key, value: e.target.value } }); toast("Saved"); }
      catch (err) { toast(err.message, "error"); }
    };
    const time = (key) => h("input", { class: "input", type: "time", value: d.values[key], onchange: save(key) });
    return Card("Schedule", "Run Close DM and auto-reply only during these hours", h("div", { class: "list" },
      toggle("sched_enabled", "Use a schedule", "Off = always active"),
      h("div", { class: "setting" }, h("div", {}, h("div", { class: "t" }, "Active hours"), h("div", { class: "d" }, "From and until (can pass midnight)")),
        h("div", { class: "time-pair" }, time("sched_start"), h("span", {}, "→"), time("sched_end"))),
      h("div", { class: "setting" }, h("div", {}, h("div", { class: "t" }, "Time zone")),
        Select(TZ, TZ.some(([v]) => v === d.values.tz) ? d.values.tz : "Asia/Tehran", async (value) => { await api("/settings/value", { method: "POST", body: { key: "tz", value } }); toast("Saved"); })),
      toggle("sched_close_dm", "Apply to Close DM", "Outside the hours, messages are kept"),
      toggle("sched_autoreply", "Apply to auto-reply", "Outside the hours, no auto-replies are sent")), { flush: true });
  }

  function cleanupCard(d, toggle) {
    const save = async (key, value) => { await api("/settings/value", { method: "POST", body: { key, value } }); d.values[key] = value; toast("Saved"); };
    const limit = h("input", { class: "input", type: "number", min: "0", placeholder: "0 = no warning", value: d.values.topic_limit === "0" ? "" : d.values.topic_limit,
      onchange: (e) => save("topic_limit", String(Math.max(0, Math.floor(Number(e.target.value) || 0)))).catch((err) => toast(err.message, "error")) });
    return Card("Chat cleanup", "Every chat gets a topic in the backup group. Remove old ones so you stay under Telegram's topic limit.", h("div", { class: "list" },
      toggle("cleanup_enabled", "Auto-delete inactive chats", "Each night, chats with no new messages are deleted with their topic. Pinned chats are never touched."),
      h("div", { class: "setting" }, h("div", {}, h("div", { class: "t" }, "Inactive for"), h("div", { class: "d" }, "Up to 20 chats are removed per night")),
        Select([["7", "7 days"], ["14", "14 days"], ["30", "30 days"], ["60", "60 days"], ["90", "90 days"], ["180", "180 days"], ["365", "1 year"]], d.values.cleanup_days, (v) => save("cleanup_days", v))),
      h("div", { class: "setting" }, h("div", {}, h("div", { class: "t" }, "Topic warning at"), h("div", { class: "d" }, "Overview warns when you get close to this number")), limit),
      h("div", { class: "setting" }, h("div", {}, h("div", { class: "t" }, "Run cleanup now"), h("div", { class: "d" }, "Uses the settings above")),
        Btn("Run", { variant: "outline", size: "sm", ic: "trash", onclick: async () => {
          const r = await api("/cleanup/run", { method: "POST" });
          toast(r.skipped ? "Turn on auto-delete first" : `${r.removed} removed${r.failed ? `, ${r.failed} failed` : ""}`, r.failed ? "error" : "");
        } }))), { flush: true });
  }

  async function viewSettings(root) {
    const d = await api("/settings");
    themeMode = d.theme || "system"; accent = d.accent || "blue";
    applyTheme(); applyAccent();
    const toggle = (key, title, desc) => h("div", { class: "setting" }, h("div", {}, h("div", { class: "t" }, title), h("div", { class: "d" }, desc)),
      Switch(d.flags[key], async (on) => { const r = await api("/settings", { method: "POST", body: { key, value: on } }); if (r.warning) toast(r.warning, "error"); }));
    const selectRow = (key, title, desc, options) => h("div", { class: "setting" },
      h("div", {}, h("div", { class: "t" }, title), h("div", { class: "d" }, desc)),
      Select(options, d.values[key], async (value) => { await api("/settings/value", { method: "POST", body: { key, value } }); toast("Saved"); }));
    root.replaceChildren(
      appearanceCard(),
      lockCard(),
      Card("Backup", d.group ? `Group: ${d.group.title}` : "No group set. Send /setgr inside the backup group.", h("div", { class: "list" },
        toggle("backup_enabled", "Forward messages", "Turn off to pause forwarding"),
        toggle("topics_enabled", "Topic per sender", "Requires a forum group with Manage Topics"),
        toggle("close_dm", "Close DM (auto-delete)", "Instantly deletes every incoming private message for both sides"),
        selectRow("close_dm_mode", "Close DM applies to", "Whitelist chats from the Chats tab either way",
          [["all", "Everyone except whitelist"], ["selected", "Only chats I pick"]])), { flush: true }),
      scheduleCard(d, toggle),
      spamCard(d, toggle),
      cleanupCard(d, toggle),
      Card("Auto-reply", "Reply instantly to an exact keyword", h("div", { class: "stack" },
        Btn("Manage auto-replies", { variant: "outline", ic: "reply", block: true, onclick: () => {
          openSheet((close) => {
            const wrap = h("div", { class: "stack" }, Skeleton(60), Skeleton(120));
            viewAutoreplies(wrap);
            return h("div", {}, h("div", { class: "row between" }, h("h3", { class: "card-title" }, "Auto-replies"), Btn("Done", { variant: "ghost", size: "sm", onclick: () => close() })), wrap);
          });
        } }))),
      Card("Maintenance", null, h("div", { class: "stack" },
        Btn("Send test message to group", { variant: "outline", ic: "send", block: true, onclick: async () => { await api("/test", { method: "POST" }); toast("Test message sent"); } }))));
  }

  // ---------- shell ----------
  const TABS = [["overview", "Overview", "dashboard", viewOverview], ["chats", "Chats", "users", viewChats], ["account", "Account", "account", viewAccount], ["settings", "Settings", "settings", viewSettings]];
  let current = "overview";

  function shell() {
    const app = document.getElementById("app");
    const main = h("main");
    const nav = h("nav", { class: "nav" });
    async function show(id) {
      current = id;
      nav.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.id === id)));
      main.classList.remove("fade-in");
      main.replaceChildren(Skeleton(90), Skeleton(160), Skeleton(120));
      main.scrollTop = 0;
      try { await TABS.find((t) => t[0] === id)[3](main); }
      catch (e) { main.replaceChildren(Alert({ variant: "destructive", title: "Couldn't load", text: e.message })); }
      void main.offsetWidth; // restart animation
      main.classList.add("fade-in");
    }
    TABS.forEach(([id, label, ic]) => nav.append(h("button", { "data-id": id, "aria-selected": "false", onclick: () => show(id) }, icon(ic), label)));
    app.replaceChildren(
      h("div", { class: "topbar" }, h("div", {}, h("h1", {}, "Backup Console"), h("div", { class: "sub" }, "Telegram Business · Tehran time")),
        h("button", { class: "btn btn-ghost btn-icon btn-sm", "aria-label": "Refresh", onclick: () => show(current) }, icon("refresh"))),
      main, nav);
    show("overview");
  }

  if (!tg?.initData) {
    document.getElementById("app").replaceChildren(h("div", { class: "center" },
      Card("Open from Telegram", "This console only works inside Telegram.", h("p", { class: "card-description" }, "Open your bot and tap the Console button."))));
  } else {
    (async () => {
      try {
        const st = await api("/lock/status");
        lockEnabled = st.enabled;
        if (st.enabled && !st.unlocked) await requestUnlock();
      } catch { /* the first real request will surface the error */ }
      shell();
    })();
  }
})();
