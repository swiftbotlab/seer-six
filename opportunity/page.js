/* Opportunity Markets (05 · opportunity.seer.pm) — page script.
   Concept by Swift Bot Labs. Not affiliated with Seer. Sample data only (window.SEER_SAMPLE).
   Market #2842 "Lattice Builders Grants R4: which proposals will the panel fund?" — 40 entries + Invalid,
   8 funding slots. Chance of selection = p.opp.pSelect; share price = p.opp.price (the shared dataset).
   All text is inserted via textContent (Seer.el). No fetch, no eval, no innerHTML of data. */
(function () {
  "use strict";
  var D = window.SEER_SAMPLE, S = window.Seer;
  if (!D || !S || !S.ui) return;
  var U = S.ui, F = S.fmt, el = S.el, $ = S.$, $$ = S.$$;
  var R = D.round4, M = D.market("2842"), NOW = D.now, HOUR = 3600e3, DAY = 24 * HOUR;
  var SLOTS = R.slots, PAYOUT = 1 / SLOTS, SLIP = 0.005, FEAT = D.featuredProposal || "P-07";
  var LIP = (D.futarchy || []).filter(function (f) { return f.id === "LIP-31"; })[0];
  var DECISION = D.market("2843");

  /* ---------- helpers ---------- */
  function logit(p) { p = Math.max(1e-4, Math.min(1 - 1e-4, p)); return Math.log(p / (1 - p)); }
  function sigm(x) { return 1 / (1 + Math.exp(-x)); }
  function pad2(n) { return String(n).padStart(2, "0"); }
  function cents1(p) { var c = p * 100; return F.num(c, c >= 1 ? 1 : 2) + "¢"; }
  var CAP = F.num(100 / SLOTS, 1) + "¢";                     // what a funded share redeems: 1/8 sDAI = 12.5¢
  function ofCap(p) { return cents1(p) + " of " + CAP; }     // "6.3¢ of 12.5¢": the price read against the payout
  function pts(d) { var v = Math.abs(d * 100); if (v < 0.05) return "±0.0 pts"; return (d > 0 ? "+" : "−") + F.num(v, 1) + " pts"; }
  function dcls(d) { return Math.abs(d) < 0.0005 ? "t-3" : d > 0 ? "t-pos" : "t-neg"; }
  function icon(name, size) { return el("span", { class: "op-ico", html: S.icon(name, size || 16), attrs: { "aria-hidden": "true" } }); }
  function setHash(h) { try { history.replaceState(null, "", h ? "#" + h : location.pathname + location.search); } catch (e) { /* file:// fine */ } }

  /* ---------- entries (one per outcome of #2842) ---------- */
  var E = D.proposals.map(function (p) {
    var oi = -1;
    M.outcomes.forEach(function (o, k) { if (o.proposal === p.id) oi = k; });
    return { p: p, id: p.id, title: p.title, team: p.team, cat: p.category, ask: p.ask, chance: p.opp.pSelect, price: p.opp.price,
      rank: p.deep.rank, score: p.deep.marketScore, oi: oi, out: M.outcomes[oi] };
  }).sort(function (a, b) { return a.rank - b.rank; });
  var BY = {};
  var INVALID = M.outcomes.filter(function (o) { return o.invalid; })[0];
  var LINE_IN = E[SLOTS - 1], LINE_OUT = E[SLOTS];          // the two entries either side of the selection line
  var LINE = (LINE_IN.chance + LINE_OUT.chance) / 2;

  /* Price history: the same smoothed series the App explorer draws for #2842 (so the two pages agree),
     mapped to chance of selection by shifting it in log-odds so it ends exactly on pSelect. */
  function priceHist(k) { return D.series(M.id, k); }
  function chanceHist(e) {
    if (e._h) return e._h;
    var ph = priceHist(e.oi), shift = logit(e.chance) - logit(ph[ph.length - 1][1]);
    e._h = ph.map(function (q) { return [q[0], +sigm(logit(q[1]) + shift).toFixed(4)]; });
    e._h[e._h.length - 1][1] = e.chance;
    return e._h;
  }
  function chanceAgo(e, ms) { var h = chanceHist(e), t = NOW - ms; for (var i = h.length - 1; i >= 0; i--) if (h[i][0] <= t) return h[i][1]; return h[0][1]; }
  E.forEach(function (e) {
    BY[e.id] = e; e.inside = e.rank <= SLOTS; e.close = e.chance >= .35 && e.chance < .65;
    e.d24 = e.chance - chanceAgo(e, DAY);
  });

  /* ======================= 1. hero ======================= */
  function facts() {
    var dl = $("#op-facts"); if (!dl) return;
    [["Entries", String(E.length), "proposals"], ["Slots", String(SLOTS), "to fund"], ["Budget", F.compact(R.budget), "sDAI"], ["Decision", F.dayMon(R.panelReveal), F.ago(R.panelReveal)]].forEach(function (f) {
      dl.appendChild(el("div", {}, el("dt", { text: f[0] }), el("dd", {}, f[1], el("small", { text: f[2] }))));
    });
  }

  function poster() {
    var board = $("#op-board"), cap = $("#op-cap"); if (!board || !cap) return;
    var rows = [], active = -1, pinned = BY[FEAT] ? BY[FEAT].rank - 1 : SLOTS - 1;
    // bar length on a square-root scale so the long tail stays readable at thumbnail size; grid lines mark 5/25/50%
    var grid = el("div", { class: "op-board__grid", attrs: { "aria-hidden": "true" } }, [.05, .25, .5].map(function (v) { return el("i", { style: { left: (Math.sqrt(v) * 100).toFixed(2) + "%" } }); }));
    var list = el("div", { class: "op-board__rows" });
    E.forEach(function (e, i) {
      var r = el("div", { class: "op-brow" + (e.inside ? " is-in" : "") + (e.id === FEAT ? " is-feat" : ""), data: { i: String(i) }, style: { "--v": String(Math.sqrt(e.chance).toFixed(4)) } },
        el("span", { class: "op-brow__n", text: pad2(e.rank) }),
        el("span", { class: "op-brow__track" }, el("i"), el("b", { class: "op-brow__v", text: F.pct0(e.chance) })));
      list.appendChild(r); rows.push(r);
      if (e.rank === SLOTS) list.appendChild(el("div", { class: "op-sline", attrs: { "aria-hidden": "true" } }, el("span", { text: "Selection line · " + SLOTS + " slots" })));
    });
    board.appendChild(el("div", { class: "op-board__in" }, grid, list));

    function set(i) {
      if (i === active) return;
      active = i;
      rows.forEach(function (r, k) { r.classList.toggle("is-active", k === i); });
      var e = E[i]; S.clear(cap);
      cap.appendChild(el("div", { class: "op-cap__l" },
        el("b", { text: e.id + " · " + e.title }),
        el("span", { text: "Rank " + e.rank + " of " + E.length + " · " + (e.inside ? "inside the line" : "below the line") + " · " + ofCap(e.price) + " a share" }),
        el("small", { class: "op-cap__why", text: SLOTS + " slots: a funded share redeems 1/" + SLOTS + " sDAI (" + CAP + "), so " + cents1(e.price) + " ≈ " + F.pct0(e.chance) + "." })));
      cap.appendChild(el("div", { class: "op-cap__num" }, F.pct0(e.chance), el("small", { text: "Chance of selection" })));
    }
    function rowAt(ev) { var r = ev.target.closest && ev.target.closest(".op-brow"); return r ? +r.dataset.i : -1; }
    list.addEventListener("pointermove", function (ev) { var i = rowAt(ev); if (i > -1) set(i); });
    list.addEventListener("pointerleave", function () { set(pinned); });
    list.addEventListener("click", function (ev) { var i = rowAt(ev); if (i > -1) { pinned = i; openEntry(E[i].id); } });
    board.addEventListener("keydown", function (ev) {
      var k = ev.key, n = active;
      if (k === "ArrowDown" || k === "ArrowRight") n = Math.min(E.length - 1, active + 1);
      else if (k === "ArrowUp" || k === "ArrowLeft") n = Math.max(0, active - 1);
      else if (k === "Home") n = 0; else if (k === "End") n = E.length - 1;
      else if (k === "Enter" || k === " ") { ev.preventDefault(); openEntry(E[active].id); return; }
      else return;
      ev.preventDefault(); pinned = n; set(n);
    });
    set(pinned);
  }

  /* ======================= 2. market head + flow ======================= */
  function round() {
    var specs = $("#op-mspecs");
    if (specs) specs.appendChild(U.specs([{ html: "Mkt <b>#" + M.id + "</b>" }, "Builders Grants R4", { class: "s-hide-sm", html: "<b>" + E.length + "</b> entries + Invalid" }]));
    var b = $("#op-mbadges");
    if (b) { b.appendChild(U.stateBadge(M.state)); b.appendChild(U.verifyBadge(M.verify)); b.appendChild(U.chainBadge(M.chain)); b.appendChild(U.typeTag(M)); b.appendChild(el("span", { class: "s-tag", text: M.collateral })); }
    var st = $("#op-mstats");
    if (st) {
      st.appendChild(U.stat("Volume", F.usd(M.volume), { unit: "sDAI", note: "Since listing, " + F.dayMon(M.created) }));
      st.appendChild(U.stat("Liquidity", F.usd(M.liquidity), { unit: "sDAI", note: "Across 41 outcome pools" }));
      st.appendChild(U.stat("Entries", String(E.length), { unit: "+ Invalid", note: F.pct(INVALID.price, 1) + " on Invalid" }));
      st.appendChild(U.stat("Funding slots", String(SLOTS), { note: F.num(R.budget) + " sDAI pool" }));
      st.appendChild(U.stat("Closest call", F.pct(LINE_IN.chance, 1) + " / " + F.pct(LINE_OUT.chance, 1), { note: LINE_IN.id + " and " + LINE_OUT.id + ", ranks 8 and 9" }));
      st.appendChild(U.stat("Reports open", F.dayMon(M.openingDate), { note: "Panel decision · " + F.ago(M.openingDate) }));
    }
    var flow = $("#op-flow"); if (!flow) return;
    var names = D.opportunity.flow;
    var steps = [
      [names[0], "Teams submitted " + E.length + " proposals to " + R.org + ".", F.dayMon(R.opens), "done"],
      [names[1], "Each entry trades as its own outcome token, from the day it is listed.", "Now", "now"],
      [names[2], "Reviewers start with the entries nearest the selection line.", "Until " + F.dayMon(R.panelReveal), "now"],
      [names[3], "Five reviewers score every proposal; the top " + SLOTS + " are funded.", F.dayMon(R.panelReveal), "next"],
      [names[4], "Funded entries' shares redeem for 1/" + SLOTS + " sDAI each; the rest for nothing.", "After " + F.dayMon(R.panelReveal), "next"]
    ];
    steps.forEach(function (s, i) {
      flow.appendChild(el("li", { class: "op-flow__step is-" + s[3] },
        el("span", { class: "op-flow__n", html: s[3] === "done" ? S.icon("check", 13) : null, text: s[3] === "done" ? null : pad2(i + 1) }),
        el("div", { class: "op-flow__body" },
          el("div", { class: "op-flow__when" }, el("span", { text: s[2] }), s[3] === "now" ? el("span", { class: "s-tag s-tag--violet s-tag--mono", text: i === 1 ? "Trading" : "Reviewing" }) : null),
          el("b", { text: s[0] }), el("p", { text: s[1] }))));
    });
  }

  /* ======================= 3. the field ======================= */
  var ST = { cat: "all", q: "", sort: "chance", close: false, view: "grid", more: false };
  var QN = window.matchMedia && window.matchMedia("(max-width: 640px)").matches ? 6 : 10; // review-queue rows before "Show all"
  var SORTS = {
    chance: function (a, b) { return a.rank - b.rank; },
    move: function (a, b) { return Math.abs(b.d24) - Math.abs(a.d24) || a.rank - b.rank; },
    ask: function (a, b) { return b.ask - a.ask || a.rank - b.rank; },
    id: function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; }
  };
  function matches(e) {
    if (ST.cat !== "all" && e.cat !== ST.cat) return false;
    if (ST.close && !e.close) return false;
    if (ST.q) { var q = ST.q.toLowerCase(); if ((e.id + " " + e.title + " " + e.team + " " + e.cat).toLowerCase().indexOf(q) < 0) return false; }
    return true;
  }
  function tradeBtns(e, small) {
    var buy = el("button", { class: "s-btn s-btn--xs", attrs: { type: "button", "aria-label": "Buy " + e.id + " at " + cents1(e.price) } }, small ? "Buy" : "Buy " + cents1(e.price));
    var sell = el("button", { class: "s-btn s-btn--xs s-btn--secondary", attrs: { type: "button", "aria-label": "Sell " + e.id }, text: "Sell" });
    buy.addEventListener("click", function (ev) { ev.stopPropagation(); openEntry(e.id, "buy"); });
    sell.addEventListener("click", function (ev) { ev.stopPropagation(); openEntry(e.id, "sell"); });
    return el("span", { class: "op-trade" }, buy, sell);
  }
  function spark(e) {
    var h = chanceHist(e), v = [];
    for (var i = 0; i < h.length; i += 6) v.push(h[i][1]);
    v.push(e.chance);
    var s = S.chart.spark(v, { w: 64, h: 22, color: e.inside ? "var(--c1)" : "var(--text-3)" });
    return el("span", { class: "op-card__spark", title: "Chance since listing (" + (M.ageDays || 11) + " days)" }, s);
  }
  function card(e) {
    var c = el("article", { class: "s-card op-card" + (e.inside ? " is-in" : "") + (e.id === FEAT ? " is-feat" : ""), data: { id: e.id } });
    var title = el("a", { class: "s-card__title op-card__title", href: "#" + e.id, text: e.title });
    title.addEventListener("click", function (ev) { ev.preventDefault(); openEntry(e.id); });
    var tags = el("span", { class: "op-card__tags" }, el("span", { class: "op-card__id", text: e.id + " · " + e.cat }), e.close ? el("span", { class: "s-tag s-tag--violet op-tag-close", text: "Close call" }) : null);
    c.appendChild(el("div", { class: "s-card__head op-card__head" },
      el("span", { class: "op-tile" + (e.inside ? " is-in" : ""), attrs: { "aria-hidden": "true" } }, el("small", { text: "Rank" }), el("b", { text: pad2(e.rank) })),
      el("div", { class: "op-card__hd" }, tags, title)));
    c.appendChild(el("div", { class: "op-card__odds" },
      el("div", { class: "op-card__chance" }, el("b", { text: F.pct0(e.chance) }), el("span", { text: "chance of selection" })),
      el("div", { class: "op-card__px" }, el("span", { class: "op-card__price" }, cents1(e.price), el("small", { text: " of " + CAP })), el("span", { class: dcls(e.d24), text: pts(e.d24) + " 24h" })),
      spark(e)));
    c.appendChild(el("div", { class: "s-pbar op-card__bar" + (e.inside ? "" : " is-out"), style: { "--p": String(e.chance) }, attrs: { "aria-hidden": "true" } }, el("i")));
    c.appendChild(el("div", { class: "op-card__act" }, tradeBtns(e)));
    c.appendChild(el("div", { class: "s-card__foot" },
      el("div", { class: "s-card__meta" }, el("span", { text: e.team }), el("span", { text: F.compact(e.ask) + " sDAI ask" })),
      el("div", { class: "s-card__icons" }, el("button", { attrs: { type: "button", "aria-label": "Bookmark " + e.id, "data-demo": "Bookmarks are not wired in this concept." }, html: S.icon("bookmark", 15) }))));
    c.addEventListener("click", function (ev) { if (ev.target.closest("a,button")) return; openEntry(e.id); });
    return c;
  }
  function groupHead(title, sub, n) {
    return el("div", { class: "op-ghead" }, el("div", {}, el("h3", { class: "t-title", text: title }), el("p", { class: "t-meta", text: sub })), el("span", { class: "s-count op-ghead__n", text: n + (n === 1 ? " entry" : " entries") }));
  }
  function divider() {
    var gap = LINE_IN.chance - LINE_OUT.chance;
    return el("div", { class: "op-divider", attrs: { role: "separator", "aria-label": "Selection line: " + SLOTS + " funding slots" } },
      el("span", { class: "op-divider__lbl" }, el("span", { class: "s-spec", text: "Selection line · " + SLOTS + " slots · " + F.num(R.budget) + " sDAI" }),
        el("span", { class: "t-meta", text: LINE_IN.id + " (" + F.pct(LINE_IN.chance, 1) + ") and " + LINE_OUT.id + " (" + F.pct(LINE_OUT.chance, 1) + ") are " + F.num(gap * 100, 1) + " points apart" })));
  }
  function note(t) { return el("p", { class: "op-gempty t-meta", text: t }); }
  function renderGrid() {
    var host = $("#op-grid"); if (!host) return; S.clear(host);
    var list = E.filter(matches).sort(SORTS[ST.sort]);
    var a = list.filter(function (e) { return e.inside; }), b = list.filter(function (e) { return !e.inside; });
    host.appendChild(groupHead("Inside the line", "The market's current top " + SLOTS + ": the shortlist if prices are right", a.length));
    host.appendChild(a.length ? el("div", { class: "op-cards" }, a.map(card)) : note("No entries inside the line match these filters."));
    host.appendChild(divider());
    host.appendChild(groupHead("Below the line", "Ranks " + (SLOTS + 1) + "–" + E.length + ": each still read and scored by the panel", b.length));
    var few = 4; // one row of cards below the line; "Show all" opens the rest
    var limit = ST.more || b.length <= few + 4 ? b.length : few;
    host.appendChild(b.length ? el("div", { class: "op-cards" }, b.slice(0, limit).map(card)) : note("No entries below the line match these filters."));
    if (b.length > limit) {
      var more = el("button", { class: "s-btn s-btn--ghost op-more", attrs: { type: "button" }, text: "Show all " + b.length + " below the line" });
      more.addEventListener("click", function () { ST.more = true; renderGrid(); var c = $$(".op-cards", host)[1]; if (c && c.children[limit]) { var t = c.children[limit].querySelector("a"); if (t) t.focus({ preventScroll: true }); } });
      host.appendChild(el("div", { class: "op-morewrap" }, more));
    }
    fieldNote(list.length, a.length + Math.min(b.length, limit));
  }
  var tableApi = null;
  function renderTable() {
    var host = $("#op-table"); if (!host) return;
    var rows = E.filter(matches);
    if (!tableApi) {
      tableApi = U.table(host, [
        { key: "rank", label: "Rank", num: true, sort: true, width: "64px", render: function (r) { return el("span", { class: "op-rk" + (r.inside ? " is-in" : "") }, pad2(r.rank)); } },
        { key: "title", label: "Entry", sort: true, render: function (r) { return el("div", { class: "op-tcell" }, el("b", { text: r.title }), el("span", { class: "t-meta", text: r.id + " · " + r.team })); } },
        { key: "cat", label: "Category", sort: true, class: "s-hide-sm", render: function (r) { return el("span", { class: "s-tag", text: r.cat }); } },
        { key: "ask", label: "Ask (sDAI)", num: true, sort: true, class: "s-hide-sm", render: function (r) { return F.num(r.ask); } },
        { key: "score", label: "Deep score", num: true, sort: true, class: "s-hide-sm", render: function (r) { return el("a", { class: "s-link", href: "../deep/#" + r.id, text: F.num(r.score, 2), title: "Forecast panel score in Deep #2841" }); } },
        { key: "chance", label: "Chance", num: true, sort: true, render: function (r) { return el("span", { class: "op-tchance" }, el("span", { class: "s-pbar s-pbar--thin" + (r.inside ? "" : " is-out"), style: { "--p": String(r.chance) } }, el("i")), el("b", { text: F.pct0(r.chance) })); } },
        { key: "price", label: "Price · of " + CAP, num: true, sort: true, render: function (r) { return cents1(r.price); } },
        { key: "d24", label: "24h", num: true, sort: true, render: function (r) { return el("span", { class: dcls(r.d24), text: pts(r.d24) }); } },
        { key: "act", label: "Trade", class: "op-tact", render: function (r) { return tradeBtns(r, true); } }
      ], { rows: rows, sortKey: "rank", sortDir: "asc", onRow: function (r) { openEntry(r.id); }, caption: "Entries in market #2842 with price and chance of selection", empty: { title: "No entries match", text: "Clear the filters to see all 40." } });
    } else tableApi.update(rows);
    fieldNote(rows.length, rows.length);
  }
  function fieldNote(match, shown) {
    var n = $("#op-fieldnote"); if (!n) return;
    n.textContent = (match === E.length ? "All " + E.length + " entries" : match + " of " + E.length + " entries match") + (shown < match ? ", " + shown + " shown" : "") + ". Chance of selection is the market's estimate for each entry; the panel's scores decide. Sample data.";
  }
  function renderField() { if (ST.view === "grid") renderGrid(); else renderTable(); }
  function field() {
    var counts = {}; E.forEach(function (e) { counts[e.cat] = (counts[e.cat] || 0) + 1; });
    var cats = [["all", "All", E.length]].concat(Object.keys(counts).sort().map(function (k) { return [k, k, counts[k]]; }));
    var cbox = $("#op-cats"); if (cbox) cbox.appendChild(U.chipRow(cats, "all", function (v) { ST.cat = v; ST.more = false; renderField(); }));
    var vbox = $("#op-view");
    if (vbox) {
      vbox.appendChild(U.seg([["grid", "Grid"], ["table", "Table"]], "grid", function (v) {
        ST.view = v; $("#op-grid").hidden = v !== "grid"; $("#op-table").hidden = v !== "table";
        $("#op-sort").closest(".op-sort").hidden = v !== "grid"; renderField();
      }, "Field view"));
    }
    var sort = $("#op-sort"); if (sort) sort.addEventListener("change", function () { ST.sort = sort.value; renderField(); });
    var close = $("#op-close"); if (close) close.addEventListener("change", function () { ST.close = close.checked; ST.more = false; renderField(); });
    var q = $("#op-q"), shellQ = $("[data-shell-search] input");
    if (q) q.addEventListener("input", function () { ST.q = q.value.trim().slice(0, 80); if (shellQ) shellQ.value = q.value; renderField(); });
    var jumped = false;
    document.addEventListener("seer:search", function (ev) {
      var v = String((ev.detail && ev.detail.q) || "").slice(0, 80); ST.q = v.trim(); if (q) q.value = v; renderField();
      if (!jumped && v) { jumped = true; var f = $("#field"), r = f.getBoundingClientRect(); if (r.top > window.innerHeight * .6 || r.bottom < 0) f.scrollIntoView({ behavior: "smooth", block: "start" }); }
    });
    renderField();
  }

  /* ======================= 4. review queue ======================= */
  var QS = { hi: .70, lo: .20, order: "close", all: false };
  var DEPTH = { full: { label: "Full review", short: "Full", h: 3, color: "var(--violet-2)" }, fast: { label: "Fast-track", short: "Fast", h: 1, color: "var(--violet-3)" }, light: { label: "Light pass", short: "Light", h: .5, color: "var(--c-other)" } };
  function depthOf(e) { return e.chance >= QS.hi ? "fast" : e.chance < QS.lo ? "light" : "full"; }
  function queueList() {
    var list = E.slice(); list.forEach(function (e) { e.dep = depthOf(e); });
    if (QS.order === "close") {
      var w = { full: 0, fast: 1, light: 2 };
      list.sort(function (a, b) { return w[a.dep] - w[b.dep] || (a.dep === "full" ? Math.abs(a.chance - LINE) - Math.abs(b.chance - LINE) : a.rank - b.rank) || a.rank - b.rank; });
    }
    return list;
  }
  var qTable = null;
  function renderQueue() {
    var list = queueList(), n = { full: 0, fast: 0, light: 0 }, hours = 0;
    list.forEach(function (e, i) { e.qo = i + 1; n[e.dep]++; hours += DEPTH[e.dep].h; });
    var allFull = E.length * DEPTH.full.h;
    var st = $("#op-qstats");
    if (st) {
      S.clear(st);
      st.appendChild(U.stat("Full review", String(n.full), { unit: "entries", note: F.num(n.full * DEPTH.full.h) + " h" }));
      st.appendChild(U.stat("Fast-track", String(n.fast), { unit: "entries", note: F.num(n.fast * DEPTH.fast.h) + " h" }));
      st.appendChild(U.stat("Light pass", String(n.light), { unit: "entries", note: F.num(n.light * DEPTH.light.h, 1).replace(/\.0$/, "") + " h" }));
      st.appendChild(U.stat("Per reviewer", F.num(hours, 1).replace(/\.0$/, ""), { unit: "h", note: "vs " + allFull + " h reading all in full" }));
    }
    var strip = $("#op-strip");
    if (strip) {
      S.clear(strip);
      strip.setAttribute("aria-label", "Reading depth by entry: " + n.full + " full reviews, " + n.fast + " fast-tracks, " + n.light + " light passes. Bars are ranked by chance of selection.");
      var cols = el("div", { class: "op-strip__cols" });
      E.forEach(function (e) {
        var d = depthOf(e), col = el("span", { class: "op-strip__col is-" + d, style: { "--v": String(e.chance) } }, el("i"));
        col.addEventListener("pointermove", function (ev) { S.tip.show(ev.clientX, ev.clientY, e.id + " · rank " + e.rank, [{ label: "Chance", value: F.pct0(e.chance), color: DEPTH[d].color }, { label: "Review", value: DEPTH[d].label }]); });
        col.addEventListener("pointerleave", S.tip.hide);
        col.addEventListener("click", function () { openEntry(e.id); });
        cols.appendChild(col);
      });
      strip.appendChild(el("div", { class: "op-strip__y", attrs: { "aria-hidden": "true" } }, el("span", { text: "100%" }), el("span", { text: "50%" }), el("span", { text: "0" })));
      var plot = el("div", { class: "op-strip__plot" }, cols,
        el("span", { class: "op-strip__th is-hi", style: { bottom: (QS.hi * 100) + "%" } }, el("b", { text: "Fast-track ≥ " + F.pct0(QS.hi) })),
        el("span", { class: "op-strip__th is-lo", style: { bottom: (QS.lo * 100) + "%" } }, el("b", { text: "Light pass < " + F.pct0(QS.lo) })),
        el("span", { class: "op-strip__line", style: { "--k": String(SLOTS), "--n": String(E.length) } }, el("b", { text: SLOTS + " slots" })));
      strip.appendChild(plot);
      strip.appendChild(el("div", { class: "op-strip__x", attrs: { "aria-hidden": "true" } }, el("span", { text: "Rank 01" }), el("span", { text: "Rank " + E.length })));
    }
    var rows = QS.all ? list : list.slice(0, QN);
    var cols2 = [
      { key: "o", label: "Order", num: true, width: "64px", render: function (r) { return el("span", { class: "op-rk" }, pad2(r.qo)); } },
      { key: "title", label: "Entry", render: function (r) { return el("div", { class: "op-tcell" }, el("b", { text: r.title }), el("span", { class: "t-meta", text: r.id + " · rank " + r.rank + " · " + r.team })); } },
      { key: "chance", label: "Chance", num: true, render: function (r) { return el("span", { class: "op-tchance" }, el("span", { class: "s-pbar s-pbar--thin" + (r.inside ? "" : " is-out"), style: { "--p": String(r.chance) } }, el("i")), el("b", { text: F.pct0(r.chance) })); } },
      { key: "gap", label: "From the line", num: true, class: "s-hide-sm", render: function (r) { return el("span", { class: "t-2", text: pts(r.chance - LINE) }); } },
      { key: "dep", label: "Review", render: function (r) { return el("span", { class: "op-dep is-" + r.dep }, el("i"), el("span", { class: "op-dep__l", text: DEPTH[r.dep].label }), el("span", { class: "op-dep__s", text: DEPTH[r.dep].short })); } },
      { key: "h", label: "Time", num: true, class: "s-hide-sm", render: function (r) { return DEPTH[r.dep].h >= 1 ? DEPTH[r.dep].h + " h" : "30 min"; } }
    ];
    var host = $("#op-qtable");
    if (host) {
      if (!qTable) qTable = U.table(host, cols2, { rows: rows, compact: true, onRow: function (r) { openEntry(r.id); }, caption: "Review queue for Lattice Builders Grants Round 4" });
      else qTable.update(rows);
    }
    var more = $("#op-qmore"); if (more) more.textContent = QS.all ? "Show the first " + QN : "Show all " + E.length;
    var sub = $("#op-qsub"); if (sub) sub.textContent = QS.order === "close" ? "Full reviews first, closest to the selection line at the top; then fast-tracks, then light passes." : "Ranked by price, highest chance first. The dashed line is the eighth funding slot.";
  }
  function queue() {
    function bindRange(id, key, min, max) {
      var r = $("#" + id), v = $("#" + id + "-v"); if (!r) return;
      function upd() {
        var x = +r.value / 100;
        if (key === "hi" && x <= QS.lo) { x = QS.lo + .05; r.value = Math.round(x * 100); }
        if (key === "lo" && x >= QS.hi) { x = QS.hi - .05; r.value = Math.round(x * 100); }
        QS[key] = x; v.textContent = F.pct0(x); r.style.setProperty("--v", ((+r.value - min) / (max - min) * 100) + "%"); renderQueue();
      }
      r.addEventListener("input", upd); r.style.setProperty("--v", ((+r.value - min) / (max - min) * 100) + "%");
    }
    bindRange("op-hi", "hi", 50, 95); bindRange("op-lo", "lo", 5, 45);
    var ob = $("#op-qorder"); if (ob) ob.appendChild(U.seg([["close", "Closest call first"], ["rank", "By chance"]], "close", function (v) { QS.order = v; renderQueue(); }, "Queue order"));
    var lg = $("#op-qlegend"); if (lg) ["full", "fast", "light"].forEach(function (k) { lg.appendChild(el("span", {}, el("i", { class: "op-sw is-" + k }), DEPTH[k].label)); });
    var more = $("#op-qmore"); if (more) more.addEventListener("click", function () { QS.all = !QS.all; renderQueue(); });
    var ex = $("#op-export"); if (ex) ex.addEventListener("click", exportQueue);
    renderQueue();
  }
  function csvCell(v) { var s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function exportQueue() {
    var list = queueList(), lines = [["order", "entry", "title", "team", "rank", "chance_of_selection", "price_sdai", "review", "hours"].join(",")];
    list.forEach(function (e, i) { lines.push([i + 1, e.id, e.title, e.team, e.rank, e.chance.toFixed(3), e.price.toFixed(4), DEPTH[e.dep].label, DEPTH[e.dep].h].map(csvCell).join(",")); });
    lines.push("# Sample data from a design concept (Swift Bot Labs). Not live; not affiliated with Seer.");
    try {
      var blob = new Blob([lines.join("\n") + "\n"], { type: "text/csv" }), url = URL.createObjectURL(blob);
      var a = el("a", { href: url, attrs: { download: "lattice-r4-review-queue.csv" } }); document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      S.toast("Saved lattice-r4-review-queue.csv (sample data).", "download");
    } catch (x) { S.toast("This browser blocked the download.", "alert"); }
  }

  /* ======================= 5. markets ======================= */
  function markets() {
    var host = $("#op-markets"); if (!host) return;
    // live (sample)
    var art = el("div", { class: "op-mk__art", attrs: { "aria-hidden": "true" } });
    var live = el("article", { class: "s-card s-card--pad op-mk" },
      el("div", { class: "s-row s-row--between", style: { "--gap": "8px" } }, el("span", { class: "s-row", style: { "--gap": "8px" } }, el("span", { class: "s-tag s-tag--violet s-tag--mono", text: "Live" }), U.stateBadge(M.state))),
      el("div", {}, el("h3", { class: "t-title", text: R.name }), el("p", { class: "t-meta", text: R.org + " · " + SLOTS + " grants from " + F.num(R.budget) + " sDAI · #" + M.id })),
      art,
      U.kv([["Entries", el("span", { text: E.length + " proposals" })], ["Volume", el("span", { text: F.num(M.volume) + " sDAI" })], ["Panel decision", el("span", { text: F.date(R.panelReveal) })]]),
      el("a", { class: "s-btn s-btn--block", href: "#field", text: "Open the field" }));
    host.appendChild(live);
    S.motif.barcode(art, { values: E.slice(0, 16).map(function (e) { return e.chance; }), highlight: [0, 1, 2, 3, 4, 5, 6, 7], bar: 6, gap: 4, w: 400, titles: E.slice(0, 16).map(function (e) { return e.id + " " + F.pct0(e.chance); }) });
    // upcoming (public facts only; no prices)
    var up = el("article", { class: "s-card s-card--pad op-mk" },
      el("div", { class: "s-row s-row--between", style: { "--gap": "8px" } }, el("span", { class: "s-tag s-tag--mono", text: "Upcoming" }), el("span", { class: "s-tag s-tag--outline", text: "Public info" })),
      el("div", {}, el("h3", { class: "t-title", text: "Design Seer's six interfaces" }), el("p", { class: "t-meta", text: "Seer · design contest · poidh bounty #38" })),
      el("div", { class: "op-mk__empty" }, el("p", { class: "t-body", text: "Entries close on 23 Oct 2026. Each entry then becomes an outcome here, traders price the field, and Seer's team picks the winner and the ranking." })),
      U.kv([["Entries close", el("span", { text: "23 Oct 2026 · 23:59 AoE" })], ["Prices", el("span", { class: "t-3", text: "None yet" })], ["Decided by", el("span", { text: "Seer team" })]]),
      el("button", { class: "s-btn s-btn--block s-btn--ghost", attrs: { type: "button", "data-demo": "Reminders are not wired in this concept." }, text: "Remind me when it lists" }));
    host.appendChild(up);
    // archive (real, finalised)
    var A = D.opportunity.archive[0];
    var rest = 1 - A.top.reduce(function (s, t) { return s + t.share; }, 0);
    var stackBox = el("div", { class: "op-mk__stack" });
    var arch = el("article", { class: "s-card s-card--pad op-mk" },
      el("div", { class: "s-row s-row--between", style: { "--gap": "8px" } }, el("span", { class: "s-row", style: { "--gap": "8px" } }, el("span", { class: "s-tag s-tag--mono", text: "Archive" }), U.stateBadge("closed")), el("span", { class: "s-tag s-tag--outline", text: "Public result" })),
      el("div", {}, el("h3", { class: "t-title", text: A.title }), el("p", { class: "t-meta", text: "Seer · " + A.entries + " entries · " + A.images + " images" })),
      stackBox,
      el("p", { class: "op-mk__win" }, icon("trophy", 15), el("span", {}, el("b", { text: A.top[0].name }), " was selected. It was also the market favourite, at " + F.pct(A.top[0].share, 1) + ". The six interfaces in this concept use it.")),
      U.kv([["Volume", el("span", { text: F.usd(A.volume, true) })], ["Liquidity", el("span", { text: F.usd(A.liquidity, true) })]]),
      el("p", { class: "t-meta", text: A.note }));
    host.appendChild(arch);
    stackInOrder(stackBox, A.top.map(function (t, i) { return { label: t.name, value: t.share, color: ["var(--c1)", "var(--c2)", "var(--c3)"][i] }; }).concat([{ label: (A.entries - A.top.length) + " others", value: rest, color: "var(--c-other)" }]));
  }

  // 100% stack that keeps the given order (the shared one sorts by size; here "others" must stay last)
  function stackInOrder(host, items) {
    var bar = el("div", { class: "s-stackbar s-stackbar--lg", attrs: { role: "img", "aria-label": items.map(function (i) { return i.label + " " + F.pct(i.value, 1); }).join(", ") } });
    items.forEach(function (it) {
      var seg = el("i", { style: { flex: "0 0 calc(" + (it.value * 100).toFixed(3) + "% - 2px)", "--seg": it.color }, attrs: { tabindex: "0", "aria-label": it.label + " " + F.pct(it.value, 1) } });
      var show = function (ev) { var bb = seg.getBoundingClientRect(); S.tip.show(ev && ev.clientX || bb.left, ev && ev.clientY || bb.top, it.label, [{ label: "Final price", value: F.pct(it.value, 1), color: it.color }]); };
      seg.addEventListener("pointermove", show); seg.addEventListener("focus", function () { show(); });
      seg.addEventListener("pointerleave", S.tip.hide); seg.addEventListener("blur", S.tip.hide);
      bar.appendChild(seg);
    });
    host.appendChild(el("div", {}, bar, el("div", { class: "s-legend u-mt-2" }, items.map(function (it) { return el("span", {}, el("i", { style: { background: it.color } }), it.label + " " + F.pct(it.value, 1)); }))));
  }

  /* ======================= 6. how it works ======================= */
  function how() {
    var pool = $("#op-pool");
    if (pool) {
      var items = E.map(function (e) { return { label: e.id, value: e.price }; }).concat([{ label: "Invalid", value: INVALID.price }]);
      var tot = items.reduce(function (s, x) { return s + x.value; }, 0);
      S.chart.stack(pool, items, { fold: 5, format: function (p) { return F.pct(p, 1); } });
      pool.appendChild(el("p", { class: "t-meta u-mt-2", text: "Share of the pool by entry. The 41 prices sum to " + F.num(tot * 100, 2) + "¢; arbitrage keeps them near 1 sDAI." }));
    }
    var calc = $("#op-calc"), e = BY[FEAT];
    if (calc && e) {
      var out = el("div", { class: "op-calc__out" });
      function draw(amount) {
        var q = quote(e, "buy", amount); S.clear(out);
        out.appendChild(el("div", { class: "op-calc__row" }, el("span", { text: "Buy " + e.id + " at " + cents1(q.avg) }), el("b", { text: F.num(q.shares, 0) + " shares" })));
        out.appendChild(el("div", { class: "op-calc__row is-hi" }, el("span", { text: "If the panel funds it" }), el("b", { text: F.tok(q.payout, "sDAI") })));
        out.appendChild(el("div", { class: "op-calc__row" }, el("span", { text: "If it is not funded" }), el("b", { text: "0 sDAI" })));
        out.appendChild(el("p", { class: "t-meta", text: e.id + " has a " + F.pct0(e.chance) + " chance of selection. Average price includes estimated price impact." }));
      }
      calc.appendChild(el("div", { class: "s-row s-row--between", style: { "--gap": "8px" } }, el("span", { class: "t-meta", text: "Spend" }), U.seg([["10", "10 sDAI"], ["100", "100 sDAI"], ["250", "250 sDAI"]], "100", function (v) { draw(+v); }, "Example amount")));
      calc.appendChild(out); draw(100);
    }
    var res = $("#op-res");
    if (res) res.appendChild(U.kv([
      ["Oracle", el("span", { text: "Reality.eth" })],
      ["Arbitrator", el("span", { text: "Kleros" })],
      ["Question", U.addr(M.questionId, { chars: 6, what: "Reality.eth question ID" })],
      ["Invalid", el("span", { text: F.pct(INVALID.price, 1) + " · pays if cancelled" })]
    ]));
    var tl = $("#op-timeline"); if (tl) tl.appendChild(U.timeline(D.lifecycleOf(M)));
    var ln = $("#op-life-note"); if (ln) ln.textContent = "Created " + F.date(M.created) + " · reports open " + F.date(M.openingDate);
  }

  /* ======================= entry drawer + ticket ======================= */
  function quote(e, side, amount) {
    var px = side === "buy" ? e.price : e.price * (1 - .012);
    var raw = amount / Math.max(M.liquidity, 1) * .25, imp = Math.min(raw, SLIP);
    var avg = side === "buy" ? Math.min(.999, px * (1 + imp)) : px * (1 - imp);
    var shares = amount ? amount / avg : 0;
    return { px: px, avg: avg, shares: shares, payout: shares * PAYOUT, ret: amount ? shares * PAYOUT / amount - 1 : 0, impact: raw, over: raw > SLIP };
  }
  function ticket(host, e, side) {
    var amount = 0;
    var panel = el("section", { class: "s-panel s-ticket op-ticket", attrs: { "aria-label": "Trade ticket for " + e.id } });
    panel.appendChild(el("div", { class: "s-panel__head" },
      el("span", { class: "s-row", style: { "--gap": "8px" } }, el("span", { html: S.glyph("opportunity"), style: { color: "var(--violet-2)", display: "inline-flex" } }), el("span", { class: "t-meta", text: F.usd(M.volume) + " Vol." })),
      el("span", { class: "t-meta", text: "#" + M.id + " · outcome " + pad2(e.oi + 1) })));
    panel.appendChild(el("h3", { class: "t-title", text: "Will the panel fund " + e.id + "?" }));
    var tiles = el("div", { class: "s-pricetiles" });
    var tb = el("button", { class: "s-pricetile", attrs: { type: "button", "aria-pressed": String(side === "buy") } }, el("small", { text: "Buy · ask" }), el("b", { text: cents1(quote(e, "buy", 0).px) }));
    var ts = el("button", { class: "s-pricetile", attrs: { type: "button", "aria-pressed": String(side === "sell") } }, el("small", { text: "Sell · bid" }), el("b", { text: cents1(quote(e, "sell", 0).px) }));
    tiles.appendChild(tb); tiles.appendChild(ts); panel.appendChild(tiles);
    var input = el("input", { attrs: { type: "text", inputmode: "decimal", placeholder: "$0", "aria-label": "Amount in sDAI", maxlength: "12" } });
    var chips = el("div", { class: "s-amountchips" }, [1, 5, 10, 100].map(function (c) {
      var b = el("button", { attrs: { type: "button" }, text: "+$" + c });
      b.addEventListener("click", function () { amount = Math.min(1e6, Math.round((amount + c) * 100) / 100); input.value = "$" + F.num(amount, 2); calc(); });
      return b;
    }));
    var rows = el("div", { class: "s-ticket__rows", attrs: { "aria-live": "polite" } });
    var warn = el("div", { class: "s-callout s-callout--warn op-twarn", attrs: { hidden: true } });
    var conf = el("button", { class: "s-btn s-btn--lg", attrs: { type: "button" }, text: "Confirm" });
    var reset = el("button", { class: "s-icon-btn", attrs: { type: "button", "aria-label": "Clear amount" }, html: S.icon("close", 20) });
    input.addEventListener("input", function () { var v = parseFloat(input.value.replace(/[^0-9.]/g, "")); amount = isFinite(v) ? Math.min(1e6, v) : 0; calc(); });
    input.addEventListener("blur", function () { input.value = amount ? "$" + F.num(amount, 2) : ""; });
    reset.addEventListener("click", function () { amount = 0; input.value = ""; calc(); input.focus(); });
    conf.addEventListener("click", function () {
      if (!amount) { S.toast("Enter an amount first.", "alert"); input.focus(); return; }
      S.toast("Sample only: no transaction sent (" + (side === "buy" ? "buy " : "sell ") + F.tok(amount, "sDAI") + " of " + e.id + ").", "info");
    });
    function pick(s) { side = s; tb.setAttribute("aria-pressed", String(s === "buy")); ts.setAttribute("aria-pressed", String(s === "sell")); calc(); }
    tb.addEventListener("click", function () { pick("buy"); }); ts.addEventListener("click", function () { pick("sell"); });
    function line(k, v, cls) { return el("div", { class: cls || null }, el("span", { text: k }), el("b", { text: v })); }
    function calc() {
      var q = quote(e, side, amount); S.clear(rows);
      rows.appendChild(line("Average price", cents1(q.avg)));
      if (side === "buy") {
        rows.appendChild(line("Shares", amount ? F.num(q.shares, 2) : "—"));
        rows.appendChild(line("If funded", amount ? F.tok(q.payout, "sDAI") + " (" + F.signed(q.ret, 0) + ")" : "—"));
        rows.appendChild(line("If not funded", amount ? "0 sDAI" : "—"));
      } else {
        rows.appendChild(line("Shares to sell", amount ? F.num(q.shares, 2) : "—"));
        rows.appendChild(line("You receive", amount ? F.tok(amount, "sDAI") : "—"));
      }
      rows.appendChild(line("Max slippage", F.pct(SLIP, 1)));
      warn.hidden = !q.over; S.clear(warn);
      if (q.over) { warn.appendChild(icon("alert")); warn.appendChild(el("span", {}, el("b", { text: "Thin pool. " }), "Estimated price impact " + F.pct(q.impact, 1) + " is above your " + F.pct(SLIP, 1) + " slippage, so this order would revert. Lower the amount.")); }
      conf.textContent = q.over ? "Lower the amount" : amount ? (side === "buy" ? "Buy " : "Sell ") + e.id : "Confirm";
      conf.disabled = !!q.over;
    }
    panel.appendChild(el("div", { class: "s-panel s-panel--nested", style: { gap: "14px" } },
      el("div", { class: "s-amount" }, el("label", { text: "Amount" }), input), chips, rows, warn,
      el("div", { class: "s-ticket__confirm" }, conf, reset)));
    panel.appendChild(el("p", { class: "t-meta", text: "Pay with sDAI on Gnosis. A funded share redeems for 1/" + SLOTS + " sDAI, because the payout is split across the funded entries. Sample prices; nothing is traded." }));
    calc(); host.appendChild(panel);
    return { focus: function () { input.focus(); } };
  }

  var drawer = $("#op-drawer"), dpanel = $("#op-dpanel"), lastFocus = null, curId = null;
  function xlink(app, label, value, sub, href) {
    return el("a", { class: "op-xl", href: href }, U.avatar(app, "ink"), el("span", { class: "op-xl__b" }, el("span", { class: "s-spec", text: label }), el("b", { text: value }), el("span", { class: "t-meta", text: sub })), el("span", { class: "op-xl__go", html: S.icon("arrow-right", 16), attrs: { "aria-hidden": "true" } }));
  }
  function renderDrawer(e, side) {
    S.clear(dpanel);
    var close = el("button", { class: "s-icon-btn op-dclose", attrs: { type: "button", "aria-label": "Close entry" }, html: S.icon("close", 18) });
    close.addEventListener("click", closeEntry);
    dpanel.appendChild(el("div", { class: "op-dtop" }, U.specs([{ html: "Entry <b>" + e.id + "</b>" }, "Outcome " + pad2(e.oi + 1) + " of " + M.outcomes.length, "Mkt #" + M.id]), close));
    dpanel.appendChild(el("div", { class: "op-dhead" },
      el("h2", { class: "t-h3", attrs: { id: "op-d-title" }, text: e.title }),
      el("div", { class: "s-row", style: { "--gap": "8px" } }, el("span", { class: "s-tag", text: e.cat }), e.inside ? el("span", { class: "s-tag s-tag--violet", text: "Inside the line" }) : el("span", { class: "s-tag s-tag--outline", text: "Below the line" }), e.close ? el("span", { class: "s-tag s-tag--violet", text: "Close call" }) : null, el("span", { class: "t-meta", text: e.team + " · asks " + F.num(e.ask) + " sDAI" }))));
    var st = el("div", { class: "s-stats op-dstats", style: { "--cols": "4" } },
      U.stat("Chance", F.pct0(e.chance), { note: "of selection" }),
      U.stat("Price", cents1(e.price), { note: "of " + CAP + " if funded" }),
      U.stat("Rank", pad2(e.rank), { unit: "of " + E.length, note: e.inside ? "Inside the line" : "Below the line" }),
      U.stat("24h", pts(e.d24).replace(" pts", ""), { unit: "pts", note: "Chance move" }));
    var dv = st.lastChild.querySelector(".s-stat__value"); if (dv) dv.classList.add(dcls(e.d24));
    dpanel.appendChild(st);
    // chart: this entry vs the entry on the other side of the selection line
    var other = e.inside ? LINE_OUT : LINE_IN;
    var chartCard = el("div", { class: "s-card s-card--pad op-dchart" });
    var chartBox = el("div");
    var rangeSeg = U.seg([["1", "1D"], ["7", "1W"], ["all", "All"]], "all", function (v) { drawChart(v); }, "Chart range");
    chartCard.appendChild(el("div", { class: "s-row s-row--between", style: { "--gap": "8px" } }, el("div", {}, el("h3", { class: "t-title", text: "Chance of selection" }), el("p", { class: "t-meta", text: "Against " + other.id + ", the " + (other.inside ? "last entry inside" : "first entry below") + " the line" })), rangeSeg));
    chartCard.appendChild(chartBox);
    dpanel.appendChild(chartCard);
    function slice(h, v) { if (v === "all") return h; var t = NOW - (+v) * DAY; return h.filter(function (p) { return p[0] >= t; }); }
    function drawChart(v) {
      S.clear(chartBox);
      var a = slice(chanceHist(e), v), b = slice(chanceHist(other), v);
      S.chart.line(chartBox, { height: 190, endLabels: false, y: { min: 0, max: 1, ticks: [0, .25, .5, .75, 1], format: F.pct0 }, x: { format: v === "1" ? function (t) { return F.time(t); } : F.dayMon },
        series: [{ name: e.id + " · " + F.pct0(e.chance), short: e.id, values: a, color: "var(--c1)" }, { name: other.id + " · rank " + other.rank, short: other.id, values: b, color: "var(--text-3)", dash: true }], label: "Chance of selection over time for " + e.id + " and " + other.id });
    }
    // trade + links + chain
    var tHost = el("div"); dpanel.appendChild(tHost);
    var t = ticket(tHost, e, side);
    var gap = Math.abs(e.chance - LINE);
    dpanel.appendChild(el("div", { class: "s-callout" }, icon("info"), el("span", {}, el("b", { text: e.close ? "A close call. " : e.inside ? "A likely pick. " : "A long shot. " }),
      (e.close ? "This entry is " + F.num(gap * 100, 1) + " points from the selection line, so the panel's full review matters most here. " : "") + "The panel scores every proposal; Lattice DAO funds the top " + SLOTS + " by score. The price only suggests where reviewers should start.")));
    var decisionYes = DECISION ? DECISION.outcomes[0].price : null;
    dpanel.appendChild(el("div", { class: "op-xls" },
      xlink("deep", "Deep · #2841", F.num(e.score, 2) + " / 10", "Forecast panel score", "../deep/#" + e.id),
      xlink("app", "App · #" + M.id, "Outcome " + pad2(e.oi + 1), "Market record and holders", "../app/#m=" + M.id + "&o=" + e.oi),
      xlink("futarchy", "Futarchy · LIP-31", decisionYes != null ? F.pct0(decisionYes) + " approve" : "Round budget", "Vote on the round's budget", "../futarchy/#LIP-31")));
    var det = el("details", { class: "s-card s-card--pad op-dchain" }, el("summary", {}, el("span", { class: "t-title", text: "On-chain details" }), el("span", { class: "t-meta", text: "Outcome token, condition, oracle" })),
      U.kv([
        ["Outcome token", U.addr(e.out.token, { what: "outcome token address" })],
        ["Symbol", el("span", { text: e.out.symbol + " · ERC-20 wrapper of an ERC-1155 position" })],
        ["Market", U.addr(M.address, { what: "market address" })],
        ["Condition ID", U.addr(M.conditionId, { chars: 6, what: "condition ID" })],
        ["Reality.eth question", U.addr(M.questionId, { chars: 6, what: "question ID" })],
        ["Collateral", el("span", { text: "sDAI on Gnosis" })],
        ["Proposer", U.addr(e.p.proposer, { what: "proposer address" })]
      ]));
    dpanel.appendChild(det);
    dpanel.appendChild(el("p", { class: "t-meta", text: "Sample data. Lattice DAO, its proposals and every address here are fictional; addresses start with 0x5eed." }));
    return { draw: function () { drawChart("all"); }, ticket: t };
  }
  function openEntry(id, side) {
    var e = BY[id]; if (!e || !drawer) return;
    if (!drawer.classList.contains("is-open")) lastFocus = document.activeElement;
    curId = id;
    var view = renderDrawer(e, side || "buy");
    drawer.classList.add("is-open"); drawer.setAttribute("aria-hidden", "false"); document.documentElement.classList.add("op-lock");
    dpanel.scrollTop = 0;
    view.draw();
    $$(".op-card.is-selected").forEach(function (c) { c.classList.remove("is-selected"); });
    var c = $('.op-card[data-id="' + id + '"]'); if (c) c.classList.add("is-selected");
    setHash(id);
    setTimeout(function () { if (side) view.ticket.focus(); else { var b = $(".op-dclose", dpanel); if (b) b.focus(); } }, 40);
  }
  function closeEntry() {
    if (!drawer.classList.contains("is-open")) return;
    drawer.classList.remove("is-open"); drawer.setAttribute("aria-hidden", "true"); document.documentElement.classList.remove("op-lock");
    S.tip.hide(); setHash(""); curId = null;
    if (lastFocus && document.body.contains(lastFocus)) { try { lastFocus.focus({ preventScroll: true }); } catch (x) { lastFocus.focus(); } }
  }
  function drawerEvents() {
    if (!drawer) return;
    drawer.addEventListener("click", function (ev) { if (ev.target.hasAttribute("data-close")) closeEntry(); });
    document.addEventListener("keydown", function (ev) {
      if (!drawer.classList.contains("is-open")) return;
      if (ev.key === "Escape") { ev.preventDefault(); closeEntry(); return; }
      if (ev.key === "Tab") { // keep focus inside the dialog
        var f = $$('a[href],button:not([disabled]),input,select,summary,[tabindex="0"]', dpanel).filter(function (x) { return x.offsetParent !== null; });
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
        else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
      }
    });
  }
  function fromHash() {
    var m = /^#(P-\d{2})$/i.exec(location.hash || "");
    if (!m) return;
    var id = m[1].toUpperCase(); if (!BY[id] || id === curId) return;
    var f = $("#field"); if (f) f.scrollIntoView({ block: "start" });
    openEntry(id);
  }

  /* ---------- boot ---------- */
  facts(); poster(); round(); field(); queue(); markets(); how(); drawerEvents();
  fromHash();
  window.addEventListener("hashchange", fromHash);
})();
