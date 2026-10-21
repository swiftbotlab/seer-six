/* Seer App · "On Seer now": real markets, read live from Seer's public markets API, with a dated fallback.
   Concept by Swift Bot Labs. Not affiliated with Seer.

   Two POSTs to app.seer.pm/.netlify/functions/markets-search: open + Kleros-verified markets (sorted by liquidity), of which
   the strip shows the most liquid per topic (one Polymarket meta-market, not six), and {open, limit 1} for the count of every
   open market (the strip's last card). A binary card whose Yes + No add up to under 99% says what is left to Invalid.
   Market titles and outcomes on Seer are written by whoever created the market, so everything from the API
   is untrusted: it is type-checked, stripped of control and bidi characters, clamped, and only ever rendered
   with textContent. Links are built here from a validated chain id and 0x address, never taken from the API.
   If the request fails, times out or returns anything odd, the strip shows the dated snapshot in
   assets/seer-snapshot.js (rewritten hourly by tools/refresh.py with these same rules) and says so, with its age.
   The header chip beside the logo says the same thing: Live, or Snapshot and when. */
(function () {
  "use strict";
  var S = window.Seer, X = window.SEER_SNAPSHOT || null;
  var host = document.getElementById("ap-live"), src = document.getElementById("ap-live-src"), meta = document.getElementById("ap-live-meta");
  if (!S || !S.el || !host || !src) return;
  var el = S.el;

  var API = "https://app.seer.pm/.netlify/functions/markets-search";
  var SHOW = 8, ASK = 48;                 // markets shown / asked for (dupes, repeats of a topic and conditional markets are skipped)
  var LIQ_MIN = 250;                      // USD: thinner markets only fill in on a day with fewer than 4 cards
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
      o.n = pairs.length;
      if (pairs.length > 3) pairs = pairs.sort(function (a, b) { return b[1] - a[1]; }).slice(0, 3);
      o.outcomes = pairs; if (m.templateId === "3") o.multi = true;
    } else return null;                                                       // multi-scalar etc.: skip rather than mislabel
    // who asked: the creator's address and the creation block's time (only ever shown as text)
    if (typeof m.creator === "string" && ADDR.test(m.creator) && m.creator !== ZERO) o.creator = m.creator.toLowerCase();
    var ts = typeof m.blockTimestamp === "number" ? m.blockTimestamp : typeof m.blockTimestamp === "string" && /^\d{9,11}$/.test(m.blockTimestamp) ? +m.blockTimestamp : null;
    if (ts != null && isFinite(ts) && ts > 1.5e9 && ts * 1000 < Date.now() + 864e5) o.created = ts * 1000;
    if (m.verification && typeof m.verification === "object" && m.verification.status === "verified") o.verified = true;
    return o;
  }

  // the topic of a title: its first capitalised word after the first (Polymarket, Knesset, GTA...), months skipped;
  // the same rule as stem() in tools/refresh.py, so the hourly snapshot and the live strip pick the same cards
  var MONTHS = { jan: 1, feb: 1, mar: 1, apr: 1, may: 1, jun: 1, jul: 1, aug: 1, sep: 1, sept: 1, oct: 1, nov: 1, dec: 1, january: 1, february: 1,
    march: 1, april: 1, june: 1, july: 1, august: 1, september: 1, october: 1, november: 1, december: 1 };
  var EDGE = /^[^0-9A-Za-z\u00C0-\u024F]+|[^0-9A-Za-z\u00C0-\u024F]+$/g;
  function stem(title) {
    var w = title.split(" ");
    for (var i = 1; i < w.length; i++) {
      var t = w[i].replace(EDGE, "").replace(/['\u2019]s$/i, "");
      if (t && /^[A-Z\u00C0-\u00DE]/.test(t) && !MONTHS[t.toLowerCase()]) return t.toLowerCase();
    }
    return w.slice(0, 3).join(" ").toLowerCase();
  }
  // by liquidity: one card per title and per topic, a liquidity floor; on a thin day (under 4 cards) plain liquidity order
  function pick(list) {
    var out = [], seen = {}, topic = {}, i, k, s;
    list.sort(function (a, b) { return b.liq - a.liq; });
    for (i = 0; i < list.length && out.length < SHOW; i++) {
      k = list[i].title.toLowerCase(); s = stem(list[i].title);
      if (seen[k] || topic[s] || list[i].liq < LIQ_MIN) continue;
      seen[k] = 1; topic[s] = 1; out.push(list[i]);
    }
    if (out.length < 4) {
      out = []; seen = {};
      for (i = 0; i < list.length && out.length < SHOW; i++) {
        k = list[i].title.toLowerCase();
        if (seen[k]) continue; seen[k] = 1; out.push(list[i]);
      }
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
      // a binary market whose two prices add up to under 99%: say where the rest is (Seer leaves it to Invalid)
      var two = !m.multi && m.outcomes.length === 2, sum = two ? m.outcomes[0][1] + m.outcomes[1][1] : 100;
      if (two && sum < 99) {
        var rest = Math.round((100 - sum) * 10) / 10;
        body.appendChild(el("li", { class: "ap-snap__inv", attrs: { title: m.outcomes[0][0] + " and " + m.outcomes[1][0] + " add up to " + pct(sum) + "; the other " + pct(rest) + " is the price left to Invalid." } },
          el("span", { class: "ap-snap__o", text: "Invalid (the rest)" }), el("b", { class: "t-num", text: pct(rest) })));
      }
    }
    return el("article", { class: "ap-snap__card ap-live__card", attrs: { role: "listitem" } },
      el("h3", { class: "ap-snap__t" }, el("a", { href: link(m), text: clip(m.title, 90), attrs: { rel: "noopener noreferrer", target: "_blank", title: m.title, "aria-label": m.title + " (opens on Seer)" } })),
      body,
      el("div", { class: "ap-snap__foot" },
        el("span", { class: "t-num", text: usd(m.liq) + " liq · " + CHAINS[m.chain], attrs: { title: "Liquidity in USD and chain, as Seer's API reports them" } }),
        el("span", { class: "ap-snap__go" }, "Seer", el("span", { html: S.icon("external", 13) }))));
  }

  // the strip's last card: every open market on Seer (snapshot count at once, the live count when Seer answers)
  var openN = X && X.open && okCount(X.open.count) ? X.open.count : null;
  function okCount(c) { return typeof c === "number" && isFinite(c) && c >= 1 && c < 1e7 && Math.round(c) === c; }
  function allCard() {
    return el("article", { class: "ap-snap__card ap-live__card ap-live__all", attrs: { role: "listitem" } },
      el("span", { class: "ap-live__all-k", text: "All on Seer" }),
      el("b", { class: "ap-live__all-n t-num", text: openN ? openN.toLocaleString("en-US") : "Every" }),
      el("span", { class: "ap-live__all-t", text: "open markets, every type and chain" }),
      el("a", { class: "ap-snap__go ap-live__all-go", href: "https://app.seer.pm/", text: "Browse on Seer", attrs: { rel: "noopener noreferrer", target: "_blank", "aria-label": (openN ? openN.toLocaleString("en-US") + " open markets: browse" : "Browse every open market") + " on Seer (opens app.seer.pm)" } },
        el("span", { html: S.icon("external", 13) })));
  }
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function snapAt() {                                    // the snapshot's read time (ms), from "at" or its "21 Oct 2026, 09:31 UTC" label
    if (!X) return null;
    if (typeof X.at === "number" && isFinite(X.at) && X.at > 1.7e12 && X.at < Date.now() + 864e5) return X.at;
    var r = typeof X.when === "string" && /^(\d{1,2}) ([A-Z][a-z]{2}) (\d{4}), (\d\d):(\d\d) UTC$/.exec(X.when), mo = r ? MON.indexOf(r[2]) : -1;
    return mo < 0 ? null : Date.UTC(+r[3], mo, +r[1], +r[4], +r[5]);
  }
  function ago(ms) { var s = Math.max(0, (Date.now() - ms) / 1000); return s < 3600 ? Math.max(1, Math.round(s / 60)) + " min ago" : s < 172800 ? Math.round(s / 3600) + " h ago" : Math.round(s / 86400) + " days ago"; }
  function dayMon(ms) { var d = new Date(ms); return d.getUTCDate() + " " + MON[d.getUTCMonth()]; }

  /* header: a provenance chip in place of the shell's "Sample data" badge — the first screen and the explorer under it are
     real Seer markets; the walkthrough further down is the labelled sample */
  function chip(state, whenTxt) {
    var c = document.querySelector(".s-header .ap-prov") || document.querySelector(".s-header .s-lockup__sample");
    if (!c) return;
    if (!c.classList.contains("ap-prov")) { var n = el("span", { class: "s-sample s-lockup__sample ap-prov" }); c.parentNode.replaceChild(n, c); c = n; }
    var live = state === "live", at = snapAt();
    c.setAttribute("data-state", state);
    c.title = live ? "Top of this page: real markets read live from Seer's public markets API at " + whenTxt + "; the Markets explorer under it reads the same API. The walkthrough further down is sample data. Trades happen on app.seer.pm."
      : "Top of this page: real markets, a snapshot of Seer's public markets API" + (at ? " read " + ago(at) + " (refreshed hourly)" : "") + "; the Markets explorer under it reads the same API. The walkthrough further down is sample data. Trades happen on app.seer.pm.";
    S.clear(c).appendChild(el("i", { attrs: { "aria-hidden": "true" } }));
    var t = el("span", { class: "ap-prov__t" });                              // one flex item, so the spaces inside it hold
    t.appendChild(el("span", { class: "ap-prov__k" + (!live && at ? " ap-prov__long" : ""), text: live ? "Live" : at ? "Snapshot" : "Loading" }));
    if (!live && at) t.appendChild(el("span", { class: "ap-prov__d", text: dayMon(at) }));   // phones: "21 Oct" in place of the word
    var w = live ? whenTxt : at ? dayMon(at) : "";
    if (w) t.appendChild(el("span", { class: "s-sample__mid", text: " · " + w }));
    c.appendChild(t);
    c.appendChild(el("span", { class: "s-sr", text: live ? ": the top of this page is read live from app.seer.pm; the sample walkthrough further down is made up" : ": the top of this page is a dated snapshot of app.seer.pm; the sample walkthrough further down is made up" }));
  }

  /* ---------- the question-asker block in the bar: who asked the strip's first market, what it prices, how to use it ----------
     Only from the market's own data: the creator's address (never a guessed organisation), its type and Seer's prices. */
  function leadOf(m) { var o = m.outcomes.slice().sort(function (a, b) { return b[1] - a[1]; }); return o; }
  function isYes(m) { return !m.multi && m.outcomes.length === 2 && /^yes$/i.test(m.outcomes[0][0]) && /^no$/i.test(m.outcomes[1][0]); }
  /* "Asked by" names only what the data shows: the creator's address (linked to its page on the chain's block explorer where
     that page is known to answer: Gnosisscan, Etherscan), when it asked, and how many other markets that address has created on
     Seer (markets-search {creator}, count only), which opens the explorer below on that asker's markets */
  var SCAN = { 1: "https://etherscan.io/address/", 100: "https://gnosisscan.io/address/" };
  var asked = X && X.creators && typeof X.creators === "object" ? X.creators : {}, askedLive = {};
  function creatorCount(a) { var c = own(askedLive, a) ? askedLive[a] : own(asked, a) ? asked[a] : null; return okCount(c) ? c : null; }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function askBy(m) {
    var by = document.getElementById("ap-ask-by");
    if (!by || !m) return;
    S.clear(by);
    // the snapshot's rows come from tools/refresh.py (same checks); test them again before they become a link or a date
    if (typeof m.creator !== "string" || !ADDR.test(m.creator) || !CHAINS[m.chain]) { by.textContent = "Whoever created it on Seer (anyone can, without permission); the address is on its market page"; return; }
    var a = m.creator.toLowerCase(), sh = a.slice(0, 6) + "…" + a.slice(-4);
    var made = typeof m.created === "number" && isFinite(m.created) && m.created > 1.5e12 && m.created < Date.now() + 864e5 ? m.created : null;
    by.appendChild(SCAN[m.chain] ? el("a", { class: "qa-ask__addr", href: SCAN[m.chain] + a, text: sh, attrs: { title: a, target: "_blank", rel: "noopener noreferrer", "aria-label": a + " on " + (m.chain === 100 ? "Gnosisscan" : "Etherscan") + " (opens in a new tab)" } })
      : el("span", { class: "qa-ask__addr", text: sh, attrs: { title: a } }));
    by.appendChild(document.createTextNode(", who created it on " + CHAINS[m.chain] + (made ? " on " + dayMon(made) + " " + new Date(made).getUTCFullYear() : "")));
    var n = creatorCount(a);
    if (n != null && n > 1) {
      by.appendChild(document.createTextNode(" and "));
      var b = el("a", { class: "qa-ask__more", href: "?creator=" + a + "#markets", text: (n - 1).toLocaleString("en-US") + " other Seer market" + (n - 1 === 1 ? "" : "s"), attrs: { "aria-label": "Show all " + n.toLocaleString("en-US") + " markets created by " + sh + " in the explorer below" } });
      b.addEventListener("click", function (e) { if (window.AP_X && typeof window.AP_X.byCreator === "function") { e.preventDefault(); window.AP_X.byCreator(a); } });
      by.appendChild(b);
    } else if (n === 1) by.appendChild(document.createTextNode(", its only market on Seer"));
    if (!own(askedLive, a)) countFor(a, function () { if (shownCreator === a) askBy(m); });
  }
  var shownCreator = null, asking = {};
  function countFor(a, done) {                    // {creator, Generic, limit 1}: only the numeric "count" is used (~4 KB)
    if (asking[a] || typeof fetch !== "function") return; asking[a] = 1;
    var c3 = typeof AbortController === "function" ? new AbortController() : null, k3 = setTimeout(function () { if (c3) c3.abort(); }, ABORT_MS);
    fetch(API, {
      method: "POST", mode: "cors", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer", redirect: "error",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ creator: a, type: "Generic", limit: 1, page: 1 }),
      signal: c3 ? c3.signal : undefined
    }).then(function (r) {
      if (!r.ok || !/application\/json/i.test(r.headers.get("content-type") || "") || +(r.headers.get("content-length") || 0) > 300000) throw new Error("bad answer");
      return r.text();
    }).then(function (t) {
      clearTimeout(k3);
      if (t.length > 300000) throw new Error("too big");
      var d = JSON.parse(t);
      if (!d || !okCount(d.count)) throw new Error("bad count");
      askedLive[a] = d.count; done();
    }).catch(function () { clearTimeout(k3); });       // the snapshot's count (if any) stays
  }
  function askBlock(m) {
    var pr = document.getElementById("ap-ask-prices"), use = document.getElementById("ap-ask-use");
    if (!pr || !use || !m) return;
    shownCreator = typeof m.creator === "string" ? m.creator.toLowerCase() : null;
    askBy(m);
    var t = clip(m.title, 50), c, u;
    if (m.scalar) {
      var sc = m.scalar, unit = sc.unit ? " " + sc.unit : "";
      c = "“" + t + "”: the expected value on a range of " + num(sc.min) + " to " + num(sc.max) + unit;
      u = "Read " + num(sc.value) + unit + " as the market's estimate today; the ends of the range are the limits it can pay";
    } else if (isYes(m)) {
      var y = m.outcomes[0][1];
      c = "“" + t + "”: the chance it resolves Yes";
      u = "Read " + pct(y) + " as today's odds of Yes, not a certainty; search a topic to compare markets on it";
    } else {
      var L = leadOf(m), a = L[0];
      c = "“" + t + "”: " + (m.multi ? "each answer's share of the payout (several can win)" : (m.n ? "the chance of each of its " + m.n + " answers" : "the chance of each answer"));
      u = "Read " + clip(a[0], 28) + " at " + (m.multi ? (Math.round(a[1] * 10) / 10) + "¢" : pct(a[1])) + " as today's " + (m.multi ? "expected share" : "odds") + ", not a certainty; search a topic to compare";
    }
    pr.textContent = c; use.textContent = u;
  }

  var shown = null; // "live" | "snapshot"
  function render(list, state, when, count) {
    S.clear(host);
    askBlock(list[0]);
    list.forEach(function (m) { host.appendChild(card(m)); });
    host.appendChild(allCard());
    src.setAttribute("data-state", state);
    S.clear(src).appendChild(el("i", { attrs: { "aria-hidden": "true" } }));
    src.appendChild(document.createTextNode(state === "live" ? "Live · app.seer.pm · " + when : "Snapshot · " + when));
    var at = snapAt(), age = at ? " (read " + ago(at) + ", refreshed hourly)" : "";
    if (meta) meta.textContent = state === "live"
      ? "The most liquid open, Kleros-verified market per topic: " + list.length + " of " + count + ", read from Seer's public API just now."
      : state === "loading" ? "Dated snapshot" + age + " while live prices load from Seer's public API…"
      : "Seer's API couldn't be reached just now, so this is the snapshot" + age + ": the most liquid open, Kleros-verified market per topic, " + list.length + " of " + count + ".";
    host.setAttribute("aria-busy", state === "loading" ? "true" : "false");
    if (state !== "loading") shown = state;
    chip(state, when);
    railButtons();
  }
  function fallback() {
    if (shown) return;
    if (X && Array.isArray(X.markets) && X.markets.length) { render(X.markets.slice(0, SHOW), "snapshot", X.when, X.count); return; }
    src.setAttribute("data-state", "snapshot"); src.textContent = "Seer's API is unavailable right now"; host.setAttribute("aria-busy", "false");
  }
  function hhmm(d) { var p = function (n) { return (n < 10 ? "0" : "") + n; }; return p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()) + " UTC"; }

  /* ---------- fetch ---------- */
  // paint the dated snapshot at once (labelled as such), so the strip is never empty while Seer answers
  if (X && Array.isArray(X.markets) && X.markets.length) render(X.markets.slice(0, SHOW), "loading", X.when, X.count);
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

  // the count of every open market for the last card ({open, limit 1}: only the numeric "count" is used; ~4 KB)
  (function () {
    var c2 = typeof AbortController === "function" ? new AbortController() : null, k2 = setTimeout(function () { if (c2) c2.abort(); }, ABORT_MS);
    fetch(API, {
      method: "POST", mode: "cors", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer", redirect: "error",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ marketStatusList: ["open"], limit: 1, page: 1 }),
      signal: c2 ? c2.signal : undefined
    }).then(function (r) {
      if (!r.ok || !/application\/json/i.test(r.headers.get("content-type") || "") || +(r.headers.get("content-length") || 0) > 200000) throw new Error("bad answer");
      return r.text();
    }).then(function (t) {
      clearTimeout(k2);
      if (t.length > 200000) throw new Error("too big");
      var d = JSON.parse(t);
      if (!d || !okCount(d.count)) throw new Error("bad count");
      openN = d.count;
      var n = host.querySelector(".ap-live__all-n"), a = host.querySelector(".ap-live__all-go");
      if (n) n.textContent = openN.toLocaleString("en-US");
      if (a) a.setAttribute("aria-label", openN.toLocaleString("en-US") + " open markets: browse on Seer (opens app.seer.pm)");
    }).catch(function () { clearTimeout(k2); });                           // the snapshot count stays
  })();

  /* ---------- topic search: what do Seer's real markets say about a word? ----------
     page.js's search box asks window.AP_TOPIC.peek(query, onReady) for word queries (3+ letters; numbers, #ids, P-07 and 0x
     stay on the sample). One POST {marketName, open, limit 24} to the same endpoint, 350 ms after the typing stops, the
     previous request aborted; the answer goes through normalize() above, is sorted by liquidity and cut to 4 rows. Rows are
     returned as plain values (page.js renders them with textContent); links are built here from validated chain + 0x id. */
  window.AP_TOPIC = (function () {
    var cache = {}, keys = [], timer = null, ctl2 = null;
    function key(v) { return clean(String(v || ""), 60).toLowerCase(); }
    function eligible(k) { return k.length >= 3 && /[a-z\u00c0-\u024f]{3}/i.test(k) && !/^0x/i.test(k) && !/^#?\d+$/.test(k) && !/^p-?\d{1,2}$/i.test(k.replace(/\s+/g, "")); }
    function lead(m) {
      if (m.scalar) return num(m.scalar.value) + (m.scalar.unit ? " " + m.scalar.unit : "");
      var a = leadOf(m)[0]; return clip(a[0], 18) + " " + (m.multi ? (Math.round(a[1] * 10) / 10) + "¢" : pct(a[1]));
    }
    function keep(k, r) { if (!cache[k]) { keys.push(k); if (keys.length > 40) delete cache[keys.shift()]; } cache[k] = r; }
    function ask2(k, onReady) {
      if (ctl2) ctl2.abort();
      var c = typeof AbortController === "function" ? new AbortController() : null, kill2 = setTimeout(function () { if (c) c.abort(); }, ABORT_MS);
      ctl2 = c;
      fetch(API, {
        method: "POST", mode: "cors", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer", redirect: "error",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ marketName: k, marketStatusList: ["open"], limit: 24, page: 1 }),
        signal: c ? c.signal : undefined
      }).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        if (!/application\/json/i.test(r.headers.get("content-type") || "")) throw new Error("not JSON");
        if (+(r.headers.get("content-length") || 0) > MAX_BYTES) throw new Error("too big");
        return r.text();
      }).then(function (t) {
        clearTimeout(kill2);
        if (t.length > MAX_BYTES) throw new Error("too big");
        var d = JSON.parse(t);
        if (!d || !Array.isArray(d.markets)) throw new Error("bad shape");
        var seen = {}, list = d.markets.slice(0, 24).map(normalize).filter(function (m) {
          if (!m) return false; var tk = m.title.toLowerCase(); if (seen[tk]) return false; seen[tk] = 1; return true;
        }).sort(function (a, b) { return b.liq - a.liq; }).slice(0, 4);
        var n = typeof d.count === "number" && isFinite(d.count) && d.count >= 0 && d.count < 1e7 ? Math.round(d.count) : list.length;
        keep(k, { state: "ok", q: k, count: Math.max(n, list.length), rows: list.map(function (m) {
          return { label: clip(m.title, 110), title: m.title, sub: usd(m.liq) + " liq · " + CHAINS[m.chain] + (m.verified ? " · Kleros-verified" : " · not verified"), val: lead(m), href: link(m) };
        }) });
        if (ctl2 === c) ctl2 = null;
        onReady(k);
      }).catch(function (e) {
        clearTimeout(kill2);
        if (e && e.name === "AbortError" && ctl2 !== c) return;              // replaced by a newer query
        if (ctl2 === c) ctl2 = null;
        cache[k] = { state: "error", q: k, at: Date.now() }; onReady(k);
      });
    }
    return {
      ok: function (raw) { return typeof fetch === "function" && eligible(key(raw)); },
      peek: function (raw, onReady) {
        var k = key(raw);
        if (!eligible(k) || typeof fetch !== "function") return null;
        var r = cache[k];
        if (r && !(r.state === "error" && Date.now() - r.at > 30000)) return r;
        clearTimeout(timer);
        timer = setTimeout(function () { ask2(k, onReady); }, 350);
        return { state: "loading", q: k };
      }
    };
  })();

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
