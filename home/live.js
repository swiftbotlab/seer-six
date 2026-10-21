/* Seer homepage · "Open on Seer now": the real number of open markets, read live from Seer's public markets API.
   Concept by Swift Bot Labs. Not affiliated with Seer.

   One POST to app.seer.pm/.netlify/functions/markets-search ({marketStatusList:["open"], limit:1}); only the
   numeric "count" is used. Nothing from the response is ever inserted as markup: the count is type-checked,
   range-checked and formatted here, then set with textContent. The page shows the dated snapshot count
   (assets/seer-snapshot.js) at once, labels it "Snapshot" after 4 s without an answer, and swaps in a live
   answer that arrives within 12 s. CSP on this page: connect-src https://app.seer.pm only. */
(function () {
  "use strict";
  var X = window.SEER_SNAPSHOT && window.SEER_SNAPSHOT.open;
  var n = document.getElementById("hm-live-n"), src = document.getElementById("hm-live-src");
  if (!n || !src) return;
  var API = "https://app.seer.pm/.netlify/functions/markets-search";
  var FALLBACK_MS = 4000, ABORT_MS = 12000, MAX_BYTES = 200000; // a limit:1 answer is ~4 KB
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
    if (X && okCount(X.count) && typeof X.when === "string") { n.textContent = fmt(X.count); label("snapshot", "Snapshot · " + X.when); }
    else label("snapshot", "Seer's API is unavailable right now");
  }
  function hhmm(d) { var p = function (v) { return (v < 10 ? "0" : "") + v; }; return p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()) + " UTC"; }

  // the dated snapshot first, so the row is never empty while Seer answers
  if (X && okCount(X.count)) n.textContent = fmt(X.count);
  var timer = setTimeout(fallback, FALLBACK_MS);
  var ctl = typeof AbortController === "function" ? new AbortController() : null;
  var kill = setTimeout(function () { if (ctl) ctl.abort(); }, ABORT_MS);
  if (typeof fetch !== "function") { clearTimeout(timer); clearTimeout(kill); fallback(); return; }
  fetch(API, {
    method: "POST", mode: "cors", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer", redirect: "error",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ marketStatusList: ["open"], limit: 1, page: 1 }),
    signal: ctl ? ctl.signal : undefined
  }).then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    if (!/application\/json/i.test(r.headers.get("content-type") || "")) throw new Error("not JSON");
    if (+(r.headers.get("content-length") || 0) > MAX_BYTES) throw new Error("too big");
    return r.text();
  }).then(function (t) {
    if (t.length > MAX_BYTES) throw new Error("too big");
    var d = JSON.parse(t);
    if (!d || typeof d !== "object" || !okCount(d.count)) throw new Error("bad count");
    clearTimeout(timer); clearTimeout(kill);
    shown = "live"; n.textContent = fmt(d.count); label("live", "Live · app.seer.pm · " + hhmm(new Date()));
  }).catch(function (e) {
    clearTimeout(timer); clearTimeout(kill); src.setAttribute("data-why", String((e && e.name) || "error").slice(0, 40));
    if (shown !== "live") { shown = null; fallback(); }
  });
})();
