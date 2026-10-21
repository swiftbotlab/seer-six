/* Seer App · Markets: the explorer itself, on Seer's real markets.
   Concept by Swift Bot Labs. Not affiliated with Seer.

   Every filter but the market type is a field of Seer's own public markets API (POST app.seer.pm/.netlify/functions/markets-search,
   the request Seer's app makes): state (marketStatusList), chain (chainsList), Kleros Curate (verificationStatusList),
   conditional only (showConditionalMarkets), futarchy only (type), search (marketName), asked by (creator) and the sort (orderBy).
   One page is 24 markets, as on Seer; "Load 24 more" asks for the next page. The market type is filtered here, on the loaded rows.
   Market titles and outcomes on Seer are written by whoever created the market, so everything from the API is untrusted:
   type-checked, range-checked, stripped of control and bidi characters, clamped, and only ever rendered with textContent.
   Links are built here from a validated chain id and 0x address, never taken from the data. A market's state is read from
   its own fields (answers, opening time, arbitration, payout), the way Seer's app shows it.
   Fallback: the explorer's first page in assets/seer-snapshot.js (rewritten hourly by tools/refresh.py, pruned to the fields
   read here and run through the same normalize()), painted at once and kept, with its date, if Seer does not answer; the
   filters then apply to the markets in that snapshot, and the explorer says so. */
(function () {
  "use strict";
  var S = window.Seer, U = S && S.ui, F = S && S.fmt;
  var root = document.getElementById("ap-x");
  if (!S || !U || !F || !root) return;
  var el = S.el, $ = S.$, $$ = S.$$;
  var SNAP = window.SEER_SNAPSHOT && typeof window.SEER_SNAPSHOT === "object" ? window.SEER_SNAPSHOT : null;
  var XS = SNAP && SNAP.explore && typeof SNAP.explore === "object" && Array.isArray(SNAP.explore.markets) ? SNAP.explore : null;

  var API = "https://app.seer.pm/.netlify/functions/markets-search";
  var PAGE = 24, MAX_PAGES = 10, FALLBACK_MS = 4000, ABORT_MS = 12000, MAX_BYTES = 1500000, DEBOUNCE = 380;
  var CH = { 1: ["Ethereum", "ethereum"], 10: ["OP Mainnet", "optimism"], 100: ["Gnosis", "gnosis"], 8453: ["Base", "base"] };
  var COLL = { "100:0xaf204776c7245bf4147c2612bf6e5972ee483701": "sDAI", "100:0xe91d153e0b41518a2ce8dd3d7944fa863463a97d": "xDAI",
    "1:0x83f20f44975d03b1b09e64809b757c47f942beea": "sDAI" };
  var ZERO = "0x0000000000000000000000000000000000000000";
  var ADDR = /^0x[0-9a-fA-F]{40}$/;
  var BAD = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u2069\uFEFF]/g; // C0/C1, zero-width, bidi, BOM
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  // Seer's own state names (its app shows the same labels; SEER_SAMPLE.states carries them for the shared badges)
  var STATES = [["unresolved", "Not resolved yet"], ["any", "Any state"], ["not-open", "Reports not open yet"], ["open", "Reports open"],
    ["waiting", "Waiting for answer"], ["dispute", "In dispute"], ["pending", "Pending execution"], ["closed", "Closed"]];
  var API_STATE = { "not-open": "not_open", open: "open", waiting: "answer_not_final", dispute: "in_dispute", pending: "pending_execution", closed: "closed" };
  var VERIFY = [["all", "Any"], ["verified", "Verified"], ["verifying", "Verifying"], ["challenged", "Challenged"], ["none", "Not verified"]];
  var API_VERIFY = { verified: "verified", verifying: "verifying", challenged: "challenged", none: "not_verified" };
  var SORTS = [["default", "Seer's order"], ["liquidityUSD", "Liquidity"], ["volumeUSD", "Volume"], ["outcomesSupply", "Open interest"],
    ["openingTs", "Opening date"], ["creationDate", "Creation date"]];
  var KINDS = [["all", "All types"], ["categorical", "Categorical"], ["multi-categorical", "Multi-categorical"], ["scalar", "Scalar"], ["multi-scalar", "Multi-scalar"]];
  var KIND_NAME = { categorical: "Categorical", "multi-categorical": "Multi-categorical", scalar: "Scalar", "multi-scalar": "Multi-scalar" };
  var DEF = { state: "unresolved", chain: "all", verify: "all", sort: "default", cond: false, fut: false, q: "", creator: "" };

  function clean(s, max) {
    if (typeof s !== "string") return "";
    s = s.replace(BAD, " ").replace(/\s+/g, " ").trim();
    return s.length > max ? s.slice(0, max) : s;
  }
  function num(x, lo, hi) { return typeof x === "number" && isFinite(x) && x >= lo && x <= hi ? x : null; }
  function pctOk(x) { return num(x, 0, 100) != null; }
  function bound(s) { // Seer stores newer scalar bounds in wei (1e18), older ones as plain integers
    if (typeof s !== "string" || !/^\d{1,40}$/.test(s)) return null;
    var n = Number(s); return n > 1e10 ? n / 1e18 : n;
  }
  function tsec(x) { if (typeof x === "string" && /^\d{9,11}$/.test(x)) x = +x; return num(x, 0, 1e11); }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  /* ---------- API market (live or snapshot) -> the explorer's row, or null if anything is off ---------- */
  function normalize(m, now) {
    if (!m || typeof m !== "object") return null;
    if (typeof m.chainId !== "number" || !own(CH, m.chainId) || typeof m.id !== "string" || !ADDR.test(m.id)) return null;
    var fut = m.type === "Futarchy";
    if (!fut && m.type !== "Generic") return null;
    var title = clean(m.marketName, 240);
    if (title.length < 4) return null;
    var tpl = m.templateId, nq = Array.isArray(m.questions) ? Math.min(m.questions.length, 64) : 0;
    var outs = Array.isArray(m.outcomes) ? m.outcomes.slice(0, 64) : [], odds = Array.isArray(m.odds) ? m.odds.slice(0, 64) : [];
    var o = { id: m.id.toLowerCase(), chain: m.chainId, title: title, fut: fut };
    var pm = m.parentMarket && typeof m.parentMarket === "object" ? m.parentMarket.id : null;
    o.cond = typeof pm === "string" && ADDR.test(pm) && pm.toLowerCase() !== ZERO;
    if (tpl === "1" && nq === 1) {                                  // scalar: Seer's own estimate formula (as in live.js)
      o.kind = "scalar";
      var lo = bound(m.lowerBound), hi = bound(m.upperBound);
      if (lo == null || hi == null || !(hi > lo)) return null;
      var unit = "", u = /\[([^\]]{1,24})\]\s*$/.exec(title);
      if (u) { unit = u[1].trim(); o.title = title.slice(0, u.index).trim() || title; }
      o.scalar = { min: lo, max: hi, unit: unit, value: null };
      if (pctOk(odds[0]) && pctOk(odds[1])) {
        var dn = odds[0], up = odds[1], sum = dn + up;
        if (sum > 100) { dn = dn / sum * 100; up = up / sum * 100; }
        if (sum > 0) o.scalar.value = Math.round(dn * lo + up * hi) / 100;
      }
    } else if (tpl === "1" || tpl === "2" || tpl === "3") {
      o.kind = tpl === "1" ? "multi-scalar" : tpl === "3" ? "multi-categorical" : "categorical";
      var rows = [], priced = 0, inv = null;
      for (var i = 0; i < outs.length && rows.length < 64; i++) {
        var name = clean(outs[i], 80);
        if (!name) continue;
        var p = pctOk(odds[i]) ? odds[i] : null;
        if (name.toLowerCase() === "invalid") { inv = p; continue; }
        rows.push([name, p]); if (p != null) priced++;
      }
      if (rows.length < 2) return null;
      o.n = rows.length;
      o.priced = priced === rows.length;                              // draw prices only when Seer prices every answer
      o.outs = o.priced ? rows.slice().sort(function (a, b) { return b[1] - a[1]; }) : rows;
      o.inv = o.priced ? inv : null;
      o.yesno = o.kind === "categorical" && rows.length === 2 && /^yes$/i.test(rows[0][0]) && /^no$/i.test(rows[1][0]);
      if (o.yesno) o.outs = rows;                                     // Yes first, as Seer lists it
    } else return null;
    o.liq = num(m.liquidityUSD, 0, 1e10) || 0;
    o.vol = num(m.volumeUSD, 0, 1e10) || 0;
    o.oi = num(m.openInterestUSD, 0, 1e10) || 0;
    var op = tsec(m.openingTs); o.opening = op != null && op > 1e9 && op < 4.2e9 ? op * 1000 : null;
    var bt = tsec(m.blockTimestamp); o.created = bt != null && bt > 1.5e9 && bt * 1000 < now + 864e5 ? bt * 1000 : null;
    if (typeof m.creator === "string" && ADDR.test(m.creator) && m.creator.toLowerCase() !== ZERO) o.creator = m.creator.toLowerCase();
    var v = m.verification && typeof m.verification === "object" ? m.verification.status : null;
    o.verify = v === "verified" ? "verified" : v === "verifying" ? "verifying" : v === "challenged" ? "challenged" : "none";
    if (typeof m.collateralToken === "string" && ADDR.test(m.collateralToken)) o.coll = COLL[m.chainId + ":" + m.collateralToken.toLowerCase()] || null;
    // its state, from its own fields (payout reported / an arbitration / no answer yet / the answer's finalize time)
    var arb = typeof m.questionsInArbitration === "string" && /^\d{1,6}$/.test(m.questionsInArbitration) ? +m.questionsInArbitration : 0;
    var fin = tsec(m.finalizeTs);
    o.state = m.payoutReported === true ? "closed" : arb > 0 ? "dispute"
      : m.hasAnswers !== true ? (o.opening && o.opening > now ? "not-open" : "open")
      : fin != null && fin * 1000 > now ? "waiting" : "pending";
    return o;
  }

  /* ---------- formatting ---------- */
  function pct(v) { return (Math.round(v * 10) / 10) + "%"; }
  function cents(v) { return (v < 10 ? Math.round(v * 10) / 10 : Math.round(v)) + "¢"; }
  function usd(n) { return n >= 1e6 ? "$" + (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? "$" + (n / 1e3).toFixed(1) + "K" : "$" + Math.round(n); }
  function nm(v) { return Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("en-US") : String(Math.round(v * 100) / 100); }
  function clip(t, n) { if (t.length <= n) return t; var c = t.slice(0, n), sp = c.lastIndexOf(" "); return (sp > n * .6 ? c.slice(0, sp) : c).replace(/[\s,;:(]+$/, "") + "…"; }
  function short(a) { return a.slice(0, 6) + "…" + a.slice(-4); }
  function day(ms, yr) { var d = new Date(ms); return d.getUTCDate() + " " + MON[d.getUTCMonth()] + (yr ? " " + d.getUTCFullYear() : ""); }
  function hhmm(ms) { var d = new Date(ms), p = function (n) { return (n < 10 ? "0" : "") + n; }; return p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()) + " UTC"; }
  function ago(ms) { var s = Math.max(0, (Date.now() - ms) / 1000); return s < 3600 ? Math.max(1, Math.round(s / 60)) + " min ago" : s < 172800 ? Math.round(s / 3600) + " h ago" : Math.round(s / 86400) + " days ago"; }
  function link(m) { return "https://app.seer.pm/markets/" + m.chain + "/" + m.id; } // chain + id validated in normalize()
  function lead(m) {                                       // the market's leading price, in its own unit
    if (m.kind === "scalar") return m.scalar.value == null ? "No price yet" : nm(m.scalar.value) + (m.scalar.unit ? " " + m.scalar.unit : "") + " expected";
    if (!m.priced) return "No price yet";
    var a = m.outs[0];
    if (m.yesno) return "Yes " + pct(a[1]);
    return clip(a[0], 26) + " " + (m.kind === "multi-categorical" ? cents(a[1]) : m.kind === "multi-scalar" ? pct(a[1]) + " share" : pct(a[1]));
  }
  function ext(cls, label, href, aria, plain) {            // a link out to Seer (new tab), with the kit's arrow icon
    return el("a", { class: cls, href: href, attrs: { target: "_blank", rel: "noopener noreferrer", "aria-label": aria || null } }, label,
      plain ? null : el("span", { html: S.icon("external", 13), attrs: { "aria-hidden": "true" } }));
  }

  /* ---------- state ---------- */
  var Q = {}; Object.keys(DEF).forEach(function (k) { Q[k] = DEF[k]; });
  var kind = "all", view = "cards";
  (function () {                                            // the viewer's last view wins; wide screens open on the table
    var sv = null; try { sv = localStorage.getItem("ap-x-view"); } catch (e) { /* private mode: fine */ }
    view = sv === "table" || sv === "cards" ? sv : (window.matchMedia && matchMedia("(min-width: 1200px)").matches ? "table" : "cards");
  })();
  (function () {                                            // ?creator=0x… (from "Asked by" links): open on that asker's markets
    var r = /[?&]creator=(0x[0-9a-fA-F]{40})(?:&|$)/.exec(location.search);
    if (r && r[1].toLowerCase() !== ZERO) { Q.creator = r[1].toLowerCase(); Q.state = "any"; }
  })();
  var rows = [], count = null, mode = "loading", at = null, page = 1, seq = 0, ctl = null, more = "idle", allCards = false;
  var PHONE = window.matchMedia ? window.matchMedia("(max-width: 640px)") : null;

  function body(p) {
    var b = { type: Q.fut ? "Futarchy" : "Generic", limit: PAGE, page: p };
    if (Q.state === "unresolved") b.marketStatusList = ["not_open", "open", "answer_not_final", "in_dispute", "pending_execution"];
    else if (API_STATE[Q.state]) b.marketStatusList = [API_STATE[Q.state]];
    if (Q.chain !== "all") b.chainsList = [Q.chain];
    if (API_VERIFY[Q.verify]) b.verificationStatusList = [API_VERIFY[Q.verify]];
    if (Q.cond) b.showConditionalMarkets = true;
    if (Q.q) b.marketName = Q.q;
    if (Q.creator) b.creator = Q.creator;
    if (Q.sort !== "default") { b.orderBy = Q.sort; b.orderDirection = "desc"; }
    return b;
  }
  function isDefault() { return Object.keys(DEF).every(function (k) { return Q[k] === DEF[k]; }); }
  // the market type is filtered here, on the loaded rows; the rest are Seer's own filters, applied here too to the snapshot
  function matchKind(m) { return kind === "all" || m.kind === kind; }
  function matchServer(m) {
    if (Q.state === "unresolved" ? m.state === "closed" : Q.state !== "any" && m.state !== Q.state) return false;
    if (Q.chain !== "all" && String(m.chain) !== Q.chain) return false;
    if (Q.verify !== "all" && m.verify !== Q.verify) return false;
    if (Q.cond && !m.cond) return false;
    if (Q.fut !== m.fut) return false;
    if (Q.creator && m.creator !== Q.creator) return false;
    if (Q.q && m.title.toLowerCase().indexOf(Q.q.toLowerCase()) < 0) return false;
    return true;
  }
  var SKEY = { liquidityUSD: "liq", volumeUSD: "vol", outcomesSupply: "oi", openingTs: "opening", creationDate: "created" };
  function snapSort(list) {
    var k = SKEY[Q.sort];
    return list.slice().sort(k ? function (a, b) { return (b[k] || 0) - (a[k] || 0); }
      : function (a, b) { return (b.verify === "verified") - (a.verify === "verified") || b.liq - a.liq; });  // Seer's default
  }
  function snapRows() {
    var now = Date.now();
    return XS ? XS.markets.slice(0, 60).map(function (m) { return normalize(m, now); }).filter(Boolean) : [];
  }
  function snapAt() {
    if (!SNAP) return null;
    if (typeof SNAP.at === "number" && isFinite(SNAP.at) && SNAP.at > 1.7e12 && SNAP.at < Date.now() + 864e5) return SNAP.at;
    return null;
  }

  /* ---------- fetch ---------- */
  function post(b) {
    if (typeof fetch !== "function") return Promise.reject(new Error("no fetch"));
    if (ctl) ctl.abort();
    var c = typeof AbortController === "function" ? new AbortController() : null, kill = setTimeout(function () { if (c) c.abort(); }, ABORT_MS);
    ctl = c;
    return fetch(API, {
      method: "POST", mode: "cors", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer", redirect: "error",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(b), signal: c ? c.signal : undefined
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      if (!/application\/json/i.test(r.headers.get("content-type") || "")) throw new Error("not JSON");
      if (+(r.headers.get("content-length") || 0) > MAX_BYTES) throw new Error("too big");
      return r.text();
    }).then(function (t) {
      clearTimeout(kill);
      if (t.length > MAX_BYTES) throw new Error("too big");
      var d = JSON.parse(t);
      if (!d || !Array.isArray(d.markets)) throw new Error("bad shape");
      var n = typeof d.count === "number" && isFinite(d.count) && d.count >= 0 && d.count < 1e7 ? Math.round(d.count) : null;
      var now = Date.now(), seen = {}, list = d.markets.slice(0, PAGE).map(function (m) { return normalize(m, now); }).filter(function (m) {
        if (!m) return false; var k = m.chain + ":" + m.id; if (seen[k]) return false; seen[k] = 1; return true;
      });
      return { list: list, count: n };
    }, function (e) { clearTimeout(kill); throw e; });
  }
  var fbTimer = null;
  function load() {                                         // page 1 of the current filters
    var my = ++seq; page = 1; more = "idle"; allCards = false;
    if (mode !== "live" || !rows.length) setSrc("loading");
    root.setAttribute("aria-busy", "true");
    clearTimeout(fbTimer);
    fbTimer = setTimeout(function () { if (my === seq && mode !== "live") showSnapshot("slow"); }, FALLBACK_MS);
    post(body(1)).then(function (r) {
      if (my !== seq) return;
      clearTimeout(fbTimer);
      if (r.count == null) throw new Error("no count");
      rows = r.list; count = Math.max(r.count, rows.length); mode = "live"; at = Date.now();
      render();
    }).catch(function (e) {
      if (my !== seq) return;
      clearTimeout(fbTimer);
      root.setAttribute("data-why", String((e && e.name) || "error").slice(0, 40));
      showSnapshot("error");
    });
  }
  function loadMore() {
    if (mode !== "live" || more === "busy" || page >= MAX_PAGES) return;
    var my = seq, p = page + 1; more = "busy"; renderMore();
    post(body(p)).then(function (r) {
      if (my !== seq) return;
      var have = {}; rows.forEach(function (m) { have[m.chain + ":" + m.id] = 1; });
      r.list.forEach(function (m) { if (!have[m.chain + ":" + m.id]) rows.push(m); });
      if (r.count != null) count = Math.max(r.count, rows.length);
      page = p; more = r.list.length ? "idle" : "end"; at = Date.now();
      render(true);
    }).catch(function () { if (my !== seq) return; more = "error"; renderMore(); });
  }
  function showSnapshot(why) {
    if (why === "slow") root.setAttribute("data-why", "slow");
    var list = snapRows();
    if (!list.length) { mode = "none"; rows = []; count = null; render(); return; }
    mode = "snapshot"; rows = snapSort(list.filter(matchServer)); count = null;
    render();
  }

  /* ---------- render ---------- */
  var src = $("#ap-x-src"), meta = $("#ap-x-meta"), bar = $("#ap-x-resbar"), res = $("#ap-x-results"), moreRow = $("#ap-x-more");
  function setSrc(state) {
    if (!src) return;
    var sa = snapAt();
    src.setAttribute("data-state", state === "live" ? "live" : state === "loading" ? "loading" : "snapshot");
    S.clear(src).appendChild(el("i", { attrs: { "aria-hidden": "true" } }));
    src.appendChild(document.createTextNode(state === "live" ? "Live · app.seer.pm · " + hhmm(at)
      : state === "loading" ? "Loading from app.seer.pm…"
      : state === "snapshot" ? "Snapshot · " + (sa ? day(sa, true) + ", " + hhmm(sa) : "dated")
      : "Seer's API is unavailable right now"));
  }
  function render(keepScroll) {
    var shown = rows.filter(matchKind), sa = snapAt(), snap = mode === "snapshot" || mode === "loading";
    setSrc(mode === "live" ? "live" : mode === "snapshot" ? "snapshot" : mode === "loading" ? "loading" : "none");
    root.setAttribute("aria-busy", "false");
    root.setAttribute("data-mode", mode);
    if (meta) meta.textContent = mode === "live"
      ? (Q.creator ? "Every market " + short(Q.creator) + " has asked on Seer" : isDefault() ? "Every market on Seer that is not resolved yet" : "Seer's markets for these filters") + ", read live from Seer's public markets API."
      : mode === "loading" ? "The explorer's first page from the snapshot" + (sa ? " read " + ago(sa) : "") + ", while live markets load from Seer's public API…"
      : mode === "snapshot" ? "Seer's API " + (root.getAttribute("data-why") === "slow" ? "is slow to answer" : "couldn't be reached") + ", so this is the explorer's first page from the snapshot" + (sa ? " read " + ago(sa) + " (refreshed hourly)" : "") + "; filters apply to its markets."
      : "Seer's API is unavailable right now and no snapshot loaded.";
    // results line: how many, of what; then the active filters as removable pills
    S.clear(bar);
    var n = el("span", { class: "ap-results__n" }, el("b", { text: String(shown.length) }));
    if (mode === "live") n.appendChild(document.createTextNode((kind !== "all" ? " " + KIND_NAME[kind].toLowerCase() + " of " + rows.length + " loaded" : " shown") + " · " + count.toLocaleString("en-US") + " on Seer"));
    else if (snap) n.appendChild(document.createTextNode(" of the " + snapRows().length + " markets in the snapshot"));
    bar.appendChild(n);
    var act = actives();
    act.forEach(function (a) {
      var b = el("button", { class: "ap-pill", attrs: { type: "button", "aria-label": "Remove filter " + a[1] } }, a[1], el("span", { html: S.icon("close", 13), style: { display: "inline-flex" } }));
      b.addEventListener("click", function () { reset(a[0]); changed(a[0] === "kind"); });
      bar.appendChild(b);
    });
    if (act.length > 1) bar.appendChild(el("button", { class: "ap-clear", text: "Clear all", attrs: { type: "button" }, on: { click: clearAll } }));
    syncToggle(act);
    // the rows
    S.clear(res);
    if (!shown.length) {
      res.appendChild(U.empty({ title: mode === "none" ? "Seer's markets could not be loaded" : "No markets match", text: mode === "none" ? "Try again in a moment, or browse every market on app.seer.pm."
        : snap ? "None of the markets in the snapshot fit these filters. Seer's API is unreachable, so only its first page is here; clear the filters or try again shortly."
        : kind !== "all" && rows.length ? "None of the " + rows.length + " loaded markets is " + KIND_NAME[kind].toLowerCase() + (count > rows.length ? ". Load more, or clear the type." : ".") : "Seer has no market for these filters. Clear them, or ask the question yourself on Seer.",
        action: mode === "none" ? { label: "Browse on Seer", href: "https://app.seer.pm/" } : { label: "Clear filters", onClick: clearAll }, motif: "dotgrid", motifOpts: { cols: 12, rows: 6, cell: 20, dissolve: .55 } }));
    } else if (view === "table") renderTable(shown);
    else {
      // phones: the first 6 cards, then one button for the rest of the page (the table and wider screens show the whole page)
      var cut = !allCards && PHONE && PHONE.matches && shown.length > 7;
      var g = el("div", { class: "s-grid s-grid--cards ap-cards ap-xcards", attrs: { role: "list", "aria-label": "Markets on Seer" } });
      (cut ? shown.slice(0, 6) : shown).forEach(function (m) { g.appendChild(card(m)); });
      res.appendChild(g);
      if (cut) {
        var sa2 = el("button", { class: "s-btn s-btn--ghost ap-showall", attrs: { type: "button" } }, "Show all " + shown.length + " loaded", el("span", { html: S.icon("chevron-down", 16), style: { display: "inline-flex" } }));
        sa2.addEventListener("click", function () { allCards = true; render(true); var c7 = $$(".ap-xcard", res)[6]; if (c7) { var a7 = c7.querySelector("a"); if (a7) a7.focus({ preventScroll: true }); } });
        res.appendChild(el("div", { class: "ap-showall-row" }, sa2));
      }
    }
    renderMore();
    if (!keepScroll && pendingScroll) { pendingScroll = false; var t = document.getElementById("markets"); if (t) t.scrollIntoView(); }
  }
  function renderMore() {
    if (!moreRow) return;
    S.clear(moreRow);
    if (mode !== "live" || count == null || rows.length >= count) return;
    if (view === "cards" && !allCards && PHONE && PHONE.matches && rows.filter(matchKind).length > 7) return;  // "Show all" first
    if (page >= MAX_PAGES) { moreRow.appendChild(ext("s-btn s-btn--ghost", "The rest on app.seer.pm", "https://app.seer.pm/", "Browse the rest of Seer's markets (opens app.seer.pm)")); return; }
    var left = count - rows.length, nx = Math.min(PAGE, left);
    var b = el("button", { class: "s-btn s-btn--ghost ap-showall", attrs: { type: "button", "aria-describedby": "ap-x-resbar" } },
      more === "busy" ? "Loading…" : more === "error" ? "Seer didn't answer: try again" : "Load " + nx + " more", el("span", { html: S.icon("chevron-down", 16), style: { display: "inline-flex" } }));
    if (more === "busy") b.disabled = true;
    b.addEventListener("click", loadMore);
    moreRow.appendChild(b);
    moreRow.appendChild(el("span", { class: "t-meta ap-xmore__n", text: left.toLocaleString("en-US") + " more on Seer" }));
  }

  /* a market card: the kit's card (head, outcome rows or the type's own shape, meta footer), every link out to Seer */
  var SEG = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)"];
  function body4(m) {
    var go = link(m);
    if (m.kind === "scalar") {
      var c = m.scalar, unit = c.unit ? " " + c.unit : "";
      if (c.value == null) return el("p", { class: "t-meta ap-xnone", text: "No price yet: the range is " + nm(c.min) + " to " + nm(c.max) + unit + "." });
      var p = Math.max(0, Math.min(1, (c.value - c.min) / (c.max - c.min)));
      return el("div", { class: "ap-cvis ap-cvis--rng" },
        el("div", { class: "s-row s-row--between" }, el("span", { class: "t-meta", text: "Expected" }), el("b", { class: "t-num ap-cvis__v", text: nm(c.value) + unit })),
        el("div", { class: "ap-rng", attrs: { role: "img", "aria-label": "Expected " + nm(c.value) + unit + " on a range of " + nm(c.min) + " to " + nm(c.max) }, style: { "--p": p.toFixed(4) } },
          el("span", { class: "ap-rng__track" }, el("i")), el("span", { class: "ap-rng__ticks" }, [0, 1, 2, 3, 4].map(function () { return el("i"); })), el("span", { class: "ap-rng__pin" })),
        el("div", { class: "s-row s-row--between t-meta t-num" }, el("span", { text: nm(c.min) }), el("span", { text: nm(c.max) + unit })));
    }
    if (!m.priced) return el("div", { class: "ap-xnone" }, el("p", { class: "t-meta", text: "No price yet: Seer shows prices once the market has liquidity." }),
      el("p", { class: "ap-xnone__o", text: m.outs.slice(0, 3).map(function (o) { return clip(o[0], 24); }).join(" · ") + (m.n > 3 ? " · +" + (m.n - 3) : "") }));
    if (m.yesno) {
      var yes = m.outs[0][1], no = m.outs[1][1], sum = yes + no, box = el("div", {});
      box.appendChild(el("div", { class: "s-mcard__binary" },
        ext("s-btn", "Yes " + cents(yes), go, "Yes at " + cents(yes) + ": trade on Seer (opens app.seer.pm)", true),
        ext("s-btn s-btn--secondary", "No " + cents(no), go, "No at " + cents(no) + ": trade on Seer (opens app.seer.pm)", true)));
      if (sum < 99) box.appendChild(el("p", { class: "t-meta ap-xinv", text: "Invalid holds the other " + pct(Math.round((100 - sum) * 10) / 10), attrs: { title: "Yes and No add up to " + pct(sum) + "; Seer leaves the rest to Invalid." } }));
      else if (sum > 101) box.appendChild(el("p", { class: "t-meta ap-xinv", text: "Yes and No add up to " + cents(Math.round(sum * 10) / 10) + " in Seer's pools today", attrs: { title: "Seer prices each outcome in its own pool, so on a thin market the two can add up to more than 100¢. Shown as Seer reports them." } }));
      return box;
    }
    // several answers: one stacked bar of the whole set, then the top two as the kit's outcome rows
    var multi = m.kind === "multi-categorical", total = 0;
    m.outs.forEach(function (o) { total += o[1]; });
    var wrap = el("div", { class: "s-orows" });
    if (total > 0 && m.n > 2) {
      var top = m.outs.slice(0, SEG.length), rest = 0;
      m.outs.slice(SEG.length).forEach(function (o) { rest += o[1]; });
      var stack = el("div", { class: "ap-stack", attrs: { role: "img", "aria-label": (multi ? "Shares of the payout: " : m.kind === "multi-scalar" ? "Shares: " : "Chances: ") + top.map(function (o) { return o[0] + " " + (multi ? cents(o[1]) : pct(o[1])); }).join(", ") + (m.n > SEG.length ? ", " + (m.n - SEG.length) + " others" : "") } });
      top.forEach(function (o, i) { stack.appendChild(el("i", { style: { width: (o[1] / total * 100).toFixed(3) + "%", background: SEG[i] }, attrs: { title: o[0] + " · " + (multi ? cents(o[1]) : pct(o[1])) } })); });
      if (rest > 0) stack.appendChild(el("i", { class: "is-rest", style: { width: (rest / total * 100).toFixed(3) + "%" } }));
      wrap.appendChild(el("div", { class: "ap-cvis ap-cvis--stack" }, stack));
    }
    m.outs.slice(0, 2).forEach(function (o, i) {
      wrap.appendChild(U.orow({ name: o[0], price: o[1] / 100 }, { actions: false, swatch: m.n > 2 ? SEG[i] : null, value: multi ? cents(o[1]) : pct(o[1]), sub: m.kind === "multi-scalar" ? "share" : multi ? "of payout" : null, p: o[1] / 100 }));
    });
    if (m.n > 2) wrap.appendChild(el("p", { class: "t-meta ap-xrest", text: "+" + (m.n - 2) + " more answer" + (m.n - 2 === 1 ? "" : "s") + " on Seer" }));
    return wrap;
  }
  function asker(m, cls) {
    if (!m.creator) return null;
    var b = el("button", { class: cls || "ap-xby__a", text: short(m.creator), attrs: { type: "button", title: m.creator, "aria-label": "Show every market asked by " + m.creator } });
    b.addEventListener("click", function () { byCreator(m.creator); });
    return b;
  }
  function card(m) {
    var c = el("article", { class: "s-card s-mcard ap-xcard", attrs: { role: "listitem" } });
    c.appendChild(el("div", { class: "s-card__head" }, U.avatar("grid"),
      el("a", { class: "s-card__title", href: link(m), text: clip(m.title, 120), attrs: { target: "_blank", rel: "noopener noreferrer", title: m.title.length > 120 ? m.title : null, "aria-label": m.title + " (opens on Seer)" } })));
    c.appendChild(body4(m));
    var bot = el("div", { class: "ap-cbot" }), row = el("div", { class: "ap-crow" });
    row.appendChild(U.stateBadge(m.state));
    if (m.verify !== "none") row.appendChild(U.verifyBadge(m.verify));
    if (m.cond) row.appendChild(el("span", { class: "s-tag s-tag--violet", text: "Conditional" }));
    if (m.fut) row.appendChild(el("span", { class: "s-tag s-tag--violet", text: "Futarchy" }));
    bot.appendChild(row);
    bot.appendChild(el("div", { class: "s-specs ap-cspec" }, el("span", { text: KIND_NAME[m.kind] }), el("span", { text: CH[m.chain][0] }), m.coll ? el("span", { class: "ap-nc", text: m.coll }) : null));
    if (m.creator) bot.appendChild(el("p", { class: "ap-xby" }, el("span", { class: "ap-xby__k", text: "Asked by" }), asker(m), m.created ? el("span", { class: "ap-xby__d", text: " · " + day(m.created, true) }) : null));
    var metaEl = el("div", { class: "s-card__meta" }, el("span", { text: usd(m.vol) + " Vol." }), el("span", { text: usd(m.liq) + " liq" }),
      m.opening && m.state === "not-open" ? el("span", { text: "Reports " + day(m.opening, true) }) : null);
    bot.appendChild(el("div", { class: "s-card__foot" }, metaEl, el("div", { class: "s-card__icons" },
      el("a", { class: "ap-xgo", href: link(m), html: S.icon("external", 15), attrs: { target: "_blank", rel: "noopener noreferrer", "aria-label": "Open on Seer: " + clip(m.title, 80) } }))));
    c.appendChild(bot);
    return c;
  }
  function renderTable(list) {
    var box = el("div", { class: "ap-table-tight ap-xtable" }); res.appendChild(box);
    U.table(box, [
      { key: "title", label: "Market", class: "ap-wrap", sort: function (m) { return m.title.toLowerCase(); }, render: function (m) {
        return el("span", { class: "ap-mcell" }, U.avatar("grid"), el("span", {},
          el("a", { class: "ap-xt", href: link(m), text: clip(m.title, 140), attrs: { target: "_blank", rel: "noopener noreferrer", title: m.title, "aria-label": m.title + " (opens on Seer)" } }),
          el("small", {}, m.creator ? "Asked by " : "", m.creator ? asker(m, "ap-xby__a ap-xby__a--t") : null, (m.created ? (m.creator ? " · " : "") + day(m.created, true) : "") + (m.cond ? " · conditional" : ""))));
      } },
      { key: "kind", label: "Type", sort: function (m) { return m.kind; }, render: function (m) { return el("span", { class: "s-tag", text: KIND_NAME[m.kind] }); } },
      { key: "state", label: "State", sort: function (m) { return m.state; }, render: function (m) { return U.stateBadge(m.state); } },
      { key: "chain", label: "Chain", sort: function (m) { return CH[m.chain][0]; }, render: function (m) { return U.chainBadge(CH[m.chain][1]); } },
      { key: "lead", label: "Leading", class: "ap-xlead", render: function (m) { return lead(m); } },
      { key: "liq", label: "Liquidity", num: true, sort: true, render: function (m) { return usd(m.liq); } },
      { key: "vol", label: "Volume", num: true, sort: true, render: function (m) { return usd(m.vol); } },
      { key: "oi", label: "Open int.", num: true, sort: true, class: "col-xl", render: function (m) { return usd(m.oi); } },
      { key: "opening", label: "Reports open", num: true, sort: function (m) { return m.opening || 0; }, render: function (m) { return m.opening ? day(m.opening, true) : "—"; } }
    ], { rows: list, caption: "Markets on Seer matching the current filters" });
  }

  /* ---------- controls ---------- */
  var ctrls = {};
  function fsel(key, label, opts) {
    var s = el("select", { class: "s-select", attrs: { "aria-label": label } });
    opts.forEach(function (o) { s.appendChild(el("option", { text: o[1], attrs: { value: o[0] } })); });
    s.value = Q[key];
    var w = el("label", { class: "ap-fsel" }, el("span", { text: label }), s);
    s.addEventListener("change", function () { Q[key] = s.value; changed(); });
    ctrls[key] = { sel: s, wrap: w };
    return w;
  }
  function fswitch(key, label) {
    var i = el("input", { attrs: { type: "checkbox" } }); i.checked = !!Q[key];
    i.addEventListener("change", function () { Q[key] = i.checked; changed(); });
    ctrls[key] = { input: i };
    return el("label", { class: "s-switch" }, i, label);
  }
  function syncCtrls() {
    Object.keys(ctrls).forEach(function (k) {
      var c = ctrls[k];
      if (c.sel) { c.sel.value = Q[k]; c.wrap.classList.toggle("is-set", k !== "sort" && Q[k] !== DEF[k]); }
      else if (c.input) c.input.checked = !!Q[k];
    });
    if (kindRow) $$(".s-chip", kindRow).forEach(function (b, i) { b.setAttribute("aria-pressed", String(KINDS[i][0] === kind)); });
  }
  function actives() {
    var out = [], lab = function (list, v) { for (var i = 0; i < list.length; i++) if (list[i][0] === v) return list[i][1]; return v; };
    if (Q.creator) out.push(["creator", "Asked by " + short(Q.creator)]);
    if (Q.q) out.push(["q", "Search: “" + clip(Q.q, 24) + "”"]);
    if (kind !== "all") out.push(["kind", KIND_NAME[kind]]);
    if (Q.state !== DEF.state) out.push(["state", lab(STATES, Q.state)]);
    if (Q.chain !== "all") out.push(["chain", CH[+Q.chain][0]]);
    if (Q.verify !== "all") out.push(["verify", "Kleros: " + lab(VERIFY, Q.verify)]);
    if (Q.cond) out.push(["cond", "Conditional only"]);
    if (Q.fut) out.push(["fut", "Futarchy only"]);
    return out;
  }
  function reset(k) {
    if (k === "kind") kind = "all";
    else { Q[k] = DEF[k]; if (k === "q" && window.AP_X_QUERY_RESET) window.AP_X_QUERY_RESET(); }
    if (k === "creator" && /[?&]creator=/.test(location.search) && history.replaceState) {
      try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) { /* fine */ }
    }
    syncCtrls();
  }
  function clearAll() { ["creator", "q", "kind", "state", "chain", "verify", "cond", "fut", "sort"].forEach(reset); changed(); }
  var debounce = null;
  function changed(local) {
    syncCtrls();
    if (local) { render(true); return; }
    clearTimeout(debounce);
    debounce = setTimeout(load, 120);
  }
  function syncToggle(act) {
    var tg = $("#ap-x-ftoggle"); if (!tg) return;
    var nf = act.filter(function (a) { return a[0] !== "q" && a[0] !== "kind" && a[0] !== "creator"; }).length;
    S.clear(tg); tg.insertAdjacentHTML("beforeend", S.icon("filter", 14)); tg.appendChild(document.createTextNode("Filters")); if (nf) tg.appendChild(el("span", { class: "s-count", text: String(nf) }));
  }
  var pendingScroll = false;
  function byCreator(a) {                                   // "Asked by": every market that address has asked, any state
    if (!ADDR.test(a)) return;
    Q.creator = a.toLowerCase(); Q.state = "any"; Q.q = ""; kind = "all";
    if (window.AP_X_QUERY_RESET) window.AP_X_QUERY_RESET();
    pendingScroll = true; changed();
  }
  var kindRow = null;
  (function init() {
    kindRow = U.chipRow(KINDS.map(function (k) { return [k[0], k[1]]; }), kind, function (v) { kind = v; changed(true); });
    $("#ap-x-kinds").appendChild(kindRow);
    var b = $("#ap-x-fbody");
    b.appendChild(fsel("state", "State", STATES));
    b.appendChild(fsel("chain", "Chain", [["all", "All chains"], ["100", "Gnosis"], ["1", "Ethereum"], ["10", "OP Mainnet"], ["8453", "Base"]]));
    b.appendChild(fsel("verify", "Kleros Curate", VERIFY));
    b.appendChild(fswitch("cond", "Conditional only"));
    b.appendChild(fswitch("fut", "Futarchy only"));
    var end = $("#ap-x-fend");
    end.appendChild(fsel("sort", "Sort", SORTS));
    end.appendChild(U.seg([["cards", "Cards"], ["table", "Table"]], view, function (v) { view = v; try { localStorage.setItem("ap-x-view", v); } catch (e) { /* fine */ } render(true); }, "Results view"));
    var tg = $("#ap-x-ftoggle");
    tg.addEventListener("click", function () { var open = !b.classList.contains("is-open"); b.classList.toggle("is-open", open); tg.setAttribute("aria-expanded", String(open)); });
    syncCtrls();
  })();

  // the page's search box (page.js) hands word queries here: Seer's own search over every market's title
  window.AP_X = {
    search: function (raw) {
      var q = clean(String(raw || ""), 60);
      if (q.length < 3 || !/[a-z\u00c0-\u024f]{3}/i.test(q) || /^0x/i.test(q) || /^#?\d+$/.test(q) || /^p-?\d{1,2}$/i.test(q.replace(/\s+/g, ""))) q = "";
      if (q === Q.q) return;
      Q.q = q; clearTimeout(debounce); syncCtrls();
      debounce = setTimeout(load, DEBOUNCE);
    },
    byCreator: byCreator
  };

  // first paint: the snapshot's first page at once (labelled), then the live answer
  if (XS) { var first = snapRows().filter(matchServer); if (first.length) { rows = snapSort(first); mode = "loading"; render(true); } }
  if (Q.creator) pendingScroll = true;
  load();
})();
