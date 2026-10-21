/* Seer Opportunity · the hero is a REAL opportunity market on Seer: "Seer AI Job Board Name", every community-suggested
   name as an outcome, run as three linked categorical markets on Gnosis (each market's "Other" outcome buys into the
   next one; the last "Other" is "None of the listed names"), merged the way opportunity.seer.pm lists them.
   Concept by Swift Bot Labs. Not affiliated with Seer.

   One POST to app.seer.pm/.netlify/functions/markets-search (the three market ids). snapshot.js is the dated
   fallback, painted at once and labelled; after 4 s without an answer the label settles on "Snapshot", and a late
   live answer (until 12 s) still replaces it.
   Outcome names on Seer are written by whoever suggested them, so everything from the API (and the snapshot, which
   was copied from it) is untrusted: type-checked, control and bidi characters stripped, clamped, rendered with
   textContent only. The market's structure (ids, chain, parent links, Other positions) must match what is pinned
   here or the answer is refused. Links are built from the pinned chain id and 0x address, never taken from the data.
   The page's CSP allows connect-src https://app.seer.pm only. */
(function () {
  "use strict";
  var doc = document, S = window.Seer || {}, X = window.OP_SNAPSHOT || null;

  var API = "https://app.seer.pm/.netlify/functions/markets-search";
  var CHAIN = 100, CHAIN_NAME = "Gnosis";
  var LINKED = [["0x8b3c7f3f09f6a85353926d8ee0f12decc1c9a5e8", 78], ["0xf6a42af200c181df45e0f3fd49d58f5d57bb7d35", 78], ["0x144364db8edd6225248fe9d02f77ecc3ec0e4c4c", null]];
  var FINAL_OTHER = "None of the listed names";
  var ZERO = "0x0000000000000000000000000000000000000000";
  var ADDR = /^0x[0-9a-f]{40}$/;
  var FALLBACK_MS = 4000, ABORT_MS = 12000, MAX_BYTES = 1500000, MAX_NAMES = 400;
  // C0/C1 controls, zero-width marks, bidi embeddings/overrides/isolates, BOM
  var BAD = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u2069\uFEFF]/g;
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var SVGNS = "http://www.w3.org/2000/svg";

  /* ---------- helpers ---------- */
  function clean(s, max) {
    if (typeof s !== "string") return "";
    s = s.replace(BAD, " ").replace(/\s+/g, " ").trim();
    return s.length > max ? s.slice(0, max) : s;
  }
  function okNum(x, lo, hi) { return typeof x === "number" && isFinite(x) && x >= lo && x <= hi; }
  function r1(x) { return Math.round(x * 10) / 10; }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function mk(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function sv(tag, attrs) { var e = doc.createElementNS(SVGNS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
  function clear(n) { while (n && n.firstChild) n.removeChild(n.firstChild); return n; }
  function $(id) { return doc.getElementById(id); }
  function cents(p) { return p == null ? "no price" : r1(p).toFixed(1) + "¢"; }   // Seer quotes one decimal
  function usd(n) { return n >= 1e6 ? "$" + (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? "$" + (n / 1e3).toFixed(1) + "K" : "$" + Math.round(n); }
  function clip(t, n) { return t.length <= n ? t : t.slice(0, n - 1).replace(/[\s.,;:-]+$/, "") + "…"; }
  function hhmm(ms) { var d = new Date(ms); return pad2(d.getUTCHours()) + ":" + pad2(d.getUTCMinutes()) + " UTC"; }
  function dayMon(ms) { var d = new Date(ms); return d.getUTCDate() + " " + MON[d.getUTCMonth()]; }
  function stamp(ms) { var d = new Date(ms); return dayMon(ms) + " " + d.getUTCFullYear() + ", " + hhmm(ms); }
  var LINK = "https://app.seer.pm/markets/" + CHAIN + "/" + LINKED[0][0]; // pinned chain + address

  /* ---------- validation: snapshot rows or API markets -> one shape, or null ---------- */
  function shape(x) {
    if (!x || !Array.isArray(x.rows) || x.rows.length < 10 || x.rows.length > MAX_NAMES) return null;
    var rows = [];
    for (var i = 0; i < x.rows.length; i++) {
      var r = x.rows[i];
      if (!Array.isArray(r)) continue;
      var name = clean(r[0], 60); if (!name) continue;
      var p = okNum(r[1], 0, 100) ? r1(r[1]) : null;
      rows.push({ name: name, p: p, lvl: r[2] === 1 || r[2] === 2 ? r[2] : 0, k: i });
    }
    var priced = rows.filter(function (r) { return r.p != null; });
    if (priced.length < 10) return null;
    rows.sort(function (a, b) { return (b.p == null ? -1 : b.p) - (a.p == null ? -1 : a.p) || a.k - b.k; });
    var sum = r1(priced.reduce(function (s, r) { return s + r.p; }, 0));
    if (sum < 30 || sum > 400) return null;                                   // not a price set we can draw honestly
    return { rows: rows, total: rows.length, sum: sum,
      under1: priced.filter(function (r) { return r.p < 1; }).length,
      liq: okNum(x.liq, 0, 1e9) ? x.liq : null, vol: okNum(x.vol, 0, 1e9) ? x.vol : null,
      at: okNum(x.at, 1.6e12, 4.1e12) ? x.at : null };
  }
  function fromSnapshot(s) {
    if (!s || typeof s !== "object" || s.chain !== CHAIN || !Array.isArray(s.ids) || s.ids.join() !== LINKED.map(function (l) { return l[0]; }).join()) return null;
    var at = typeof s.at === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d)?Z$/.test(s.at) ? Date.parse(s.at) : NaN;
    return shape({ rows: s.rows, liq: s.liq, vol: s.vol, at: at });
  }
  function fromApi(d) {
    if (!d || !Array.isArray(d.markets) || d.markets.length > 10) return null;
    var by = {};
    d.markets.forEach(function (m) { if (m && typeof m.id === "string" && ADDR.test(m.id.toLowerCase())) by[m.id.toLowerCase()] = m; });
    var rows = [], liq = 0, vol = 0;
    for (var lvl = 0; lvl < LINKED.length; lvl++) {
      var m = by[LINKED[lvl][0]], last = lvl === LINKED.length - 1, other = LINKED[lvl][1];
      if (!m || m.chainId !== CHAIN || m.templateId !== "2" || m.type !== "Generic" || m.payoutReported !== false) return null;
      var pm = m.parentMarket;
      if (!pm || typeof pm.id !== "string" || pm.id.toLowerCase() !== (lvl ? LINKED[lvl - 1][0] : ZERO)) return null;
      if (lvl && String(m.parentOutcome) !== String(LINKED[lvl - 1][1])) return null;
      var outs = m.outcomes, odds = m.odds;
      if (!Array.isArray(outs) || !Array.isArray(odds) || outs.length !== odds.length || outs.length < 3 || outs.length > 128) return null;
      if (!last && other !== outs.length - 2) return null;                   // "Other" sits just before Invalid
      if (okNum(m.liquidityUSD, 0, 1e9)) liq += m.liquidityUSD;
      if (okNum(m.volumeUSD, 0, 1e9)) vol += m.volumeUSD;
      for (var c = 0; c < outs.length - 1; c++) {                             // the last outcome is Invalid
        if (!last && c === other) continue;                                    // "Other" buys into the next market
        rows.push([last && c === outs.length - 2 ? FINAL_OTHER : outs[c], odds[c], lvl]);
      }
    }
    return shape({ rows: rows, liq: liq, vol: vol, at: Date.now() });
  }

  /* ---------- header: the provenance chip replaces the shell's sample-data badge (the hero is a real market) ---------- */
  function chip(state, at) {
    var c = doc.querySelector(".s-header .op-prov") || doc.querySelector(".s-header .s-lockup__sample");
    if (!c) return;
    if (!c.classList.contains("op-prov")) { var n = mk("span", "s-sample s-lockup__sample op-prov"); c.parentNode.replaceChild(n, c); c = n; }
    var live = state === "live", when = at ? (live ? hhmm(at) : dayMon(at)) : "";
    c.setAttribute("data-state", state);
    c.title = "Top of this page: a real opportunity market on Seer, " + (live ? "read live from Seer's public markets API at " + hhmm(at) : "a dated snapshot of Seer's public markets API" + (at ? " (" + stamp(at) + ")" : "")) + ". The walkthrough further down is sample data. Nothing here is tradable.";
    clear(c).appendChild(mk("i")).setAttribute("aria-hidden", "true");
    var t = mk("span", "op-prov__t");                                         // one flex item, so the spaces inside it hold
    var k = mk("span", "op-prov__k", live ? "Live" : at ? "Snapshot" : state === "loading" ? "Loading" : "No data");
    if (!live && at) k.className += " op-prov__long";
    t.appendChild(k);
    if (!live && at) t.appendChild(mk("span", "op-prov__d", dayMon(at)));       // phones: "21 Oct" in place of the word
    if (when) t.appendChild(mk("span", "s-sample__mid", " · " + when));
    c.appendChild(t);
    c.appendChild(mk("span", "s-sr", live ? ": the top of this page is read live from app.seer.pm; the walkthrough below is sample data" : ": the top of this page is a dated snapshot of app.seer.pm; the walkthrough below is sample data"));
  }

  /* ---------- hero ---------- */
  var cur = null, active = 0, pinned = 0, ui = null;
  var mq = window.matchMedia ? window.matchMedia("(max-width: 640px)") : null;
  function topN() { return mq && mq.matches ? 6 : 10; }
  function scaleMax(p) { var c = [4, 20, 40, 100]; for (var i = 0; i < c.length; i++) if (p <= c[i]) return c[i]; return 100; }
  function frac(p, max) { return p == null ? 0 : Math.sqrt(Math.min(p, max) / max); }

  function src(state, at) {
    var s = $("op-rsrc"); if (!s) return;
    s.setAttribute("data-state", state);
    clear(s).appendChild(mk("i")).setAttribute("aria-hidden", "true");
    var t = s.appendChild(mk("span"));                                         // one flex item, so the spaces inside it hold
    if (!cur) { t.textContent = "Seer's API is unavailable right now"; return; }
    t.appendChild(doc.createTextNode(state === "live" ? "Live" : "Snapshot"));
    t.appendChild(mk("span", "op-rsrc-x", " · app.seer.pm"));
    if (!at) return;
    if (state === "live") { t.appendChild(doc.createTextNode(" · " + hhmm(at))); return; }
    t.appendChild(doc.createTextNode(" · " + dayMon(at)));
    t.appendChild(mk("span", "op-rsrc-x", " " + new Date(at).getUTCFullYear()));
    t.appendChild(doc.createTextNode(", " + hhmm(at)));
  }

  function facts(d) {
    var dl = $("op-rfacts"); if (!dl) return;
    clear(dl);
    var lead = d.rows[0];
    [["Names", String(d.total), "suggested"], ["Leader", clip(lead.name, 14), cents(lead.p)],
     ["Liquidity", d.liq != null ? usd(d.liq) : "n/a", ""], ["Volume", d.vol != null ? usd(d.vol) : "n/a", ""]].forEach(function (f, i) {
      var dd = mk("dd", i === 1 ? "op-rfacts__name" : null, f[1]);
      if (i === 1) dd.title = lead.name;
      if (f[2]) dd.appendChild(mk("small", null, f[2]));
      var div = mk("div"); div.appendChild(mk("dt", null, f[0])); div.appendChild(dd); dl.appendChild(div);
    });
  }

  function board(d) {
    var host = $("op-rboard"); if (!host) return;
    clear(host);
    var N = Math.min(topN(), d.rows.length), max = scaleMax(d.rows[0].p);
    host.setAttribute("aria-label", "Seer's prices for all " + d.total + " suggested names, highest first. The top " + N + " are listed; the strip below draws every name as one bar, on the same square-root scale. Use the arrow keys to read each name.");
    var rows = mk("div", "op-rrows"), rowEls = [];
    for (var i = 0; i < N; i++) {
      var r = d.rows[i], row = mk("div", "op-rrow");
      row.setAttribute("data-i", String(i));
      row.appendChild(mk("span", "op-rrow__n", pad2(i + 1)));
      var nm = mk("span", "op-rrow__name", r.name); nm.title = r.name; row.appendChild(nm);
      var tr = mk("span", "op-rrow__track"), bar = mk("i");
      bar.style.width = (frac(r.p, max) * 100).toFixed(2) + "%";
      tr.appendChild(bar); row.appendChild(tr);
      row.appendChild(mk("b", "op-rrow__v", cents(r.p)));
      rows.appendChild(row); rowEls.push(row);
    }
    // axis under the bars, in the same grid columns so the ticks line up with the tracks
    var ax = mk("div", "op-rrow op-rrow--axis"); ax.setAttribute("aria-hidden", "true");
    ax.appendChild(mk("span")); ax.appendChild(mk("span", "op-raxis__name", "√ scale"));
    var tk = mk("span", "op-raxis");
    [0, .05, .25, .5, 1].forEach(function (v) { var t = mk("span", null, v ? String(r1(max * v)) + "¢" : "0"); t.style.left = (Math.sqrt(v) * 100).toFixed(2) + "%"; tk.appendChild(t); });
    ax.appendChild(tk); ax.appendChild(mk("span"));
    rows.appendChild(ax);
    host.appendChild(rows);

    // every name as one bar: the kit's data barcode, same square-root scale
    var code = mk("div", "op-rcode");
    var k = mk("div", "op-rcode__k");
    var kl = k.appendChild(mk("span", null, "All " + d.total + " names")); kl.appendChild(mk("span", "op-rcode__x", ", one bar each"));
    k.appendChild(mk("span", null, d.under1 + " under 1¢"));
    code.appendChild(k);
    var n = d.rows.length, svg = sv("svg", { class: "op-rcode__svg", viewBox: "0 0 " + n + " 100", preserveAspectRatio: "none", "aria-hidden": "true", focusable: "false" });
    var rects = d.rows.map(function (r, j) {
      var h = Math.max(3, frac(r.p, max) * 100);
      var x = sv("rect", { x: (j + .14).toFixed(2), y: (100 - h).toFixed(2), width: ".72", height: h.toFixed(2), class: j < N ? "is-top" : "" });
      svg.appendChild(x); return x;
    });
    code.appendChild(svg);
    host.appendChild(code);
    ui = { rows: rowEls, rects: rects, svg: svg, n: n };

    function at(ev) {
      var row = ev.target.closest && ev.target.closest(".op-rrow[data-i]");
      if (row) return +row.getAttribute("data-i");
      if (ev.target.closest && ev.target.closest(".op-rcode")) {
        var b = svg.getBoundingClientRect(); if (!b.width) return -1;
        return Math.max(0, Math.min(n - 1, Math.floor((ev.clientX - b.left) / b.width * n)));
      }
      return -1;
    }
    host.onpointermove = function (ev) { var i = at(ev); if (i > -1) set(i); };
    host.onpointerleave = function () { set(pinned); };
    host.onclick = function (ev) { var i = at(ev); if (i > -1) { pinned = i; set(i); } };
    host.onkeydown = function (ev) {
      var key = ev.key, j = active;
      if (key === "ArrowDown" || key === "ArrowRight") j = Math.min(n - 1, active + 1);
      else if (key === "ArrowUp" || key === "ArrowLeft") j = Math.max(0, active - 1);
      else if (key === "PageDown") j = Math.min(n - 1, active + 10);
      else if (key === "PageUp") j = Math.max(0, active - 10);
      else if (key === "Home") j = 0; else if (key === "End") j = n - 1;
      else return;
      ev.preventDefault(); pinned = j; set(j);
    };
    active = -1; set(Math.min(pinned, n - 1));
  }

  function set(i) {
    if (!cur || !ui || i === active) return;
    if (ui.rects[active]) ui.rects[active].classList.remove("is-on");
    if (ui.rows[active]) ui.rows[active].classList.remove("is-active");
    active = i;
    if (ui.rects[i]) ui.rects[i].classList.add("is-on");
    if (ui.rows[i]) ui.rows[i].classList.add("is-active");
    var d = cur.d, r = d.rows[i], cap = $("op-rcap"); if (!cap) return;
    clear(cap);
    var l = mk("div", "op-cap__l");
    var b = mk("b", null, r.name); b.title = r.name; l.appendChild(b);
    l.appendChild(mk("span", null, "Rank " + (i + 1) + " of " + d.total + " · linked market " + (r.lvl + 1) + " of 3"));
    l.appendChild(mk("small", "op-cap__why", r.name === FINAL_OTHER && r.lvl === 2 ? "Pays 1 sDAI a share if the name adopted is not on the list." : "A share pays 1 sDAI if this name is adopted."));
    cap.appendChild(l);
    var num = mk("div", "op-cap__num", cents(r.p)); num.appendChild(mk("small", null, "Price on Seer")); cap.appendChild(num);
  }

  function note(d) {
    var off = Math.abs(d.sum - 100) > 3, sum = Math.round(d.sum);
    var p = $("op-rnote");
    if (p) p.textContent = d.total + " names in three linked markets on " + CHAIN_NAME + ": each market's Other outcome buys into the next. " +
      (off ? "Every name trades in its own small pool, so the prices add up to " + sum + "¢, not 100¢: read them as a ranking, not as chances."
        : "The prices add up to " + sum + "¢.");
    var m = $("op-rnote-m");
    if (m) {
      clear(m).appendChild(doc.createTextNode("Three linked markets on " + CHAIN_NAME + ". " + (off ? "Thin pools: the prices add up to " + sum + "¢, so read them as a ranking. " : "The prices add up to " + sum + "¢. ")));
      var a = mk("a", "op-rnote__go", "Open on Seer"); a.href = LINK; a.rel = "noopener noreferrer"; a.target = "_blank";
      a.setAttribute("aria-label", "Open this market on Seer (new tab)");
      a.appendChild(arrow()); m.appendChild(a);
    }
  }
  function arrow() { var s = sv("svg", { width: 12, height: 12, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.9", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" }); s.appendChild(sv("path", { d: "M7 17 17 7M8 7h9v9" })); return s; }

  function specs(d) {
    var s = $("op-rspecs"); if (!s) return;
    clear(s);
    s.appendChild(mk("span", null, "On Seer"));
    s.appendChild(mk("span", "op-rspec-x", "3 linked markets"));
    var c = mk("span"); c.appendChild(mk("b", null, String(d.total))); c.appendChild(doc.createTextNode(" names")); s.appendChild(c);
  }

  function failed() {
    if (cur) return;
    chip("snapshot", null);
    var host = $("op-rboard"); if (!host) return;
    clear(host);
    var p = mk("p", "op-rfail", "Seer's market could not be loaded just now. It is on ");
    var a = mk("a", "s-link", "app.seer.pm"); a.href = LINK; a.rel = "noopener noreferrer"; a.target = "_blank";
    p.appendChild(a); p.appendChild(doc.createTextNode(".")); host.appendChild(p);
    src("snapshot", null);
    var root = $("op-rposter"); if (root) { root.setAttribute("aria-busy", "false"); root.classList.add("is-nodata"); }
  }

  var shown = null; // "live" | "snapshot" once settled
  function paint(d, state) {
    cur = { d: d, state: state };
    if (state !== "loading") shown = state;
    if (!ready) return;
    facts(d); specs(d); board(d); note(d); src(state, d.at); chip(state, d.at);
    var go = $("op-rgo"); if (go) go.setAttribute("href", LINK);
    var root = $("op-rposter"); if (root) root.setAttribute("aria-busy", state === "loading" ? "true" : "false");
  }
  function relabel(state) { // the snapshot stays; only its label settles
    if (!cur) { shown = state; failed(); return; }
    cur.state = state; shown = state;
    if (ready) { src(state, cur.d.at); chip(state, cur.d.at); var root = $("op-rposter"); if (root) root.setAttribute("aria-busy", "false"); }
  }

  /* ---------- boot: header chip now (no flash of the sample badge), hero when the DOM is there ---------- */
  var ready = false, snap = fromSnapshot(X);
  chip(snap ? "loading" : "snapshot", snap ? snap.at : null);
  if (snap) cur = { d: snap, state: "loading" };
  function start() {
    ready = true;
    if (cur) paint(cur.d, cur.state); else if (shown) failed();
    if (mq) { var onMq = function () { if (cur) board(cur.d); }; if (mq.addEventListener) mq.addEventListener("change", onMq); else if (mq.addListener) mq.addListener(onMq); }
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", start); else start();

  var timer = setTimeout(function () { if (!shown) relabel("snapshot"); }, FALLBACK_MS);
  function fail(e) {
    clearTimeout(timer); clearTimeout(kill);
    if (shown === "live") return;
    var s = $("op-rsrc"); if (s) s.setAttribute("data-why", String((e && (e.name === "Error" ? e.message : e.name)) || "error").slice(0, 40));
    relabel("snapshot");
  }
  var ctl = typeof AbortController === "function" ? new AbortController() : null;
  var kill = setTimeout(function () { if (ctl) ctl.abort(); }, ABORT_MS);
  if (typeof fetch !== "function") { fail(new Error("no fetch")); return; }
  fetch(API, {
    method: "POST", mode: "cors", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer", redirect: "error",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chainsList: [String(CHAIN)], marketIds: LINKED.map(function (l) { return l[0]; }), limit: LINKED.length, page: 1 }),
    signal: ctl ? ctl.signal : undefined
  }).then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    if (!/application\/json/i.test(r.headers.get("content-type") || "")) throw new Error("not JSON");
    if (+(r.headers.get("content-length") || 0) > MAX_BYTES) throw new Error("too big");
    return r.text();
  }).then(function (t) {
    if (t.length > MAX_BYTES) throw new Error("too big");
    var d = fromApi(JSON.parse(t));
    if (!d) throw new Error("bad shape");
    clearTimeout(timer); clearTimeout(kill);
    paint(d, "live");
  }).catch(fail);
})();
