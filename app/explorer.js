/* Seer App · Markets: the explorer itself, on Seer's real markets, across Seer's interfaces.
   Concept by Swift Bot Labs. Not affiliated with Seer.

   Seer is a two-sided marketplace: information seekers who need an answer, and traders who put capital behind a forecast.
   The explorer reads every market both ways (the lens at its top): "Information seekers" leads with what the market says and
   how much liquidity stands behind it; "Traders" leads with prices, liquidity, volume and dates. Every market opens a detail
   drawer (?market=<chain>:<0x…>) that answers the three questions: who is asking, what it prices, how to use the signal,
   with a seekers' panel and a traders' panel side by side, and "Trade on Seer" as the way out. AP_X.lookup answers the page's
   search box for a pasted market or asker address (any chain, any state).

   Every filter but the market type is a field of Seer's own public markets API (POST app.seer.pm/.netlify/functions/markets-search,
   the request Seer's app makes): interface (type, creator + marketName, marketIds), state (marketStatusList), chain (chainsList),
   Kleros Curate (verificationStatusList), conditional only (showConditionalMarkets), search (marketName), asked by (creator)
   and the sort (orderBy). One page is 24 markets, as on Seer; "Load 24 more" asks for the next page. The market type is
   filtered here, on the loaded rows.

   Interface: which Seer interface a market belongs to, derived only from the market's own fields and the interfaces' own
   lists, never guessed: Risk Pricing = a market risk.seer.pm's API lists (risk/snapshot.js, hourly); Opportunity = the three
   linked AI job board markets and the settled Rebrand Contest market that opportunity.seer.pm runs on; Futarchy = Seer's
   futarchy market type; Deep = asked by 0x00dc…36e0 (the creator of deep.seer.pm's Round 3 markets) with "Deep Funding" in
   the question; Seer app = listed on app.seer.pm with nothing in its data pointing to another interface; Not identified =
   the data lacks the fields to tell.

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
  var RSNAP = window.SEER_RISK_SNAPSHOT && typeof window.SEER_RISK_SNAPSHOT === "object" ? window.SEER_RISK_SNAPSHOT : null;
  var DSNAP = window.SEER_DEEP_R3 && typeof window.SEER_DEEP_R3 === "object" ? window.SEER_DEEP_R3 : null;

  var API = "https://app.seer.pm/.netlify/functions/markets-search";
  var PAGE = 24, MAX_PAGES = 10, FALLBACK_MS = 4000, ABORT_MS = 12000, MAX_BYTES = 1500000, ONE_BYTES = 400000, DEBOUNCE = 380;
  var CH = { 1: ["Ethereum", "ethereum"], 10: ["OP Mainnet", "optimism"], 100: ["Gnosis", "gnosis"], 8453: ["Base", "base"] };
  // each chain's block explorer, only where its address page answers a plain request (checked 23 Oct 2026)
  var SCAN = { 1: ["https://etherscan.io/address/", "Etherscan"], 100: ["https://gnosisscan.io/address/", "Gnosisscan"],
    10: ["https://optimism.blockscout.com/address/", "Blockscout"], 8453: ["https://base.blockscout.com/address/", "Blockscout"] };
  var COLL = { "100:0xaf204776c7245bf4147c2612bf6e5972ee483701": "sDAI", "100:0xe91d153e0b41518a2ce8dd3d7944fa863463a97d": "xDAI",
    "1:0x83f20f44975d03b1b09e64809b757c47f942beea": "sDAI" };
  var ZERO = "0x0000000000000000000000000000000000000000";
  var ADDR = /^0x[0-9a-fA-F]{40}$/, HEX32 = /^0x[0-9a-fA-F]{64}$/;
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
  var KINDS = [["all", "All types"], ["categorical", "Categorical"], ["multi-categorical", "Multi-categorical"], ["scalar", "Scalar"], ["multi-scalar", "Multi-scalar"], ["futarchy", "Futarchy"]];
  var KIND_NAME = { categorical: "Categorical", "multi-categorical": "Multi-categorical", scalar: "Scalar", "multi-scalar": "Multi-scalar", futarchy: "Futarchy" };

  /* ---------- interfaces: which Seer app a market belongs to, from its own fields and the apps' own lists ---------- */
  var IF = {
    app: { name: "Seer app", host: "app.seer.pm", glyph: "app", page: null },
    futarchy: { name: "Futarchy", host: "futarchy.seer.pm", glyph: "futarchy", page: "../futarchy/" },
    deep: { name: "Deep", host: "deep.seer.pm", glyph: "deep", page: "../deep/" },
    risk: { name: "Risk Pricing", host: "risk.seer.pm", glyph: "risk", page: "../risk/" },
    opportunity: { name: "Opportunity", host: "opportunity.seer.pm", glyph: "opportunity", page: "../opportunity/" },
    unknown: { name: "Not identified", host: null, glyph: "app", page: null }
  };
  var DEEP_ASKER = "0x00dc3e0acadb8dba21bb08ff30540222ff8836e0";   // created all 98 Round 3 markets on deep.seer.pm (Seer's API, 21 Oct)
  var OPP = { "100:0x8b3c7f3f09f6a85353926d8ee0f12decc1c9a5e8": "jobs", "100:0xf6a42af200c181df45e0f3fd49d58f5d57bb7d35": "jobs",
    "100:0x144364db8edd6225248fe9d02f77ecc3ec0e4c4c": "jobs", "100:0xe7850b0d928aa40ab8732bd323fa4f6ef3c24b8a": "rebrand" };
  var RISK = {};                                                      // "100:0x…" -> "2026-Q3", from risk.seer.pm's /markets list
  (function () {
    if (!RSNAP || RSNAP.chainId !== 100 || !Array.isArray(RSNAP.markets)) return;
    RSNAP.markets.slice(0, 40).forEach(function (x) {
      if (x && typeof x.id === "string" && ADDR.test(x.id) && typeof x.quarter === "string" && /^\d{4}-Q[1-4]$/.test(x.quarter)) RISK["100:" + x.id.toLowerCase()] = x.quarter;
    });
  })();
  // Deep's Round 3 markets carry no price in Seer's markets API; deep.seer.pm's own feed (deep/round3.js, hourly) does
  var DEEP = {}, DEEP_AT = null;                                      // "10:0x…" -> [UP, DOWN] prices, 0-1
  (function () {
    if (!DSNAP || DSNAP.chainId !== 10 || !Array.isArray(DSNAP.repos)) return;
    var t = typeof DSNAP.fetchedAt === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(DSNAP.fetchedAt) ? Date.parse(DSNAP.fetchedAt) : NaN;
    if (!(t > 1.7e12 && t < Date.now() + 864e5)) return;
    DEEP_AT = t;
    DSNAP.repos.slice(0, 400).forEach(function (r) {
      if (!Array.isArray(r) || typeof r[3] !== "string" || !ADDR.test(r[3])) return;
      var up = r[1], dn = r[2];
      if (typeof up === "number" && typeof dn === "number" && isFinite(up) && isFinite(dn) && up >= 0 && up <= 1 && dn >= 0 && dn <= 1 && up + dn > 0) DEEP["10:" + r[3].toLowerCase()] = [up, dn];
    });
  })();
  function idsOf(map) { return Object.keys(map).map(function (k) { return k.split(":")[1]; }); }
  var IFACES = [["all", "All interfaces"], ["app", "Seer app"], ["futarchy", "Futarchy"], ["deep", "Deep"]];
  if (Object.keys(RISK).length) IFACES.push(["risk", "Risk Pricing"]);
  IFACES.push(["opportunity", "Opportunity"]);
  function ifaceOf(o) {                                     // -> [key, why], read only from the market's own fields
    var k = o.chain + ":" + o.id;
    if (own(RISK, k)) return ["risk", "risk.seer.pm's own API lists this market as its " + RISK[k].replace("-", " ") + " board."];
    if (own(DEEP, k)) return ["deep", "Listed in deep.seer.pm's own Round 3 feed, which also prices it (hourly snapshot)."];
    if (own(OPP, k)) return ["opportunity", OPP[k] === "rebrand" ? "The Seer Rebrand Contest market, archived on opportunity.seer.pm."
      : "One of the three linked markets behind opportunity.seer.pm's AI job board name."];
    if (o.fut) return ["futarchy", "Seer's futarchy market type, the one futarchy.seer.pm's proposals use."];
    if (!o.creator) return ["unknown", "Seer's data for this market carries no valid creator, so it can't be matched to an interface."];
    if (o.creator === DEEP_ASKER && /\bDeep Funding\b/.test(o.title)) return ["deep", "Asked by 0x00dc…36e0, the creator of deep.seer.pm's Round 3 markets, and the question names the Deep Funding experiment."];
    return ["app", "Listed on app.seer.pm; nothing in its data points to another Seer interface."];
  }

  var DEF = { state: "unresolved", chain: "all", verify: "all", sort: "default", cond: false, iface: "all", q: "", creator: "" };
  // Deep and Futarchy open newest first: Deep's newest round, and Futarchy's newest proposals (Seer's own order puts old test markets on top)
  var NEWEST = { deep: "openingTs", futarchy: "creationDate" };

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
    if (o.cond) o.parent = pm.toLowerCase();
    if (!fut && tpl === "1" && nq === 1) {                          // scalar: Seer's own estimate formula (as in live.js)
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
      } else if (own(DEEP, o.chain + ":" + o.id)) {                 // no price in Seer's API: deep.seer.pm's own, the same formula
        var dp = DEEP[o.chain + ":" + o.id], u2 = dp[0], d2 = dp[1], s2 = u2 + d2;
        if (s2 > 1) { u2 = u2 / s2; d2 = d2 / s2; }
        o.scalar.value = Math.round((d2 * lo + u2 * hi) * 100) / 100;
        o.ext = "deep";
      }
    } else if (tpl === "1" || tpl === "2" || tpl === "3") {
      o.kind = fut ? "futarchy" : tpl === "1" ? "multi-scalar" : tpl === "3" ? "multi-categorical" : "categorical";
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
    if (typeof m.collateralToken === "string" && ADDR.test(m.collateralToken)) {
      o.collAddr = m.collateralToken.toLowerCase();
      o.coll = COLL[m.chainId + ":" + o.collAddr] || null;
    }
    if (typeof m.conditionId === "string" && HEX32.test(m.conditionId)) o.condId = m.conditionId.toLowerCase();
    o.qids = (Array.isArray(m.questions) ? m.questions.slice(0, 64) : []).map(function (q) {
      return q && typeof q === "object" && typeof q.id === "string" && HEX32.test(q.id) ? q.id.toLowerCase() : null;
    }).filter(Boolean);
    // its state, from its own fields (payout reported / an arbitration / no answer yet / the answer's finalize time)
    var arb = typeof m.questionsInArbitration === "string" && /^\d{1,6}$/.test(m.questionsInArbitration) ? +m.questionsInArbitration : 0;
    var fin = tsec(m.finalizeTs);
    o.finalize = fin != null && fin > 1e9 && fin < 4.2e9 ? fin * 1000 : null;   // Seer writes a far-future value while no answer is in
    o.state = m.payoutReported === true ? "closed" : arb > 0 ? "dispute"
      : m.hasAnswers !== true ? (o.opening && o.opening > now ? "not-open" : "open")
      : fin != null && fin * 1000 > now ? "waiting" : "pending";
    var f = ifaceOf(o); o.iface = f[0]; o.ifWhy = f[1];
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
  function keyOf(m) { return m.chain + ":" + m.id; }
  function link(m) { return "https://app.seer.pm/markets/" + m.chain + "/" + m.id; } // chain + id validated in normalize()
  function detailHref(m) { return "?market=" + keyOf(m) + "#markets"; }
  function collName(m) { return m.coll || "unit of collateral"; }
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

  /* ---------- the seekers' reading: what a market says, and how much stands behind it (our wording, Seer's numbers) ---------- */
  function reading(m) {
    if (m.kind === "scalar") {
      var c = m.scalar, un = c.unit ? " " + c.unit : "";
      return c.value == null ? "No price yet, so no estimate: the range is " + nm(c.min) + " to " + nm(c.max) + un + "."
        : "The market expects about " + nm(c.value) + un + ", on a range of " + nm(c.min) + " to " + nm(c.max) + "." + (m.ext === "deep" ? " Priced on deep.seer.pm." : "");
    }
    if (!m.priced) return m.fut ? "Seer's markets API gives no price for this futarchy market, so there is no reading to take here."
      : "No price yet: Seer shows prices once the market has liquidity, so there is no reading to take.";
    if (m.fut) return "Seer's API prices its conditional tokens; the top one is " + clip(m.outs[0][0], 30) + " at " + pct(m.outs[0][1]) + ".";
    var a = m.outs[0], b = m.outs[1];
    if (m.yesno) {
      var y = a[1];
      return "The market puts Yes at " + pct(y) + ": " + (y >= 85 ? "it expects Yes" : y >= 60 ? "it leans Yes" : y > 40 ? "close to a coin flip" : y > 15 ? "it leans No" : "it expects No") + ".";
    }
    if (m.kind === "multi-categorical") return "Several answers can win and share the payout. Highest priced: " + clip(a[0], 40) + " at " + cents(a[1]) + (b ? ", then " + clip(b[0], 30) + " at " + cents(b[1]) : "") + ".";
    if (m.kind === "multi-scalar") return "Each answer's expected share of the total: " + clip(a[0], 40) + " leads at " + pct(a[1]) + (b ? ", then " + clip(b[0], 30) + " at " + pct(b[1]) : "") + ".";
    return "Most likely: " + clip(a[0], 40) + " at " + pct(a[1]) + (b ? ", then " + clip(b[0], 30) + " at " + pct(b[1]) : "") + ".";
  }
  function hasPrice(m) { return m.kind === "scalar" ? m.scalar.value != null : !!m.priced; }
  // our rule of thumb, said as one: under $1K of liquidity low, $1K-10K moderate, $10K and up high
  function depth(m) {
    if (!hasPrice(m)) return { k: "none", label: "No price yet", note: "Nothing to read until the market has liquidity and a price." };
    if (m.ext === "deep") return { k: "none", label: "Liquidity not in Seer's API", note: "Priced on deep.seer.pm. Seer's markets API reports no liquidity for this market, so this page can't say how much stands behind the price." };
    var l = m.liq;
    if (l < 1000) return { k: "low", label: "Low liquidity", note: "A small trade can move this price: read it as a rough lean, not a settled view." };
    if (l < 10000) return { k: "mid", label: "Moderate liquidity", note: "A larger trade can still move this price: compare it with related markets before leaning on it." };
    return { k: "high", label: "High liquidity", note: "Moving this price takes real capital, so it carries more weight. It is still a forecast, not a fact." };
  }
  function stateNote(m) {
    switch (m.state) {
      case "not-open": return "Reports open " + (m.opening ? day(m.opening, true) + ", " + hhmm(m.opening) : "later") + ": nobody can answer before then, so for now the price is the only answer.";
      case "open": return "Reports are open: anyone can post the answer on Reality.eth now. Until one is final, the price is still a forecast.";
      case "waiting": return "An answer has been posted. It becomes final" + (m.finalize ? " on " + day(m.finalize, true) + ", " + hhmm(m.finalize) : "") + " unless someone challenges it with a higher bond.";
      case "dispute": return "The answer is in arbitration with Kleros: the market waits for its ruling.";
      case "pending": return "The answer is final; the market waits for its payout to be reported, then winners redeem.";
      case "closed": return "Resolved: the outcome is decided, so the price is no longer a forecast.";
    }
    return "";
  }
  function whatPrices(m) {
    var c = collName(m);
    if (m.fut) return "A futarchy proposal: conditional tokens that pay out only if the proposal passes (Yes-) or fails (No-), so the two sides can be compared.";
    if (m.kind === "scalar") return "Where the answer will land between " + nm(m.scalar.min) + " and " + nm(m.scalar.max) + (m.scalar.unit ? " " + m.scalar.unit : "") + ": UP pays more the higher it lands, DOWN the lower, and their prices give the expected value.";
    if (m.yesno) return "The chance it resolves Yes: a Yes share pays 1 " + c + " if it does.";
    if (m.kind === "multi-categorical") return "Each of its " + m.n + " answers' expected share of the payout: several can win and split it.";
    if (m.kind === "multi-scalar") return "How a total splits between its " + m.n + " answers: each price is that answer's expected share.";
    return "The chance of each of its " + m.n + " answers: a share of the right answer pays 1 " + c + ".";
  }

  /* ---------- state ---------- */
  var Q = {}; Object.keys(DEF).forEach(function (k) { Q[k] = DEF[k]; });
  var kind = "all", view = "cards", lens = "seeker";
  function param(name, re) { var r = new RegExp("[?&]" + name + "=(" + re + ")(?:&|$)").exec(location.search); return r ? r[1] : null; }
  (function () {                                            // the viewer's last view and lens win; wide screens open on the table
    var sv = null, sl = null; try { sv = localStorage.getItem("ap-x-view"); sl = localStorage.getItem("ap-x-lens"); } catch (e) { /* private mode: fine */ }
    view = sv === "table" || sv === "cards" ? sv : (window.matchMedia && matchMedia("(min-width: 1200px)").matches ? "table" : "cards");
    if (sl === "seeker" || sl === "trader") lens = sl;
    var pl = param("lens", "seeker|trader"); if (pl) lens = pl;
    var pi = param("iface", "[a-z]{2,12}"); if (pi && IFACES.some(function (x) { return x[0] === pi; })) { Q.iface = pi; if (NEWEST[pi]) Q.sort = NEWEST[pi]; }
    var r = param("creator", "0x[0-9a-fA-F]{40}");          // ?creator=0x… (from "Asked by" links): open on that asker's markets
    if (r && r.toLowerCase() !== ZERO) { Q.creator = r.toLowerCase(); Q.state = "any"; Q.iface = "all"; }
  })();
  var rows = [], count = null, mode = "loading", at = null, page = 1, seq = 0, more = "idle", allCards = false;
  var PHONE = window.matchMedia ? window.matchMedia("(max-width: 640px)") : null;
  var known = {}, knownKeys = [];                           // every market this page has normalized, for the detail drawer
  function remember(m) { var k = keyOf(m); if (!own(known, k)) { knownKeys.push(k); if (knownKeys.length > 400) delete known[knownKeys.shift()]; } known[k] = m; }

  function filt(b) {                                        // the state, chain, Kleros and conditional filters, as Seer's API fields
    if (Q.state === "unresolved") b.marketStatusList = ["not_open", "open", "answer_not_final", "in_dispute", "pending_execution"];
    else if (API_STATE[Q.state]) b.marketStatusList = [API_STATE[Q.state]];
    if (Q.chain !== "all") b.chainsList = [Q.chain];
    if (API_VERIFY[Q.verify]) b.verificationStatusList = [API_VERIFY[Q.verify]];
    if (Q.cond) b.showConditionalMarkets = true;
    return b;
  }
  function body(p) {
    var f = Q.iface, b = filt({ limit: PAGE, page: p });
    if (f === "futarchy") b.type = "Futarchy"; else if (f === "app" || f === "deep") b.type = "Generic";
    if (f === "risk") b.marketIds = idsOf(RISK); else if (f === "opportunity") b.marketIds = idsOf(OPP);
    if (f === "deep") { b.creator = DEEP_ASKER; b.marketName = Q.q || "Deep Funding"; }
    else { if (Q.q) b.marketName = Q.q; if (Q.creator) b.creator = Q.creator; }
    if (Q.sort !== "default") { b.orderBy = Q.sort; b.orderDirection = "desc"; }
    return b;
  }
  function isDefault() { return Object.keys(DEF).every(function (k) { return Q[k] === DEF[k]; }); }
  // the market type and the interface are checked here on the loaded rows too (Seer app has no server-side filter of its own)
  function matchLocal(m) { return (kind === "all" || m.kind === kind) && (Q.iface === "all" || m.iface === Q.iface); }
  function matchServer(m) {
    if (Q.state === "unresolved" ? m.state === "closed" : Q.state !== "any" && m.state !== Q.state) return false;
    if (Q.chain !== "all" && String(m.chain) !== Q.chain) return false;
    if (Q.verify !== "all" && m.verify !== Q.verify) return false;
    if (Q.cond && !m.cond) return false;
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
  var snapCache = null;
  function snapRows() {
    if (snapCache) return snapCache;
    var now = Date.now();
    snapCache = XS ? XS.markets.slice(0, 60).map(function (m) { return normalize(m, now); }).filter(Boolean) : [];
    snapCache.forEach(function (m) { m.src = "snapshot"; if (!own(known, keyOf(m))) remember(m); });
    return snapCache;
  }
  function snapAt() {
    if (!SNAP) return null;
    if (typeof SNAP.at === "number" && isFinite(SNAP.at) && SNAP.at > 1.7e12 && SNAP.at < Date.now() + 864e5) return SNAP.at;
    return null;
  }

  /* ---------- fetch: one POST to Seer's markets API per slot (the list, one market, one asker's markets) ---------- */
  var CTL = {};
  function post(b, slot, maxBytes) {                        // -> Seer's parsed answer {markets: [...], count}, checked for shape and size
    if (typeof fetch !== "function") return Promise.reject(new Error("no fetch"));
    if (CTL[slot]) CTL[slot].abort();
    var c = typeof AbortController === "function" ? new AbortController() : null, kill = setTimeout(function () { if (c) c.abort(); }, ABORT_MS);
    CTL[slot] = c;
    return fetch(API, {
      method: "POST", mode: "cors", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer", redirect: "error",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(b), signal: c ? c.signal : undefined
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      if (!/application\/json/i.test(r.headers.get("content-type") || "")) throw new Error("not JSON");
      if (+(r.headers.get("content-length") || 0) > maxBytes) throw new Error("too big");
      return r.text();
    }).then(function (t) {
      clearTimeout(kill);
      if (t.length > maxBytes) throw new Error("too big");
      var d = JSON.parse(t);
      if (!d || !Array.isArray(d.markets)) throw new Error("bad shape");
      return d;
    }, function (e) { clearTimeout(kill); throw e; });
  }
  function okN(c) { return typeof c === "number" && isFinite(c) && c >= 0 && c < 1e7 && Math.round(c) === c ? c : null; }
  function seer(b, slot, maxBytes) {
    return post(b, slot, maxBytes).then(function (d) {
      var n = typeof d.count === "number" && isFinite(d.count) && d.count >= 0 && d.count < 1e7 ? Math.round(d.count) : null;
      var now = Date.now(), seen = {}, list = d.markets.slice(0, b.limit).map(function (m) { return normalize(m, now); }).filter(function (m) {
        if (!m) return false; var k = keyOf(m); if (seen[k]) return false; seen[k] = 1; return true;
      });
      list.forEach(function (m) { m.src = "live"; m.at = now; remember(m); });
      return { list: list, count: n };
    });
  }

  /* ---------- interface counts on the chips: Seer's own counts for the current state, chain, Kleros and conditional filters ----------
     Four count-only reads (limit 1; only the numeric "count" is used): every market, type Futarchy, type Generic, and Deep's rule
     (Generic + asked by 0x00dc…36e0 + "Deep Funding"); one read of the Risk Pricing and Opportunity markets by id, counted here.
     Seer app = Generic − Deep − Risk Pricing − Opportunity, our interface rule. Search and asker filters are not counted.
     Fallback: the hourly snapshot's counts (SEER_SNAPSHOT.explore.ifaceCounts, tools/refresh.py), only for the default filters. */
  var CK0 = "unresolved|all|all|0", cseq = 0, cTimer = null, cLive = null, cLiveKey = null, cLiveAt = null;
  function cntKey() { return [Q.state, Q.chain, Q.verify, Q.cond ? 1 : 0].join("|"); }
  function cntOf(all, fut, gen, deep, risk, opp) {        // -> {all, app, futarchy, deep, risk, opportunity}, or null if it doesn't add up
    if ([all, fut, gen, deep, risk, opp].some(function (x) { return okN(x) == null; })) return null;
    var app = gen - deep - risk - opp;
    if (app < 0 || fut > all || gen > all) return null;
    return { all: all, app: app, futarchy: fut, deep: deep, risk: risk, opportunity: opp, rest: Math.max(0, all - fut - gen) };
  }
  var XC = (function () {                                   // the snapshot's counts, checked like a live answer
    var c = XS && XS.ifaceCounts && typeof XS.ifaceCounts === "object" ? XS.ifaceCounts : null;
    if (!c || typeof c.at !== "number" || !(c.at > 1.7e12 && c.at < Date.now() + 864e5)) return null;
    var o = cntOf(c.all, c.futarchy, c.generic, c.deep, c.risk, c.opportunity);
    if (o) o.at = c.at;
    return o;
  })();
  var cSrc = null;
  function paintCounts(c, how, at) {
    if (!ifRow) return;
    $$(".s-chip", ifRow).forEach(function (b, i) {
      var k = IFACES[i] && IFACES[i][0], key = k === "all" ? "all" : k, n = c && own(c, key) ? c[key] : null, sp = b.querySelector(".s-chip__n");
      if (n == null) { if (sp) sp.parentNode.removeChild(sp); b.removeAttribute("aria-label"); b.removeAttribute("title"); return; }
      if (!sp) { sp = el("span", { class: "s-chip__n" }); b.appendChild(sp); }
      sp.textContent = n.toLocaleString("en-US");
      b.setAttribute("aria-label", IFACES[i][1] + ": " + n.toLocaleString("en-US") + " market" + (n === 1 ? "" : "s"));
      b.title = k === "all" ? "Seer's own count for these filters" + (c.rest ? ". It includes " + c.rest.toLocaleString("en-US") + " that are in neither Seer's Generic nor its Futarchy type, so no interface count holds them" : "")
        : k === "app" ? "Seer's general (Generic) markets minus the Deep, Risk Pricing and Opportunity ones: our interface rule"
        : k === "deep" ? "Generic markets asked by 0x00dc…36e0 with “Deep Funding” in the question"
        : k === "futarchy" ? "Seer's futarchy market type" : k === "risk" ? "The risk.seer.pm board markets in Seer's API" : "The AI job board's linked markets and the Rebrand Contest market";
    });
    if (!cSrc) return;
    var st = STATES.filter(function (x) { return x[0] === Q.state; })[0], bits = [st ? st[1].toLowerCase() : Q.state];
    bits.push(Q.chain === "all" ? "all chains" : CH[+Q.chain][0]);
    if (Q.verify !== "all") bits.push("Kleros " + VERIFY.filter(function (x) { return x[0] === Q.verify; })[0][1].toLowerCase());
    if (Q.cond) bits.push("conditional only");
    cSrc.setAttribute("data-state", how);
    cSrc.textContent = how === "live" ? "Counts read live " + hhmm(at) + ": " + bits.join(", ") + (Q.q || Q.creator ? "; search and asker not counted" : "")
      : how === "snapshot" ? (cLiveKey === "error" ? "Seer's API didn't answer: counts" : "Counts") + " from the hourly snapshot, " + day(at, true) + " " + hhmm(at) + ": not resolved yet, all chains"
      : how === "loading" ? "Counting on Seer…"
      : "No counts: Seer's API didn't answer just now";
  }
  function loadCounts() {
    var k = cntKey(), my = ++cseq;
    if (cLive && cLiveKey === k) return paintCounts(cLive, "live", cLiveAt);
    if (XC && k === CK0) paintCounts(XC, "snapshot", XC.at); else paintCounts(null, "loading");
    var base = filt({ limit: 1, page: 1 }), ids = idsOf(RISK).concat(idsOf(OPP));
    function w(x) { var b = {}, p; for (p in base) b[p] = base[p]; for (p in x) b[p] = x[p]; return b; }
    function n(d) { var c = okN(d.count); if (c == null) throw new Error("bad count"); return c; }
    Promise.all([post(w({}), "c-all", ONE_BYTES), post(w({ type: "Futarchy" }), "c-fut", ONE_BYTES), post(w({ type: "Generic" }), "c-gen", ONE_BYTES),
      post(w({ type: "Generic", creator: DEEP_ASKER, marketName: "Deep Funding" }), "c-deep", ONE_BYTES),
      ids.length ? post(w({ marketIds: ids, limit: ids.length + 2 }), "c-ids", ONE_BYTES) : Promise.resolve({ markets: [], count: 0 })
    ]).then(function (r) {
      if (my !== cseq) return;
      var risk = 0, opp = 0, seen = {};
      r[4].markets.slice(0, ids.length + 2).forEach(function (m) {
        if (!m || typeof m !== "object" || typeof m.chainId !== "number" || !own(CH, m.chainId) || typeof m.id !== "string" || !ADDR.test(m.id)) return;
        var key = m.chainId + ":" + m.id.toLowerCase(); if (seen[key]) return; seen[key] = 1;
        if (own(RISK, key)) risk++; else if (own(OPP, key)) opp++;
      });
      var c = cntOf(n(r[0]), n(r[1]), n(r[2]), n(r[3]), risk, opp);
      if (!c) throw new Error("counts don't add up");
      cLive = c; cLiveKey = k; cLiveAt = Date.now();
      paintCounts(c, "live", cLiveAt);
    }).catch(function () {
      if (my !== cseq) return;
      cLive = null; cLiveKey = "error";
      if (XC && cntKey() === CK0) paintCounts(XC, "snapshot", XC.at); else paintCounts(null, "none");
    });
  }
  function countsSoon() { clearTimeout(cTimer); cTimer = setTimeout(loadCounts, 160); }
  var fbTimer = null;
  function load() {                                         // page 1 of the current filters
    var my = ++seq; page = 1; more = "idle"; allCards = false;
    if (mode !== "live" || !rows.length) setSrc("loading");
    root.setAttribute("aria-busy", "true");
    clearTimeout(fbTimer);
    fbTimer = setTimeout(function () { if (my === seq && mode !== "live") showSnapshot("slow"); }, FALLBACK_MS);
    seer(body(1), "list", MAX_BYTES).then(function (r) {
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
    seer(body(p), "list", MAX_BYTES).then(function (r) {
      if (my !== seq) return;
      var have = {}; rows.forEach(function (m) { have[keyOf(m)] = 1; });
      r.list.forEach(function (m) { if (!have[keyOf(m)]) rows.push(m); });
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
    src.appendChild(document.createTextNode(state === "live" ? "Read " + hhmm(at)          // plain while live: the header chip says Live
      : state === "loading" ? "Loading from app.seer.pm…"
      : state === "snapshot" ? "Snapshot · " + (sa ? day(sa, true) + ", " + hhmm(sa) : "dated")
      : "Seer's API is unavailable right now"));
  }
  function render(keepScroll) {
    var shown = rows.filter(matchLocal), sa = snapAt(), snap = mode === "snapshot" || mode === "loading";
    setSrc(mode === "live" ? "live" : mode === "snapshot" ? "snapshot" : mode === "loading" ? "loading" : "none");
    root.setAttribute("aria-busy", "false");
    root.setAttribute("data-mode", mode);
    root.setAttribute("data-lens", lens);
    var ifn = Q.iface !== "all" ? IF[Q.iface].name : null;
    if (meta) meta.textContent = mode === "live"
      ? (Q.creator ? "Every market " + short(Q.creator) + " has asked on Seer" : ifn ? "Seer's markets from " + ifn + (Q.iface === "app" ? " (listed on app.seer.pm, no other interface)" : ", " + IF[Q.iface].host) : isDefault() ? "Every market on Seer, from every interface, that is not resolved yet" : "Seer's markets for these filters") + ", read live from Seer's public markets API."
      : mode === "loading" ? "The explorer's first page from the snapshot" + (sa ? " read " + ago(sa) : "") + ", while live markets load from Seer's public API…"
      : mode === "snapshot" ? "Seer's API " + (root.getAttribute("data-why") === "slow" ? "is slow to answer" : "couldn't be reached") + ", so this is the explorer's first page from the snapshot" + (sa ? " read " + ago(sa) + " (refreshed hourly)" : "") + "; filters apply to its markets."
      : "Seer's API is unavailable right now and no snapshot loaded.";
    // results line: how many, of what; then the active filters as removable pills
    S.clear(bar);
    var n = el("span", { class: "ap-results__n" }, el("b", { text: String(shown.length) }));
    if (mode === "live") n.appendChild(document.createTextNode((shown.length < rows.length ? " of " + rows.length + " loaded" : " shown") + " · " + count.toLocaleString("en-US") + (Q.iface === "app" ? " general markets on Seer, before the interface check" : " on Seer")));
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
        : rows.length ? "None of the " + rows.length + " loaded markets fits " + (kind !== "all" ? "this type" : "this interface") + (count > rows.length ? ". Load more, or clear the filter." : ".") : "Seer has no market for these filters. Clear them, or ask the question yourself on Seer.",
        action: mode === "none" ? { label: "Browse on Seer", href: "https://app.seer.pm/" } : { label: "Clear filters", onClick: clearAll }, motif: "dotgrid", motifOpts: { cols: 12, rows: 6, cell: 20, dissolve: .55 } }));
    } else if (view === "table") renderTable(shown);
    else {
      // phones: the first 6 cards, then one button for the rest of the page (the table and wider screens show the whole page)
      var cut = !allCards && PHONE && PHONE.matches && shown.length > 7;
      var g = el("div", { class: "s-grid s-grid--cards ap-cards ap-xcards", attrs: { role: "list", "aria-label": "Markets on Seer" } });
      (cut ? shown.slice(0, 6) : shown).forEach(function (m) { g.appendChild(lens === "seeker" ? cardSeek(m) : card(m)); });
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
    if (view === "cards" && !allCards && PHONE && PHONE.matches && rows.filter(matchLocal).length > 7) return;  // "Show all" first
    if (page >= MAX_PAGES) { moreRow.appendChild(ext("s-btn s-btn--ghost", "The rest on app.seer.pm", "https://app.seer.pm/", "Browse the rest of Seer's markets (opens app.seer.pm)")); return; }
    var left = count - rows.length, nx = Math.min(PAGE, left);
    var b = el("button", { class: "s-btn s-btn--ghost ap-showall", attrs: { type: "button", "aria-describedby": "ap-x-resbar" } },
      more === "busy" ? "Loading…" : more === "error" ? "Seer didn't answer: try again" : "Load " + nx + " more", el("span", { html: S.icon("chevron-down", 16), style: { display: "inline-flex" } }));
    if (more === "busy") b.disabled = true;
    b.addEventListener("click", loadMore);
    moreRow.appendChild(b);
    moreRow.appendChild(el("span", { class: "t-meta ap-xmore__n", text: left.toLocaleString("en-US") + " more on Seer" }));
  }

  /* the price block of a card: the kit's outcome rows, or the type's own shape; every trade link goes to Seer */
  var SEG = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)"];
  function scalarVis(m) {
    var c = m.scalar, unit = c.unit ? " " + c.unit : "";
    var p = Math.max(0, Math.min(1, (c.value - c.min) / (c.max - c.min)));
    return el("div", { class: "ap-cvis ap-cvis--rng" },
      el("div", { class: "s-row s-row--between" }, el("span", { class: "t-meta", text: "Expected" }), el("b", { class: "t-num ap-cvis__v", text: nm(c.value) + unit })),
      el("div", { class: "ap-rng", attrs: { role: "img", "aria-label": "Expected " + nm(c.value) + unit + " on a range of " + nm(c.min) + " to " + nm(c.max) }, style: { "--p": p.toFixed(4) } },
        el("span", { class: "ap-rng__track" }, el("i")), el("span", { class: "ap-rng__ticks" }, [0, 1, 2, 3, 4].map(function () { return el("i"); })), el("span", { class: "ap-rng__pin" })),
      el("div", { class: "s-row s-row--between t-meta t-num" }, el("span", { text: nm(c.min) }), el("span", { text: nm(c.max) + unit })));
  }
  function stackVis(m, top) {
    var multi = m.kind === "multi-categorical", total = 0, rest = 0;
    m.outs.forEach(function (o) { total += o[1]; });
    if (!(total > 0) || m.n < 3) return null;
    var head = m.outs.slice(0, top || SEG.length);
    m.outs.slice(head.length).forEach(function (o) { rest += o[1]; });
    var stack = el("div", { class: "ap-stack", attrs: { role: "img", "aria-label": (multi ? "Shares of the payout: " : m.kind === "multi-scalar" ? "Shares: " : "Chances: ") + head.map(function (o) { return o[0] + " " + (multi ? cents(o[1]) : pct(o[1])); }).join(", ") + (m.n > head.length ? ", " + (m.n - head.length) + " others" : "") } });
    head.forEach(function (o, i) { stack.appendChild(el("i", { style: { width: (o[1] / total * 100).toFixed(3) + "%", background: SEG[i % SEG.length] }, attrs: { title: o[0] + " · " + (multi ? cents(o[1]) : pct(o[1])) } })); });
    if (rest > 0) stack.appendChild(el("i", { class: "is-rest", style: { width: (rest / total * 100).toFixed(3) + "%" } }));
    return el("div", { class: "ap-cvis ap-cvis--stack" }, stack);
  }
  function sumNote(m) {                                     // a binary market whose two prices don't add up to 100
    if (!m.yesno || !m.priced) return null;
    var sum = m.outs[0][1] + m.outs[1][1];
    if (sum < 99) return el("p", { class: "t-meta ap-xinv", text: "Invalid holds the other " + pct(Math.round((100 - sum) * 10) / 10), attrs: { title: "Yes and No add up to " + pct(sum) + "; Seer leaves the rest to Invalid." } });
    if (sum > 101) return el("p", { class: "t-meta ap-xinv", text: "Yes and No add up to " + cents(Math.round(sum * 10) / 10) + " in Seer's pools today", attrs: { title: "Seer prices each outcome in its own pool, so on a thin market the two can add up to more than 100¢. Shown as Seer reports them." } });
    return null;
  }
  function body4(m) {
    var go = link(m);
    if (m.kind === "scalar") {
      if (m.scalar.value == null) return el("p", { class: "t-meta ap-xnone", text: "No price yet: the range is " + nm(m.scalar.min) + " to " + nm(m.scalar.max) + (m.scalar.unit ? " " + m.scalar.unit : "") + "." });
      return scalarVis(m);
    }
    if (!m.priced) return el("div", { class: "ap-xnone" }, el("p", { class: "t-meta", text: m.fut ? "No price in Seer's markets API for this futarchy market." : "No price yet: Seer shows prices once the market has liquidity." }),
      el("p", { class: "ap-xnone__o", text: m.outs.slice(0, 3).map(function (o) { return clip(o[0], 24); }).join(" · ") + (m.n > 3 ? " · +" + (m.n - 3) : "") }));
    if (m.yesno) {
      var yes = m.outs[0][1], no = m.outs[1][1], box = el("div", {});
      box.appendChild(el("div", { class: "s-mcard__binary" },
        ext("s-btn", "Yes " + cents(yes), go, "Yes at " + cents(yes) + ": trade on Seer (opens app.seer.pm)", true),
        ext("s-btn s-btn--secondary", "No " + cents(no), go, "No at " + cents(no) + ": trade on Seer (opens app.seer.pm)", true)));
      var sn = sumNote(m); if (sn) box.appendChild(sn);
      return box;
    }
    // several answers: one stacked bar of the whole set, then the top two as the kit's outcome rows
    var multi = m.kind === "multi-categorical", wrap = el("div", { class: "s-orows" }), st = stackVis(m);
    if (st) wrap.appendChild(st);
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
  function ifTag(m) { return el("span", { class: "s-tag ap-iftag", data: { iface: m.iface }, title: m.ifWhy }, el("span", { class: "ap-iftag__g", html: S.glyph(IF[m.iface].glyph), attrs: { "aria-hidden": "true" } }), IF[m.iface].name); }
  function opener(m, cls, text, max) {                      // a link that opens the market's detail drawer (and works as a plain URL)
    var a = el("a", { class: cls, href: detailHref(m), text: text || clip(m.title, max || 120), attrs: { title: m.title.length > (max || 120) ? m.title : null, "aria-label": (text ? text + ": " : "") + m.title + " (details)", "aria-haspopup": "dialog" } });
    a.addEventListener("click", function (e) { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return; e.preventDefault(); openDetail(m, true); });
    return a;
  }
  function cardHead(m) {
    return el("div", { class: "s-card__head" }, U.avatar(IF[m.iface].glyph), opener(m, "s-card__title"));
  }
  function badges(m) {
    var row = el("div", { class: "ap-crow" });
    row.appendChild(U.stateBadge(m.state));
    if (m.verify !== "none") row.appendChild(U.verifyBadge(m.verify));
    row.appendChild(ifTag(m));
    if (m.cond) row.appendChild(el("span", { class: "s-tag s-tag--violet", text: "Conditional" }));
    return row;
  }
  function byLine(m) {
    return m.creator ? el("p", { class: "ap-xby" }, el("span", { class: "ap-xby__k", text: "Asked by" }), asker(m), m.created ? el("span", { class: "ap-xby__d", text: " · " + day(m.created, true) }) : null) : null;
  }
  function meter(m, cls) {
    var d = depth(m);
    return el("span", { class: "ap-depth" + (cls ? " " + cls : ""), data: { lv: d.k }, attrs: { title: d.note } },
      el("span", { class: "ap-meter", attrs: { "aria-hidden": "true" } }, el("i"), el("i"), el("i")),
      el("span", { class: "ap-depth__t", text: d.label + (d.k !== "none" ? " · " + usd(m.liq) : "") }));
  }
  // the traders' card: prices first (the kit's market card), every trade link out to Seer
  function card(m) {
    var c = el("article", { class: "s-card s-mcard ap-xcard", attrs: { role: "listitem" } });
    c.appendChild(cardHead(m));
    c.appendChild(body4(m));
    var bot = el("div", { class: "ap-cbot" });
    bot.appendChild(badges(m));
    bot.appendChild(el("div", { class: "s-specs ap-cspec" }, el("span", { text: KIND_NAME[m.kind] }), el("span", { text: CH[m.chain][0] }), m.coll ? el("span", { class: "ap-nc", text: m.coll }) : null));
    var by = byLine(m); if (by) bot.appendChild(by);
    var metaEl = el("div", { class: "s-card__meta" }, el("span", { text: usd(m.vol) + " Vol." }), el("span", m.ext === "deep" ? { text: "priced on deep.seer.pm", attrs: { title: "Seer's markets API has no price or liquidity for this market; the price is deep.seer.pm's own (hourly snapshot)." } } : { text: usd(m.liq) + " liq" }),
      m.opening && m.state === "not-open" ? el("span", { text: "Reports " + day(m.opening, true) }) : null);
    bot.appendChild(el("div", { class: "s-card__foot" }, metaEl, el("div", { class: "s-card__icons" },
      el("a", { class: "ap-xgo", href: link(m), html: S.icon("external", 15), attrs: { target: "_blank", rel: "noopener noreferrer", "aria-label": "Trade on Seer: " + clip(m.title, 80) } }))));
    c.appendChild(bot);
    return c;
  }
  // the seekers' card: what the market says and how much stands behind it, then who asked; details for the rest
  function cardSeek(m) {
    var c = el("article", { class: "s-card s-mcard ap-xcard ap-xcard--seek", attrs: { role: "listitem" } });
    c.appendChild(cardHead(m));
    c.appendChild(el("div", { class: "ap-read" }, el("span", { class: "ap-read__k", text: "What it says" }), el("p", { class: "ap-read__t", text: reading(m) })));
    c.appendChild(meter(m));
    var bot = el("div", { class: "ap-cbot" });
    bot.appendChild(badges(m));
    var by = byLine(m); if (by) bot.appendChild(by);
    bot.appendChild(el("div", { class: "s-card__foot ap-seekfoot" }, opener(m, "s-btn s-btn--secondary s-btn--sm ap-readbtn", "Read the signal"),
      el("a", { class: "ap-xgo", href: link(m), html: S.icon("external", 15), attrs: { target: "_blank", rel: "noopener noreferrer", "aria-label": "Open on Seer: " + clip(m.title, 80) } })));
    c.appendChild(bot);
    return c;
  }
  function mcell(m) {
    return el("span", { class: "ap-mcell" }, U.avatar(IF[m.iface].glyph), el("span", {},
      opener(m, "ap-xt", null, 140),
      el("small", {}, m.creator ? "Asked by " : "", m.creator ? asker(m, "ap-xby__a ap-xby__a--t") : null, (m.created ? (m.creator ? " · " : "") + day(m.created, true) : "") + (m.cond ? " · conditional" : ""))));
  }
  function renderTable(list) {
    var box = el("div", { class: "ap-table-tight ap-xtable" + (lens === "seeker" ? " ap-xtable--seek" : "") }); res.appendChild(box);
    var mk = { key: "title", label: "Market", class: "ap-wrap", sort: function (m) { return m.title.toLowerCase(); }, render: mcell };
    var ifc = { key: "iface", label: "Interface", sort: function (m) { return IF[m.iface].name; }, render: ifTag };
    var st = { key: "state", label: "State", sort: function (m) { return m.state; }, render: function (m) { return U.stateBadge(m.state); } };
    var cols = lens === "seeker" ? [mk, ifc,
      { key: "says", label: "What it says", class: "ap-wrap ap-xsays", render: function (m) { return clip(reading(m), 120); } },
      { key: "liq", label: "Liquidity behind it", num: true, sort: true, render: function (m) { return meter(m, "ap-depth--t"); } },
      st]
      : [mk, ifc,
      { key: "kind", label: "Type", sort: function (m) { return m.kind; }, render: function (m) { return el("span", { class: "s-tag", text: KIND_NAME[m.kind] }); } },
      st,
      { key: "chain", label: "Chain", class: "col-xl", sort: function (m) { return CH[m.chain][0]; }, render: function (m) { return U.chainBadge(CH[m.chain][1]); } },
      { key: "lead", label: "Leading", class: "ap-xlead", render: function (m) { return lead(m); } },
      { key: "liq", label: "Liquidity", num: true, sort: true, render: function (m) { return m.ext === "deep" ? el("span", { text: "—", attrs: { title: "Not in Seer's markets API: this market is priced on deep.seer.pm" } }) : usd(m.liq); } },
      { key: "vol", label: "Volume", num: true, sort: true, render: function (m) { return usd(m.vol); } },
      { key: "oi", label: "Open int.", num: true, sort: true, class: "col-xl", render: function (m) { return usd(m.oi); } },
      { key: "opening", label: "Reports open", num: true, sort: function (m) { return m.opening || 0; }, render: function (m) { return m.opening ? day(m.opening, true) : "—"; } }];
    U.table(box, cols, { rows: list, caption: (lens === "seeker" ? "What each market says, for information seekers" : "Prices and liquidity, for traders") + ": markets on Seer matching the current filters",
      onRow: function (m) { openDetail(m, true); } });
  }

  /* ---------- controls ---------- */
  var ctrls = {};
  function fsel(key, label, opts, local) {
    var s = el("select", { class: "s-select", attrs: { "aria-label": label } });
    opts.forEach(function (o) { s.appendChild(el("option", { text: o[1], attrs: { value: o[0] } })); });
    s.value = key === "kind" ? kind : Q[key];
    var w = el("label", { class: "ap-fsel" }, el("span", { text: label }), s);
    s.addEventListener("change", function () { if (key === "kind") kind = s.value; else Q[key] = s.value; changed(!!local); });
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
      var c = ctrls[k], v = k === "kind" ? kind : Q[k], d = k === "kind" ? "all" : DEF[k];
      if (c.sel) { c.sel.value = v; c.wrap.classList.toggle("is-set", k !== "sort" && v !== d); }
      else if (c.input) c.input.checked = !!v;
    });
    if (ifRow) $$(".s-chip", ifRow).forEach(function (b, i) { b.setAttribute("aria-pressed", String(IFACES[i][0] === Q.iface)); });
    if (lensBox) $$("button", lensBox).forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-lens") === lens)); });
  }
  function actives() {
    var out = [], lab = function (list, v) { for (var i = 0; i < list.length; i++) if (list[i][0] === v) return list[i][1]; return v; };
    if (Q.creator) out.push(["creator", "Asked by " + short(Q.creator)]);
    if (Q.iface !== "all") out.push(["iface", "Interface: " + IF[Q.iface].name]);
    if (Q.q) out.push(["q", "Search: “" + clip(Q.q, 24) + "”"]);
    if (kind !== "all") out.push(["kind", KIND_NAME[kind]]);
    if (Q.state !== DEF.state) out.push(["state", lab(STATES, Q.state)]);
    if (Q.chain !== "all") out.push(["chain", CH[+Q.chain][0]]);
    if (Q.verify !== "all") out.push(["verify", "Kleros: " + lab(VERIFY, Q.verify)]);
    if (Q.cond) out.push(["cond", "Conditional only"]);
    return out;
  }
  function reset(k) {
    if (k === "kind") kind = "all";
    else { Q[k] = DEF[k]; if (k === "q" && window.AP_X_QUERY_RESET) window.AP_X_QUERY_RESET(); }
    if (k === "creator") dropParam("creator");
    if (k === "iface") dropParam("iface");
    syncCtrls();
  }
  function dropParam(name) {
    if (!history.replaceState || location.search.indexOf(name + "=") < 0) return;
    var s = location.search.replace(/^\?/, "").split("&").filter(function (p) { return p && p.indexOf(name + "=") !== 0; });
    try { history.replaceState(history.state, "", location.pathname + (s.length ? "?" + s.join("&") : "") + location.hash); } catch (e) { /* fine */ }
  }
  function clearAll() { ["creator", "iface", "q", "kind", "state", "chain", "verify", "cond", "sort"].forEach(reset); changed(); }
  var debounce = null;
  function changed(local) {
    syncCtrls();
    if (local) { render(true); return; }
    clearTimeout(debounce);
    debounce = setTimeout(load, 120);
    if (cntKey() !== cLiveKey) countsSoon();
  }
  function syncToggle(act) {
    var tg = $("#ap-x-ftoggle"); if (!tg) return;
    var nf = act.filter(function (a) { return a[0] !== "q" && a[0] !== "iface" && a[0] !== "creator"; }).length;
    S.clear(tg); tg.insertAdjacentHTML("beforeend", S.icon("filter", 14)); tg.appendChild(document.createTextNode("Filters")); if (nf) tg.appendChild(el("span", { class: "s-count", text: String(nf) }));
  }
  var pendingScroll = false;
  function byCreator(a) {                                   // "Asked by": every market that address has asked, any state, any interface
    if (!ADDR.test(a)) return;
    Q.creator = a.toLowerCase(); Q.state = "any"; Q.q = ""; Q.iface = "all"; kind = "all";
    if (window.AP_X_QUERY_RESET) window.AP_X_QUERY_RESET();
    pendingScroll = true; changed();
  }
  function setIface(v) {
    if (v === Q.iface) return;
    if (NEWEST[Q.iface] && Q.sort === NEWEST[Q.iface]) Q.sort = "default";
    if (NEWEST[v] && Q.sort === "default") Q.sort = NEWEST[v];
    Q.iface = v; if (v !== "all" && Q.creator) reset("creator");
    if (v !== "all") kind = "all";
    changed();
  }
  function setLens(v) {
    if (v !== "seeker" && v !== "trader") return;
    lens = v; try { localStorage.setItem("ap-x-lens", v); } catch (e) { /* fine */ }
    syncCtrls(); render(true);
  }
  var ifRow = null, lensBox = null;
  (function init() {
    // the two sides of the marketplace: one switch decides what every card and row leads with
    lensBox = $("#ap-x-lens");
    if (lensBox) {
      [["seeker", "Information seekers", "What each market says, and how much backs it"], ["trader", "Traders", "Prices, liquidity, volume and dates"]].forEach(function (l) {
        var b = el("button", { class: "ap-lens__b", attrs: { type: "button", "aria-pressed": String(l[0] === lens), "data-lens": l[0] } },
          el("span", { class: "ap-lens__k", text: "For" }), el("b", { text: l[1] }), el("small", { text: l[2] }));
        b.addEventListener("click", function () { setLens(l[0]); });
        lensBox.appendChild(b);
      });
    }
    ifRow = U.chipRow(IFACES.map(function (k) { return [k[0], k[1]]; }), Q.iface, setIface);
    $$(".s-chiprow__track", ifRow).forEach(function (t) { t.setAttribute("aria-labelledby", "ap-x-iface-k"); });
    $$(".s-icon-btn", ifRow).forEach(function (b, i) { b.setAttribute("aria-label", i ? "Scroll interfaces right" : "Scroll interfaces left"); });
    var ifb = $("#ap-x-ifaces"); if (ifb) ifb.appendChild(ifRow);
    cSrc = $("#ap-x-iface-src");
    var b = $("#ap-x-fbody");
    b.appendChild(fsel("state", "State", STATES));
    b.appendChild(fsel("chain", "Chain", [["all", "All chains"], ["100", "Gnosis"], ["1", "Ethereum"], ["10", "OP Mainnet"], ["8453", "Base"]]));
    b.appendChild(fsel("kind", "Type", KINDS, true));
    b.appendChild(fsel("verify", "Kleros Curate", VERIFY));
    b.appendChild(fswitch("cond", "Conditional only"));
    var end = $("#ap-x-fend");
    end.appendChild(fsel("sort", "Sort", SORTS));
    end.appendChild(U.seg([["cards", "Cards"], ["table", "Table"]], view, function (v) { view = v; try { localStorage.setItem("ap-x-view", v); } catch (e) { /* fine */ } render(true); }, "Results view"));
    var tg = $("#ap-x-ftoggle");
    tg.addEventListener("click", function () { var open = !b.classList.contains("is-open"); b.classList.toggle("is-open", open); tg.setAttribute("aria-expanded", String(open)); });
    syncCtrls();
  })();

  /* ---------- the market detail drawer: who is asking, what it prices, how to use the signal; then both sides ---------- */
  var drawer = $("#ap-x-drawer"), dpanel = $("#ap-x-dpanel"), lastFocus = null, curKey = null;
  var askers = {}, askerKeys = [];                          // creator -> {count, list}
  function sec(title, kicker, kids) {
    return el("section", { class: "ap-dsec", attrs: { "aria-label": title } },
      el("div", { class: "ap-dsec__h" }, el("span", { class: "ap-dsec__n", text: kicker }), el("h3", { class: "ap-dsec__t", text: title })), kids);
  }
  function scanLink(chain, a, text) {
    var s = SCAN[chain];
    return s ? el("a", { class: "ap-daddr", href: s[0] + a, text: text || short(a), attrs: { title: a, target: "_blank", rel: "noopener noreferrer", "aria-label": a + " on " + s[1] + " (opens in a new tab)" } })
      : el("span", { class: "ap-daddr", text: text || short(a), attrs: { title: a } });
  }
  function copyBtn(v, what) { return el("button", { class: "s-addr__copy ap-dcopy", html: S.icon("copy", 13), attrs: { type: "button", "data-copy": v, "aria-label": "Copy " + what } }); }
  function dtop(m, specs) {
    var close = el("button", { class: "s-icon-btn ap-dclose", attrs: { type: "button", "aria-label": "Close market details" }, html: S.icon("close", 18) });
    close.addEventListener("click", function () { closeDetail(false); });
    return el("div", { class: "ap-dtop" }, U.specs(specs), close);
  }
  function renderLoading(chain, id) {
    S.clear(dpanel);
    dpanel.appendChild(dtop(null, ["Market", CH[chain][0], short(id)]));
    dpanel.appendChild(el("h2", { class: "ap-dtitle", attrs: { id: "ap-d-title" }, text: "Reading this market from app.seer.pm…" }));
    dpanel.appendChild(U.skeleton("row", 4));
  }
  function renderMissing(chain, id, why) {
    S.clear(dpanel);
    dpanel.appendChild(dtop(null, ["Market", CH[chain][0], short(id)]));
    dpanel.appendChild(el("h2", { class: "ap-dtitle", attrs: { id: "ap-d-title" }, text: why === "error" ? "Seer's API didn't answer" : "This market isn't in Seer's markets API" }));
    dpanel.appendChild(el("p", { class: "t-body", text: why === "error" ? "The market could not be read right now and it is not in the snapshot. Its page on Seer has everything." : "Seer's markets API returned no market at this address on " + CH[chain][0] + " in a shape this explorer reads. Its page on Seer may still exist." }));
    dpanel.appendChild(el("div", { class: "s-row" }, ext("s-btn", "Open on Seer", "https://app.seer.pm/markets/" + chain + "/" + id, "Open this market on app.seer.pm (new tab)")));
  }
  function outcomeList(m) {
    if (m.kind === "scalar") return m.scalar.value == null ? el("p", { class: "t-meta", text: "No price yet: the range is " + nm(m.scalar.min) + " to " + nm(m.scalar.max) + (m.scalar.unit ? " " + m.scalar.unit : "") + "." }) : scalarVis(m);
    var wrap = el("div", { class: "s-orows ap-douts" }), multi = m.kind === "multi-categorical", SHOWN = 10;
    if (!m.priced) {
      wrap.appendChild(el("p", { class: "t-meta", text: m.fut ? "Seer's markets API gives no price for these conditional tokens:" : "No price yet. Its " + m.n + " answers:" }));
      wrap.appendChild(el("ul", { class: "ap-dnames" }, m.outs.slice(0, 12).map(function (o) { return el("li", { text: clip(o[0], 60) }); })));
      if (m.n > 12) wrap.appendChild(el("p", { class: "t-meta", text: "+" + (m.n - 12) + " more on Seer" }));
      return wrap;
    }
    var st = stackVis(m); if (st) wrap.appendChild(st);
    m.outs.slice(0, SHOWN).forEach(function (o, i) {
      wrap.appendChild(U.orow({ name: o[0], price: o[1] / 100 }, { actions: false, swatch: m.n > 2 && i < SEG.length ? SEG[i] : null, value: multi ? cents(o[1]) : pct(o[1]), sub: m.kind === "multi-scalar" ? "share" : multi ? "of payout" : null, p: o[1] / 100 }));
    });
    if (m.n > SHOWN) wrap.appendChild(el("p", { class: "t-meta ap-xrest", text: "+" + (m.n - SHOWN) + " more answers on Seer" }));
    if (m.inv != null && !m.yesno) wrap.appendChild(el("p", { class: "t-meta ap-xinv", text: "Invalid: " + pct(m.inv) + " (pays out if the question can't be answered)" }));
    var sn = sumNote(m); if (sn) wrap.appendChild(sn);
    return wrap;
  }
  function otherMarkets(m, box) {                           // the asker's other markets: count + the most liquid few, live
    S.clear(box);
    if (!m.creator) return;
    var a = m.creator, c = own(askers, a) ? askers[a] : null;
    if (c) return drawOthers(m, box, c);
    var snapN = SNAP && SNAP.creators && typeof SNAP.creators === "object" && own(SNAP.creators, a) && typeof SNAP.creators[a] === "number" ? SNAP.creators[a] : null;
    box.appendChild(el("p", { class: "t-meta", text: "Reading what else " + short(a) + " has asked on Seer…" }));
    // two reads: how many markets they have asked in all (count only), and their most liquid ones not resolved yet
    Promise.all([seer({ creator: a, limit: 1, page: 1 }, "askerN", ONE_BYTES),
      seer({ creator: a, limit: 6, page: 1, orderBy: "liquidityUSD", orderDirection: "desc", marketStatusList: ["not_open", "open", "answer_not_final", "in_dispute", "pending_execution"] }, "asker", ONE_BYTES)
    ]).then(function (r) {
      if (r[0].count == null) throw new Error("no count");
      askers[a] = { count: r[0].count, open: r[1].count, list: r[1].list }; askerKeys.push(a); if (askerKeys.length > 30) delete askers[askerKeys.shift()];
      if (curKey === keyOf(m)) drawOthers(m, box, askers[a]);
    }).catch(function () {
      if (curKey !== keyOf(m)) return;
      S.clear(box);
      box.appendChild(el("p", { class: "t-meta", text: snapN != null && snapN >= 1 && snapN < 1e7 ? short(a) + " has created " + Math.round(snapN).toLocaleString("en-US") + " markets on Seer (hourly snapshot). " : "Seer didn't answer for this asker's other markets. " }));
      box.appendChild(el("div", { class: "s-row" }, askAll(m, null)));
    });
  }
  function askAll(m, n) {
    var b = el("button", { class: "s-btn s-btn--ghost s-btn--sm", attrs: { type: "button" }, text: n != null ? "All " + n.toLocaleString("en-US") + " in the explorer" : "Their markets in the explorer" });
    b.addEventListener("click", function () { closeDetail(false); byCreator(m.creator); });
    return b;
  }
  function drawOthers(m, box, c) {
    S.clear(box);
    var others = c.list.filter(function (x) { return keyOf(x) !== keyOf(m); }).slice(0, 4);
    var n = Math.max(c.count, others.length + 1);
    box.appendChild(el("p", { class: "ap-dline" }, el("b", { text: n === 1 ? "This is their only market on Seer." : n.toLocaleString("en-US") + " markets on Seer in all." }),
      others.length ? " Their most liquid others not resolved yet:" : n > 1 ? " None of the others is open right now." : ""));
    if (others.length) box.appendChild(el("ul", { class: "ap-dothers" }, others.map(function (x) {
      return el("li", {}, opener(x, "ap-dothers__a", null, 90), el("span", { class: "ap-dothers__m", text: IF[x.iface].name + " · " + lead(x) + " · " + usd(x.liq) + " liq" }));
    })));
    if (n > 1) box.appendChild(el("div", { class: "s-row" }, askAll(m, n)));
  }
  // a Risk Pricing board: risk.seer.pm states it as yearly default chances and No to All, the figure the Risk page and the strip show
  function riskNote(m) {
    if (m.iface !== "risk" || !RSNAP || typeof RSNAP.noToAll !== "number" || !(RSNAP.noToAll >= 0 && RSNAP.noToAll <= 1)) return null;
    var t = typeof RSNAP.fetchedAt === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(RSNAP.fetchedAt) ? Date.parse(RSNAP.fetchedAt) : NaN;
    if (!(t > 1.7e12 && t < Date.now() + 864e5)) return null;
    return el("p", { class: "ap-dline ap-drisk", text: "risk.seer.pm reads this board as each asset's chance of default per year; its No to All, the chance that none defaults, is " +
      (Math.round(RSNAP.noToAll * 10000) / 100).toFixed(2) + "% (hourly snapshot, " + day(t, true) + " " + hhmm(t) + "). The prices below are app.seer.pm's token prices, shares of one payout, not yearly chances." });
  }
  function renderDetail(m, from) {
    S.clear(dpanel);
    var f = IF[m.iface], d = depth(m);
    dpanel.appendChild(dtop(m, [f.name, KIND_NAME[m.kind], CH[m.chain][0]]));
    dpanel.appendChild(el("div", { class: "ap-dhead" },
      el("h2", { class: "ap-dtitle", attrs: { id: "ap-d-title" }, text: m.title }),
      badges(m)));
    // 1 · who is asking
    var others = el("div", { class: "ap-dothers-box" });
    var who = el("dl", { class: "qa-ask ap-dask" },
      el("div", {}, el("dt", { text: "Asked by" }), el("dd", {}, m.creator ? [scanLink(m.chain, m.creator), m.created ? " on " + day(m.created, true) : "", m.creator ? copyBtn(m.creator, "the asker's address") : null] : "Seer's data names no creator for this market")),
      el("div", {}, el("dt", { text: "Interface" }), el("dd", {}, el("b", { text: f.name }), " · " + m.ifWhy,
        f.page ? [" ", el("a", { href: f.page, text: "Its page in this concept" })] : null)),
      m.creator ? el("div", {}, el("dt", { text: "They also ask" }), el("dd", {}, others)) : null);
    dpanel.appendChild(sec("Who is asking", "01", who));
    if (m.creator) otherMarkets(m, others);
    // 2 · what it prices
    dpanel.appendChild(sec("What it prices", "02", [el("p", { class: "ap-dline", text: whatPrices(m) }), riskNote(m), outcomeList(m)]));
    // 3 · how to use the signal, beside the traders' numbers: the two sides of the market
    var tips = [d.note];
    if (hasPrice(m) && m.vol === 0 && !m.ext) tips.push("No trades yet: the price is still where the liquidity was first set.");
    var sn = stateNote(m); if (sn) tips.push(sn);
    tips.push("Prices move. This reading is from " + (m.ext === "deep" ? "deep.seer.pm's feed, read hourly" + (DEEP_AT ? " (" + hhmm(DEEP_AT) + ")" : "") : from === "snapshot" ? "the hourly snapshot" : "app.seer.pm at " + hhmm(m.at || Date.now())) + ".");
    var seek = el("section", { class: "s-card s-card--pad ap-side ap-side--seek", attrs: { "aria-labelledby": "ap-d-seek" } },
      el("span", { class: "s-spec", text: "For information seekers" }),
      el("h3", { class: "ap-side__t", attrs: { id: "ap-d-seek" }, text: "What this tells you" }),
      el("p", { class: "ap-side__read", text: reading(m) }),
      meter(m, "ap-depth--d"),
      el("h4", { class: "ap-side__h", text: "How to use it" }),
      el("ul", { class: "ap-side__tips" }, tips.map(function (t) { return el("li", { text: t }); })));
    var kv = [["Leading", el("b", { text: lead(m) })],
      m.ext === "deep" ? ["Price from", "deep.seer.pm's own feed, hourly snapshot" + (DEEP_AT ? " (" + day(DEEP_AT, true) + ", " + hhmm(DEEP_AT) + ")" : "") + "; Seer's markets API has none"] : null,
      ["Liquidity", m.ext === "deep" ? "Not in Seer's API" : usd(m.liq)], ["Volume", usd(m.vol)], ["Open interest", usd(m.oi)],
      m.opening ? ["Reports open", day(m.opening, true) + ", " + hhmm(m.opening)] : null,
      m.state === "waiting" && m.finalize ? ["Answer final", day(m.finalize, true) + ", " + hhmm(m.finalize)] : null,
      m.created ? ["Created", day(m.created, true)] : null,
      ["Collateral", m.coll || (m.collAddr ? short(m.collAddr) : "—")], ["Chain", CH[m.chain][0]],
      ["Kleros Curate", { verified: "Verified", verifying: "Verifying", challenged: "Challenged", none: "Not verified" }[m.verify]]];
    var trade = el("section", { class: "s-card s-card--pad ap-side ap-side--trade", attrs: { "aria-labelledby": "ap-d-trade" } },
      el("span", { class: "s-spec", text: "For traders" }),
      el("h3", { class: "ap-side__t", attrs: { id: "ap-d-trade" }, text: "Price, liquidity and dates" }),
      U.kv(kv),
      el("div", { class: "ap-side__go" }, ext("s-btn", "Trade on Seer", link(m), "Trade this market on app.seer.pm (new tab)"),
        el("p", { class: "t-meta", text: "Orders go through app.seer.pm; this concept places none." })));
    dpanel.appendChild(sec("How to use the signal", "03", el("div", { class: "ap-sides" }, seek, trade)));
    // the on-chain record, for anyone who wants to check it
    var rec = [["Market", el("span", { class: "ap-dval" }, scanLink(m.chain, m.id), copyBtn(m.id, "the market address"))]];
    if (m.condId) rec.push(["Condition ID", el("span", { class: "ap-dval" }, el("span", { class: "ap-daddr", text: m.condId.slice(0, 10) + "…" + m.condId.slice(-6), attrs: { title: m.condId } }), copyBtn(m.condId, "the condition ID"))]);
    if (m.qids && m.qids.length) rec.push([m.qids.length > 1 ? "Reality.eth questions" : "Reality.eth question", el("span", { class: "ap-dval" }, el("span", { class: "ap-daddr", text: m.qids[0].slice(0, 10) + "…" + m.qids[0].slice(-6) + (m.qids.length > 1 ? " +" + (m.qids.length - 1) : ""), attrs: { title: m.qids[0] } }), copyBtn(m.qids[0], "the question ID"))]);
    if (m.collAddr) rec.push(["Collateral token", el("span", { class: "ap-dval" }, scanLink(m.chain, m.collAddr), m.coll ? " " + m.coll : "")]);
    if (m.parent) {
      var pb = el("a", { class: "ap-daddr", href: "?market=" + m.chain + ":" + m.parent + "#markets", text: short(m.parent), attrs: { title: m.parent, "aria-label": "Open the parent market " + m.parent } });
      pb.addEventListener("click", function (e) { e.preventDefault(); openKey(m.chain, m.parent, false); });
      rec.push(["Parent market", el("span", { class: "ap-dval" }, pb, " (this is a conditional market)")]);
    }
    dpanel.appendChild(el("details", { class: "s-card s-card--pad ap-drec" }, el("summary", {}, el("span", { class: "t-title", text: "On-chain record" }), el("span", { class: "t-meta", text: "Contract, condition, oracle question" })), U.kv(rec)));
    var share = location.origin + location.pathname + "?market=" + keyOf(m) + "#markets";
    dpanel.appendChild(el("div", { class: "ap-dfoot" },
      el("span", { class: "t-meta", text: from === "snapshot" ? "From the hourly snapshot of Seer's markets API" + (snapAt() ? ", " + day(snapAt(), true) + " " + hhmm(snapAt()) : "") + "." : "Read live from Seer's public markets API (app.seer.pm)." }),
      el("button", { class: "s-btn s-btn--ghost s-btn--sm", attrs: { type: "button", "data-copy": share }, html: S.icon("link", 14) + "<span>Copy link</span>" })));
  }
  function showDrawer() {
    if (!drawer) return;
    if (!drawer.classList.contains("is-open")) lastFocus = document.activeElement;
    drawer.classList.add("is-open"); drawer.setAttribute("aria-hidden", "false"); document.documentElement.classList.add("ap-lock");
    dpanel.scrollTop = 0;
    setTimeout(function () { var b = $(".ap-dclose", dpanel); if (b) b.focus({ preventScroll: true }); }, 40);
  }
  function urlWith(k) {
    var s = location.search.replace(/^\?/, "").split("&").filter(function (p) { return p && p.indexOf("market=") !== 0; });
    if (k) s.push("market=" + k);
    return location.pathname + (s.length ? "?" + s.join("&") : "") + location.hash;
  }
  function setUrl(k, push) {
    if (!history.pushState) return;
    try {                                                   // only a pushed entry carries {apx}: closing it goes back, anything else strips the param
      if (push) history.pushState({ apx: k }, "", urlWith(k));
      else history.replaceState(k && history.state && history.state.apx ? { apx: k } : null, "", urlWith(k));
    } catch (e) { /* file:// fine */ }
  }
  function openDetail(m, push) {
    if (!drawer || !m) return;
    var wasOpen = drawer.classList.contains("is-open");
    curKey = keyOf(m);
    renderDetail(m, m.src === "snapshot" ? "snapshot" : "live");
    showDrawer();
    setUrl(curKey, push && !wasOpen);                         // one history entry per opened drawer; moves inside it replace
  }
  function openKey(chain, id, push) {                       // from a URL or a link: a market already read, else ask Seer for it
    if (!drawer || !own(CH, chain) || !ADDR.test(id)) return;
    id = id.toLowerCase();
    var k = chain + ":" + id;
    snapRows();
    if (own(known, k) && known[k].src === "live") return openDetail(known[k], push);
    var had = own(known, k) ? known[k] : null, wasOpen = drawer.classList.contains("is-open");
    if (had) openDetail(had, push);                         // the snapshot's copy at once, the live one when Seer answers
    else { curKey = k; renderLoading(chain, id); showDrawer(); setUrl(k, push && !wasOpen); }
    seer({ marketIds: [id], chainsList: [String(chain)], limit: 1, page: 1 }, "one", ONE_BYTES).then(function (r) {
      if (curKey !== k) return;
      var m = r.list[0], top = dpanel.scrollTop;
      if (m && keyOf(m) === k) { renderDetail(m, "live"); dpanel.scrollTop = top; if (!had) { var b = $(".ap-dclose", dpanel); if (b) b.focus({ preventScroll: true }); } }
      else if (!had) renderMissing(chain, id, "none");
    }).catch(function () { if (curKey === k && !had) renderMissing(chain, id, "error"); });
  }
  function closeDetail(fromPop) {
    if (!drawer || !drawer.classList.contains("is-open")) return;
    drawer.classList.remove("is-open"); drawer.setAttribute("aria-hidden", "true"); document.documentElement.classList.remove("ap-lock");
    curKey = null; ["one", "asker", "askerN"].forEach(function (s) { if (CTL[s]) CTL[s].abort(); });
    var back = !fromPop && history.state && history.state.apx;
    if (back) history.back(); else if (!fromPop) setUrl(null, false);
    refocus(lastFocus, back || fromPop);
  }
  function refocus(f, late) {                               // back to what opened the drawer; a history step blurs the page, so wait it out
    if (!f) return;
    var go = function () { if (document.body.contains(f)) { try { f.focus({ preventScroll: true }); } catch (x) { f.focus(); } } };
    go(); if (late) setTimeout(go, 60);
  }
  function marketParam() { var r = /[?&]market=(\d{1,5}):(0x[0-9a-fA-F]{40})(?:&|$)/.exec(location.search); return r && own(CH, +r[1]) ? [+r[1], r[2].toLowerCase()] : null; }
  if (drawer) {
    drawer.addEventListener("click", function (ev) { if (ev.target.hasAttribute && ev.target.hasAttribute("data-close")) closeDetail(false); });
    document.addEventListener("keydown", function (ev) {
      if (!drawer.classList.contains("is-open")) return;
      if (ev.key === "Escape") { ev.preventDefault(); closeDetail(false); return; }
      if (ev.key === "Tab") {                                 // keep focus inside the dialog
        var f = $$('a[href],button:not([disabled]),input,select,summary,[tabindex="0"]', dpanel).filter(function (x) { return x.offsetParent !== null; });
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
        else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
      }
    });
    window.addEventListener("popstate", function () { var p = marketParam(); if (p) openKey(p[0], p[1], false); else closeDetail(true); });
  }

  /* ---------- address lookup for the page's search box (page.js): a pasted market address (or its app.seer.pm link) opens that
     market's record; an asker's address lists everything it asked. Two POSTs, 300 ms after the typing stops, each on its own
     abort slot (the drawer's reads are never cancelled): {marketIds: [addr]} with no chain filter (any chain, any state) and
     {creator: addr} for its count. A creator's address is never a market id, so the two never collide. Rows come back as plain
     values built here from validated data; page.js renders them with textContent. ---------- */
  var LK = { cache: {}, keys: [], timer: null, want: null, cb: null };
  function lkParse(raw) {                                   // -> "0x…" (40 hex, lowercase) or null
    var t = clean(String(raw || ""), 200).toLowerCase(), r;
    if (/^0x[0-9a-f]{40}$/.test(t)) return t;
    r = /^(?:https?:\/\/)?app\.seer\.pm\/markets\/(\d{1,5})\/(0x[0-9a-f]{40})(?:[\/?#].*)?$/.exec(t);
    return r && own(CH, +r[1]) ? r[2] : null;
  }
  function lkKeep(a, v) { if (!own(LK.cache, a)) { LK.keys.push(a); if (LK.keys.length > 30) delete LK.cache[LK.keys.shift()]; } LK.cache[a] = v; }
  function lkRows(a, hit, n) {
    var rows = [];
    if (hit && hit.m) rows.push({ kind: "Market on Seer", label: clip(hit.m.title, 110), title: hit.m.title, sub: IF[hit.m.iface].name + " · " + CH[hit.m.chain][0] + " · " + short(a),
      val: lead(hit.m), open: [hit.m.chain, hit.m.id] });
    else if (hit) rows.push({ kind: "Market on Seer", label: "A market at " + short(a) + " on " + CH[hit.chain][0], sub: "This explorer can't read its data: open it on app.seer.pm", val: "", ext: "https://app.seer.pm/markets/" + hit.chain + "/" + a });
    if (n) rows.push({ kind: "Asker", label: n.toLocaleString("en-US") + " market" + (n === 1 ? "" : "s") + " asked by " + short(a), sub: "Everything this address asked on Seer, on every interface", val: "", creator: a });
    return rows;
  }
  function lkRun(a) {
    LK.want = a;
    var ok = 0, failed = 0, hit = null, n = null, now = Date.now();
    function done() {
      if (ok + failed < 2 || LK.want !== a) return;
      var rows = lkRows(a, hit, n);
      lkKeep(a, rows.length ? { state: "ok", addr: a, rows: rows } : failed ? { state: "error", addr: a, at: Date.now() } : { state: "miss", addr: a, rows: [] });
      LK.want = null;
      if (typeof LK.cb === "function") LK.cb(a);
    }
    post({ marketIds: [a], limit: 1, page: 1 }, "lk-m", ONE_BYTES).then(function (d) {
      var m0 = d.markets[0];
      if (m0 && typeof m0 === "object" && typeof m0.id === "string" && m0.id.toLowerCase() === a && typeof m0.chainId === "number" && own(CH, m0.chainId)) {
        var m = normalize(m0, now);
        if (m) { m.src = "live"; m.at = now; remember(m); hit = { m: m }; } else hit = { chain: m0.chainId };
      }
      ok++; done();
    }).catch(function (e) { if (LK.want !== a) return; failed++; done(); });
    post({ creator: a, limit: 1, page: 1 }, "lk-c", ONE_BYTES).then(function (d) {
      var c = okN(d.count); if (c == null) throw new Error("bad count");
      n = c; ok++; done();
    }).catch(function (e) { if (LK.want !== a) return; failed++; done(); });
  }
  function lookup(raw, onReady) {                           // -> null (not an address) | {state: loading|ok|miss|error, addr, rows}
    var a = lkParse(raw);
    if (!a) return null;
    if (a === ZERO) return { state: "miss", addr: a, rows: [] };
    var r = own(LK.cache, a) ? LK.cache[a] : null;
    if (r && !(r.state === "error" && Date.now() - r.at > 30000)) return r;
    if (typeof fetch !== "function") return { state: "error", addr: a };
    LK.cb = onReady;
    if (LK.want === a) return { state: "loading", addr: a };  // already asked: don't restart it (Enter while it loads)
    clearTimeout(LK.timer); LK.want = a;
    LK.timer = setTimeout(function () { lkRun(a); }, 300);
    return { state: "loading", addr: a };
  }

  // the page's search box (page.js) hands word queries here: Seer's own search over every market's title
  window.AP_X = {
    search: function (raw) {
      var q = clean(String(raw || ""), 60);
      if (q.length < 3 || !/[a-z\u00c0-\u024f]{3}/i.test(q) || /^0x/i.test(q) || /^#?\d+$/.test(q) || /^p-?\d{1,2}$/i.test(q.replace(/\s+/g, "")) || lkParse(q)) q = "";
      if (q === Q.q) return;
      Q.q = q; clearTimeout(debounce); syncCtrls();
      debounce = setTimeout(load, DEBOUNCE);
    },
    byCreator: byCreator,
    open: function (chain, id) { openKey(+chain, String(id || ""), true); },
    lookup: lookup,                                         // AP_X.lookup(text, onReady): a market or asker address, live
    isAddress: function (raw) { return lkParse(raw) != null; }
  };

  // first paint: the snapshot's first page at once (labelled), then the live answer
  if (XS) { var first = snapRows().filter(matchServer).filter(function (m) { return Q.iface === "all" || m.iface === Q.iface; }); if (first.length) { rows = snapSort(first); mode = "loading"; render(true); } }
  if (Q.creator) pendingScroll = true;
  load();
  loadCounts();
  var mp = marketParam(); if (mp) openKey(mp[0], mp[1], false);
})();
