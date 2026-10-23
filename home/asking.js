/* Seer homepage · "Who's asking on Seer" (#asking): the askers Seer's own data names, one row each, with the decision the
   market informs, what it prices and one figure, labelled with its source and the time it was read.
   Concept by Swift Bot Labs. Not affiliated with Seer.

   Sources. This page's CSP allows connect-src https://app.seer.pm only, so everything else is a same-origin snapshot
   loaded with <script src> (written hourly by tools/refresh.py, the same files the interface pages fall back to):
   (a) Opportunity: the AI job board's three linked markets, read live from app.seer.pm (markets-search, marketIds, the
       ids and parent links pinned as in opportunity/real.js); ../opportunity/snapshot.js shows first and stays if
       Seer doesn't answer.
   (b) Deep: ../deep/round3.js, the hourly snapshot of deep.seer.pm's Round 3 feed (deep.seer.pm allows no cross-site reads).
   (c) Futarchy: state only, from the trading close used by futarchy/eip8363.js (24 Oct 2026, 00:00 UTC). No price here.
   (d) Risk: ../risk/snapshot.js, the hourly snapshot of risk.seer.pm: No to All, the figure the Risk page leads with,
       formatted the same way.
   (e) The hero market's own asker: page.js publishes window.HM_ASKER and fires "hm-asker"; one markets-search
       {creator, orderBy creationDate asc, limit 1} gives how many markets that address has on Seer and its first one.
   Everything from Seer is untrusted: type- and range-checked, control and bidi characters stripped, clamped and set
   with textContent only. Links are pinned paths or built from a validated 0x address, never taken from the data. */
(function () {
  "use strict";
  var S = window.Seer, list = document.getElementById("hm-asking");
  if (!S || !list) return;
  var API = "https://app.seer.pm/.netlify/functions/markets-search";
  var FALLBACK_MS = 4000, ABORT_MS = 12000;
  var ADDR = /^0x[0-9a-f]{40}$/, ZERO = "0x0000000000000000000000000000000000000000";
  // C0/C1 controls, zero-width marks, bidi embeddings/overrides/isolates, BOM
  var BAD = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u2069\uFEFF]/g;
  var ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d)?Z$/;
  var REPO = /^[A-Za-z0-9][A-Za-z0-9._-]{0,59}\/[A-Za-z0-9._-]{1,100}$/;
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var CLOSES = Date.UTC(2026, 9, 24);                                    // EIP-8363 trading ends (futarchy/eip8363.js)
  // the AI job board: three linked categorical markets on Gnosis; each one's "Other" (at this index) buys into the next
  var OPP = [["0x8b3c7f3f09f6a85353926d8ee0f12decc1c9a5e8", 78], ["0xf6a42af200c181df45e0f3fd49d58f5d57bb7d35", 78], ["0x144364db8edd6225248fe9d02f77ecc3ec0e4c4c", null]];
  var OPP_LAST_OTHER = "None of the listed names";

  function $(id) { return document.getElementById(id); }
  function clean(s, max) {
    if (typeof s !== "string") return "";
    s = s.replace(BAD, " ").replace(/\s+/g, " ").trim();
    return s.length > max ? s.slice(0, max) : s;
  }
  function okNum(x, lo, hi) { return typeof x === "number" && isFinite(x) && x >= lo && x <= hi; }
  function okInt(x, lo, hi) { return okNum(x, lo, hi) && Math.round(x) === x; }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function hhmm(ms) { var d = new Date(ms); return pad2(d.getUTCHours()) + ":" + pad2(d.getUTCMinutes()) + " UTC"; }
  function dayMon(ms) { var d = new Date(ms); return d.getUTCDate() + " " + MON[d.getUTCMonth()]; }
  function dayMonYr(ms) { return dayMon(ms) + " " + new Date(ms).getUTCFullYear(); }
  function clip(t, n) { return t.length <= n ? t : t.slice(0, n - 1).replace(/[\s.,;:-]+$/, "") + "…"; }
  function isoAt(s) { var t = typeof s === "string" && ISO.test(s) ? Date.parse(s) : NaN; return isFinite(t) && t > Date.UTC(2026, 0, 1) && t < Date.now() + 864e5 ? t : null; }
  // a row's figure: the value, a short note on what it counts, and its source with the time it was read
  function put(row, value, note, source) {
    var v = $("hm-ak-" + row + "-v"), n = $("hm-ak-" + row + "-n"), s = $("hm-ak-" + row + "-s");
    if (v) v.textContent = value;
    if (n) n.textContent = note;
    if (s) s.textContent = source;
  }
  function src(host, live, at, hourly) {
    var today = dayMon(at) === dayMon(Date.now());
    return (live ? "Live" : hourly ? "Hourly snapshot" : "Snapshot") + " · " + host + " · " + (live || today ? hhmm(at) : dayMon(at) + ", " + hhmm(at));
  }

  // one POST, JSON only, size-capped, aborted after ABORT_MS (the same rules as live.js)
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

  /* ---------- the one provenance chip: what was read live, what came from a snapshot, and when ---------- */
  var prov = { opp: null, hero: null, deep: null, risk: null };
  function chip() {
    var c = $("hm-ak-src"), t = $("hm-ak-src-t"); if (!c || !t) return;
    var live = 0, snaps = {}, order = [];
    [["opp", "job board"], ["hero", "asker"], ["deep", "Deep"], ["risk", "Risk"]].forEach(function (k) {
      var p = prov[k[0]]; if (!p) return;
      if (p.live) { live = Math.max(live, p.at); return; }
      var w = dayMon(p.at) + ", " + hhmm(p.at);
      if (!snaps[w]) { snaps[w] = []; order.push(w); }
      snaps[w].push(k[1]);
    });
    var parts = [];
    if (live) parts.push("Live · app.seer.pm · " + hhmm(live));
    order.forEach(function (w) { parts.push(snaps[w].join(", ") + ": snapshot " + w); });
    c.setAttribute("data-state", live ? "live" : order.length ? "snapshot" : "loading");
    t.textContent = parts.length ? parts.join(" · ") : "Seer's data is unavailable right now";
  }

  /* ---------- (a) Opportunity: the AI job board's leading name ---------- */
  // rows [name, price %, level] (snapshot) or rebuilt from the API the way opportunity/real.js merges the three markets
  function oppRead(rows) {
    if (!Array.isArray(rows) || rows.length < 10 || rows.length > 400) return null;
    var total = 0, priced = 0, sum = 0, lead = null;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i]; if (!Array.isArray(r)) continue;
      var name = clean(r[0], 60); if (!name) continue;
      total++;
      if (!okNum(r[1], 0, 100)) continue;
      var p = Math.round(r[1] * 10) / 10; priced++; sum += p;
      if (!lead || p > lead.p) lead = { name: name, p: p };
    }
    if (priced < 10 || sum < 30 || sum > 400 || !lead) return null;           // not a price set we can quote honestly
    return { lead: lead, total: total };
  }
  function oppFromSnapshot(x) {
    if (!x || typeof x !== "object" || x.chain !== 100 || !Array.isArray(x.ids) || x.ids.join() !== OPP.map(function (l) { return l[0]; }).join()) return null;
    var at = isoAt(x.at); if (!at) return null;
    var r = oppRead(x.rows); if (r) r.at = at;
    return r;
  }
  function oppFromApi(d) {
    if (!d || !Array.isArray(d.markets) || d.markets.length > 10) return null;
    var by = {}, rows = [];
    d.markets.forEach(function (m) { if (m && typeof m.id === "string" && ADDR.test(m.id.toLowerCase())) by[m.id.toLowerCase()] = m; });
    for (var lvl = 0; lvl < OPP.length; lvl++) {
      var m = by[OPP[lvl][0]], last = lvl === OPP.length - 1, other = OPP[lvl][1];
      if (!m || m.chainId !== 100 || m.templateId !== "2" || m.type !== "Generic" || m.payoutReported !== false) return null;
      var pm = m.parentMarket;
      if (!pm || typeof pm.id !== "string" || pm.id.toLowerCase() !== (lvl ? OPP[lvl - 1][0] : ZERO)) return null;
      if (lvl && String(m.parentOutcome) !== String(OPP[lvl - 1][1])) return null;
      var outs = m.outcomes, odds = m.odds;
      if (!Array.isArray(outs) || !Array.isArray(odds) || outs.length !== odds.length || outs.length < 3 || outs.length > 128) return null;
      if (!last && other !== outs.length - 2) return null;                   // "Other" sits just before Invalid
      for (var c = 0; c < outs.length - 1; c++) {                             // the last outcome is Invalid
        if (!last && c === other) continue;
        rows.push([last && c === outs.length - 2 ? OPP_LAST_OTHER : outs[c], odds[c], lvl]);
      }
    }
    var r = oppRead(rows); if (r) r.at = Date.now();
    return r;
  }
  function oppShow(r, live) {
    put("opp", clip(r.lead.name, 32) + " · " + r.lead.p.toFixed(1) + "¢", "leads " + r.total + " suggested names", src("app.seer.pm", live, r.at, false));
    prov.opp = { live: live, at: r.at }; chip();
  }
  (function opp() {
    var snap = null, done = false;
    try { snap = oppFromSnapshot(window.OP_SNAPSHOT); } catch (e) { snap = null; }
    if (snap) oppShow(snap, false); else put("opp", "Not available right now", "", "app.seer.pm");
    ask({ chainsList: ["100"], marketIds: OPP.map(function (l) { return l[0]; }), limit: OPP.length, page: 1 }, 1500000).then(function (d) {
      var r = oppFromApi(d); if (!r) throw new Error("bad shape");
      done = true; oppShow(r, true);
    }).catch(function () { if (!done && !snap) chip(); });
  })();

  /* ---------- (b) Deep: Round 3's median UP, from the hourly snapshot ---------- */
  (function deep() {
    var X = window.SEER_DEEP_R3, ups = [], seen = {};
    var at = X && typeof X === "object" && X.v === 1 && (X.chainId === 10 || X.chainId === 1 || X.chainId === 100 || X.chainId === 8453) ? isoAt(X.fetchedAt) : null;
    if (at && Array.isArray(X.repos)) X.repos.slice(0, 400).forEach(function (r) {
      if (!Array.isArray(r) || r.length < 4) return;
      var name = clean(r[0], 161), up = okNum(r[1], 0, 1.5) ? Math.min(1, r[1]) : null, a = typeof r[3] === "string" ? r[3].toLowerCase() : "";
      if (!REPO.test(name) || up == null || !ADDR.test(a) || seen[a]) return;
      seen[a] = 1; ups.push(up);
    });
    if (!at || ups.length < 20) { put("deep", "Not available right now", "", "deep.seer.pm"); return; }
    ups.sort(function (a, b) { return a - b; });
    var n = ups.length, mid = n >> 1, med = n % 2 ? ups[mid] : (ups[mid - 1] + ups[mid]) / 2;
    put("deep", "Median UP " + med.toFixed(2), "across " + n + " repos", src("deep.seer.pm", false, at, true));
    prov.deep = { at: at }; chip();
  })();

  /* ---------- (c) Futarchy: state only ---------- */
  (function fut() {
    var closed = Date.now() >= CLOSES;
    put("fut", closed ? "Trading closed " + dayMon(CLOSES) + " · resolving" : "Trading until " + dayMon(CLOSES),
      closed ? "no live price after the close" : "closes " + dayMon(CLOSES) + ", " + hhmm(CLOSES), "futarchy.seer.pm · the trading close");
  })();

  /* ---------- (d) Risk: No to All, the same figure and label as the Risk page ---------- */
  (function risk() {
    var X = window.SEER_RISK_SNAPSHOT, at = X && typeof X === "object" ? isoAt(X.fetchedAt) : null;
    var ok = at && X.chainId === 100 && typeof X.marketId === "string" && ADDR.test(X.marketId.toLowerCase()) && okNum(X.noToAll, 0, 1) &&
      Array.isArray(X.assets) && X.assets.length >= 20 && X.assets.length <= 60;
    if (!ok) { put("risk", "Not available right now", "", "risk.seer.pm"); return; }
    var pct = S.fmt && typeof S.fmt.pct === "function" ? S.fmt.pct(X.noToAll, 2) : (Math.round(X.noToAll * 10000) / 100).toFixed(2) + "%";
    put("risk", "No to All " + pct, "per year, across " + X.assets.length + " assets", src("risk.seer.pm", false, at, true));
    prov.risk = { at: at }; chip();
  })();

  /* ---------- (e) the hero market's own asker ---------- */
  var heroAddr = null, cache = Object.create(null);
  function heroShow(a, info) {
    if (a !== heroAddr) return;
    var who = $("hm-ak-hero-who"), go = $("hm-ak-hero-go"), sh = a.slice(0, 6) + "…" + a.slice(-4);
    if (who) { who.textContent = sh; who.title = a; }
    if (go) { go.setAttribute("href", "../app/?creator=" + a + "#markets"); go.setAttribute("aria-label", "Every market " + sh + " asked on Seer, in the App explorer"); }
    var n = info && okInt(info.count, 1, 1e7) ? info.count : null;
    put("hero", n ? n.toLocaleString("en-US") + " market" + (n === 1 ? "" : "s") + " on Seer" : "The market at the top of this page",
      n && info.first ? "since " + dayMonYr(info.first) : "", info && info.live ? src("app.seer.pm", true, info.at, false) : "app.seer.pm · as read for the market at the top");
    prov.hero = info && info.live ? { live: true, at: info.at } : null; chip();
  }
  function heroAsker() {
    var H = window.HM_ASKER, a = H && typeof H.creator === "string" ? H.creator.toLowerCase() : null;
    if (!a || !ADDR.test(a) || a === ZERO) return;
    if (a === heroAddr && cache[a]) return;
    heroAddr = a;
    var known = okInt(H.count, 1, 1e7) ? { count: H.count } : null;
    heroShow(a, cache[a] || known);
    if (cache[a]) return;
    ask({ creator: a, limit: 1, page: 1, orderBy: "creationDate", orderDirection: "asc" }, 300000).then(function (d) {
      if (!okInt(d.count, 1, 1e7)) throw new Error("bad count");
      var m = Array.isArray(d.markets) ? d.markets[0] : null, first = null;
      if (m && typeof m.creator === "string" && m.creator.toLowerCase() === a) {
        var ts = typeof m.blockTimestamp === "number" ? m.blockTimestamp : typeof m.blockTimestamp === "string" && /^\d{9,11}$/.test(m.blockTimestamp) ? +m.blockTimestamp : null;
        if (ts != null && isFinite(ts) && ts > 1.5e9 && ts * 1000 < Date.now() + 864e5) first = ts * 1000;
      }
      cache[a] = { count: d.count, first: first, live: true, at: Date.now() };
      heroShow(a, cache[a]);
    }).catch(function () { /* the count page.js already has stays, without a date */ });
  }
  document.addEventListener("hm-asker", heroAsker);
  heroAsker();
  if (!heroAddr) put("hero", "The market at the top of this page", "its address is on its market page", "app.seer.pm");
  chip();
})();
