/* Futarchy · conditional markets — page script (prefix ft-).
   Concept by Swift Bot Labs · not affiliated with Seer.
   Every figure is SAMPLE DATA from assets/sample-data.js (window.SEER_SAMPLE). Values derived here
   (calibrated hourly series, vote/TWAP dates for proposals without them, pool depth, conditional
   token addresses) are deterministic and marked "derived" in the comments. */
(function () {
  "use strict";
  var D = window.SEER_SAMPLE, S = window.Seer;
  if (!D || !S || !S.ui) return;
  var F = S.fmt, el = S.el, sv = S.svgEl, $ = S.$, $$ = S.$$;
  // token prices read to ~5 significant figures: 1.2842 LAT, 3.409 KST, 143.62 GNO (not 143.6200)
  (function () { var p0 = F.price; F.price = function (v, d) { var a = Math.abs(v); return p0(v, d != null && a >= 100 ? Math.min(d, 2) : d != null && a >= 10 ? Math.min(d, 3) : d); }; })();
  var NOW = D.now, H = 3600e3, DAY = 24 * H;
  var RULE = D.futarchyRule; // 5-day TWAP; approve above +1%, reject below -1%
  var ORG = {}; D.orgs.forEach(function (o) { ORG[o.id] = o; });
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  var ABOUT = { // fictional proposal summaries
    "LIP-31": "Forty proposals compete for eight grants, each scored 0–10 by five human reviewers. If LIP-31 fails, the budget stays in the treasury.",
    "LIP-30": "Moves 20% of the treasury's stablecoins into sDAI so idle funds earn the savings rate. The treasury multisig keeps instant withdrawal rights.",
    "LIP-29": "Cuts contributor stipends by 15% for two quarters to extend the treasury's runway.",
    "HIP-12": "Adds a 24-hour delay between a bridge upgrade being approved and taking effect, so users can exit before any change lands.",
    "HIP-11": "Retires the legacy relayer and routes every bridge message through the new relayer set.",
    "KIP-7": "Opens a second cohort of the Kestrel research fellowship: six fellows for twelve months.",
    "GIP-S1": "A sample in the shape of a GnosisDAO GIP: renew the Gnosis Chain builder grants for 2027, priced in GNO. GnosisDAO is real; this proposal and its prices are not."
  };

  /* ======================= maths ======================= */
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  // phone folds (2026-10-21): <details data-fold="sm"> are open on wider screens (summary hidden by CSS) and closed on
  // phones until opened; a reader's own toggle sticks until the layout crosses 640px.
  var mqSm = window.matchMedia("(max-width: 640px)");
  function syncFolds(root, force) {
    $$("details[data-fold]", root || document).forEach(function (d) {
      if (!d.dataset.foldBound) { d.dataset.foldBound = "1"; var su = d.querySelector("summary"); if (su) su.addEventListener("click", function () { d.dataset.touched = "1"; }); }
      if (force) delete d.dataset.touched;
      if (!d.dataset.touched) d.open = !mqSm.matches;
    });
  }
  function unfold(d) { if (d && !d.open) { d.open = true; d.dataset.touched = "1"; } }
  // time-weighted average (trapezoid) of column `col` between indexes i0..i1
  function twap(s, i0, i1, col) {
    if (i1 <= i0) return s[i1][col];
    var a = 0;
    for (var k = i0 + 1; k <= i1; k++) a += (s[k][col] + s[k - 1][col]) / 2 * (s[k][0] - s[k - 1][0]);
    return a / (s[i1][0] - s[i0][0]);
  }
  // derived: shift the shared hourly series so its trailing 5-day TWAP equals the stated
  // yesTwap/noTwap exactly, tapering the shift to 0 over the last 12 h so the spot price is untouched.
  function calibrate(raw, ty, tn) {
    var L = raw.length, i0 = Math.max(0, L - 1 - 120), taper = 12;
    var w = raw.map(function (_, k) { var left = L - 1 - k; return left >= taper ? 1 : left / taper; });
    var ws = raw.map(function (r, k) { return [r[0], w[k], w[k]]; });
    var mw = twap(ws, i0, L - 1, 1) || 1;
    var cy = (ty - twap(raw, i0, L - 1, 1)) / mw, cn = (tn - twap(raw, i0, L - 1, 2)) / mw;
    return raw.map(function (r, k) { return [r[0], r[1] + cy * w[k], r[2] + cn * w[k]]; });
  }
  function recOf(x) { return x > RULE.approveAbove ? "approve" : x < RULE.rejectBelow ? "reject" : "neutral"; }
  var REC = {
    approve: { label: "Leans approve", cls: "s-tag--pos", icon: "check", why: "above the +1% line" },
    reject: { label: "Leans reject", cls: "s-tag--neg", icon: "close", why: "below the −1% line" },
    neutral: { label: "Neutral", cls: "", icon: "info", why: "inside the ±1% band" }
  };
  // prov: the official TWAP window has not closed, so the signal is provisional: outline tag, "so far".
  // Signal language only: the market leans one way; the DAO vote decides.
  function recTag(r, long, prov) {
    var c = REC[r], t = el("span", { class: "s-tag ft-rec " + (prov ? "s-tag--outline ft-rec--prov" : c.cls), html: S.icon(prov ? "clock" : c.icon, 12) });
    if (prov && long) { t.classList.add("ft-rec--long"); t.appendChild(el("span", { class: "ft-rec__head", text: "Signal: " + c.label.toLowerCase() })); t.appendChild(el("span", { class: "ft-rec__tail" }, el("span", { class: "ft-rec__sep", text: "· " }), "the vote decides")); return t; }
    t.appendChild(document.createTextNode(prov ? c.label + " · so far" : (long ? "Signal: " + c.label.toLowerCase() : c.label)));
    return t;
  }
  // the long chip reads on one line where it fits; where it wraps, its tail takes a line of its own without the dot
  // (2026-10-21: "· the vote decides" wrapped with an orphaned leading dot at 1440)
  function fitChips() {
    $$(".ft-rec--long").forEach(function (t) {
      var h = $(".ft-rec__head", t), tl = $(".ft-rec__tail", t); if (!h || !tl) return;
      t.classList.remove("is-wrapped"); tl.style.paddingLeft = "";
      if (tl.offsetTop <= h.offsetTop + 2) return;
      t.classList.add("is-wrapped");
      var ic = $("svg", t), a = ic && ic.getBoundingClientRect(), b = h.getBoundingClientRect(); // indent under the text when it sits beside the icon
      tl.style.paddingLeft = a && b.top < a.bottom - 2 ? Math.max(0, Math.round(b.left - a.left)) + "px" : "0px";
    });
  }
  function prov(m) { return !m.resolved && NOW < m.wEnd; }
  function range(a, b) {
    var A = new Date(a), B = new Date(b);
    if (A.getUTCMonth() === B.getUTCMonth() && A.getUTCFullYear() === B.getUTCFullYear()) return A.getUTCDate() + "–" + B.getUTCDate() + " " + MON[B.getUTCMonth()];
    return F.dayMon(a) + " – " + F.dayMon(b);
  }
  function txHash(key) { return D.addr("ft-tx:" + key) + D.addr("ft-tx2:" + key).slice(6, 30); }

  /* ======================= proposal models ======================= */
  function build(f) {
    var org = ORG[f.org], tok = org.token, resolved = f.status === "resolved", r = D.rng("ft:" + f.id);
    var resolution = Date.parse(f.resolution);
    var vClose = f.vote.closes ? Date.parse(f.vote.closes) : resolution;               // derived when missing
    var vOpen = f.vote.opens ? Date.parse(f.vote.opens) : vClose - 3 * DAY;
    var wEnd = f.twapWindow ? Date.parse(f.twapWindow.end) : vOpen - 12 * H;            // window closes 12 h before the vote
    var wStart = f.twapWindow ? Date.parse(f.twapWindow.start) : wEnd - 5 * DAY;
    var end = resolved ? wEnd : NOW, shift = end - NOW;                                 // resolved: series ends with the official window
    var series = calibrate(f.series.map(function (x) { return [x[0] + shift, x[1], x[2]]; }), f.yesTwap, f.noTwap);
    var dec = f.marketId ? D.market(f.marketId) : null, pA;
    if (dec) {
      var py = 0, pn = 0;
      dec.outcomes.forEach(function (o) { if (o.name === "Yes") py = o.price; if (o.name === "No") pn = o.price; });
      pA = py / (py + pn || 1);                                                          // an invalid answer resolves as not approved
    } else if (resolved) pA = f.approved ? 1 : 0;
    else pA = Math.round((.32 + r() * .46) * 1000) / 1000;                              // derived sample estimate
    var yesM = f.yesMarketId ? D.market(f.yesMarketId) : null, noM = f.noMarketId ? D.market(f.noMarketId) : null;
    var created = dec ? Date.parse(dec.created) : series[0][0] - Math.round(2 + r() * 6) * DAY;
    return {
      id: f.id, f: f, org: org, tok: tok, resolved: resolved, approved: !!f.approved, title: f.title, metric: f.metric,
      pair: f.pair || tok + "/sDAI", yesSpot: f.yesSpot, noSpot: f.noSpot, yesTwap: f.yesTwap, noTwap: f.noTwap,
      impact: f.impact, rec: f.recommendation, series: series, pA: pA, created: created,
      wStart: wStart, wEnd: wEnd, vOpen: vOpen, vClose: vClose, resolution: resolution,
      dec: dec, yesM: yesM, noM: noM, volume: f.volume, tvl: f.tvl, chain: org.chain,
      depthY: yesM ? yesM.liquidity : Math.max(f.tvl, 4000) / 2, depthN: noM ? noM.liquidity : Math.max(f.tvl, 4000) / 2
    };
  }
  var MODELS = D.futarchy.map(build), BY = {};
  MODELS.forEach(function (m) { BY[m.id] = m; });
  var state = { id: "LIP-31", days: 5, i0: 0, i1: 0, tab: 0, org: "all", status: "all", q: "", tk: { side: "buy", branch: "yes", amount: 0, slip: .01 } };
  function cur() { return BY[state.id]; }
  function phase(m) {
    if (m.resolved) return { i: 5, label: "Resolved" };
    if (NOW < m.wStart) return { i: 1, label: "Trading" };
    if (NOW < m.wEnd) return { i: 2, label: "TWAP window open" };
    if (NOW < m.vClose) return { i: 3, label: "Vote open" };
    return { i: 4, label: "Awaiting answer" };
  }
  function tokens(m) { // derived conditional token set (YES_/NO_ sDAI come from the decision market's outcome tokens)
    var out = function (name) { if (m.dec) for (var i = 0; i < m.dec.outcomes.length; i++) if (m.dec.outcomes[i].name === name) return m.dec.outcomes[i].token; return D.addr("ft-token:" + m.id + ":" + name + "_sDAI"); };
    return [
      { sym: "YES_sDAI", from: "sDAI", pays: "1 sDAI if approved", addr: out("Yes"), br: "yes" },
      { sym: "NO_sDAI", from: "sDAI", pays: "1 sDAI if not approved", addr: out("No"), br: "no" },
      { sym: "YES_" + m.tok, from: m.tok, pays: "1 " + m.tok + " if approved", addr: D.addr("ft-token:" + m.id + ":YES_" + m.tok), br: "yes" },
      { sym: "NO_" + m.tok, from: m.tok, pays: "1 " + m.tok + " if not approved", addr: D.addr("ft-token:" + m.id + ":NO_" + m.tok), br: "no" }
    ];
  }
  function priceAt(m, t, col) {
    var s = m.series, i = clamp(Math.round((t - s[0][0]) / (s[s.length - 1][0] - s[0][0]) * (s.length - 1)), 0, s.length - 1);
    return s[i][col];
  }
  function activity(m) {
    var rows = [];
    function push(e, br, k) {
      var t = typeof e.time === "number" ? e.time : Date.parse(e.time), swap = e.type === "Swap";
      rows.push({ k: k, time: t, type: e.type, branch: e.type === "Split" || e.type === "Merge" ? "both" : br,
        action: swap ? (e.side === "buy" ? "Buy " : "Sell ") + (br === "yes" ? "YES_" : "NO_") + m.tok : e.type === "Split" ? "Split sDAI" : e.type === "Merge" ? "Merge to sDAI" : e.type,
        amount: e.amount, price: swap ? priceAt(m, t, br === "yes" ? 1 : 2) : null, from: e.from, tx: e.tx });
    }
    if (m.yesM && m.noM) { // reuse the shared event log of #2844 / #2845, read as conditional pool activity
      D.events(m.yesM.id, 8).forEach(function (e, i) { push(e, "yes", "y" + i); });
      D.events(m.noM.id, 8).forEach(function (e, i) { push(e, "no", "n" + i); });
    } else { // derived, seeded per proposal
      var r = D.rng("ft-ev:" + m.id), t = m.series[m.series.length - 1][0] - Math.round(r() * 30) * 60e3, kinds = ["Swap", "Swap", "Swap", "Split", "Swap", "Merge", "Swap", "Add liquidity"];
      for (var i = 0; i < 14; i++) {
        push({ type: kinds[Math.floor(r() * kinds.length)], side: r() > .45 ? "buy" : "sell", amount: Math.round((5 + Math.pow(r(), 2) * 2200) * 100) / 100,
          time: t, from: D.addr("ft-ev-from:" + m.id + ":" + i), tx: txHash(m.id + ":" + i) }, r() > .5 ? "yes" : "no", "s" + i);
        t -= Math.round(4 + r() * 80) * 60e3;
      }
    }
    return rows.sort(function (a, b) { return b.time - a.time; }).slice(0, 14);
  }

  /* ======================= hero ======================= */
  function cell(label, value, sub, key, valueClass) {
    return el("div", { class: "ft-cell" },
      el("span", { class: "ft-cell__label" }, key ? el("i", { class: "ft-key" + (key === "no" ? " ft-key--no" : ""), attrs: { "aria-hidden": "true" } }) : null, label),
      el("span", { class: "ft-cell__value t-num " + (valueClass || ""), text: value }),
      sub == null ? null : typeof sub === "string" ? el("span", { class: "ft-cell__sub", text: sub }) : sub);
  }
  function signCls(x) { return x > 0 ? "t-pos" : x < 0 ? "t-neg" : ""; }
  function statusTag(m) {
    if (m.resolved) return el("span", { class: "s-tag " + (m.approved ? "s-tag--pos" : "s-tag--neg"), text: "Resolved · " + (m.approved ? "approved" : "rejected") });
    return el("span", { class: "s-state", data: { state: "open" }, text: phase(m).label });
  }
  function renderHero(m) {
    var box = $("#ft-hero-copy"); S.clear(box);
    box.appendChild(el("div", { class: "s-hero__kicker s-specs ft-kicker" }, el("span", { text: "04" }), el("span", { text: m.org.name }), el("span", {}, el("b", { text: m.id }))));
    box.appendChild(el("h1", { class: "ft-title", attrs: { id: "ft-title" } }, "What happens to " + m.tok + " ", el("span", { class: "t-accent" }, "if ", el("span", { class: "u-nowrap", text: m.id }), " is approved?")));
    box.appendChild(el("p", { class: "ft-subtitle" }, el("b", { text: m.id }), " · " + m.title));
    var head = el("div", { class: "ft-signal__head" }, el("span", { class: "s-spec" }, m.resolved ? "Final 5-day TWAP" : prov(m) ? el("span", {}, "Signal so far · ", el("span", { class: "s-hide-sm", text: "trailing " }), "5-day TWAP") : "Official 5-day TWAP", el("span", { class: "s-hide-sm", text: " · " + m.pair })), statusTag(m));
    var grid = el("div", { class: "ft-signal__grid" },
      cell("If approved", F.price(m.yesTwap, 4), "YES_" + m.tok + " in YES_sDAI", "yes"),
      cell("If rejected", F.price(m.noTwap, 4), "NO_" + m.tok + " in NO_sDAI", "no"),
      cell("Forecast impact", F.signed(m.impact), el("span", { class: "ft-cell__sub" }, recTag(m.rec, true, prov(m)), prov(m) ? el("span", { class: "ft-prov", text: "Official window " + range(m.wStart, m.wEnd) }) : null), null, signCls(m.impact)));
    box.appendChild(el("div", { class: "ft-signal" }, head, grid)); fitChips();
    var call = el("div", { class: "s-callout s-callout--violet ft-callout s-hide-sm", html: S.icon("vote", 16) }), p = el("p");
    if (!m.resolved) {
      p.appendChild(el("b", { text: "Information for " + m.org.name + ", not the decision:" }));
      p.appendChild(document.createTextNode(" the Snapshot vote, " + range(m.vOpen, m.vClose) + ", decides."));
    } else {
      p.appendChild(el("b", { text: m.org.name + " decided on Snapshot: " + (m.approved ? "approved." : "rejected.") }));
      p.appendChild(document.createTextNode(" The market's final signal: " + REC[m.rec].label.toLowerCase() + " (" + F.signed(m.impact) + "). The vote, not the market, made the call."));
    }
    call.appendChild(p); box.appendChild(call);
    var act = el("div", { class: "s-hero__actions ft-actions" });
    var trade = el("a", { class: "s-btn", href: "#ft-ticket", html: S.icon(m.resolved ? "download" : "swap", 16) });
    trade.appendChild(el("span", { text: m.resolved ? "Redeem tokens" : "Trade " + m.id }));
    trade.addEventListener("click", function (e) {
      var t = $("#ft-ticket"); if (!t) return; e.preventDefault();
      t.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      setTimeout(function () { var i = $("#ft-amount"); if (i) i.focus({ preventScroll: true }); }, reduceMotion ? 0 : 450);
    });
    act.appendChild(trade);
    var snap = el("button", { class: "s-btn s-btn--ghost", attrs: { type: "button", "data-demo": "Snapshot is not linked in this concept." } }, el("span", { text: m.resolved ? "Snapshot result" : "Snapshot vote" }));
    snap.insertAdjacentHTML("beforeend", S.icon("external", 14)); act.appendChild(snap);
    if (m.dec) { var app = el("a", { class: "s-btn s-btn--quiet", href: "../app/#m=" + m.dec.id }, el("span", { text: "Open #" + m.dec.id + " in App" })); app.insertAdjacentHTML("beforeend", S.icon("arrow-right", 14)); act.appendChild(app); }
    box.appendChild(act);
  }

  /* ---- hero poster: the EF 45° fork, drawn as a chart ---- */
  function renderPosterLabels(m) {
    var top = $("#ft-poster-top"), foot = $("#ft-poster-foot"); S.clear(top); S.clear(foot);
    top.appendChild(S.ui.specs([{ text: m.id }, { text: m.pair }]));
    top.appendChild(S.ui.specs(["Signal band ±1% · 5-day TWAP"]));
    foot.appendChild(S.ui.specs(m.dec ? ["Mkt #" + m.dec.id, "#" + m.yesM.id, "#" + m.noM.id] : [m.org.name, "Est. on " + (D.chain(m.chain) || { name: m.chain }).name]));
    foot.appendChild(el("div", { class: "s-specs" }, el("span", {}, "Status: ", el("b", { text: m.resolved ? (m.approved ? "Approved" : "Rejected") : phase(m).i === 1 ? "Reports not open yet · trading" : phase(m).label }))));
  }
  function drawPoster() {
    var m = cur(), box = $("#ft-poster-art");
    if (!box || !box.clientWidth) return;
    var W = box.clientWidth, Hh = box.clientHeight || 420, small = W < 560;
    var y = m.yesTwap, n = m.noTwap, up = n * (1 + RULE.approveAbove), dn = n * (1 + RULE.rejectBelow);
    var mix = m.resolved ? .5 : m.pA, sp = y * mix + n * (1 - mix);
    var lo = Math.min(y, n, dn), hi = Math.max(y, n, up), pad = (hi - lo) * .22; lo -= pad; hi += pad;
    var top = small ? 62 : 76, bot = small ? 56 : 66, ph = Hh - top - bot;
    var Y = function (v) { return top + (hi - v) / (hi - lo) * ph; };
    var labW = small ? 92 : 150, ex = W - labW - (small ? 12 : 26), sx = Math.round(W * (small ? .25 : .32)), x0 = small ? 16 : 24;
    var Ys = Y(sp), Yy = Y(y), Yn = Y(n);
    var gap = 46, svg = sv("svg", { viewBox: "0 0 " + W + " " + Hh, width: W, height: Hh, class: "ft-poster__svg", role: "img",
      "aria-label": "If " + m.id + " is approved, " + m.tok + " " + F.price(y, 4) + " sDAI; if rejected, " + F.price(n, 4) + " sDAI. Gap " + F.signed(m.impact) + ", " + REC[m.rec].why + "." });
    // construction grid on 45°, aligned so both branches run along grid lines
    var g = sv("g", { class: "ft-pt-grid" }), cA = sx + Ys, cB = sx - Ys;
    for (var k = -Hh; k < W + Hh; k += gap) {
      var a = k + ((cA - k) % gap + gap) % gap, b = k + ((cB - k) % gap + gap) % gap;
      g.appendChild(sv("path", { d: "M" + (a - Hh) + " " + Hh + "L" + a + " 0" }));
      g.appendChild(sv("path", { d: "M" + b + " 0L" + (b + Hh) + " " + Hh }));
    }
    svg.appendChild(g);
    var cg = sv("g", { class: "ft-pt-circles" });
    cg.appendChild(sv("circle", { cx: sx, cy: Ys, r: small ? 30 : 42 })); cg.appendChild(sv("circle", { cx: sx, cy: Ys, r: small ? 60 : 84 }));
    svg.appendChild(cg);
    // neutral band: NO price ±1% — YES must clear it for an approve or reject signal
    svg.appendChild(sv("rect", { class: "ft-pt-band", x: sx, y: Y(up), width: ex - sx, height: Y(dn) - Y(up) }));
    // each label has a long, a shorter and a bare form; after drawing, a label that would reach a branch or the
    // stem labels steps down a form (2026-10-21: "36% REJECT+1% · LEANS APPROVE…" ran together at 1440)
    var bandLbl = [[up, "+1%", "approve above", Y(up) + 15], [dn, "−1%", "reject below", Y(dn) - 7]].map(function (l) {
      svg.appendChild(sv("line", { class: "ft-pt-rule", x1: sx, x2: ex, y1: Y(l[0]), y2: Y(l[0]) }));
      var px = F.price(l[0], 4), forms = small ? [l[1]] : [l[1] + " · leans " + l[2] + " " + px, l[1] + " · " + l[2] + " " + px, l[1]];
      var t = sv("text", { class: "ft-pt-micro", x: ex - 10, y: l[3], "text-anchor": "end" }); t.textContent = forms[0].toUpperCase(); svg.appendChild(t);
      return { t: t, y: l[3], forms: forms };
    });
    // stem + branches (45°, then flat)
    svg.appendChild(sv("path", { class: "ft-pt-stem", d: "M" + x0 + " " + Ys + "H" + sx }));
    var lose = m.resolved ? (m.approved ? "no" : "yes") : null;
    [["yes", Yy], ["no", Yn]].forEach(function (b) {
      var dy = b[1] - Ys, kx = sx + Math.min(Math.abs(dy), ex - sx - 20);
      svg.appendChild(sv("circle", { class: "ft-pt-knee", cx: kx, cy: b[1], r: small ? 10 : 14 }));
      svg.appendChild(sv("path", { class: "ft-pt-branch ft-pt-branch--" + b[0] + (lose === b[0] ? " is-void" : ""), d: "M" + sx + " " + Ys + "L" + kx + " " + b[1] + "H" + ex }));
    });
    svg.appendChild(sv("circle", { class: "ft-pt-node", cx: sx, cy: Ys, r: small ? 5 : 6 }));
    [["yes", Yy], ["no", Yn]].forEach(function (b) { svg.appendChild(sv("circle", { class: "ft-pt-end ft-pt-end--" + b[0] + (lose === b[0] ? " is-void" : ""), cx: ex, cy: b[1], r: small ? 6 : 7 })); });
    // end labels (de-overlapped)
    var hiB = Yy <= Yn ? "yes" : "no", minSep = small ? 30 : 40, yTop = Math.min(Yy, Yn), yBot = Math.max(Yy, Yn);
    if (yBot - yTop < minSep) { var mid = (yTop + yBot) / 2; yTop = mid - minSep / 2; yBot = mid + minSep / 2; }
    var lx = ex + (small ? 14 : 20), vs = small ? 18 : 26;
    function endLabel(br, yv, above) {
      var name = br === "yes" ? "If approved" : "If rejected", val = br === "yes" ? y : n;
      var v = sv("text", { class: "ft-pt-value" + (lose === br ? " is-void" : ""), x: lx, y: yv + vs * .36, style: "font-size:" + vs + "px" }); v.textContent = F.price(val, 4); svg.appendChild(v);
      var t = sv("text", { class: "ft-pt-micro", x: lx, y: above ? yv - vs * .62 - 2 : yv + vs * .36 + 15 }); t.textContent = (lose === br ? name + " · void" : name).toUpperCase(); svg.appendChild(t);
    }
    endLabel(hiB, yTop, true); endLabel(hiB === "yes" ? "no" : "yes", yBot, false);
    if (!small && yBot - yTop > 118) {
      var gm = (yTop + yBot) / 2, gv = sv("text", { class: "ft-pt-gap", x: lx, y: gm + 5 }); gv.textContent = F.signed(m.impact); svg.appendChild(gv);
      var gl = sv("text", { class: "ft-pt-micro", x: lx, y: gm - 12 }); gl.textContent = "GAP"; svg.appendChild(gl);
    }
    // stem labels
    var s1 = sv("text", { class: "ft-pt-micro", x: x0, y: Ys - 14 }); s1.textContent = (small ? m.tok + " now" : m.tok + " · one price").toUpperCase(); svg.appendChild(s1);
    var s2 = sv("text", { class: "ft-pt-micro", x: x0, y: Ys + 22 });
    (m.resolved ? [(small ? "" : "Decided · ") + (m.approved ? "approved" : "rejected")] : small ? [F.pct0(m.pA) + " approve"] : [F.pct0(m.pA) + " approve", F.pct0(1 - m.pA) + " reject"])
      .forEach(function (line, i) { var ts = sv("tspan", { x: x0, dy: i ? 15 : 0 }); ts.textContent = line.toUpperCase(); s2.appendChild(ts); });
    svg.appendChild(s2);
    S.clear(box).appendChild(svg);
    // fit the band labels: a label's left end stays right of where a 45° branch crosses its line and of the stem labels
    var stems = [s1, s2].map(function (t) { try { var b = t.getBBox(); return b.width ? { top: b.y, bot: b.y + b.height, right: b.x + b.width } : null; } catch (e) { return null; } });
    var form = 0; // both labels end up in the same form, the shortest either one needs
    bandLbl.forEach(function (b) {
      var top = b.y - 10, bot = b.y + 3, minL = sx + 12;
      [Yy, Yn].forEach(function (yEnd) { // the 45° part of a branch spans Ys..yEnd; find where it is nearest this label's line
        var lo = Math.max(top, Math.min(Ys, yEnd)), hi = Math.min(bot, Math.max(Ys, yEnd));
        if (lo <= hi) minL = Math.max(minL, sx + (lo <= Ys && Ys <= hi ? 0 : Math.min(Math.abs(lo - Ys), Math.abs(hi - Ys))) + 12);
      });
      stems.forEach(function (r) { if (r && top < r.bot && bot > r.top) minL = Math.max(minL, r.right + 14); });
      for (var i = 0; i < b.forms.length; i++) {
        b.t.textContent = b.forms[i].toUpperCase();
        var w = 0; try { w = b.t.getComputedTextLength(); } catch (e) { /* not laid out */ }
        if (!w || ex - 10 - w >= minL) break;
      }
      form = Math.max(form, Math.min(i, b.forms.length - 1));
    });
    bandLbl.forEach(function (b) { b.t.textContent = b.forms[Math.min(form, b.forms.length - 1)].toUpperCase(); });
  }

  /* ======================= figures + lifecycle ======================= */
  function renderStats(m) {
    var box = $("#ft-stats"); S.clear(box); var st = S.ui.stat;
    box.appendChild(m.resolved ? st("DAO decision", m.approved ? "Approved" : "Rejected", { note: "Snapshot · " + F.dayMon(m.vClose) })
      : st("Chance of approval", F.pct0(m.pA), { note: m.dec ? "Decision market #" + m.dec.id : "Sample estimate" }));
    box.appendChild(st("Volume", F.compact(m.volume, 1), { unit: "sDAI", note: "Both branches" }));
    box.appendChild(st("TVL", m.tvl ? F.compact(m.tvl, 1) : "0", { unit: "sDAI", note: m.tvl ? "YES and NO pools" : "Pools closed" }));
    box.appendChild(st("Snapshot vote", range(m.vOpen, m.vClose), { note: m.resolved || NOW >= m.vClose ? "Closed" : NOW < m.vOpen ? "Not started" : "Open" }));
  }
  function renderLife(m) {
    var box = $("#ft-life"); S.clear(box); var p = phase(m);
    var steps = [
      { label: "Markets open", note: F.dayMon(m.created) },
      { label: "Trading", note: p.i === 1 ? "Now · to " + F.dayMon(m.wStart) : range(m.created, m.wStart) },
      { label: "TWAP window", note: range(m.wStart, m.wEnd) },
      { label: "Snapshot vote", note: range(m.vOpen, m.vClose) },
      { label: "Reality.eth answer", note: F.dayMon(m.resolution) },
      { label: "Redeem", note: m.resolved ? "Open now" : "Winning branch" }
    ].map(function (s, i) { s.done = i < p.i; s.current = i === p.i; return s; });
    box.appendChild(el("div", { class: "ft-life__head" },
      el("div", {}, el("span", { class: "s-spec", text: "Lifecycle · " + m.id }), el("h2", { class: "t-h3", text: "The signal is fixed before the vote opens" })),
      el("span", { class: "t-meta", text: "Signal snapshot · " + F.dateTime(NOW) })));
    box.appendChild(S.ui.timeline(steps));
  }

  /* ======================= TWAP chart + window scrubber ======================= */
  var ch = { root: null, svg: null, band: null, geom: null, drag: null, hover: -1 };
  function renderChartHead(m) {
    var h = $("#ft-chart-head"); S.clear(h);
    h.appendChild(el("div", { class: "ft-chartcard__title" }, el("span", { class: "s-spec", text: "Conditional prices · " + m.pair + " · hourly" }), el("h2", { class: "t-h3", attrs: { id: "ft-chart-title" }, text: m.tok + " under each outcome" })));
    h.appendChild(el("div", { class: "s-row ft-chartcard__meta", style: { "--gap": "14px" } }, S.chart.legend([{ name: "If approved · YES_" + m.tok, color: "var(--c-yes)" }, { name: "If rejected · NO_" + m.tok, color: "var(--c-no)" }], "line")));
  }
  function drawChart() {
    var m = cur(), s = m.series, L = s.length, root = ch.root;
    if (!root || !root.clientWidth) return;
    var W = Math.max(260, root.clientWidth), small = W < 560, Hh = small ? 250 : 300;
    var ml = 0, mr = small ? 76 : 104, mt = 30, mb = 42, pw = W - ml - mr, ph = Hh - mt - mb;
    var t0 = s[0][0], t1 = s[L - 1][0], lo = Infinity, hi = -Infinity;
    s.forEach(function (r) { lo = Math.min(lo, r[1], r[2]); hi = Math.max(hi, r[1], r[2]); });
    var pad = (hi - lo) * .14 || .01; lo -= pad; hi += pad;
    var X = function (t) { return ml + (t - t0) / (t1 - t0) * pw; }, Y = function (v) { return mt + (hi - v) / (hi - lo) * ph; };
    var svg = sv("svg", { viewBox: "0 0 " + W + " " + Hh, width: W, height: Hh, role: "img", tabindex: "0",
      "aria-label": m.tok + " price if approved and if rejected, hourly over 7 days. Arrow keys read prices; Shift with arrows moves the TWAP window." });
    svg.style.touchAction = "pan-y";
    var g = sv("g", { class: "grid" });
    S.chart.niceTicks(lo, hi, small ? 3 : 4).forEach(function (t) {
      if (t < lo || t > hi) return; var yy = Math.round(Y(t)) + .5;
      g.appendChild(sv("line", { x1: ml, x2: ml + pw, y1: yy, y2: yy }));
      var tx = sv("text", { x: ml, y: yy - 5 }); tx.textContent = F.price(t, 3); svg.appendChild(tx);
    });
    svg.insertBefore(g, svg.firstChild);
    for (var t = Math.ceil(t0 / DAY) * DAY; t <= t1; t += (small ? 2 : 1) * DAY) {
      var lx = X(t); if (lx < 20 || lx > ml + pw - 20) continue;
      var tl = sv("text", { x: lx, y: Hh - 4, "text-anchor": "middle" }); tl.textContent = F.dayMon(t); svg.appendChild(tl);
    }
    // official window (when it overlaps the visible week)
    var oa = Math.max(m.wStart, t0), ob = Math.min(m.wEnd, t1);
    if (ob > oa) {
      svg.appendChild(sv("rect", { class: "ft-offwin", x: X(oa), y: mt + ph + 6, width: Math.max(2, X(ob) - X(oa)), height: 3, rx: 1.5 }));
      var ol = sv("text", { class: "ft-offwin__lbl", x: X(oa), y: mt + ph + 21 }); ol.textContent = "OFFICIAL WINDOW"; svg.appendChild(ol);
    }
    var band = sv("g", { class: "ft-bandg" }); svg.appendChild(band);
    var ends = [];
    [[1, "var(--c-yes)", "If approved"], [2, "var(--c-no)", "If rejected"]].forEach(function (c) {
      var gs = sv("g", { class: "series" }), d = "";
      s.forEach(function (r, k) { d += (k ? "L" : "M") + X(r[0]).toFixed(1) + " " + Y(r[c[0]]).toFixed(1); });
      var ln = sv("path", { class: "line", d: d }); ln.style.stroke = c[1]; gs.appendChild(ln);
      var dot = sv("circle", { class: "dot", cx: X(t1), cy: Y(s[L - 1][c[0]]), r: 4 }); dot.style.fill = c[1]; gs.appendChild(dot);
      svg.appendChild(gs); ends.push({ y: Y(s[L - 1][c[0]]), v: s[L - 1][c[0]], name: c[2] });
    });
    if (Math.abs(ends[0].y - ends[1].y) < 30) { var mid = (ends[0].y + ends[1].y) / 2, up0 = ends[0].y <= ends[1].y; ends[0].y = mid + (up0 ? -15 : 15); ends[1].y = mid + (up0 ? 15 : -15); }
    ends.forEach(function (e) {
      var v = sv("text", { class: "lbl-strong", x: ml + pw + 10, y: e.y - 1 }); v.textContent = F.price(e.v, 4); svg.appendChild(v);
      var nm = sv("text", { class: "lbl", x: ml + pw + 10, y: e.y + 12 }); nm.textContent = e.name; svg.appendChild(nm);
    });
    var bandTop = sv("g", { class: "ft-bandtop" }); svg.appendChild(bandTop);
    var xh = sv("line", { class: "xhair", x1: 0, x2: 0, y1: mt, y2: mt + ph, visibility: "hidden" }); svg.appendChild(xh);
    var hd = [1, 2].map(function (c) { var d = sv("circle", { class: "dot", r: 4, visibility: "hidden" }); d.style.fill = c === 1 ? "var(--c-yes)" : "var(--c-no)"; svg.appendChild(d); return d; });
    var hit = sv("rect", { class: "hit ft-hit", x: ml, y: mt, width: pw, height: ph }); svg.appendChild(hit);
    ch.svg = svg; ch.band = band; ch.bandTop = bandTop; ch.geom = { X: X, Y: Y, W: W, ml: ml, mt: mt, pw: pw, ph: ph, small: small };
    function idxAt(clientX) { var bb = svg.getBoundingClientRect(), px = (clientX - bb.left) * W / bb.width; return clamp(Math.round((px - ml) / pw * (L - 1)), 0, L - 1); }
    function show(i, cx, cy) {
      var r = s[i], x = X(r[0]); ch.hover = i;
      xh.setAttribute("x1", x); xh.setAttribute("x2", x); xh.setAttribute("visibility", "visible");
      hd.forEach(function (d, k) { d.setAttribute("cx", x); d.setAttribute("cy", Y(r[k + 1])); d.setAttribute("visibility", "visible"); });
      var bb = svg.getBoundingClientRect();
      S.tip.show(cx != null ? cx : bb.left + x * bb.width / W, cy != null ? cy : bb.top + 24, F.dateTime(r[0]), [
        { label: "If approved", value: F.price(r[1], 4), color: "var(--c-yes)" },
        { label: "If rejected", value: F.price(r[2], 4), color: "var(--c-no)" },
        { label: "Gap", value: F.signed(r[1] / r[2] - 1) }]);
    }
    function hide() { xh.setAttribute("visibility", "hidden"); hd.forEach(function (d) { d.setAttribute("visibility", "hidden"); }); S.tip.hide(); }
    hit.addEventListener("pointermove", function (e) {
      var i = idxAt(e.clientX);
      if (ch.drag) { moveWindow(i + ch.drag.off); return; }
      hit.style.cursor = i >= state.i0 && i <= state.i1 ? "grab" : "crosshair";
      show(i, e.clientX, e.clientY);
    });
    hit.addEventListener("pointerdown", function (e) {
      if (e.button) return;
      var i = idxAt(e.clientX), span = state.i1 - state.i0;
      if (i >= state.i0 && i <= state.i1) ch.drag = { off: state.i1 - i };
      else { ch.drag = { off: Math.round(span / 2) }; moveWindow(i + ch.drag.off); }
      try { hit.setPointerCapture(e.pointerId); } catch (x) { /* fine */ }
      hit.style.cursor = "grabbing"; hide();
    });
    function stop() { ch.drag = null; hit.style.cursor = "grab"; }
    hit.addEventListener("pointerup", stop); hit.addEventListener("pointercancel", stop);
    hit.addEventListener("pointerleave", function () { if (!ch.drag) hide(); });
    svg.addEventListener("blur", hide);
    svg.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault(); var dir = e.key === "ArrowRight" ? 1 : -1;
      if (e.shiftKey) { moveWindow(state.i1 + dir * 6); return; }
      show(clamp((ch.hover < 0 ? L - 1 : ch.hover) + dir * 3, 0, L - 1));
    });
    S.clear(root).appendChild(svg);
    drawBand();
  }
  function drawBand() {
    var m = cur(), s = m.series, g = ch.geom, band = ch.band, top = ch.bandTop; if (!g || !band) return;
    S.clear(band); S.clear(top);
    var x0 = g.X(s[state.i0][0]), x1 = g.X(s[state.i1][0]), ty = twap(s, state.i0, state.i1, 1), tn = twap(s, state.i0, state.i1, 2);
    band.appendChild(sv("rect", { class: "ft-band", x: x0, y: g.mt, width: Math.max(1, x1 - x0), height: g.ph }));
    band.appendChild(sv("line", { class: "ft-band__edge", x1: x0, x2: x0, y1: g.mt, y2: g.mt + g.ph }));
    band.appendChild(sv("line", { class: "ft-band__edge", x1: x1, x2: x1, y1: g.mt, y2: g.mt + g.ph }));
    top.appendChild(sv("rect", { class: "ft-band__grip", x: x1 - 4, y: g.mt + g.ph / 2 - 14, width: 8, height: 28, rx: 3 }));
    var lab = sv("text", { class: "ft-band__lbl", x: clamp((x0 + x1) / 2, g.ml + 60, g.ml + g.pw - 60), y: g.mt - 12, "text-anchor": "middle" });
    lab.textContent = (state.days + "-day window" + (isRule() ? " · signal" : "")).toUpperCase(); top.appendChild(lab);
    var yy = g.Y(ty), yn = g.Y(tn), wide = x1 - x0 > 128;
    [[yy, "var(--c-yes)", ty, yy < yn], [yn, "var(--c-no)", tn, yn < yy]].forEach(function (l) {
      var ln = sv("line", { class: "ft-twapline", x1: x0, x2: x1, y1: l[0], y2: l[0] }); ln.style.stroke = l[1]; band.appendChild(ln);
      if (wide) { var t = sv("text", { class: "lbl ft-halo", x: x0 + 8, y: l[3] ? l[0] - 8 : l[0] + 17 }); t.textContent = "TWAP " + F.price(l[2], 4); top.appendChild(t); }
    });
  }
  function isRule() { var L = cur().series.length; return state.days === 5 && state.i1 === L - 1; }
  function setWindow(days, end) {
    var L = cur().series.length, span = Math.min(days * 24, L - 1);
    state.days = days; state.i1 = clamp(end, span, L - 1); state.i0 = state.i1 - span;
  }
  function moveWindow(end) {
    var span = state.i1 - state.i0, L = cur().series.length, e = clamp(end, span, L - 1);
    if (e === state.i1) return;
    state.i1 = e; state.i0 = e - span; drawBand(); updateReadout();
  }
  var sc = {};
  function renderScrub(m) {
    var box = $("#ft-scrub"); S.clear(box); var L = m.series.length;
    var seg = S.ui.seg([[1, "1 day"], [3, "3 days"], [5, "5 days · signal"], [7, "7 days"]], state.days, function (v) { setWindow(v, state.i1); drawBand(); updateReadout(); }, "Window length");
    sc.range = el("input", { class: "s-range", attrs: { type: "range", min: "0", max: String(L - 1), step: "1", "aria-label": "Window end" } });
    sc.range.addEventListener("input", function () { moveWindow(+sc.range.value); });
    sc.end = el("b", { class: "t-num" });
    var reset = el("button", { class: "s-btn s-btn--quiet s-btn--sm ft-reset", attrs: { type: "button" }, html: S.icon("clock", 14) });
    reset.appendChild(document.createTextNode("Reset to the 5-day signal"));
    reset.addEventListener("click", function () { setWindow(5, L - 1); renderScrub(m); drawBand(); updateReadout(); });
    sc.reset = reset;
    box.appendChild(el("div", { class: "ft-scrub__controls" },
      el("div", { class: "ft-field" }, el("span", { class: "ft-field__label", text: "Window length" }), seg),
      el("label", { class: "ft-field ft-field--range" }, el("span", { class: "ft-field__label" }, "Window ends ", sc.end), sc.range),
      reset));
    sc.vals = {};
    var mk = function (k, label, key) { var v = el("span", { class: "ft-cell__value t-num" }); sc.vals[k] = v; var c = cell(label, "", null, key); c.replaceChild(v, c.children[1]); return c; };
    sc.sig = el("span", { class: "ft-cell__value ft-cell__value--tag" });
    var sigCell = el("div", { class: "ft-cell" }, el("span", { class: "ft-cell__label", text: "Signal" }), sc.sig);
    box.appendChild(el("div", { class: "ft-readout" }, mk("y", "YES TWAP", "yes"), mk("n", "NO TWAP", "no"), mk("i", "Impact"), sigCell));
    sc.gauge = el("div", { class: "ft-gauge" }); box.appendChild(sc.gauge);
    sc.note = el("p", { class: "t-meta ft-scrub__note" }); box.appendChild(sc.note);
  }
  function updateReadout() {
    var m = cur(), s = m.series, L = s.length;
    var ty = twap(s, state.i0, state.i1, 1), tn = twap(s, state.i0, state.i1, 2), imp = ty / tn - 1, r = recOf(imp), rule = isRule();
    sc.vals.y.textContent = F.price(ty, 4); sc.vals.n.textContent = F.price(tn, 4);
    sc.vals.i.textContent = F.signed(imp); sc.vals.i.className = "ft-cell__value t-num " + signCls(imp);
    S.clear(sc.sig).appendChild(recTag(r, false));
    var span = state.i1 - state.i0, min = span, max = L - 1;
    sc.range.min = String(min); sc.range.max = String(max); sc.range.value = String(state.i1);
    sc.range.disabled = min >= max; sc.range.style.setProperty("--v", (max > min ? (state.i1 - min) / (max - min) * 100 : 100) + "%");
    sc.end.textContent = F.dayMon(s[state.i1][0]) + " · " + F.time(s[state.i1][0]) + " UTC";
    sc.reset.disabled = rule;
    gauge(sc.gauge, imp, rule ? null : m.impact);
    sc.note.textContent = rule
      ? (m.resolved ? "This is the official window: the final signal published before the vote." : "Last 5 days so far. The official window is " + range(m.wStart, m.wEnd) + "; the signal publishes when it closes.")
      : "Your window: " + F.signed(imp) + " (" + REC[r].label.toLowerCase() + "). The 5-day signal window reads " + F.signed(m.impact) + ". Only the fixed 5-day window produces the published signal.";
  }
  function gauge(box, imp, ruleImp, mini) {
    S.clear(box); box.classList.toggle("ft-gauge--mini", !!mini);
    var lim = Math.max(.03, Math.abs(imp) * 1.2, ruleImp != null ? Math.abs(ruleImp) * 1.2 : 0);
    var P = function (x) { return (clamp(x, -lim, lim) + lim) / (2 * lim) * 100; }, r = recOf(imp);
    var a = P(RULE.rejectBelow), b = P(RULE.approveAbove);
    var zones = [["reject", 0, a, "Leans reject"], ["neutral", a, b, "Neutral"], ["approve", b, 100, "Leans approve"]];
    var track = el("div", { class: "ft-gauge__track", attrs: { role: "img", "aria-label": "Impact " + F.signed(imp) + ": " + REC[r].label + " (" + REC[r].why + ")" } },
      zones.map(function (z) { return el("span", { class: "ft-gauge__zone" + (r === z[0] ? " is-on" : ""), data: { zone: z[0] }, style: { left: z[1] + "%", width: (z[2] - z[1]) + "%" } }); }));
    if (ruleImp != null) track.appendChild(el("i", { class: "ft-gauge__mark ft-gauge__mark--rule", style: { left: P(ruleImp) + "%" }, attrs: { title: "5-day signal window " + F.signed(ruleImp) } }));
    track.appendChild(el("i", { class: "ft-gauge__mark", style: { left: P(imp) + "%" } }));
    box.appendChild(track);
    var row = el("div", { class: "ft-gauge__ticks", attrs: { "aria-hidden": "true" } });
    zones.forEach(function (z, i) { row.appendChild(el("span", { class: "ft-gauge__zl" + (i === 0 ? " ft-gauge__zl--first" : i === 2 ? " ft-gauge__zl--last" : "") + (r === z[0] ? " is-on is-" + z[0] : ""), style: { left: (z[1] + z[2]) / 2 + "%" }, text: z[3] })); });
    if (!mini) [-lim, RULE.rejectBelow, RULE.approveAbove, lim].forEach(function (x, i) {
      row.appendChild(el("span", { class: "ft-gauge__tk" + (i === 0 ? " is-first" : i === 3 ? " is-last" : ""), style: { left: P(x) + "%" }, text: F.signed(x, Math.abs(x) >= .1 ? 0 : (Math.round(x * 1000) % 10 ? 1 : 0)) }));
    });
    box.appendChild(row);
    if (!mini && ruleImp != null) box.appendChild(el("div", { class: "s-legend ft-gauge__legend" }, el("span", {}, el("i", { class: "ft-lg-mark" }), "Your window"), el("span", {}, el("i", { class: "ft-lg-mark ft-lg-mark--rule" }), "5-day signal window")));
  }

  /* ======================= tabs ======================= */
  var TABS = ["Overview", "Markets and tokens", "Activity"];
  function renderTabs(m) {
    var bar = $("#ft-tabs"); S.clear(bar);
    var acts = activity(m);
    S.ui.tabs(bar, [{ label: TABS[0] }, { label: TABS[1], count: 4 }, { label: TABS[2], count: acts.length }], function (t, i) { state.tab = i; renderPane(m, acts); }, state.tab);
    renderPane(m, acts);
  }
  function renderPane(m, acts) {
    var p = $("#ft-pane"); S.clear(p);
    p.appendChild(state.tab === 0 ? paneOverview(m) : state.tab === 1 ? paneMarkets(m) : paneActivity(m, acts));
  }
  function paneOverview(m) {
    var wrap = el("div", { class: "ft-ov" });
    var left = el("div", { class: "ft-ov__main" },
      el("span", { class: "s-spec", text: "About " + m.id }),
      el("p", { class: "t-body ft-ov__about", text: ABOUT[m.id] || m.title }),
      S.ui.kv([
        ["Success measure", m.metric],
        ["Decided by", m.org.name + " on Snapshot"],
        ["Result reported by", "Reality.eth, with Kleros arbitration"],
        ["Chain", S.ui.chainBadge(m.chain)]
      ]));
    var pA = m.pA, outs = [{ name: "Approved", price: pA }, { name: "Not approved", price: 1 - pA }];
    var dm = el("div", { class: "s-card s-card--flat ft-dm" },
      el("div", { class: "ft-dm__head" }, el("span", { class: "s-spec", text: m.dec ? "Decision market #" + m.dec.id : "Decision market" }), m.dec ? S.ui.stateBadge(m.dec.state) : null),
      el("h3", { class: "t-title", text: "Will " + m.org.name + " approve " + m.id + "?" }),
      el("div", { class: "s-orows" }, outs.map(function (o) { return S.ui.orow(o, { actions: false }); })),
      el("p", { class: "t-meta", text: m.resolved ? "Resolved. Reality.eth reported the Snapshot result; the decision market paid out on it." : "Forecasts the vote, not the effect." }));
    if (m.dec) dm.appendChild(el("a", { class: "s-link t-meta", href: "../app/#m=" + m.dec.id, text: "Trade #" + m.dec.id + " in App" }));
    wrap.appendChild(el("div", { class: "ft-ov__grid" }, left, dm));
    if (m.f.linkedRound) {
      var P7 = D.proposal(D.featuredProposal), R = D.round4;
      var links = [
        ["deep", "Deep · #2841", "", P7.id + " forecast " + F.num(P7.deep.marketScore, 2) + " / 10", "../deep/#" + P7.id],
        ["opportunity", "Opportunity · #2842", "", P7.id + " · " + F.pct0(P7.opp.pSelect) + " chance of selection", "../opportunity/#" + P7.id],
        ["app", "App · #2843–#2845", "", "Contracts, tokens, events", "../app/#m=2843"]
      ];
      var thread = el("details", { class: "s-details ft-fold ft-fold--thread", data: { fold: "sm" } },
        el("summary", {}, el("span", { class: "ft-fold__t" }, el("b", { text: "Connected: " + R.name }), el("small", { text: "Deep, Opportunity and App markets on the same round" }))),
        el("div", { class: "ft-thread" }, el("div", { class: "ft-thread__head" }, el("span", { class: "s-spec", text: "Connected · " + R.name })),
        el("div", { class: "ft-thread__cards" }, links.map(function (l) {
          return el("a", { class: "s-card ft-tcard", href: l[4] }, S.ui.avatar(l[0], "ink"),
            el("span", { class: "ft-tcard__body" }, el("b", { text: l[1] }), el("span", { class: "ft-tcard__fig t-num", text: l[3] })),
            el("span", { class: "ft-tcard__go", html: S.icon("arrow-right", 16) }));
        }))));
      wrap.appendChild(thread); syncFolds(wrap);
    }
    return wrap;
  }
  function paneMarkets(m) {
    var wrap = el("div", { class: "ft-mk" }), d = m.dec;
    var dAddr = d ? d.address : D.addr("ft-mkt:" + m.id), cond = d ? d.conditionId : D.addr("ft-cond:" + m.id) + D.addr("ft-cond2:" + m.id).slice(6, 30), qid = d ? d.questionId : D.addr("ft-q:" + m.id) + D.addr("ft-q2:" + m.id).slice(6, 30);
    wrap.appendChild(el("div", { class: "ft-mk__head" }, el("span", { class: "s-spec", text: d ? "Decision market #" + d.id : "Decision market" }),
      el("div", { class: "s-row", style: { "--gap": "8px" } }, d ? S.ui.typeTag(d) : el("span", { class: "s-tag", text: "Categorical" }), d ? S.ui.verifyBadge(d.verify) : null)));
    wrap.appendChild(S.ui.kv([
      ["Question", d ? d.question : "Will " + m.org.name + " approve " + m.id + "?"],
      ["Market", S.ui.addr(dAddr, { chars: 6, href: d ? "../app/#m=" + d.id : null, what: "market address" })],
      ["Condition ID", S.ui.addr(cond, { chars: 6, what: "condition ID" })],
      ["Reality.eth question", S.ui.addr(qid, { chars: 6, what: "question ID" })],
      ["Oracle", "Reality.eth · Kleros as arbitrator"],
      ["Collateral", "sDAI and " + m.tok + ", split into YES_ and NO_ tokens"]
    ]));
    wrap.appendChild(el("span", { class: "s-spec ft-mk__sub", text: "Conditional pools" }));
    wrap.appendChild(el("div", { class: "ft-pools" }, [["yes", m.yesM, m.yesSpot, m.depthY], ["no", m.noM, m.noSpot, m.depthN]].map(function (p) {
      var Y = p[0] === "yes" ? "YES_" : "NO_";
      return el("div", { class: "s-card s-card--flat ft-pool" },
        el("div", { class: "ft-pool__head" }, el("span", { class: "ft-cell__label" }, el("i", { class: "ft-key" + (p[0] === "no" ? " ft-key--no" : "") }), p[0] === "yes" ? "If approved" : "If rejected"), el("span", { class: "t-meta", text: p[1] ? "#" + p[1].id : m.pair })),
        el("b", { class: "ft-pool__pair", text: Y + m.tok + " / " + Y + "sDAI" }),
        el("div", { class: "ft-pool__row" }, el("span", { class: "t-meta", text: "Price" }), el("b", { class: "t-num", text: F.price(p[2], 4) + " sDAI" })),
        el("div", { class: "ft-pool__row" }, el("span", { class: "t-meta", text: "Liquidity" }), el("b", { class: "t-num", text: F.compact(p[3], 1) + " sDAI" })),
        el("div", { class: "ft-pool__row" }, el("span", { class: "t-meta", text: "Pool" }), S.ui.addr(D.addr("ft-pool:" + m.id + ":" + p[0]), { what: "pool address" })),
        p[1] ? el("div", { class: "ft-pool__row" }, el("span", { class: "t-meta", text: "Conditional on" }), el("a", { class: "s-link t-meta", href: "../app/#m=" + p[1].id, text: "#" + p[1].parent.id + " → " + p[1].parent.outcome })) : null);
    })));
    wrap.appendChild(el("span", { class: "s-spec ft-mk__sub", text: "Outcome tokens" }));
    var tb = el("div");
    S.ui.table(tb, [
      { key: "sym", label: "Token", render: function (r) { return el("span", { class: "s-row s-row--nowrap", style: { "--gap": "8px" } }, el("i", { class: "ft-key" + (r.br === "no" ? " ft-key--no" : "") }), el("b", { class: "t-mono ft-sym", text: r.sym })); } },
      { key: "from", label: "Split from" },
      { key: "pays", label: "Redeems for" },
      { key: "addr", label: "Address", render: function (r) { return S.ui.addr(r.addr, { what: r.sym + " address" }); } }
    ], { rows: tokens(m), compact: true, caption: "Conditional outcome tokens" });
    wrap.appendChild(tb);
    wrap.appendChild(el("p", { class: "t-meta ft-mk__note", text: "Positions are ERC-1155 conditional tokens wrapped as ERC-20. There is no separate Invalid token: an invalid answer resolves as not approved. Sample addresses start with 0x5eed and do not exist." }));
    return wrap;
  }
  function paneActivity(m, acts) {
    var wrap = el("div", { class: "ft-act" });
    S.ui.table(wrap, [
      { key: "time", label: "When", sort: true, num: false, render: function (r) { return el("span", { class: "t-meta", text: F.ago(r.time), attrs: { title: F.dateTime(r.time) } }); } },
      { key: "action", label: "Action", render: function (r) { return el("b", { class: "ft-act__a", text: r.action }); } },
      { key: "branch", label: "Branch", render: function (r) { return r.branch === "both" ? el("span", { class: "t-2", text: "Both" }) : el("span", { class: "s-row s-row--nowrap", style: { "--gap": "8px" } }, el("i", { class: "ft-key" + (r.branch === "no" ? " ft-key--no" : "") }), r.branch === "yes" ? "If approved" : "If rejected"); } },
      { key: "amount", label: "Amount", num: true, sort: true, render: function (r) { return F.num(r.amount, 2) + " sDAI"; } },
      { key: "price", label: "Price", num: true, render: function (r) { return r.price == null ? el("span", { class: "t-3", text: "—" }) : F.price(r.price, 4); } },
      { key: "from", label: "Account", render: function (r) { return S.ui.addr(r.from); } },
      { key: "tx", label: "Tx", render: function (r) { return S.ui.addr(r.tx, { what: "transaction hash" }); } }
    ], { rows: acts, sortKey: "time", sortDir: "desc", compact: true, caption: "Recent activity in both conditional pools" });
    wrap.appendChild(el("p", { class: "t-meta ft-mk__note", text: "Sample events. Swaps price " + m.tok + " in one branch; splits and merges move sDAI in and out of both." }));
    return wrap;
  }

  /* ======================= ticket (kit bet slip, conditional) ======================= */
  function renderTicket(m) {
    var box = $("#ft-ticket-box"); S.clear(box);
    if (m.resolved) { box.appendChild(redeemPanel(m)); return; }
    var tk = state.tk;
    var panel = el("section", { class: "s-panel ft-ticket", attrs: { id: "ft-ticket", "aria-label": "Trade ticket" } });
    panel.appendChild(el("div", { class: "s-panel__head" },
      el("span", { class: "s-row", style: { "--gap": "8px" } }, el("span", { class: "ft-glyph", html: S.glyph("futarchy") }), el("span", { class: "t-meta", text: F.usd(m.volume) + " Vol." })),
      el("span", { class: "t-meta", text: m.yesM ? "#" + m.yesM.id + " · #" + m.noM.id : m.pair })));
    panel.appendChild(el("h3", { class: "t-title", text: "Trade " + m.tok + " on each future" }));
    var input, unit = el("span", { class: "ft-amount__unit" });
    var side = S.ui.seg([["buy", "Buy"], ["sell", "Sell"]], tk.side, function (v) { tk.side = v; tk.amount = 0; input.value = ""; calc(); renderView(m); }, "Order side");
    side.classList.add("ft-side"); panel.appendChild(side);
    var tiles = el("div", { class: "s-pricetiles" });
    [["yes", "If approved · YES_" + m.tok, m.yesSpot], ["no", "If rejected · NO_" + m.tok, m.noSpot]].forEach(function (b) {
      var t = el("button", { class: "s-pricetile ft-tile ft-tile--" + b[0], attrs: { type: "button", "aria-pressed": String(tk.branch === b[0]) } }, el("small", { text: b[1] }), el("b", { class: "t-num", text: F.price(b[2], 4) }));
      t.addEventListener("click", function () { tk.branch = b[0]; $$(".ft-tile", tiles).forEach(function (x) { x.setAttribute("aria-pressed", String(x === t)); }); calc(); renderView(m); });
      tiles.appendChild(t);
    });
    panel.appendChild(tiles);
    input = el("input", { attrs: { type: "text", inputmode: "decimal", placeholder: "0", autocomplete: "off", id: "ft-amount", maxlength: "12" } });
    if (tk.amount) input.value = F.num(tk.amount, 2);
    input.addEventListener("input", function () { tk.amount = Math.min(1e7, parseFloat(input.value.replace(/[^0-9.]/g, "")) || 0); calc(); });
    input.addEventListener("blur", function () { input.value = tk.amount ? F.num(tk.amount, 2) : ""; });
    var chips = el("div", { class: "s-amountchips" }, [10, 50, 100, 500].map(function (c) {
      var b = el("button", { attrs: { type: "button" }, text: "+" + c });
      b.addEventListener("click", function () { tk.amount = Math.round((tk.amount + c) * 100) / 100; input.value = F.num(tk.amount, 2); calc(); });
      return b;
    }));
    var rows = el("div", { class: "s-ticket__rows" }), warn = el("div", { class: "s-callout s-callout--warn ft-warn", attrs: { hidden: true, role: "status" } });
    var slip = S.ui.seg([[.005, "0.5%"], [.01, "1%"], [.03, "3%"]], tk.slip, function (v) { tk.slip = v; calc(); }, "Max slippage");
    slip.classList.add("ft-slip");
    var outs = el("div", { class: "ft-outs", attrs: { "aria-live": "polite" } });
    var conf = el("button", { class: "s-btn s-btn--lg", attrs: { type: "button" }, text: "Confirm" });
    var clr = el("button", { class: "s-icon-btn", attrs: { type: "button", "aria-label": "Clear amount" }, html: S.icon("close", 20) });
    clr.addEventListener("click", function () { tk.amount = 0; input.value = ""; calc(); input.focus(); });
    var summary = "";
    conf.addEventListener("click", function () {
      if (!tk.amount) { S.toast("Enter an amount first.", "alert"); input.focus(); return; }
      S.toast("Sample only: no transaction sent (" + summary + ").", "info");
    });
    panel.appendChild(el("div", { class: "s-panel s-panel--nested ft-ticket__box" },
      el("div", { class: "s-amount ft-amount" }, el("label", { attrs: { for: "ft-amount" }, text: "Amount" }), el("span", { class: "ft-amount__in" }, input, unit)),
      chips, rows, el("div", { class: "ft-sliprow" }, el("span", { text: "Max slippage" }), slip), warn, outs,
      el("div", { class: "s-ticket__confirm" }, conf, clr)));
    var payNote = el("p", { class: "t-meta" }); panel.appendChild(payNote);
    function line(k, v, cls) { return el("div", {}, el("span", { text: k }), el("b", { class: cls || "", text: v })); }
    function out(br, big, small) {
      return el("div", { class: "ft-out" }, el("span", { class: "ft-cell__label" }, el("i", { class: "ft-key" + (br === "no" ? " ft-key--no" : "") }), br === "yes" ? "If approved" : "If rejected"),
        el("b", { class: "t-num", text: big }), el("span", { class: "t-meta", text: small }));
    }
    function calc() {
      var yes = tk.branch === "yes", p = yes ? m.yesSpot : m.noSpot, depth = yes ? m.depthY : m.depthN, Rs = depth / 2, Rt = Rs / p, a = tk.amount;
      var P = yes ? "YES_" : "NO_", Q = yes ? "NO_" : "YES_", buy = tk.side === "buy";
      var got = 0, avg = p, imp = 0;
      if (a) { if (buy) { got = Rt * a / (Rs + a); avg = a / got; imp = a / Rs; } else { got = Rs * a / (Rt + a); avg = got / a; imp = a / (Rt + a); } }
      var payU = buy ? "sDAI" : m.tok, getU = buy ? P + m.tok : P + "sDAI";
      unit.textContent = payU; input.setAttribute("aria-label", "Amount in " + payU);
      payNote.textContent = "Pay with " + payU + " on " + (D.chain(m.chain) || { name: "Gnosis" }).name + ". Sample prices; nothing is traded.";
      S.clear(rows);
      rows.appendChild(line("Split first", a ? F.num(a, 2) + " " + payU + " → " + P + payU + " + " + Q + payU : "1 " + payU + " → 1 " + P + payU + " + 1 " + Q + payU));
      rows.appendChild(line("Average price", F.price(avg, 4) + " sDAI"));
      rows.appendChild(line("You receive", a ? F.num(got, 2) + " " + getU : "—"));
      rows.appendChild(line("Price impact", a ? F.pct(imp, 2) : "—", a && imp > tk.slip ? "t-warn" : ""));
      var over = a && imp > tk.slip;
      warn.hidden = !over; S.clear(warn);
      if (over) { warn.innerHTML = S.icon("alert", 16); warn.appendChild(el("span", {}, el("b", { text: "Thin pool. " }), "Price impact " + F.pct(imp, 2) + " is above your " + F.pct(tk.slip, 1) + " limit, so this trade would revert. Lower the amount or raise the limit.")); }
      S.clear(outs);
      var fmtU = function (v, u) { return a ? F.num(v, 2) + " " + u : "—"; };
      var hit = buy ? fmtU(got, m.tok) : fmtU(got, "sDAI"), back = fmtU(a, payU);
      var hitNote = buy ? "you hold " + m.tok + "; " + Q + "sDAI voids" : "instead of " + (a ? F.num(a, 2) + " " : "") + m.tok + "; " + Q + m.tok + " voids";
      var backNote = "trade undone: " + Q + payU + " redeems 1:1";
      var A = yes ? out("yes", hit, hitNote) : out("yes", back, backNote), B = yes ? out("no", back, backNote) : out("no", hit, hitNote);
      outs.appendChild(A); outs.appendChild(B);
      conf.textContent = a ? (buy ? "Buy " : "Sell ") + P + m.tok : "Confirm";
      conf.disabled = !!over;
      summary = a ? (buy ? "buy " + F.num(got, 2) + " " + P + m.tok + " for " + F.num(a, 2) + " sDAI" : "sell " + F.num(a, 2) + " " + P + m.tok + " for " + F.num(got, 2) + " " + P + "sDAI") : "";
    }
    calc();
    box.appendChild(panel);
  }
  function redeemPanel(m) {
    var W = m.approved ? "YES_" : "NO_", Lz = m.approved ? "NO_" : "YES_";
    var p = el("section", { class: "s-panel ft-ticket", attrs: { id: "ft-ticket", "aria-label": "Redeem tokens" } },
      el("div", { class: "s-panel__head" }, el("span", { class: "s-row", style: { "--gap": "8px" } }, el("span", { class: "ft-glyph", html: S.glyph("futarchy") }), el("span", { class: "t-meta", text: F.usd(m.volume) + " Vol." })), el("span", { class: "t-meta", text: m.pair })),
      el("h3", { class: "t-title", text: "Redeem " + m.id + " tokens" }),
      el("div", { class: "s-panel s-panel--nested ft-redeem" },
        el("div", { class: "ft-redeem__row" }, el("span", { class: "t-meta", text: "Winning branch" }), el("span", { class: "s-tag " + (m.approved ? "s-tag--pos" : "s-tag--neg"), text: m.approved ? "Approved · YES" : "Rejected · NO" })),
        el("div", { class: "ft-redeem__row" }, el("span", { class: "t-mono", text: W + "sDAI → sDAI" }), el("b", { text: "1 : 1" })),
        el("div", { class: "ft-redeem__row" }, el("span", { class: "t-mono", text: W + m.tok + " → " + m.tok }), el("b", { text: "1 : 1" })),
        el("div", { class: "ft-redeem__row" }, el("span", { class: "t-mono", text: Lz + " tokens" }), el("b", { class: "t-3", text: "Void" }))),
      el("button", { class: "s-btn s-btn--lg s-btn--block", attrs: { type: "button", "data-demo": "Connect a wallet to see redeemable balances. Sample only." }, text: "Connect wallet to redeem" }),
      el("p", { class: "t-meta", text: "Only the branch that happened pays out; trades in the other branch are undone." }));
    return p;
  }
  function renderView(m) {
    var box = $("#ft-view-box"); S.clear(box);
    if (m.resolved) return;
    var tk = state.tk, p = el("section", { class: "s-panel ft-view", attrs: { "aria-labelledby": "ft-view-title" } });
    p.appendChild(el("div", { class: "s-panel__head" }, el("h3", { class: "t-title", attrs: { id: "ft-view-title" }, text: "Your view on " + m.id }), el("span", { class: "t-meta", text: "Sets the ticket" })));
    var g = el("div", { class: "ft-view__grid", attrs: { role: "group", "aria-label": "Pick a view to set up the ticket" } },
      el("span"), el("span", { class: "ft-view__col" }, el("i", { class: "ft-key" }), "If approved"), el("span", { class: "ft-view__col" }, el("i", { class: "ft-key ft-key--no" }), "If rejected"));
    [["Bullish", m.tok + " higher if approved", ["buy", "sell"]], ["Bearish", m.tok + " higher if rejected", ["sell", "buy"]]].forEach(function (row) {
      g.appendChild(el("span", { class: "ft-view__row" }, el("b", { text: row[0] }), el("small", { text: row[1] })));
      ["yes", "no"].forEach(function (br, k) {
        var sd = row[2][k], on = tk.side === sd && tk.branch === br;
        var b = el("button", { class: "s-btn s-btn--ghost s-btn--sm ft-view__btn", attrs: { type: "button", "aria-pressed": String(on), "aria-label": row[0] + ": " + sd + " " + (br === "yes" ? "YES_" : "NO_") + m.tok }, text: sd === "buy" ? "Buy" : "Sell" });
        b.addEventListener("click", function () {
          if (tk.side !== sd) tk.amount = 0;
          tk.side = sd; tk.branch = br; renderTicket(m); renderView(m);
          var t = $("#ft-ticket"); if (t && t.getBoundingClientRect().top < 0) t.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
        });
        g.appendChild(b);
      });
    });
    p.appendChild(g);
    box.appendChild(p);
  }

  /* ======================= proposal list ======================= */
  function spark2(m) {
    var s = m.series, w = 300, h = 40, lo = Infinity, hi = -Infinity;
    s.forEach(function (r) { lo = Math.min(lo, r[1], r[2]); hi = Math.max(hi, r[1], r[2]); });
    var svg = sv("svg", { viewBox: "0 0 " + w + " " + h, preserveAspectRatio: "none", class: "ft-spark", "aria-hidden": "true" });
    [[1, "var(--c-yes)"], [2, "var(--c-no)"]].forEach(function (c) {
      var d = ""; for (var k = 0; k < s.length; k += 2) d += (k ? "L" : "M") + (k / (s.length - 1) * w).toFixed(1) + " " + (3 + (1 - (s[k][c[0]] - lo) / (hi - lo || 1)) * (h - 6)).toFixed(1);
      var p = sv("path", { d: d, fill: "none", "stroke-width": 1.6, "vector-effect": "non-scaling-stroke", "stroke-linejoin": "round" }); p.style.stroke = c[1]; svg.appendChild(p);
    });
    return svg;
  }
  function card(m) {
    var q = el("a", { class: "ft-pcard__q", href: "#" + m.id }, "Impact on " + m.tok + " price ", el("span", { class: "t-violet", text: "if " + m.id + " is approved" }));
    q.addEventListener("click", function (e) { e.preventDefault(); open(m.id); });
    var trio = el("div", { class: "ft-trio" },
      el("div", {}, el("small", {}, el("i", { class: "ft-key" }), "If approved"), el("b", { class: "t-num", text: F.price(m.yesTwap, 4) })),
      el("div", {}, el("small", {}, el("i", { class: "ft-key ft-key--no" }), "If rejected"), el("b", { class: "t-num", text: F.price(m.noTwap, 4) })),
      el("div", {}, el("small", { text: "Impact" }), el("b", { class: "t-num " + signCls(m.impact), text: F.signed(m.impact) })));
    var meta = el("div", { class: "s-card__meta" }, el("span", { text: F.usd(m.volume) + " Vol." }), el("span", { text: m.resolved ? "Voted " + F.dayMon(m.vClose) : "Vote " + F.dayMon(m.vOpen) }), el("span", { text: (D.chain(m.chain) || { name: m.chain }).name }));
    var c = el("article", { class: "s-card ft-pcard" + (m.id === state.id ? " is-current" : ""), data: { id: m.id } },
      el("div", { class: "s-card__head" }, el("span", { class: "ft-orgtile", text: m.tok, attrs: { "aria-hidden": "true" } }),
        el("div", { class: "ft-pcard__h" }, el("span", { class: "t-meta", text: m.org.name + " · " + m.id }), q)),
      el("p", { class: "ft-pcard__t", text: m.title }), spark2(m), trio,
      el("div", { class: "s-card__foot" }, meta, el("span", { class: "u-right" }, m.resolved ? el("span", { class: "s-tag " + (m.approved ? "s-tag--pos" : "s-tag--neg"), text: m.approved ? "Approved" : "Rejected" }) : recTag(m.rec, false, prov(m)))));
    if (m.id === state.id) c.setAttribute("aria-current", "true");
    c.addEventListener("click", function (e) { if (e.target.closest("a,button")) return; open(m.id); });
    return c;
  }
  var chipRowBox;
  function renderFilters() {
    var orgs = $("#ft-orgs"); S.clear(orgs);
    var items = [["all", "All", MODELS.length]].concat(D.orgs.map(function (o) { return [o.id, o.name, MODELS.filter(function (m) { return m.org.id === o.id; }).length]; }));
    chipRowBox = S.ui.chipRow(items, state.org, function (v) { state.org = v; renderList(); });
    // the status filter sits above the phone fold: using it opens the list
    orgs.appendChild(chipRowBox);
    var st = $("#ft-status"); S.clear(st);
    st.appendChild(S.ui.seg([["all", "All"], ["trading", "Trading"], ["resolved", "Resolved"]], state.status, function (v) { state.status = v; renderList(); unfold($("#ft-archive")); }, "Status"));
  }
  function clearFilters() {
    state.org = "all"; state.status = "all"; state.q = "";
    var si = $("[data-shell-search] input"); if (si) si.value = "";
    renderFilters(); renderList();
  }
  function renderList() {
    var grid = $("#ft-grid"); S.clear(grid);
    var q = state.q.trim().toLowerCase();
    var list = MODELS.filter(function (m) {
      if (state.org !== "all" && m.org.id !== state.org) return false;
      if (state.status === "trading" && m.resolved) return false;
      if (state.status === "resolved" && !m.resolved) return false;
      return !q || (m.id + " " + m.title + " " + m.org.name + " " + m.tok).toLowerCase().indexOf(q) > -1;
    });
    $("#ft-archive-n").textContent = MODELS.length + " proposals · " + D.orgs.length + " organisations · trading and resolved";
    // unfiltered: one card per organisation, then "Show all" (2026-10-21 text diet)
    var shown = list, few = !state.listAll && state.org === "all" && state.status === "all" && !q;
    if (few) { var seen = {}; shown = list.filter(function (m) { if (seen[m.org.id]) return false; seen[m.org.id] = 1; return true; }); few = shown.length < list.length; }
    $("#ft-count").textContent = (few ? shown.length + " of " + MODELS.length + " proposals, one per organisation" : list.length + " of " + MODELS.length + " proposals" + (q ? " matching “" + state.q.trim() + "”" : "")) + " · prices are 5-day TWAPs";
    if (!list.length) grid.appendChild(el("div", { class: "ft-empty" }, S.ui.empty({ title: "No proposals match", text: "Try another organisation, status or search.", motif: "fork", motifOpts: { split: .4, ws: 10, wa: 10, wb: 10 }, action: { label: "Clear filters", onClick: clearFilters } })));
    shown.forEach(function (m) { grid.appendChild(card(m)); });
    var mw = $("#ft-listmore"); if (mw) mw.parentNode.removeChild(mw);
    if (few) {
      var more = el("button", { class: "s-btn s-btn--ghost", attrs: { type: "button" }, text: "Show all " + list.length + " proposals" });
      more.addEventListener("click", function () {
        var had = shown.map(function (m) { return m.id; }); state.listAll = true; renderList();
        var nx = $$(".ft-pcard", grid).filter(function (c) { return had.indexOf(c.dataset.id) < 0; })[0];
        if (nx) { var a = nx.querySelector("a"); if (a) a.focus({ preventScroll: true }); }
      });
      grid.parentNode.insertBefore(el("div", { class: "ft-morewrap", attrs: { id: "ft-listmore" } }, more), grid.nextSibling);
    }
  }

  /* ======================= roles + track record ======================= */
  function renderRecord() {
    var roles = $("#ft-roles"); S.clear(roles);
    [["swap", "Traders", "Price the token under each outcome, and profit only if they are right about the branch that happens."],
      ["scale", "The signal band", "Turns the two prices into advice: 5-day TWAP, ±1%. Published before the vote opens."],
      ["vote", "The DAO", "Decides on Snapshot. The signal is advisory; nothing executes automatically."],
      ["verified", "Reality.eth and Kleros", "Report the vote's result on-chain, with Kleros arbitrating disputes. Then the winning branch redeems."]
    ].forEach(function (r, i) {
      roles.appendChild(el("li", { class: "ft-role" }, el("span", { class: "ft-role__i", html: S.icon(r[0], 18) }),
        el("div", {}, el("span", { class: "s-spec", text: String(i + 1).padStart(2, "0") }), el("b", { text: r[1] }), el("p", { class: "t-body", text: r[2] }))));
    });
    var box = $("#ft-record-table"); S.clear(box);
    // Real on Seer: futarchy.seer.pm's closed proposals, read from its list and each market page on 21 Oct 2026, 09:25-09:29 UTC
    var FT = "https://futarchy.seer.pm/markets/";
    var REAL = [
      ["GIP-153", "GnosisDAO", "Gnosis Chain transition into the Ethereum Economic Zone", 0.98, "yes", "23 Aug 2026", "0x4120de9931fd29c8a6effea4df57a7c8760c1677"],
      ["GIP-152", "GnosisDAO", "Spin out the Gnosis App into an independent company", 0, "awaiting", "Ended 12 Aug 2026", "0xee8878d0a7136c5cd109554f06bb780e225badef"],
      ["KIP-90", "Kleros", "Cooperative Spending Disclosure", 0.68, "yes", "20 Jul 2026", "0x84412fe9d088c1d8dd676a7be9a3d5d0291ab1cf"],
      ["GIP-151", "GnosisDAO", "One-time pro-rata treasury redemption", 0, "yes", "3 Jul 2026", "0xece80208cb8376be311ce0f5ea4ef73850a0dcf0"],
      ["KIP-88", "Kleros", "DAO Guidance to the Cooperative", 0.91, "yes", "9 Jun 2026", "0x0cae5e6f520e52e3d6a93c856bb6dbf7781f2e31"],
      ["KIP-86", "Kleros", "Exclude PNK held by the Kleros Cooperative from KIP-66", 0.94, "yes", "5 Apr 2026", "0xb607bd7c7201e966e6a150cd6ef1d08db55cad5d"],
      ["GIP-149", "GnosisDAO", "Fund continued support of Revoke.cash", -2.36, "no", "10 Mar 2026", "0x47c80f5f701ebc5f25cab64e660f0577890729c2"],
      ["GIP-145", "GnosisDAO", "Advisory Futarchy Pilot with $100k temporary liquidity", 1.96, "yes", "17 Feb 2026", "0x45e1064348fd8a407d6d1f59fc64b05f633b28fc"],
      ["KIP-81", "Kleros", "Priced the PNK level, not an impact", null, "no", "23 Nov 2025", "0x2c1e08674f3f78f8a1426a41c41b8bf546fa481a"]
    ].map(function (r) { return { id: r[0], org: r[1], title: r[2], impact: r[3], res: r[4], date: r[5], href: FT + r[6] }; });
    var realBox = el("div"), sampleBox = el("div", { attrs: { hidden: true } }), note = $(".ft-record__note");
    var NOTES = {
      real: "Impact as futarchy.seer.pm lists it; outcome as each market resolved. All six resolved markets with a non-zero gap leaned the way the DAO then voted. Correlation, not proof: the vote made each call. Snapshot of futarchy.seer.pm, 21 Oct 2026.",
      sample: note ? note.textContent : ""
    };
    box.appendChild(el("div", { class: "s-row s-row--between ft-record__bar" },
      el("span", { class: "s-src", attrs: { "data-state": "snapshot" } }, el("i", { attrs: { "aria-hidden": "true" } }), "Snapshot · futarchy.seer.pm · 21 Oct 2026"),
      S.ui.seg([["real", "On Seer · real"], ["sample", "Lattice · sample"]], "real", function (v) {
        realBox.hidden = v !== "real"; sampleBox.hidden = v === "real"; if (note) note.textContent = NOTES[v];
      }, "Which track record")));
    box.appendChild(realBox); box.appendChild(sampleBox);
    if (note) note.textContent = NOTES.real;
    S.ui.table(realBox, [
      { key: "id", label: "Proposal", render: function (r) { return el("span", { class: "ft-rec__p" }, el("a", { href: r.href, attrs: { rel: "noopener", target: "_blank", "aria-label": r.id + ", " + r.title + " (opens on Seer)" } }, el("b", { text: r.id })), el("span", { class: "t-meta u-clamp-1", text: r.org + " · " + r.title })); } },
      { key: "impact", label: "Impact listed", render: function (r) { return r.impact == null ? el("span", { class: "t-meta", text: "Level market" }) : el("b", { class: "t-num " + signCls(r.impact), text: (r.impact > 0 ? "+" : r.impact < 0 ? "−" : "+") + Math.abs(r.impact).toFixed(2) + "%" }); } },
      { key: "res", label: "Resolved", render: function (r) { return r.res === "awaiting" ? el("span", { class: "s-tag", text: "Awaiting" }) : el("span", { class: "s-tag " + (r.res === "yes" ? "s-tag--pos" : "s-tag--neg"), text: r.res === "yes" ? "Yes · approved" : "No · rejected" }); } },
      { key: "read", label: "Reading", render: function (r) {
        var t = r.impact == null ? "Not comparable: priced a level" : r.res === "awaiting" ? "No gap; resolution pending" : r.impact === 0 ? "No gap; decided on other grounds" : (r.impact > 0) === (r.res === "yes") ? "Leaned the way the DAO voted" : "Leaned against the vote";
        return el("span", { class: "t-2" }, t, el("span", { class: "t-meta", text: " · " + r.date }));
      } }
    ], { rows: REAL, caption: "Closed futarchy proposals on Seer: listed impact versus how each resolved" });
    var rows = MODELS.filter(function (m) { return m.resolved; });
    S.ui.table(sampleBox, [
      { key: "id", label: "Proposal", render: function (m) { return el("span", { class: "ft-rec__p" }, el("b", { text: m.id }), el("span", { class: "t-meta u-clamp-1", text: m.title })); } },
      { key: "impact", label: "Market signal", render: function (m) { return el("span", { class: "s-row s-row--nowrap", style: { "--gap": "8px" } }, el("b", { class: "t-num " + signCls(m.impact), text: F.signed(m.impact) }), recTag(m.rec, false)); } },
      { key: "approved", label: "DAO vote", render: function (m) { return el("span", { class: "s-tag " + (m.approved ? "s-tag--pos" : "s-tag--neg"), text: m.approved ? "Approved" : "Rejected" }); } },
      { key: "read", label: "Reading", render: function (m) {
        var agree = (m.rec === "approve" && m.approved) || (m.rec === "reject" && !m.approved);
        return el("span", { class: "t-2", text: m.rec === "neutral" ? "Neutral signal; decided on other grounds" : agree ? "Vote matched the signal" : "Vote went against the signal" });
      } }
    ], { rows: rows, onRow: function (m) { open(m.id); }, caption: "Resolved proposals: market signal versus the DAO's vote" });
  }

  /* ======================= how it works ======================= */
  function renderHow(m) {
    var box = $("#ft-how"); S.clear(box);
    var tok = m.tok;
    function step(n, title, text, diag) { return el("article", { class: "s-card s-card--pad ft-step" }, el("span", { class: "s-spec", text: n }), el("h3", { class: "t-h3", text: title }), el("p", { class: "t-body", text: text }), el("div", { class: "ft-diag" }, diag)); }
    var bar = function (cls, t) { return el("span", { class: "ft-bar " + cls, text: t }); };
    box.appendChild(step("01", "Split", "Deposit sDAI or " + tok + " and receive one YES and one NO token per unit. Exactly one side will be worth anything.",
      el("div", { class: "ft-diag__split" }, bar("ft-bar--base", "100 sDAI"), el("span", { class: "ft-diag__fork", html: S.glyph("futarchy") }),
        el("div", { class: "ft-diag__pair" }, bar("ft-bar--yes", "100 YES_sDAI"), bar("ft-bar--no", "100 NO_sDAI")))));
    box.appendChild(step("02", "Trade each future", "Two pools price " + tok + " in each world. The YES pool only settles if the proposal passes; the NO pool only if it fails.",
      el("div", { class: "ft-diag__pools" },
        el("div", {}, el("span", { class: "ft-cell__label" }, el("i", { class: "ft-key" }), "YES_" + tok + " / YES_sDAI"), el("b", { class: "t-num", text: F.price(m.yesSpot, 4) })),
        el("div", {}, el("span", { class: "ft-cell__label" }, el("i", { class: "ft-key ft-key--no" }), "NO_" + tok + " / NO_sDAI"), el("b", { class: "t-num", text: F.price(m.noSpot, 4) })))));
    var gb = el("div", { class: "ft-gauge" }); gauge(gb, m.impact, null, true);
    box.appendChild(step("03", "Read the gap", "The 5-day TWAP of YES against NO becomes the signal: leans approve above +1%, leans reject below −1%, otherwise neutral. The vote still decides.",
      el("div", { class: "ft-diag__gap" }, el("div", { class: "s-row s-row--between" }, el("b", { class: "t-num " + signCls(m.impact), text: F.signed(m.impact) }), recTag(m.rec, true, prov(m))), gb)));
    box.appendChild(step("04", "Vote, then redeem", "The DAO votes. Reality.eth reports the result and Kleros arbitrates disputes. The winning branch redeems 1:1; the other voids.",
      el("div", { class: "ft-diag__redeem" },
        el("div", {}, el("span", { class: "s-tag s-tag--pos", text: "Approved" }), el("span", { class: "t-meta", text: "YES_ redeems · NO_ voids" })),
        el("div", {}, el("span", { class: "s-tag s-tag--neg", text: "Rejected" }), el("span", { class: "t-meta", text: "NO_ redeems · YES_ voids" })))));
  }

  /* ======================= selection + routing ======================= */
  function renderProposal() {
    var m = cur();
    renderHero(m); renderPosterLabels(m); drawPoster(); renderStats(m); renderLife(m);
    renderChartHead(m); drawChart(); renderScrub(m); updateReadout();
    renderTabs(m); renderTicket(m); renderView(m); renderHow(m);
    $$(".ft-pcard").forEach(function (c) { var on = c.dataset.id === m.id; c.classList.toggle("is-current", on); if (on) c.setAttribute("aria-current", "true"); else c.removeAttribute("aria-current"); });
    document.title = m.id + " · Futarchy · Conditional markets (concept)";
  }
  function select(id) {
    if (!BY[id]) return false;
    state.id = id; setWindow(5, BY[id].series.length - 1);
    state.tk = { side: "buy", branch: "yes", amount: 0, slip: state.tk.slip };
    renderProposal(); return true;
  }
  function open(id) {
    if (id !== state.id) select(id);
    try { history.replaceState(null, "", "#" + id); } catch (e) { /* file:// in some browsers */ }
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  }
  function fromHash() { var h = decodeURIComponent(location.hash.replace(/^#/, "")); return BY[h] ? select(h) : false; }

  /* ======================= On Seer band: the real EIP-8363 market's state ======================= */
  // futarchy.seer.pm showed "Remaining Time 2d 14h 32m" at 21 Oct 2026 09:27 UTC, so trading ends 24 Oct 00:00 UTC
  // (data-closes in index.html). The prices stay the dated snapshot; only the state line follows the real clock.
  (function () {
    var s = $("#ft-onseer-state"), t = s ? Date.parse(s.getAttribute("data-closes") || "") : NaN;
    if (!isFinite(t) || Date.now() < t) return;
    S.clear(s).appendChild(document.createTextNode("Trading closed " + F.dayMon(t) + ", resolving"));
    s.appendChild(el("span", { class: "s-hide-sm", text: " on Reality.eth" }));
    s.appendChild(document.createTextNode(". At the snapshot"));
  })();

  /* ======================= boot ======================= */
  ch.root = el("div", { class: "s-chart ft-chart" });
  $("#ft-chart").appendChild(ch.root);
  if (!fromHash()) select("LIP-31");
  S.onResize(ch.root, drawChart);
  S.onResize($("#ft-poster-art"), drawPoster);
  S.onResize($("#ft-hero-copy"), fitChips);
  renderFilters(); renderList(); renderRecord();
  syncFolds();
  if (mqSm.addEventListener) mqSm.addEventListener("change", function () { syncFolds(null, true); });
  window.addEventListener("hashchange", fromHash);
  document.addEventListener("seer:search", function (e) { state.q = (e.detail && e.detail.q) || ""; renderList(); if (state.q) unfold($("#ft-archive")); });
})();
