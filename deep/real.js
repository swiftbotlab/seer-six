/* Deep · the real round first. Concept by Swift Bot Labs. Not affiliated with Seer.

   The hero is Seer's own Deep Funding Round 3 (Originality) field: every repository's UP price, from a dated
   snapshot of deep.seer.pm's data feed (round3.js, written server side by mkdeep.py; that feed sends no CORS
   header, so the page makes no runtime request). Loaded right after shell.js so the header's provenance chip is
   set before first paint; the hero itself is drawn on DOMContentLoaded.

   Seer strings are untrusted even in our own snapshot file: every row is type-checked, stripped of control and
   bidi characters, clamped, and rendered with textContent only. Links are built here from a validated chain id
   and 0x address, never taken from the data. If the snapshot is missing or malformed, the hero says so, links
   to deep.seer.pm, and the header keeps the sample-data badge. */
(function () {
  "use strict";
  var doc = document, RAW = window.SEER_DEEP_R3;
  var CHAINS = { 10: "Optimism" };
  var ADDR = /^0x[0-9a-fA-F]{40}$/;
  var REPO = /^[A-Za-z0-9][A-Za-z0-9._-]{0,59}\/[A-Za-z0-9._-]{1,100}$/;
  var BAD = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u2069\uFEFF]/g;
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var SVGNS = "http://www.w3.org/2000/svg";

  function clean(s, max) {
    if (typeof s !== "string") return "";
    s = s.replace(BAD, " ").replace(/\s+/g, " ").trim();
    return s.length > max ? s.slice(0, max) : s;
  }
  function num(x) { return typeof x === "number" && isFinite(x) && x >= 0 && x <= 1.5 ? Math.min(1, x) : null; }

  /* ---------- validate the snapshot ---------- */
  var R = (function () {
    if (!RAW || typeof RAW !== "object" || RAW.v !== 1 || !Array.isArray(RAW.repos)) return null;
    var chain = RAW.chainId;
    if (!CHAINS[chain]) return null;
    var t = typeof RAW.fetchedAt === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(RAW.fetchedAt) ? Date.parse(RAW.fetchedAt) : NaN;
    if (!isFinite(t) || t < Date.parse("2026-01-01T00:00:00Z") || t > Date.now() + 864e5) return null;
    var rows = [], seen = {};
    RAW.repos.slice(0, 400).forEach(function (r) {
      if (!Array.isArray(r) || r.length < 4) return;
      var name = clean(r[0], 161), up = num(r[1]), dn = num(r[2]), a = r[3];
      if (!REPO.test(name) || up == null || dn == null || typeof a !== "string" || !ADDR.test(a)) return;
      a = a.toLowerCase();
      if (seen[a]) return; seen[a] = 1;
      rows.push({ name: name, up: up, down: dn, href: "https://app.seer.pm/markets/" + chain + "/" + a });
    });
    if (rows.length < 20) return null;
    rows.sort(function (x, y) { return y.up - x.up || (x.name < y.name ? -1 : 1); });
    rows.forEach(function (r, i) { r.rank = i + 1; });
    var ups = rows.map(function (r) { return r.up; }), n = ups.length, mid = n >> 1;
    var sorted = ups.slice().sort(function (a, b) { return a - b; });
    var status = typeof RAW.status === "string" && /^[a-z_ ]{1,20}$/.test(RAW.status) ? RAW.status : "";
    return { rows: rows, t: t, chain: chain, status: status, median: n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2 };
  })();

  function d2(v) { return v.toFixed(2); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function when(t) { var d = new Date(t); return d.getUTCDate() + " " + MON[d.getUTCMonth()] + " " + d.getUTCFullYear() + ", " + pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()) + " UTC"; }
  function dayMon(t) { var d = new Date(t); return d.getUTCDate() + " " + MON[d.getUTCMonth()]; }
  function ago(t) {
    var s = Math.max(0, Math.round((Date.now() - t) / 1000));
    return s < 3600 ? Math.max(1, Math.round(s / 60)) + " min ago" : s < 172800 ? Math.round(s / 3600) + " h ago" : Math.round(s / 86400) + " days ago";
  }
  function mk(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function sv(tag, attrs) { var e = doc.createElementNS(SVGNS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
  function ext(a) { a.rel = "noopener"; a.target = "_blank"; return a; }
  var ARROW = "M7 17 17 7M8 7h9v9";
  function arrow() { var s = sv("svg", { width: 12, height: 12, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.9", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" }); s.appendChild(sv("path", { d: ARROW })); return s; }

  /* ---------- header: the provenance chip replaces the sample-data badge (only when the hero really is Seer data) ---------- */
  (function chip() {
    var old = doc.querySelector(".s-header .s-lockup__sample");
    if (!old || !R) return;
    var c = mk("span", "s-sample s-lockup__sample dp-prov");
    c.setAttribute("data-state", "snapshot");
    c.title = "What the first screen shows: Seer's Round 3 market data, a snapshot of deep.seer.pm taken " + when(R.t) + ". The walkthrough further down is sample data. Nothing here is tradable.";
    var vis = mk("span", "dp-prov__v", "Snapshot");
    var mid = mk("span", "s-sample__mid", " · " + dayMon(R.t));
    vis.appendChild(mid);
    c.appendChild(vis);
    c.appendChild(mk("span", "s-sr", ": Seer data from deep.seer.pm, " + when(R.t) + ". The walkthrough below is sample data."));
    old.parentNode.replaceChild(c, old);
  })();

  /* ---------- hero ---------- */
  function hero() {
    var root = doc.getElementById("r3");
    if (!root) return;
    var srcEl = doc.getElementById("dp-r3-src"), box = doc.getElementById("dp-dots"), cap = doc.getElementById("dp-dots-cap");
    if (!R) {
      root.classList.add("is-nodata");
      if (srcEl) { srcEl.setAttribute("data-state", "off"); srcEl.lastChild.textContent = "Round 3 data did not load"; }
      [].forEach.call(root.querySelectorAll("[data-r3-only]"), function (e) { e.hidden = true; });
      if (cap) cap.hidden = true;
      if (box) {
        var p = mk("p", "dp-dots__fail", "The Round 3 snapshot did not load. The real round is on ");
        p.appendChild(ext(Object.assign(mk("a", "s-link", "deep.seer.pm"), { href: "https://deep.seer.pm/" })));
        p.appendChild(doc.createTextNode("."));
        box.appendChild(p); box.removeAttribute("tabindex"); box.removeAttribute("role");
      }
      return;
    }
    var rows = R.rows, n = rows.length;
    if (srcEl) srcEl.lastChild.textContent = "Snapshot · deep.seer.pm · " + when(R.t) + " · " + ago(R.t);
    [].forEach.call(root.querySelectorAll("[data-r3=n]"), function (e) { e.textContent = String(n); });
    [].forEach.call(doc.querySelectorAll('.s-nav a[href="#r3-all"]'), function (e) { e.textContent = "All " + n; });
    var st = doc.getElementById("dp-r3-status");
    if (st && R.status) st.textContent = R.status === "open" ? "open · trading" : R.status;

    // facts
    var dl = doc.getElementById("dp-r3-facts");
    if (dl) {
      var top10 = rows[Math.min(9, n - 1)].up;
      [["Field", String(n), "repositories"], ["Median UP", d2(R.median), "share original"], ["Top 10", "≥ " + d2(Math.floor(top10 * 100) / 100), "UP"], ["Range", d2(rows[n - 1].up) + "–" + d2(rows[0].up), "UP"]].forEach(function (f) {
        var dd = mk("dd", null, f[1]); dd.appendChild(mk("small", null, f[2]));
        var w = mk("div"); w.appendChild(mk("dt", null, f[0])); w.appendChild(dd); dl.appendChild(w);
      });
    }

    // top five, as the On Seer cells
    var ul = doc.getElementById("dp-r3-top");
    if (ul) rows.slice(0, 5).forEach(function (r) {
      var a = ext(mk("a", "s-onseer__c")); a.href = r.href;
      a.setAttribute("aria-label", r.name + ": UP " + d2(r.up) + ", rank " + r.rank + " of " + n + " (opens on Seer)");
      var s = mk("span", null, r.name); s.title = r.name; a.appendChild(s);
      a.appendChild(mk("b", null, d2(r.up))); a.appendChild(mk("small", null, "UP · #" + r.rank));
      var i = mk("i"); i.style.setProperty("--w", (r.up * 100).toFixed(1) + "%"); a.appendChild(i);
      var li = mk("li"); li.appendChild(a); ul.appendChild(li);
    });

    // the whole field, folded
    var list = doc.getElementById("dp-r3-list"), q = doc.getElementById("dp-r3-q"), cnt = doc.getElementById("dp-r3-count");
    if (list) {
      var items = rows.map(function (r) {
        var li = mk("li", "dp-r3row"), a = ext(mk("a")); a.href = r.href;
        a.setAttribute("aria-label", r.name + ": UP " + d2(r.up) + ", DOWN " + d2(r.down) + ", rank " + r.rank + " (opens on Seer)");
        a.appendChild(mk("span", "dp-r3row__k", pad(r.rank)));
        var nm = mk("span", "dp-r3row__n", r.name); nm.title = r.name; a.appendChild(nm);
        a.appendChild(mk("b", "dp-r3row__v", d2(r.up)));
        var bar = mk("i", "dp-r3row__bar"); bar.style.setProperty("--w", (r.up * 100).toFixed(1) + "%"); a.appendChild(bar);
        li.appendChild(a); list.appendChild(li); return li;
      });
      var filt = function () {
        var s = q ? clean(q.value, 80).toLowerCase() : "", k = 0;
        items.forEach(function (li, i) { var on = !s || rows[i].name.toLowerCase().indexOf(s) >= 0; li.hidden = !on; if (on) k++; });
        if (cnt) cnt.textContent = s ? k + " of " + n + " match" : n + " repositories, highest UP first";
      };
      if (q) q.addEventListener("input", filt);
      filt();
    }

    // the poster: the EF line run ONE -> MANY, left to right (Seer's Part II brief). One line, the round's question, enters
    // on the left and fans out into one branch per repository; each branch runs right to its UP price and ends in a dot.
    // Branches are ranked top to bottom (rank 1 on top), so their ends trace the whole field's prices.
    if (!box || !cap) return;
    var lo = Math.floor((rows[n - 1].up - .005) * 20) / 20, hi = Math.ceil((rows[0].up + .005) * 20) / 20;
    var TOP = Math.min(10, n), cur = 0, sel = 0, ends = [], svg = null, geo = null;
    function color(i) { return i < TOP ? "rgba(143,85,247," + (1 - i * .035).toFixed(2) + ")" : "rgba(191,191,230," + (.62 - (i - TOP) / Math.max(1, n - TOP) * .34).toFixed(2) + ")"; }
    function draw() {
      var W = box.clientWidth, H = box.clientHeight;
      if (!W || !H) return;
      var small = W < 480, gut = 2, right = 8, axisH = 26, top = 30;
      var base = H - axisH, y0 = top + 4, y1 = base - 10, ym = (y0 + y1) / 2;
      var pitch = (y1 - y0) / Math.max(1, n - 1);
      var xs = gut + W * (small ? .15 : .14), xe = gut + W * (small ? .34 : .32), cx = (xs + xe) / 2;
      var X = function (v) { return xe + (v - lo) / (hi - lo) * (W - right - xe); };
      var sw = Math.max(.7, Math.min(1.6, pitch * .5)), rad = Math.max(1.4, Math.min(3, pitch * .55));
      var bn = doc.getElementById("dp-r3-binnote"); if (bn) bn.textContent = "1 line = 1 repo · ends at its UP";
      svg = sv("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H, "aria-hidden": "true" });
      // UP axis under the straight runs
      svg.appendChild(sv("line", { class: "dp-d-base", x1: xe, x2: W - right, y1: base + .5, y2: base + .5 }));
      var stepT = W < 480 ? .1 : .05;
      for (var t = Math.ceil(lo / stepT - 1e-9) * stepT; t <= hi + 1e-9; t += stepT) {
        var tx = X(t), first = t - lo < 1e-9, last = hi - t < 1e-9;
        svg.appendChild(sv("line", { class: "dp-d-tick", x1: tx, x2: tx, y1: base + 1, y2: base + 5 }));
        var lb = sv("text", { class: "dp-d-axis", x: tx, y: H - 4, "text-anchor": first ? "start" : last ? "end" : "middle" }); lb.textContent = t.toFixed(2); svg.appendChild(lb);
      }
      var ux = sv("text", { class: "dp-d-axis", x: gut, y: H - 4 }); ux.textContent = "UP →"; svg.appendChild(ux);
      // median rule
      var mx = X(R.median);
      svg.appendChild(sv("line", { class: "dp-d-med", x1: mx, x2: mx, y1: top - 8, y2: base }));
      var ml = sv("text", { class: "dp-d-medlbl", x: mx - 8, y: top - 12, "text-anchor": "end" }); ml.textContent = "MEDIAN " + d2(R.median); svg.appendChild(ml);
      var tl = sv("text", { class: "dp-d-medlbl dp-d-toplbl", x: W - right, y: top - 12, "text-anchor": "end" }); tl.textContent = "TOP " + TOP + " BY UP"; svg.appendChild(tl);
      // the branches, lowest rank first so the violet top ten draw over the rest
      ends = []; geo = { rad: rad };
      var g = sv("g", { class: "dp-d-fan" }), dg = sv("g", {});
      function branch(i) {
        var r = rows[i], yi = y0 + i * pitch, x2 = X(r.up);
        var tail = "C" + cx.toFixed(1) + " " + ym.toFixed(1) + " " + cx.toFixed(1) + " " + yi.toFixed(1) + " " + xe.toFixed(1) + " " + yi.toFixed(1) + "H" + x2.toFixed(1);
        return { d: "M" + gut + " " + ym.toFixed(1) + "H" + xs.toFixed(1) + tail, sel: "M" + xs.toFixed(1) + " " + ym.toFixed(1) + tail, x: x2, y: yi };
      }
      for (var i = n - 1; i >= 0; i--) {
        var b = branch(i);
        g.appendChild(sv("path", { d: b.d, stroke: color(i), "stroke-width": sw.toFixed(2), class: "dp-d-br" }));
        dg.appendChild(sv("circle", { cx: b.x.toFixed(1), cy: b.y.toFixed(1), r: rad.toFixed(2), fill: color(i), class: "dp-d-dot" }));
        ends[i] = b;
      }
      svg.appendChild(g);
      // the one line in: the round's question
      svg.appendChild(sv("line", { class: "dp-d-stem", x1: gut, x2: xs + 1, y1: ym, y2: ym }));
      var q1 = sv("text", { class: "dp-d-medlbl", x: gut, y: ym - 10 }); q1.textContent = "1 QUESTION"; svg.appendChild(q1);
      var q2 = sv("text", { class: "dp-d-axis", x: gut, y: ym + 20 }); q2.textContent = n + " REPOS"; svg.appendChild(q2);
      svg.appendChild(dg);
      geo.sel = sv("path", { class: "dp-d-sel", d: "M0 0" });
      geo.ring = sv("circle", { class: "dp-d-ring", r: (rad + 3).toFixed(2), cx: -20, cy: -20 });
      svg.appendChild(geo.sel); svg.appendChild(geo.ring);
      geo.y0 = y0; geo.pitch = pitch;
      while (box.firstChild) box.removeChild(box.firstChild);
      box.appendChild(svg);
      cur = -1; on(sel);
    }
    function on(i) {
      if (!svg || i === cur) return;
      cur = i;
      var r = rows[i], d = ends[i];
      if (d) { geo.ring.setAttribute("cx", d.x.toFixed(1)); geo.ring.setAttribute("cy", d.y.toFixed(1)); geo.sel.setAttribute("d", d.sel); }
      while (cap.firstChild) cap.removeChild(cap.firstChild);
      var l = mk("div"); l.style.minWidth = "0";
      l.appendChild(mk("b", null, r.name));
      var meta = mk("span", null, "Rank " + r.rank + " of " + n + " · DOWN " + d2(r.down));
      var a = ext(mk("a", "dp-cap-link", "Market on Seer")); a.href = r.href; a.id = "dp-dots-link"; a.appendChild(arrow());
      meta.appendChild(doc.createTextNode(" ")); meta.appendChild(a); l.appendChild(meta); cap.appendChild(l);
      var num = mk("div", "dp-cap-num", d2(r.up)); num.appendChild(mk("small", null, "UP · share original")); cap.appendChild(num);
      box.setAttribute("aria-valuenow", String(r.rank));
      box.setAttribute("aria-valuetext", r.name + ": UP " + d2(r.up) + ", DOWN " + d2(r.down) + ", rank " + r.rank + " of " + n);
    }
    function nearest(e) { // the branch whose row is closest to the pointer (rows are evenly spaced)
      if (!geo) return -1;
      var bb = box.getBoundingClientRect(), y = e.clientY - bb.top;
      return Math.max(0, Math.min(n - 1, Math.round((y - geo.y0) / Math.max(.5, geo.pitch))));
    }
    box.setAttribute("aria-valuemin", "1"); box.setAttribute("aria-valuemax", String(n));
    box.addEventListener("pointermove", function (e) { var i = nearest(e); if (i >= 0) on(i); });
    box.addEventListener("pointerleave", function () { on(sel); });
    box.addEventListener("click", function (e) { var i = nearest(e); if (i >= 0) { sel = i; on(i); } });
    box.addEventListener("keydown", function (e) {
      var k = e.key, i = cur < 0 ? sel : cur;
      if (k === "ArrowLeft" || k === "ArrowDown") i++; else if (k === "ArrowRight" || k === "ArrowUp") i--;
      else if (k === "Home") i = 0; else if (k === "End") i = n - 1;
      else if (k === "PageDown") i += 10; else if (k === "PageUp") i -= 10;
      else if (k === "Enter") { var a = doc.getElementById("dp-dots-link"); if (a) { e.preventDefault(); a.click(); } return; }
      else return;
      e.preventDefault(); sel = Math.max(0, Math.min(n - 1, i)); on(sel);
    });
    if (window.ResizeObserver) { var last = 0; new ResizeObserver(function () { var w = box.clientWidth + "x" + box.clientHeight; if (w !== last) { last = w; draw(); } }).observe(box); }
    else window.addEventListener("resize", draw);
    draw(); // now too: ResizeObserver waits for a painted frame, which background tabs skip
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", hero); else hero();
})();
