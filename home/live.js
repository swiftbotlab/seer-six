/* Seer homepage · the real data on this page, read live from Seer's public markets API.
   Concept by Swift Bot Labs. Not affiliated with Seer.

   Two POSTs to app.seer.pm/.netlify/functions/markets-search:
   1. the hero: open + Kleros-verified markets (Seer sorts them by liquidity). The most liquid top-level categorical or
      multi-categorical market is handed to page.js (window.HM_HERO), which validates it again and draws it. Until then,
      or if Seer does not answer, the hero shows the dated snapshot in home/hero-snapshot.js and says so.
   2. "Open on Seer now": {marketStatusList:["open"], limit:1}; only the numeric "count" is used.
   Market titles and answers on Seer are written by whoever created the market, so nothing from a response is ever
   inserted as markup: every field is type-checked, range-checked, stripped of control and bidi characters and
   clamped, then set with textContent. Links are built from a validated chain id and 0x address, never taken from the
   data. Each part shows its dated snapshot at once, labels it "Snapshot" after 4 s without an answer, and swaps in a
   live answer that arrives within 12 s. CSP on this page: connect-src https://app.seer.pm only. */
(function () {
  "use strict";
  var API = "https://app.seer.pm/.netlify/functions/markets-search";
  var FALLBACK_MS = 4000, ABORT_MS = 12000;
  var CHAINS = { 1: 1, 10: 1, 100: 1, 8453: 1 };
  var ZERO = "0x0000000000000000000000000000000000000000";
  var ADDR = /^0x[0-9a-fA-F]{40}$/;
  // C0/C1 controls, zero-width marks, bidi embeddings/overrides/isolates, BOM
  var BAD = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u2069\uFEFF]/g;
  // collateral tokens we can name: chain:address -> symbol (anything else is shown as "collateral")
  var COLL = { "100:0xaf204776c7245bf4147c2612bf6e5972ee483701": "sDAI", "100:0xe91d153e0b41518a2ce8dd3d7944fa863463a97d": "xDAI",
    "1:0x83f20f44975d03b1b09e64809b757c47f942beea": "sDAI" };

  function clean(s, max) {
    if (typeof s !== "string") return "";
    s = s.replace(BAD, " ").replace(/\s+/g, " ").trim();
    return s.length > max ? s.slice(0, max) : s;
  }
  function num(x, hi) { return typeof x === "number" && isFinite(x) && x >= 0 && x < hi ? x : null; }
  function hhmm(d) { var p = function (v) { return (v < 10 ? "0" : "") + v; }; return p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()) + " UTC"; }

  // one POST, JSON only, size-capped, aborted after ABORT_MS
  function ask(body, maxBytes) {
    if (typeof fetch !== "function") return Promise.reject(new Error("no fetch"));
    var ctl = typeof AbortController === "function" ? new AbortController() : null;
    var kill = setTimeout(function () { if (ctl) ctl.abort(); }, ABORT_MS);
    return fetch(API, {
      method: "POST", mode: "cors", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer", redirect: "error",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      if (!/application\/json/i.test(r.headers.get("content-type") || "")) throw new Error("not JSON");
      if (+(r.headers.get("content-length") || 0) > maxBytes) throw new Error("too big");
      return r.text();
    }).then(function (t) {
      clearTimeout(kill);
      if (t.length > maxBytes) throw new Error("too big");
      var d = JSON.parse(t);
      if (!d || typeof d !== "object") throw new Error("bad shape");
      return d;
    }, function (e) { clearTimeout(kill); throw e; });
  }

  /* ---------- 1. the hero market ---------- */
  // API market -> the shape page.js validates ({id, chain, title, tpl, outcomes:[[name, odds %]], invalid, liq, vol, coll}), or null
  function heroShape(m) {
    if (!m || typeof m !== "object" || m.type !== "Generic") return null;                    // futarchy pairs have their own app
    if (!m.parentMarket || m.parentMarket.id !== ZERO) return null;                          // conditional child markets read oddly alone
    if (!CHAINS[m.chainId] || typeof m.id !== "string" || !ADDR.test(m.id)) return null;
    if (m.templateId !== "2" && m.templateId !== "3") return null;                           // categorical / multi-categorical
    var title = clean(m.marketName, 200);
    if (title.length < 8) return null;
    var outs = Array.isArray(m.outcomes) ? m.outcomes.slice(0, 41) : [], odds = Array.isArray(m.odds) ? m.odds.slice(0, 41) : [];
    var rows = [], inv = null;
    for (var i = 0; i < outs.length; i++) {
      var name = clean(outs[i], 80), p = num(odds[i], 100.0001);
      if (name.toLowerCase() === "invalid") { inv = p; continue; }
      if (!name || p == null) return null;
      rows.push([name, Math.round(p * 10) / 10]);
    }
    if (rows.length < 2 || rows.length > 40) return null;
    var sum = rows.reduce(function (a, r) { return a + r[1]; }, 0) + (inv || 0);
    if (sum < 50 || sum > 150) return null;
    var o = { id: m.id.toLowerCase(), chain: m.chainId, title: title, tpl: m.templateId, outcomes: rows, invalid: inv,
      liq: Math.round((num(m.liquidityUSD, 1e10) || 0) * 100) / 100, vol: Math.round((num(m.volumeUSD, 1e10) || 0) * 100) / 100 };
    var c = typeof m.collateralToken === "string" && ADDR.test(m.collateralToken) ? COLL[m.chainId + ":" + m.collateralToken.toLowerCase()] : null;
    if (c) o.coll = c;
    return o;
  }
  (function hero() {
    var H = window.HM_HERO;
    if (!H || typeof H.set !== "function") return;
    var done = false;
    var timer = setTimeout(function () { if (!done) H.state("snapshot"); }, FALLBACK_MS);
    ask({ marketStatusList: ["open"], verificationStatusList: ["verified"], limit: 24, page: 1 }, 1500000).then(function (d) {
      if (!Array.isArray(d.markets)) throw new Error("bad shape");
      var c = d.markets.slice(0, 24).map(heroShape).filter(Boolean);
      if (!c.length) throw new Error("no usable market");
      c.sort(function (a, b) { return b.liq - a.liq; });
      var count = num(d.count, 1e7) != null && Math.round(d.count) === d.count && d.count >= c.length ? d.count : null;
      if (!H.set(c[0], { state: "live", at: Date.now(), verified: count })) throw new Error("rejected");
      done = true; clearTimeout(timer);
    }).catch(function (e) {
      done = true; clearTimeout(timer); H.state("snapshot");
      var s = document.getElementById("hm-price-src"); if (s) s.setAttribute("data-why", String((e && e.name) || "error").slice(0, 40));
    });
  })();

  /* ---------- 2. "Open on Seer now" ---------- */
  (function count() {
    var X = window.SEER_SNAPSHOT && window.SEER_SNAPSHOT.open;
    var n = document.getElementById("hm-live-n"), src = document.getElementById("hm-live-src");
    if (!n || !src) return;
    var shown = null;
    function fmt(c) { return Math.round(c).toLocaleString("en-US"); }
    function label(state, text) {
      src.setAttribute("data-state", state);
      while (src.firstChild) src.removeChild(src.firstChild);
      var i = document.createElement("i"); i.setAttribute("aria-hidden", "true"); src.appendChild(i);
      src.appendChild(document.createTextNode(text));
    }
    function okCount(c) { return typeof c === "number" && isFinite(c) && c >= 1 && c < 1e7 && Math.round(c) === c; }
    function fallback() {
      if (shown) return; shown = "snapshot";
      if (X && okCount(X.count) && typeof X.when === "string") { n.textContent = fmt(X.count); label("snapshot", "Snapshot · " + clean(X.when, 40)); }
      else label("snapshot", "Seer's API is unavailable right now");
    }
    // the dated snapshot first, so the row is never empty while Seer answers
    if (X && okCount(X.count)) n.textContent = fmt(X.count);
    var timer = setTimeout(fallback, FALLBACK_MS);
    ask({ marketStatusList: ["open"], limit: 1, page: 1 }, 200000).then(function (d) {   // a limit:1 answer is ~4 KB
      if (!okCount(d.count)) throw new Error("bad count");
      clearTimeout(timer);
      shown = "live"; n.textContent = fmt(d.count); label("live", "Live · app.seer.pm · " + hhmm(new Date()));
    }).catch(function (e) {
      clearTimeout(timer); src.setAttribute("data-why", String((e && e.name) || "error").slice(0, 40));
      if (shown !== "live") { shown = null; fallback(); }
    });
  })();
})();
