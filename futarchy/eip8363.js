/* Futarchy · the hero: EIP-8363, a real futarchy market on futarchy.seer.pm (prefix ft-real / ft-rp).
   Concept by Swift Bot Labs · not affiliated with Seer.

   Reads the market's two CONDITIONAL pools (YES_WETH/YES_USDS and NO_WETH/NO_USDS on Ethereum) live from Seer's public
   candles API (api.futarchy.seer.pm, CORS *): hourly closes since 8 Oct 2026 plus each pool's spot price, in ONE POST.
   Only numbers are used. Each value is type-checked (decimal strings by regex), range-clamped and cross-checked; no
   string from the API is ever rendered, and every link is built here from the fixed market and pool addresses.
   The dated snapshot in eip8363-data.js is painted at once; the live answer replaces it when Seer replies (until 12 s),
   and after 4 s without one the page says "Snapshot · <date>". Market state follows the real clock: trading ends
   24 Oct 2026 00:00 UTC (futarchy.seer.pm showed "2d 14h 32m" left at 21 Oct 09:27 UTC). Once data read after that
   moment is shown, both prices and the impact come from each pool's last hourly candle that ends by the close, never a
   later candle or spot price, and the chips say "Prices at close" instead of "Live". */
(function () {
  "use strict";
  var S = window.Seer, X = window.FT_EIP8363 || null;
  var root = document.getElementById("ft-real");
  if (!S || !S.el || !S.svgEl || !root) return;
  var el = S.el, sv = S.svgEl;
  function $(id) { return document.getElementById(id); }

  var API = "https://api.futarchy.seer.pm/candles/graphql?chainId=1";
  var POOL = { yes: "0xa95d30c125c20d001f6aed9f2eff1b8e5577dca3", no: "0x7a3b5f6592186c5d121ec4e48fc9e5d020a0b2df" };
  var H = 3600, SINCE = Date.UTC(2026, 9, 8) / 1000;                             // series start, seconds
  var W0 = Date.UTC(2026, 9, 9, 12) / 1000, W1 = Date.UTC(2026, 9, 14, 12) / 1000; // the market's 5-day TWAP window
  var CLOSES = Date.UTC(2026, 9, 24) / 1000;                                     // trading ends
  var BAND = 0.01;                                                                // YES vs NO: ±1% = neutral
  var FALLBACK_MS = 4000, ABORT_MS = 12000, MAX_BYTES = 600000, MAX_ROWS = 1000;
  var NUM = /^\d{1,7}(\.\d{1,40})?$/, TS = /^\d{10}$/;
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  /* ---------- numbers ---------- */
  var nf2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  function usd(v) { return nf2.format(v); }
  function gapTxt(g) { var a = Math.abs(g) * 100; return a < 0.01 ? "<0.01%" : (g > 0 ? "+" : "−") + a.toFixed(2) + "%"; }
  function rec(g) { return g > BAND ? "approve" : g < -BAND ? "reject" : "neutral"; }
  function dayMon(t) { var d = new Date(t * 1000); return d.getUTCDate() + " " + MON[d.getUTCMonth()]; }
  function hhmm(t) { var d = new Date(t * 1000), p = function (n) { return (n < 10 ? "0" : "") + n; }; return p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()); }
  function price(s) { // a decimal string from the API -> a plausible ETH price in USDS, or NaN
    if (typeof s !== "string" || !NUM.test(s)) return NaN;
    var v = Number(s); return v > 100 && v < 1e6 ? v : NaN;
  }

  /* ---------- data model: [[t (s), price]] per branch, spot prices, read time ---------- */
  function fromSnapshot(x) {
    if (!x || typeof x !== "object" || typeof x.since !== "number" || typeof x.at !== "number") return null;
    function pairs(a) {
      if (!Array.isArray(a) || a.length % 2 || a.length > 2 * MAX_ROWS) return null;
      var out = [];
      for (var i = 0; i < a.length; i += 2) {
        var h = a[i], p = a[i + 1] / 100;
        if (typeof h !== "number" || h !== Math.floor(h) || h < 0 || !(p > 100 && p < 1e6)) return null;
        out.push([x.since + h * H, p]);
      }
      return out;
    }
    var y = pairs(x.yes), n = pairs(x.no);
    if (!y || !n || y.length < 24 || n.length < 24 || !(x.py > 100 && x.py < 1e6) || !(x.pn > 100 && x.pn < 1e6)) return null;
    if (x.at / 1000 >= CLOSES && !closeOk(y, n)) return null;
    return { yes: y, no: n, py: x.py, pn: x.pn, at: Math.floor(x.at / 1000) };
  }
  function fromApi(d, nowS) {
    if (!d || typeof d !== "object" || !d.data || typeof d.data !== "object") throw new Error("bad shape");
    var D = d.data;
    function rows(list) {
      if (!Array.isArray(list) || list.length > MAX_ROWS) throw new Error("bad rows");
      var seen = {}, out = [];
      list.forEach(function (r) {
        if (!r || typeof r !== "object" || typeof r.periodStartUnix !== "string" || !TS.test(r.periodStartUnix)) return;
        var t = Number(r.periodStartUnix), p = price(r.close);
        if (t < SINCE || t > nowS + H || t % H || !isFinite(p) || seen[t]) return;
        seen[t] = 1; out.push([t, p]);
      });
      if (out.length < 24) throw new Error("too few candles");
      return out.sort(function (a, b) { return a[0] - b[0]; });
    }
    function spot(pool, side, last) {
      if (!pool || typeof pool !== "object" || pool.type !== "CONDITIONAL" || pool.outcomeSide !== side) throw new Error("wrong pool");
      var p = price(pool.price);
      return isFinite(p) && Math.abs(p / last - 1) < 0.2 ? p : last;                // a wild spot falls back to the last close
    }
    var y = rows(D.y), n = rows(D.n);
    var py = spot(D.py, "YES", y[y.length - 1][1]), pn = spot(D.pn, "NO", n[n.length - 1][1]);
    if (nowS >= CLOSES) { if (!closeOk(y, n)) throw new Error("no close"); } // after the close the spot prices are not used
    else if (Math.abs(py / pn - 1) > 0.5) throw new Error("branches disagree");
    return { yes: y, no: n, py: py, pn: pn, at: nowS };
  }
  // the last candle [start, close] that starts at or before t (s); null before the first candle
  function lastBy(s, t) { var lo = 0, hi = s.length - 1, r = null; while (lo <= hi) { var m = (lo + hi) >> 1; if (s[m][0] <= t) { r = s[m]; lo = m + 1; } else hi = m - 1; } return r; }
  // last close at or before t (s); null before the first candle
  function at(s, t) { var r = lastBy(s, t); return r ? r[1] : null; }
  // at the close: each branch's last hourly candle that ENDS by it (starts at or before CLOSES - 1 h); a candle that starts at
  // or after the close, and any spot price read after it, are never used. Both must exist and agree within 50%.
  function closeOk(y, n) {
    var cy = lastBy(y, CLOSES - H), cn = lastBy(n, CLOSES - H);
    return !!(cy && cn && Math.abs(cy[1] / cn[1] - 1) <= 0.5);
  }
  // time-weighted average over the window: each hour holds the close of the hour before it (an approximation of the
  // pools' own TWAP oracle, which futarchy.seer.pm reads on-chain)
  function twap(s) {
    var sum = 0, k = 0;
    for (var t = W0; t < W1; t += H) { var p = at(s, t - H); if (p == null) return null; sum += p; k++; }
    return k ? sum / k : null;
  }
  function derive(m) {
    var done = m.at >= CLOSES, end = done ? CLOSES : m.at, start = Math.max(m.yes[0][0], m.no[0][0]), hours = [];
    if (done) {                                // trading has ended: the prices AT the close replace the spot prices
      var cy = lastBy(m.yes, CLOSES - H), cn = lastBy(m.no, CLOSES - H);
      m.py = cy[1]; m.pn = cn[1]; m.candle = Math.max(cy[0], cn[0]);
    }
    for (var t = start; t <= (done ? CLOSES - H : end); t += H) hours.push([t, at(m.yes, t), at(m.no, t)]);
    if (hours.length && hours[hours.length - 1][0] < end) hours.push([end, m.py, m.pn]); // end on the spot (or close) prices
    var ty = twap(m.yes), tn = twap(m.no);
    m.hours = hours; m.start = start; m.end = end; m.closed = done;
    m.gap = m.py / m.pn - 1;
    m.twapGap = ty && tn ? ty / tn - 1 : null;
    return m;
  }

  /* ---------- the copy (static markup in index.html, refreshed here) ---------- */
  var cur = null, mode = null; // mode: loading | live | snapshot
  function setText(id, t) { var n = $(id); if (n) n.textContent = t; }
  function renderCopy(m) {
    var closed = m.closed || Math.floor(Date.now() / 1000) >= CLOSES;
    setText("ft-real-y", usd(m.py)); setText("ft-real-n", usd(m.pn)); setText("ft-real-gap", gapTxt(m.gap));
    setText("ft-real-gap-l", m.closed ? "Impact at close" : closed ? "Impact, last snapshot" : "Impact (spot)");
    var r = rec(m.gap), tag = $("ft-real-rec");
    if (tag) {
      tag.className = "s-tag ft-rec" + (r === "approve" ? " s-tag--pos" : r === "reject" ? " s-tag--neg" : "");
      S.clear(tag).insertAdjacentHTML("beforeend", S.icon(r === "neutral" ? "info" : r === "approve" ? "check" : "close", 12));
      tag.appendChild(document.createTextNode(r === "neutral" ? "Inside ±1% · neutral" : r === "approve" ? "Above +1%" : "Below −1%"));
    }
    var tw = $("ft-real-twap");
    if (tw && m.twapGap != null) {
      S.clear(tw).appendChild(el("span", { class: "s-hide-sm", text: "Signal: " }));
      tw.appendChild(document.createTextNode("5-day TWAP, 9–14 Oct: "));
      tw.appendChild(el("b", { text: "≈ " + gapTxt(m.twapGap) + " · " + (rec(m.twapGap) === "neutral" ? "neutral" : "leans " + rec(m.twapGap)) }));
    }
    var st = $("ft-real-state");
    if (st) {
      st.setAttribute("data-state", closed ? "pending" : "open");
      st.textContent = closed ? "Closed " + dayMon(CLOSES) + " " + hhmm(CLOSES) + " UTC · resolving" : "Trading until " + dayMon(CLOSES);
    }
  }
  // provenance: the hero's chip and the header chip (index.html swaps the shell's sample badge for it)
  function renderSource(state, m) {
    var label = state === "live" ? "Live" : "Snapshot", when = state === "live" ? hhmm(m.at) + " UTC" : (X && X.when) || "";
    var short = state === "live" ? when : X && typeof X.at === "number" ? dayMon(Math.floor(X.at / 1000)) : "";
    var hs = $("ft-real-src");
    if (m && m.closed) { renderClosed(state, m, when); return; }
    if (hs) hs.removeAttribute("title");
    if (hs) {
      hs.setAttribute("data-state", state);
      S.clear(hs).appendChild(el("i", { attrs: { "aria-hidden": "true" } }));
      hs.appendChild(document.createTextNode(label));
      hs.appendChild(el("span", { class: "s-hide-sm", text: " · futarchy.seer.pm" }));
      hs.appendChild(document.createTextNode(" · " + when));
    }
    var hd = $("ft-hsrc");
    if (hd) {
      hd.setAttribute("data-state", state);
      S.clear(hd).appendChild(el("i", { attrs: { "aria-hidden": "true" } }));
      hd.appendChild(el("span", { class: "ft-hsrc__k", text: label }));
      if (short) hd.appendChild(el("span", { class: "ft-hsrc__when", text: " · " + short }));
      hd.setAttribute("aria-label", "Top of page: " + (state === "live" ? "live from futarchy.seer.pm, read at " + when : "snapshot of futarchy.seer.pm, " + when + (state === "loading" ? ", live prices loading" : "")));
    }
    root.setAttribute("aria-busy", state === "loading" ? "true" : "false");
  }
  // after the close: no Live chip; the hero says the prices are the close's, from which hourly candle, and where they were read
  function renderClosed(state, m, when) {
    var c = m.candle, cw = (CLOSES - c <= 86400 ? "" : dayMon(c) + " ") + hhmm(c) + " UTC";
    var read = state === "live" ? "read live from api.futarchy.seer.pm at " + when : "from the hourly snapshot of " + when + (state === "loading" ? " (live read pending)" : " (Seer's API didn't answer)");
    var why = "Trading closed " + dayMon(CLOSES) + ", " + hhmm(CLOSES) + " UTC. Both prices are the closes of each pool's last hourly candle before it (" +
      dayMon(c) + " " + hhmm(c) + "\u2013" + hhmm(c + H) + " UTC), never a later trade; " + read + ".";
    var hs = $("ft-real-src");
    if (hs) {
      hs.setAttribute("data-state", "closed"); hs.setAttribute("title", why);
      S.clear(hs).appendChild(el("i", { attrs: { "aria-hidden": "true" } }));
      hs.appendChild(document.createTextNode("Prices at close"));
      hs.appendChild(el("span", { class: "s-hide-sm", text: " · futarchy.seer.pm" }));
      hs.appendChild(document.createTextNode(" · ")); hs.appendChild(el("span", { class: "s-hide-sm", text: "hourly " }));
      hs.appendChild(document.createTextNode("candle " + cw));
    }
    var hd = $("ft-hsrc");
    if (hd) {
      hd.setAttribute("data-state", "closed");
      S.clear(hd).appendChild(el("i", { attrs: { "aria-hidden": "true" } }));
      hd.appendChild(el("span", { class: "ft-hsrc__k", text: "At close" }));
      hd.appendChild(el("span", { class: "ft-hsrc__when", text: " · " + dayMon(CLOSES) }));
      hd.setAttribute("aria-label", "Top of page: EIP-8363's prices at its close, " + dayMon(CLOSES) + " " + hhmm(CLOSES) + " UTC, from futarchy.seer.pm (hourly candle " + cw + ")");
    }
    root.setAttribute("aria-busy", state === "loading" ? "true" : "false");
  }

  /* ---------- the poster: both conditional prices since 8 Oct, the ±1% band, the TWAP window ---------- */
  var box = $("ft-rp-art");
  function drawPoster() {
    var m = cur;
    if (!m || !box || !box.clientWidth) return;
    var W = box.clientWidth, Hh = box.clientHeight || 420, small = W < 560;
    var top = small ? 58 : 66, bot = small ? 58 : 66, x0 = small ? 16 : 24;
    // ex = "now", where the price history ends; right of it the one proposal FORKS into its two outcomes (EF line, one -> many)
    var labW = small ? 92 : 116, fk = small ? 30 : 56, ex = W - labW - fk - (small ? 10 : 18), ph = Hh - top - bot;
    var hs = m.hours, t0 = m.start, t1 = m.end, winLabels = [], yLabels = [];
    var lo = Infinity, hi = -Infinity;
    hs.forEach(function (r) { if (r[2] != null) { lo = Math.min(lo, r[2] * (1 - BAND)); hi = Math.max(hi, r[2] * (1 + BAND)); } if (r[1] != null) { lo = Math.min(lo, r[1]); hi = Math.max(hi, r[1]); } });
    var pad = (hi - lo) * .08; lo -= pad; hi += pad;
    var Xs = function (t) { return x0 + (t - t0) / Math.max(1, t1 - t0) * (ex - x0); };
    var Y = function (v) { return top + (hi - v) / (hi - lo) * ph; };
    var Yy = Y(m.py), Yn = Y(m.pn);
    var svg = sv("svg", { viewBox: "0 0 " + W + " " + Hh, width: W, height: Hh, class: "ft-poster__svg ft-rp", role: "img",
      "aria-label": "EIP-8363 on Seer, hourly since " + dayMon(t0) + (m.closed ? " to the trading close, " + dayMon(CLOSES) + " " + hhmm(CLOSES) + " UTC" : "") + ", then the proposal forks into its two outcomes: ETH " + usd(m.py) + " USDS if scheduled, " + usd(m.pn) + " if not" + (m.closed ? " at the close" : "") + ", a gap of " + gapTxt(m.gap) + ", " +
        (rec(m.gap) === "neutral" ? "inside the ±1% band." : rec(m.gap) === "approve" ? "above the +1% band." : "below the −1% band.") +
        (m.twapGap != null ? " 5-day TWAP, 9 to 14 Oct: about " + gapTxt(m.twapGap) + ", " + (rec(m.twapGap) === "neutral" ? "neutral." : "leans " + rec(m.twapGap) + ".") : "") });
    // construction grid on 45°, through the end node (the EF logo sheet's lines)
    var g = sv("g", { class: "ft-pt-grid" }), gap = 46, cA = ex + Yn, cB = ex - Yn;
    for (var k = -Hh; k < W + Hh; k += gap) {
      var a = k + ((cA - k) % gap + gap) % gap, b = k + ((cB - k) % gap + gap) % gap;
      g.appendChild(sv("path", { d: "M" + (a - Hh) + " " + Hh + "L" + a + " 0" }));
      g.appendChild(sv("path", { d: "M" + b + " 0L" + (b + Hh) + " " + Hh }));
    }
    svg.appendChild(g);
    // price gridlines (left labels)
    var step = niceStep((hi - lo) / (small ? 3 : 4));
    for (var v = Math.ceil(lo / step) * step; v <= hi; v += step) {
      svg.appendChild(sv("line", { class: "ft-rp-grid", x1: x0, x2: ex, y1: Y(v), y2: Y(v) }));
      var tl = sv("text", { class: "ft-pt-micro ft-rp-ylab", x: x0, y: Y(v) - 5 }); tl.textContent = nf0.format(v); yLabels.push(tl);
    }
    // the official TWAP window
    var wa = Math.max(x0, Xs(W0)), wb = Math.min(ex, Xs(W1));
    if (wb > wa) {
      svg.appendChild(sv("rect", { class: "ft-rp-win", x: wa, y: top, width: wb - wa, height: ph }));
      // labels go to whichever end of the window the lines and the band leave more room at
      var wTop = Infinity, wBot = -Infinity;
      hs.forEach(function (r) { if (r[0] < W0 || r[0] > W1 || r[2] == null) return; wTop = Math.min(wTop, Y(r[2] * (1 + BAND)), Y(r[1])); wBot = Math.max(wBot, Y(r[2] * (1 - BAND)), Y(r[1])); });
      var lines = [small ? "TWAP" : "TWAP 9–14 OCT"].concat(!small && m.twapGap != null ? [("≈ " + gapTxt(m.twapGap) + " · " + rec(m.twapGap)).toUpperCase()] : []);
      var atTop = !(wTop - top < top + ph - wBot);
      lines.forEach(function (txt, i) {
        var yy = atTop ? top + 16 + i * 15 : top + ph - 10 - (lines.length - 1 - i) * 15;
        var wl = sv("text", { class: "ft-pt-micro ft-rp-winl", x: wa + 7, y: yy }); wl.textContent = txt; svg.appendChild(wl); winLabels.push(wl);
      });
    }
    // the ±1% band around the NO price: YES has to leave it for a signal
    var up = "", dn = "";
    hs.forEach(function (r) { if (r[2] == null) return; var x = Xs(r[0]).toFixed(1); up += (up ? "L" : "M") + x + " " + Y(r[2] * (1 + BAND)).toFixed(1); dn = "L" + x + " " + Y(r[2] * (1 - BAND)).toFixed(1) + dn; });
    if (up) {
      svg.appendChild(sv("path", { class: "ft-pt-band ft-rp-band", d: up + dn + "Z" }));
    }
    // NO under YES: where the two futures agree they read as one line
    [[2, "no"], [1, "yes"]].forEach(function (c) {
      var d = ""; hs.forEach(function (r) { if (r[c[0]] == null) return; d += (d ? "L" : "M") + Xs(r[0]).toFixed(1) + " " + Y(r[c[0]]).toFixed(1); });
      svg.appendChild(sv("path", { class: "ft-pt-branch ft-pt-branch--" + c[1] + " ft-rp-line ft-rp-line--" + c[1], d: d }));
    });
    yLabels.forEach(function (t) { svg.appendChild(t); }); // above the lines, haloed in ink
    // EF circles + the end node
    var cg = sv("g", { class: "ft-pt-circles" });
    cg.appendChild(sv("circle", { cx: ex, cy: (Yy + Yn) / 2, r: small ? 22 : 30 })); cg.appendChild(sv("circle", { cx: ex, cy: (Yy + Yn) / 2, r: small ? 44 : 60 }));
    svg.appendChild(cg);
    // end labels, de-overlapped: the higher branch above
    var hiB = Yy <= Yn ? "yes" : "no", minSep = small ? 40 : 60, yTop = Math.min(Yy, Yn), yBot = Math.max(Yy, Yn);
    if (yBot - yTop < minSep) { var mid = (yTop + yBot) / 2; yTop = mid - minSep / 2; yBot = mid + minSep / 2; }
    // the fork: from today's prices each branch turns 45° to its outcome (the spread is drawn for legibility, not to the
    // price scale: the labels carry the values), NO under YES as in the history
    var fx = ex + fk, yEnd = { yes: hiB === "yes" ? yTop : yBot, no: hiB === "yes" ? yBot : yTop };
    [["no", Yn], ["yes", Yy]].forEach(function (b) {
      var y1 = yEnd[b[0]], dx = Math.min(fk - 8, Math.abs(y1 - b[1]));
      svg.appendChild(sv("path", { class: "ft-pt-branch ft-pt-branch--" + b[0] + " ft-rp-line ft-rp-line--" + b[0] + " ft-rp-fork", d: "M" + ex.toFixed(1) + " " + b[1].toFixed(1) + "L" + (ex + dx).toFixed(1) + " " + y1.toFixed(1) + "H" + fx.toFixed(1) }));
    });
    if (Math.abs(Yy - Yn) < 3) svg.appendChild(sv("circle", { class: "ft-pt-node ft-rp-node", cx: ex, cy: (Yy + Yn) / 2, r: small ? 4 : 5 }));
    [["no", yEnd.no], ["yes", yEnd.yes]].forEach(function (b) { svg.appendChild(sv("circle", { class: "ft-pt-end ft-pt-end--" + b[0], cx: fx, cy: b[1], r: small ? 5 : 6 })); });
    var lx = fx + (small ? 10 : 14), vs = small ? 17 : 22;
    function endLabel(br, yv, above) {
      var val = br === "yes" ? m.py : m.pn, name = br === "yes" ? (small ? "If yes" : "If scheduled") : (small ? "If no" : "If not");
      var vt = sv("text", { class: "ft-pt-value", x: lx, y: yv + vs * .36, style: "font-size:" + vs + "px" }); vt.textContent = usd(val); svg.appendChild(vt);
      var t = sv("text", { class: "ft-pt-micro", x: lx, y: above ? yv - vs * .62 - 2 : yv + vs * .36 + 15 }); t.textContent = name.toUpperCase(); svg.appendChild(t);
    }
    endLabel(hiB, yTop, true); endLabel(hiB === "yes" ? "no" : "yes", yBot, false);
    // time axis
    var ty = top + ph + 18, days = Math.max(1, Math.round((t1 - t0) / 86400)), every = small ? (days > 10 ? 6 : 4) : (days > 12 ? 4 : 3);
    for (var d0 = Math.ceil(t0 / 86400) * 86400, i = 0; d0 <= t1; d0 += 86400, i++) {
      if (i % every) continue;
      var x = Xs(d0); if (x > ex - (small ? 44 : 52)) break;
      svg.appendChild(sv("line", { class: "ft-rp-tick", x1: x, x2: x, y1: top + ph, y2: top + ph + 5 }));
      var tx = sv("text", { class: "ft-pt-micro", x: x < x0 + 22 ? x0 : x, y: ty, "text-anchor": x < x0 + 22 ? "start" : "middle" }); tx.textContent = dayMon(d0).toUpperCase(); svg.appendChild(tx);
    }
    var nw = sv("text", { class: "ft-pt-micro", x: ex, y: ty, "text-anchor": "end" }); nw.textContent = (m.end >= CLOSES ? "CLOSE" : mode === "live" ? "NOW" : dayMon(m.end).toUpperCase()); svg.appendChild(nw);
    // hover: read any hour
    var hl = sv("line", { class: "ft-rp-x", x1: 0, x2: 0, y1: top, y2: top + ph, visibility: "hidden" });
    var hdy = sv("circle", { class: "ft-pt-end ft-pt-end--yes", r: 4, visibility: "hidden" }), hdn = sv("circle", { class: "ft-pt-end ft-pt-end--no", r: 4, visibility: "hidden" });
    var ht = sv("text", { class: "ft-pt-micro ft-rp-read", x: x0, y: top - 14, visibility: "hidden" });
    svg.appendChild(hl); svg.appendChild(hdn); svg.appendChild(hdy); svg.appendChild(ht);
    var hit = sv("rect", { x: x0, y: top, width: ex - x0, height: ph, fill: "transparent" });
    function readAt(e) {
      var bb = svg.getBoundingClientRect(), px = (e.clientX - bb.left) * W / bb.width;
      var t = t0 + Math.max(0, Math.min(1, (px - x0) / (ex - x0))) * (t1 - t0), best = hs[0];
      hs.forEach(function (r) { if (Math.abs(r[0] - t) < Math.abs(best[0] - t)) best = r; });
      if (best[1] == null || best[2] == null) return;
      var x = Xs(best[0]);
      hl.setAttribute("x1", x); hl.setAttribute("x2", x); hl.setAttribute("visibility", "visible");
      hdy.setAttribute("cx", x); hdy.setAttribute("cy", Y(best[1])); hdy.setAttribute("visibility", "visible");
      hdn.setAttribute("cx", x); hdn.setAttribute("cy", Y(best[2])); hdn.setAttribute("visibility", "visible");
      ht.textContent = (dayMon(best[0]) + " " + hhmm(best[0]) + " · " + (small ? "" : "YES ") + usd(best[1]) + (small ? " / " : " · NO ") + usd(best[2]) + " · " + gapTxt(best[1] / best[2] - 1)).toUpperCase();
      ht.setAttribute("visibility", "visible");
    }
    function hide() { [hl, hdy, hdn, ht].forEach(function (n) { n.setAttribute("visibility", "hidden"); }); }
    hit.addEventListener("pointermove", readAt); hit.addEventListener("pointerdown", readAt); hit.addEventListener("pointerleave", hide);
    svg.appendChild(hit);
    S.clear(box).appendChild(svg);
    // a price label that would sit on a TWAP label is dropped
    var wb2 = winLabels.map(function (t) { try { return t.getBBox(); } catch (e) { return null; } }).filter(Boolean);
    yLabels.forEach(function (t) {
      var b; try { b = t.getBBox(); } catch (e) { return; }
      if (wb2.some(function (w) { return b.x < w.x + w.width + 4 && w.x < b.x + b.width + 4 && b.y < w.y + w.height && w.y < b.y + b.height; })) t.parentNode.removeChild(t);
    });
  }
  function niceStep(raw) { var p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p; }

  function show(m, state) {
    cur = derive(m); mode = state;
    renderCopy(cur); renderSource(state, cur); drawPoster();
  }

  /* ---------- boot: snapshot first, then live ---------- */
  var snap = fromSnapshot(X);
  if (snap) show(snap, "loading");
  if (box && S.onResize) S.onResize(box, drawPoster);
  var settled = false;
  function fallback(why) {
    if (settled) return; settled = true;
    if (why) root.setAttribute("data-why", String(why).slice(0, 40));
    if (snap) show(snap, "snapshot");
    else renderSource("snapshot", { at: 0 });
  }
  var timer = setTimeout(function () { fallback("timeout"); }, FALLBACK_MS);
  var ctl = typeof AbortController === "function" ? new AbortController() : null;
  var kill = setTimeout(function () { if (ctl) ctl.abort(); }, ABORT_MS);
  if (typeof fetch !== "function") { clearTimeout(timer); fallback("no fetch"); return; }
  function q(alias, pool) {
    return alias + ': candles(first: ' + MAX_ROWS + ', where: {pool: "' + pool + '", period: 3600, periodStartUnix_gte: ' + SINCE + '}, orderBy: periodStartUnix, orderDirection: asc) { periodStartUnix close }';
  }
  var query = "{ " + q("y", POOL.yes) + " " + q("n", POOL.no) +
    ' py: pool(id: "' + POOL.yes + '") { price type outcomeSide } pn: pool(id: "' + POOL.no + '") { price type outcomeSide } }';
  fetch(API, {
    method: "POST", mode: "cors", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer", redirect: "error",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: query }),
    signal: ctl ? ctl.signal : undefined
  }).then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    if (!/application\/json/i.test(r.headers.get("content-type") || "")) throw new Error("not JSON");
    if (+(r.headers.get("content-length") || 0) > MAX_BYTES) throw new Error("too big");
    return r.text();
  }).then(function (t) {
    if (t.length > MAX_BYTES) throw new Error("too big");
    var m = fromApi(JSON.parse(t), Math.floor(Date.now() / 1000));
    clearTimeout(timer); clearTimeout(kill); settled = true;
    show(m, "live");
  }).catch(function (e) { clearTimeout(timer); clearTimeout(kill); fallback((e && e.name) || "error"); });
})();
