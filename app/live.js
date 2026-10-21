/* Seer App · "On Seer now": real markets, read live from Seer's public markets API, with a dated fallback.
   Concept by Swift Bot Labs. Not affiliated with Seer.

   One POST to app.seer.pm/.netlify/functions/markets-search (open + Kleros-verified, sorted by liquidity).
   Market titles and outcomes on Seer are written by whoever created the market, so everything from the API
   is untrusted: it is type-checked, stripped of control and bidi characters, clamped, and only ever rendered
   with textContent. Links are built here from a validated chain id and 0x address, never taken from the API.
   If the request fails, times out or returns anything odd, the strip shows the dated snapshot in
   assets/seer-snapshot.js and says so. */
(function () {
  "use strict";
  var S = window.Seer, X = window.SEER_SNAPSHOT || null;
  var host = document.getElementById("ap-live"), src = document.getElementById("ap-live-src"), meta = document.getElementById("ap-live-meta");
  if (!S || !S.el || !host || !src) return;
  var el = S.el;

  var API = "https://app.seer.pm/.netlify/functions/markets-search";
  var SHOW = 8, ASK = 24;                 // markets shown / asked for (dupes and conditional markets are skipped)
  var FALLBACK_MS = 4000, ABORT_MS = 12000; // show the snapshot after 4 s; a late live answer (until 12 s) still replaces it
  var MAX_BYTES = 1500000;                  // a 24-market answer is ~80 KB; refuse anything far bigger
  var CHAINS = { 1: "Ethereum", 10: "Optimism", 100: "Gnosis", 8453: "Base" };
  var ZERO = "0x0000000000000000000000000000000000000000";
  var ADDR = /^0x[0-9a-fA-F]{40}$/;
  // C0/C1 controls, zero-width marks, bidi embeddings/overrides/isolates, BOM
  var BAD = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u2069\uFEFF]/g;

  function clean(s, max) {
    if (typeof s !== "string") return "";
    s = s.replace(BAD, " ").replace(/\s+/g, " ").trim();
    return s.length > max ? s.slice(0, max) : s;
  }
  function pctOk(x) { return typeof x === "number" && isFinite(x) && x >= 0 && x <= 100; }
  function bound(s) { // Seer stores newer scalar bounds in wei (1e18); older ones as plain integers
    if (typeof s !== "string" || !/^\d{1,40}$/.test(s)) return null;
    var n = Number(s); return n > 1e10 ? n / 1e18 : n;
  }

  // API market -> the snapshot's shape, or null if anything is off
  function normalize(m) {
    if (!m || typeof m !== "object") return null;
    if (m.type !== "Generic") return null;                                   // futarchy pairs have their own app
    if (!m.parentMarket || m.parentMarket.id !== ZERO) return null;          // conditional child markets read oddly out of context
    if (!CHAINS[m.chainId] || typeof m.id !== "string" || !ADDR.test(m.id)) return null;
    var title = clean(m.marketName, 200);
    if (title.length < 8) return null;
    var liq = typeof m.liquidityUSD === "number" && isFinite(m.liquidityUSD) && m.liquidityUSD >= 0 && m.liquidityUSD < 1e10 ? m.liquidityUSD : 0;
    var odds = Array.isArray(m.odds) ? m.odds.slice(0, 64) : [];
    var outs = Array.isArray(m.outcomes) ? m.outcomes.slice(0, 64) : [];
    var nq = Array.isArray(m.questions) ? m.questions.length : 0;
    var o = { id: m.id.toLowerCase(), chain: m.chainId, title: title, liq: liq };
    if (m.templateId === "1" && nq === 1) {                                   // scalar: Seer's own estimate formula
      var lo = bound(m.lowerBound), hi = bound(m.upperBound);
      if (lo == null || hi == null || !(hi > lo) || !pctOk(odds[0]) || !pctOk(odds[1])) return null;
      var dn = odds[0], up = odds[1], sum = dn + up;
      if (sum > 100) { dn = dn / sum * 100; up = up / sum * 100; }
      var unit = "", u = /\[([^\]]{1,24})\]\s*$/.exec(title);
      if (u) { unit = u[1].trim(); o.title = title.slice(0, u.index).trim(); }
      o.scalar = { value: Math.round((dn * lo + up * hi)) / 100, min: lo, max: hi, unit: unit };
    } else if (m.templateId === "2" || m.templateId === "3") {
      var pairs = [];
      for (var i = 0; i < outs.length; i++) {
        var name = clean(outs[i], 80);
        if (!name || name.toLowerCase() === "invalid" || !pctOk(odds[i])) continue;
        pairs.push([name, odds[i]]);
      }
      if (pairs.length < 2) return null;
      if (pairs.length > 3) pairs = pairs.sort(function (a, b) { return b[1] - a[1]; }).slice(0, 3);
      o.outcomes = pairs; if (m.templateId === "3") o.multi = true;
    } else return null;                                                       // multi-scalar etc.: skip rather than mislabel
    return o;
  }

  function pick(list) {
    var out = [], seen = {};
    list.sort(function (a, b) { return b.liq - a.liq; });
    for (var i = 0; i < list.length && out.length < SHOW; i++) {
      var k = list[i].title.toLowerCase();
      if (seen[k]) continue; seen[k] = 1; out.push(list[i]);
    }
    return out;
  }

  /* ---------- render ---------- */
  var pct = function (v) { return (Math.round(v * 10) / 10) + "%"; };
  var usd = function (n) { return n >= 1e6 ? "$" + (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? "$" + (n / 1e3).toFixed(1) + "K" : "$" + Math.round(n); };
  var num = function (v) { return Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("en-US") : String(Math.round(v * 100) / 100); };
  var clip = function (t, n) { if (t.length <= n) return t; var c = t.slice(0, n), sp = c.lastIndexOf(" "); return (sp > n * .6 ? c.slice(0, sp) : c).replace(/[\s,;:(]+$/, "") + "…"; };
  var link = function (m) { return "https://app.seer.pm/markets/" + m.chain + "/" + m.id; }; // chain + id validated above

  function card(m) {
    var body;
    if (m.scalar) {
      var c = m.scalar, pos = Math.max(0, Math.min(1, (c.value - c.min) / (c.max - c.min))), unit = c.unit ? " " + c.unit : "";
      body = el("div", { class: "ap-snap__scalar" },
        el("div", { class: "ap-snap__val" }, el("b", { class: "t-num", text: num(c.value) }), el("span", { text: unit + " expected" })),
        el("div", { class: "ap-snap__range", attrs: { role: "img", "aria-label": "Expected " + num(c.value) + unit + " on a range of " + num(c.min) + " to " + num(c.max) } }, el("i", { style: { left: (pos * 100).toFixed(1) + "%" } })),
        el("div", { class: "ap-snap__ends t-num" }, el("span", { text: num(c.min) }), el("span", { text: num(c.max) })));
    } else {
      body = el("ul", { class: "ap-snap__outs" }, m.outcomes.slice(0, 2).map(function (o, i) {
        return el("li", { style: { "--w": Math.max(1.5, Math.min(100, o[1])) + "%" }, attrs: { "data-i": String(i) } },
          el("span", { class: "ap-snap__o", text: clip(o[0], 28), attrs: { title: o[0] } }), el("b", { class: "t-num", text: pct(o[1]) }));
      }));
    }
    return el("article", { class: "ap-snap__card ap-live__card", attrs: { role: "listitem" } },
      el("h3", { class: "ap-snap__t" }, el("a", { href: link(m), text: clip(m.title, 90), attrs: { rel: "noopener noreferrer", target: "_blank", title: m.title, "aria-label": m.title + " (opens on Seer)" } })),
      body,
      el("div", { class: "ap-snap__foot" },
        el("span", { class: "t-num", text: usd(m.liq) + " liq · " + CHAINS[m.chain], attrs: { title: "Liquidity in USD and chain, as Seer's API reports them" } }),
        el("span", { class: "ap-snap__go" }, "Seer", el("span", { html: S.icon("external", 13) }))));
  }

  var shown = null; // "live" | "snapshot"
  function render(list, state, when, count) {
    S.clear(host);
    list.forEach(function (m) { host.appendChild(card(m)); });
    src.setAttribute("data-state", state);
    S.clear(src).appendChild(el("i", { attrs: { "aria-hidden": "true" } }));
    src.appendChild(document.createTextNode(state === "live" ? "Live · app.seer.pm · " + when : "Snapshot · " + when));
    if (meta) meta.textContent = state === "live"
      ? "Top " + list.length + " of " + count + " open, Kleros-verified markets by liquidity, read from Seer's public API just now."
      : "Seer's API couldn't be reached just now, so this is the dated snapshot: top " + list.length + " of " + count + " open, Kleros-verified markets by liquidity.";
    host.setAttribute("aria-busy", "false");
    shown = state; railButtons();
  }
  function fallback() {
    if (shown) return;
    if (X && Array.isArray(X.markets) && X.markets.length) { render(X.markets.slice(0, SHOW), "snapshot", X.when, X.count); return; }
    src.setAttribute("data-state", "snapshot"); src.textContent = "Seer's API is unavailable right now"; host.setAttribute("aria-busy", "false");
  }
  function hhmm(d) { var p = function (n) { return (n < 10 ? "0" : "") + n; }; return p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()) + " UTC"; }

  /* ---------- fetch ---------- */
  var timer = setTimeout(fallback, FALLBACK_MS);
  var ctl = typeof AbortController === "function" ? new AbortController() : null;
  var kill = setTimeout(function () { if (ctl) ctl.abort(); }, ABORT_MS);
  if (typeof fetch !== "function") { clearTimeout(timer); fallback(); return; }
  fetch(API, {
    method: "POST", mode: "cors", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer", redirect: "error",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ marketStatusList: ["open"], verificationStatusList: ["verified"], limit: ASK, page: 1 }),
    signal: ctl ? ctl.signal : undefined
  }).then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    if (!/application\/json/i.test(r.headers.get("content-type") || "")) throw new Error("not JSON");
    var len = +(r.headers.get("content-length") || 0);
    if (len > MAX_BYTES) throw new Error("too big");
    return r.text();
  }).then(function (t) {
    if (t.length > MAX_BYTES) throw new Error("too big");
    var d = JSON.parse(t);
    if (!d || !Array.isArray(d.markets)) throw new Error("bad shape");
    var list = pick(d.markets.slice(0, ASK).map(normalize).filter(Boolean));
    if (list.length < 4) throw new Error("too few usable markets");
    var count = typeof d.count === "number" && isFinite(d.count) && d.count >= list.length && d.count < 1e7 ? Math.round(d.count) : list.length;
    clearTimeout(timer); clearTimeout(kill);
    render(list, "live", hhmm(new Date()), count.toLocaleString("en-US"));
  }).catch(function (e) { clearTimeout(timer); clearTimeout(kill); src.setAttribute("data-why", String((e && e.name) || "error").slice(0, 40)); fallback(); });

  /* ---------- rail arrows ---------- */
  var prev = document.getElementById("ap-live-prev"), next = document.getElementById("ap-live-next");
  function railButtons() {
    if (!prev || !next) return;
    var max = host.scrollWidth - host.clientWidth - 2;
    prev.disabled = host.scrollLeft <= 2; next.disabled = host.scrollLeft >= max;
  }
  function step(dir) { host.scrollBy({ left: dir * Math.max(240, host.clientWidth * .9), behavior: "smooth" }); }
  if (prev && next) {
    prev.addEventListener("click", function () { step(-1); });
    next.addEventListener("click", function () { step(1); });
    host.addEventListener("scroll", railButtons, { passive: true });
    if (S.onResize) S.onResize(host, railButtons);
  }
})();
