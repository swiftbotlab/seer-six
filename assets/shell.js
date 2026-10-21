/* Seer · shared shell — one product header (with the Apps menu and the sample-data badge), footer, theme, copy, toasts.
   Concept by Swift Bot Labs. Not affiliated with Seer.

   Include as the FIRST element inside <body>:
     <body data-app="deep">
       <script>window.SEER_PAGE = { nav: [["Rounds", "#rounds"]], search: "Search proposals", cta: ["Upload predictions", "#upload", "upload"] };</script>
       <script src="../assets/shell.js"></script>
       <main id="main" class="s-main"> ... </main>
   The header is inserted immediately (no flash); the footer on DOMContentLoaded. */
(function () {
  "use strict";
  var S = (window.Seer = window.Seer || {});
  var doc = document;

  /* ---- base URL (site root), derived from this script's own src ---- */
  var me = doc.currentScript || [].slice.call(doc.scripts).filter(function (s) { return /assets\/shell\.js/.test(s.src); })[0];
  var ROOT = me ? new URL("../", me.src).href : "./";
  S.root = ROOT;
  S.url = function (path) { return ROOT + (path || ""); };

  /* ---- the six interfaces (single source of truth) ---- */
  S.apps = [
    { id: "home", n: "01", name: "Seer", label: "Seer", product: "", path: "home/", host: "seer.pm", motif: "wedges",
      blurb: "The protocol beneath the apps: one question format, one oracle, six ways to use the answer." },
    { id: "app", n: "02", name: "Seer App", label: "App", product: "App", path: "app/", host: "app.seer.pm", motif: "grid",
      blurb: "Seer's Etherscan: every market in one explorer, to read what it says, inspect it or trade." },
    { id: "deep", n: "03", name: "Deep", label: "Deep", product: "Deep", path: "deep/", host: "deep.seer.pm", motif: "waves",
      blurb: "Questions with many answers: agents forecast how evaluators will score each entry." },
    { id: "futarchy", n: "04", name: "Futarchy", label: "Futarchy", product: "Futarchy", path: "futarchy/", host: "futarchy.seer.pm", motif: "fork",
      blurb: "Conditional markets that forecast a proposal's effect. Information for a DAO, not the decision." },
    { id: "opportunity", n: "05", name: "Opportunity Markets", label: "Opportunity", product: "Opportunity", path: "opportunity/", host: "opportunity.seer.pm", motif: "barcode",
      blurb: "Traders forecast which submissions will be selected. Reviewers keep the final say." },
    { id: "risk", n: "06", name: "Risk Pricing", label: "Risk", product: "Risk", path: "risk/", host: "risk.seer.pm", motif: "stripes",
      blurb: "Market estimates of default risk across assets, to compare side by side." }
  ];
  S.app = function (id) { for (var i = 0; i < S.apps.length; i++) if (S.apps[i].id === id) return S.apps[i]; return null; };

  /* ---- official EF vectors (Electric Foundation, from the rebrand-contest files) ---- */
  var MARK = ["M570.6,428.8l-66.9,66.9c-1.5,1.5-.4,4.1,1.7,4.1h47.6c6.5,0,9.7,7.9,5.2,12.4l-56.5,56.5c-1.4,1.4-3.2,2.1-5.2,2.1h-68.1v56.5c0,8.1,6.5,14.6,14.6,14.6h50.5c3.9,0,7.6-1.5,10.3-4.3l133.6-133.6c2.7-2.7,4.3-6.4,4.3-10.3v-50.5c0-8.1-6.5-14.6-14.6-14.6h-56.5Z", "M440.9,487.5l56.5-56.5c1.4-1.4,3.2-2.1,5.2-2.1h68.1v-56.5c0-8.1-6.5-14.6-14.6-14.6h-50.5c-3.9,0-7.6,1.5-10.3,4.3l-133.6,133.6c-2.7,2.7-4.3,6.4-4.3,10.3v50.5c0,8.1,6.5,14.6,14.6,14.6h56.5l66.9-66.9c1.5-1.5.4-4.1-1.7-4.1h-47.6c-6.5,0-9.7-7.9-5.2-12.4Z"];
  var LOCKUP = ["M546.3,451.4c-27.5,0-45.4,21.9-45.4,48.4s18.2,48.6,45.9,48.6,38.9-12.9,43.7-33.2h-20.6c-3.8,9.8-11.8,15.7-22.4,15.7s-25.7-10.5-25.7-24.5h68.7v-6.7c0-25.5-16.6-48.3-44.1-48.3ZM521.8,491.2c0-13,12.7-22.4,24.5-22.4s23.3,9.6,23.3,22.4h-47.8Z", "M644.9,451.4c-27.5,0-45.4,21.9-45.4,48.4s18.2,48.6,45.9,48.6,38.9-12.9,43.7-33.2h-20.6c-3.8,9.8-11.8,15.7-22.4,15.7s-25.7-10.5-25.7-24.5h68.7v-6.7c0-26.2-16.6-48.3-44.1-48.3ZM620.4,491.2c0-13,12.7-22.4,24.5-22.4s23.3,9.6,23.3,22.4h-47.8Z", "M730.4,453.9c-3,0-5.9.4-8.6,1.3-1.2.4-2.4.8-3.6,1.3-6.5,3-11.8,8.2-14.8,14.8-.5,1.2-1,2.3-1.3,3.6-.8,2.7-1.3,5.6-1.3,8.6v65h21v-73.6h38.1v-21h-29.5Z", "M457.2,492.6c-7.9-1.3-27.7-1.7-27.7-13.1s13.4-11.6,20.8-11.6,21.5,3.3,21.5,15h20.6c0-23.4-22.2-31.6-42.3-31.6s-41.2,6.6-41.2,28.5,19.9,24.6,35.8,27.3c7.9,1.3,27.7,1.7,27.7,13.1s-13.4,11.6-20.8,11.6-21.5-3.3-21.5-15h-20.6c0,23.4,22.2,31.6,42.3,31.6s41.2-6.6,41.2-28.5-19.9-24.6-35.8-27.3Z", "M384.6,471v25.8c0,2-.8,3.9-2.2,5.3l-68.4,68.4c-1.4,1.4-3.3,2.2-5.3,2.2h-25.8c-4.1,0-7.5-3.3-7.5-7.5v-28.9h34.8c1,0,1.9-.4,2.6-1.1l28.9-28.9c2.3-2.4.7-6.4-2.6-6.4h-27.4l36.4-36.4h28.9c4.1,0,7.5,3.3,7.5,7.5Z", "M348.2,434.6v28.9h-34.8c-1,0-1.9.4-2.6,1.1l-28.9,28.9c-2.3,2.3-.7,6.4,2.6,6.4h27.4l-36.4,36.4h-28.9c-4.1,0-7.5-3.3-7.5-7.5v-25.8c0-2,.8-3.9,2.2-5.3l68.4-68.4c1.4-1.4,3.3-2.2,5.3-2.2h25.8c4.1,0,7.5,3.3,7.5,7.5Z"];
  function paths(list) { return list.map(function (d) { return '<path d="' + d + '"/>'; }).join(""); }
  /* Seer.logo("lockup"|"mark", className) -> SVG string, fill = currentColor */
  S.logo = function (kind, cls) {
    var mark = kind === "mark";
    return '<svg class="' + (cls || "") + '" viewBox="' + (mark ? "357 357 285 285" : "239 427 521 146") + '" fill="currentColor" role="img" aria-label="Seer">' + paths(mark ? MARK : LOCKUP) + "</svg>";
  };

  /* ---- product glyphs: each interface owns one EF motif (16px grid, currentColor) ---- */
  var GLYPHS = {
    /* home: one line in from the left, branching into three on the right (Seer's Part II line direction) */
    wedges: '<path d="M.8 8H5.4M5.4 8C8.2 8 8.2 2.4 11 2.4H15.2M5.4 8H15.2M5.4 8C8.2 8 8.2 13.6 11 13.6H15.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="5.4" cy="8" r="1.5"/>',
    grid: '<circle cx="2.2" cy="2.4" r="1.2"/><circle cx="2.2" cy="8" r="1.2"/><circle cx="2.2" cy="13.6" r="1.2"/><circle cx="6" cy="2.4" r="1.05" opacity=".75"/><circle cx="6" cy="13.6" r="1.05" opacity=".75"/><path d="M9.6 1v14M14 1v14M8 5.2h7.4M8 10.8h7.4" fill="none" stroke="currentColor" stroke-width="1.3"/>',
    waves: '<path d="M.8 10.6c3.4 0 4.4-7.4 7.2-7.4s3.8 7.4 7.2 7.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M.8 14.4c3.4 0 4.4-5.2 7.2-5.2s3.8 5.2 7.2 5.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" opacity=".55"/>',
    fork: '<path d="M1 8h5.6L13 1.6M6.6 8 13 14.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="13.6" cy="2" r="1.7"/><circle cx="13.6" cy="14" r="1.7" opacity=".55"/>',
    barcode: '<rect x="1" y="1.4" width="14" height="2.2" rx=".6"/><rect x="1" y="5.2" width="9" height="2.2" rx=".6" opacity=".75"/><rect x="1" y="9" width="11.6" height="2.2" rx=".6"/><rect x="1" y="12.8" width="5.4" height="2.2" rx=".6" opacity=".55"/>',
    stripes: '<rect x="1" y="1" width="14" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M1.6 9.8 9.8 1.6M4.4 14.4 14.4 4.4M9.8 14.6l4.8-4.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'
  };
  /* Seer.glyph(appIdOrMotif, className) -> SVG string */
  S.glyph = function (key, cls) {
    var app = S.app(key);
    var g = GLYPHS[app ? app.motif : key] || GLYPHS.wedges;
    return '<svg class="s-glyph ' + (cls || "") + '" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' + g + "</svg>";
  };

  /* ---- UI icons (24px grid, 1.75 stroke, currentColor) ---- */
  var I = {
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    "chevron-left": '<path d="m15 18-6-6 6-6"/>',
    "chevron-right": '<path d="m9 18 6-6-6-6"/>',
    "chevron-down": '<path d="m6 9 6 6 6-6"/>',
    "chevron-up": '<path d="m6 15 6-6 6 6"/>',
    "arrow-right": '<path d="M5 12h14M13 6l6 6-6 6"/>',
    "arrow-left": '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    external: '<path d="M7 17 17 7M8.5 7H17v8.5"/>',
    copy: '<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.5"/><path d="M15.5 8.5V6.5A2.5 2.5 0 0 0 13 4H6.5A2.5 2.5 0 0 0 4 6.5V13a2.5 2.5 0 0 0 2.5 2.5h2"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.8v2M12 19.2v2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M2.8 12h2M19.2 12h2M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4"/>',
    moon: '<path d="M19.5 14.6A7.8 7.8 0 0 1 9.4 4.5a7.8 7.8 0 1 0 10.1 10.1Z"/>',
    gift: '<rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5 12v7.5h14V12M12 8v11.5M12 8s-1.2-4-3.6-3.5C6.6 4.9 7 8 9.2 8M12 8s1.2-4 3.6-3.5C17.4 4.9 17 8 14.8 8"/>',
    bookmark: '<path d="M7 3.5h10a1 1 0 0 1 1 1V20.5l-6-3.8-6 3.8V4.5a1 1 0 0 1 1-1Z" fill="currentColor"/>',
    upload: '<path d="M12 15V4.5M7.5 9 12 4.5 16.5 9M4.5 15v3.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V15"/>',
    download: '<path d="M12 4.5V15M7.5 10.5 12 15l4.5-4.5M4.5 15v3.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V15"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
    filter: '<path d="M4 5h16l-6.2 7.6V19l-3.6 1.4v-7.8Z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    "plus-square": '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8.5v7M8.5 12h7"/>',
    wallet: '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18M15.5 14.5h2"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    verified: '<path d="M12 3.2 19 6v5.6c0 4.1-2.9 7.5-7 8.9-4.1-1.4-7-4.8-7-8.9V6Z"/><path d="m8.9 12 2.2 2.2 4.1-4.3"/>',
    alert: '<path d="M12 4.2 21 19.5H3Z"/><path d="M12 10v4M12 16.8h.01"/>',
    swap: '<path d="M6 8h12.5l-3.2-3.2M18 16H5.5l3.2 3.2"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    more: '<circle cx="5.5" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="18.5" cy="12" r="1.2" fill="currentColor"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    file: '<path d="M7 3.5h7l4.5 4.5v12A1 1 0 0 1 17.5 21h-10.5a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"/><path d="M14 3.5V8h4.5"/>',
    scale: '<path d="M12 4v16M5 20h14M5.5 8h13M5.5 8 3 14a3 3 0 0 0 5 0Zm13 0L16 14a3 3 0 0 0 5 0Z"/>',
    vote: '<path d="M4 13.5 7.5 9h9l3.5 4.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z"/><path d="M4 13.5h16M9.5 9V4.5h5V9"/>',
    bolt: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6Z"/>',
    user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
    agent: '<rect x="5" y="7" width="14" height="11" rx="3"/><path d="M12 7V4M9.5 12h.01M14.5 12h.01M9 20.5h6"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0Z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7"/>',
    apps: '<circle cx="5.5" cy="5.5" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="5.5" r="1.6" fill="currentColor" stroke="none"/><circle cx="18.5" cy="5.5" r="1.6" fill="currentColor" stroke="none"/><circle cx="5.5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="5.5" cy="18.5" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="18.5" r="1.6" fill="currentColor" stroke="none"/><circle cx="18.5" cy="18.5" r="1.6" fill="currentColor" stroke="none"/>',
    layers: '<path d="m12 4 8.5 4.5L12 13 3.5 8.5Z"/><path d="m3.5 12.5 8.5 4.5 8.5-4.5M3.5 16.5 12 21l8.5-4.5"/>'
  };
  /* Seer.icon(name, size?, className?) -> SVG string */
  S.icon = function (name, size, cls) {
    var s = size || 16;
    return '<svg class="' + (cls || "") + '" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (I[name] || "") + "</svg>";
  };

  /* ---- theme: dark default, persisted per viewer ---- */
  function getStoredTheme() { try { return localStorage.getItem("seer-theme"); } catch (e) { return null; } }
  S.theme = function () { return doc.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark"; };
  S.setTheme = function (t) {
    doc.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("seer-theme", t); } catch (e) { /* private mode: fine */ }
    [].forEach.call(doc.querySelectorAll(".s-theme-btn"), function (b) {
      b.innerHTML = S.icon(t === "light" ? "moon" : "sun", 16) + (b.hasAttribute("data-theme-label") ? "<span>" + (t === "light" ? "Dark theme" : "Light theme") + "</span>" : "");
      b.setAttribute("aria-label", t === "light" ? "Switch to dark theme" : "Switch to light theme");
    });
    doc.dispatchEvent(new CustomEvent("seer:theme", { detail: { theme: t } }));
  };
  (function initTheme() {
    var q = /[?&]theme=(light|dark)/.exec(location.search);
    var t = (q && q[1]) || getStoredTheme(); // ?theme= wins, then the viewer's saved choice; otherwise dark (the EF kit and live Seer are dark-first, whatever the OS says)
    if (t !== "light") t = "dark";
    doc.documentElement.setAttribute("data-theme", t);
  })();

  /* Seer.clipWatch(node): sets .is-clipped while node scrolls horizontally and .is-end once it is scrolled to its end */
  S.clipWatch = function (n) {
    if (!n || n._clipWatched) return; n._clipWatched = true;
    var check = function () { var over = n.scrollWidth - n.clientWidth > 4; n.classList.toggle("is-clipped", over); n.classList.toggle("is-end", over && n.scrollLeft + n.clientWidth >= n.scrollWidth - 2); };
    var tm; n.addEventListener("scroll", function () { check(); clearTimeout(tm); tm = setTimeout(check, 240); }, { passive: true }); window.addEventListener("resize", check);
    if (window.ResizeObserver) new ResizeObserver(check).observe(n);
    check();
  };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  S.esc = esc;

  /* ---- shell render ---- */
  var cfg = window.SEER_PAGE || {};
  var appId = (doc.body && doc.body.getAttribute("data-app")) || cfg.app || "index";
  var cur = S.app(appId);

  /* the six apps live behind one "Apps" button in the header (a disclosure, not a second nav bar) */
  function appsHTML() {
    var theme = S.theme();
    var rows = S.apps.map(function (a) {
      var here = a.id === appId;
      return '<a class="s-apps__app" href="' + S.url(a.path) + '"' + (here ? ' aria-current="page"' : "") + ">" + '<span class="s-apps__glyph">' + S.glyph(a.id) + "</span>" +
        '<span class="s-apps__txt"><span class="s-apps__name">' + esc(a.name) + (here ? '<span class="s-apps__here">You are here</span>' : "") + "</span>" +
        '<span class="s-apps__host">' + esc(a.host) + "</span></span></a>";
    }).join("");
    return '<div class="s-apps" data-apps>' +
      '<button class="s-icon-btn s-apps__btn" type="button" aria-expanded="false" aria-controls="s-apps-panel" aria-label="Seer apps">' + S.icon("apps", 18) + '<span class="s-apps__lbl">Apps</span></button>' +
      '<div class="s-apps__panel" id="s-apps-panel" hidden>' +
        '<div class="s-apps__head"><span class="s-spec">Seer apps</span><a class="s-apps__all" href="' + S.url("") + '">All six, side by side' + S.icon("arrow-right", 14) + "</a></div>" +
        '<nav class="s-apps__list" aria-label="Seer apps">' + rows + "</nav>" +
        '<div class="s-apps__foot"><button class="s-theme-btn s-apps__theme" type="button" data-theme-label aria-label="' + (theme === "light" ? "Switch to dark theme" : "Switch to light theme") + '">' + S.icon(theme === "light" ? "moon" : "sun", 16) + "<span>" + (theme === "light" ? "Dark theme" : "Light theme") + "</span></button>" +
        '<span class="t-meta">Seer data first, sample walkthrough below</span></div>' +
      "</div></div>";
  }

  function headerHTML() {
    var product = cfg.product != null ? cfg.product : (cur ? cur.product : "Six interfaces");
    var homeHref = S.url("home/");
    var lock = '<a class="s-lockup__home" href="' + homeHref + '" aria-label="Seer home">' + S.logo("lockup", "s-lockup__logo") + "</a>";
    if (product) lock += '<span class="s-lockup__sep" aria-hidden="true"></span><a class="s-lockup__product" href="' + (cur ? S.url(cur.path) : S.url("")) + '">' + esc(product) + "</a>";
    lock += '<span class="s-sample s-lockup__sample" title="This view is sample data, made up to show the design, except the panels marked On Seer or Live: real Seer markets, read live from Seer or shown as dated snapshots. Nothing is tradable."><span>Sample<span class="s-sample__mid"> data</span></span></span>';
    var nav = (cfg.nav || []).map(function (n, i) {
      return '<a href="' + esc(n[1]) + '"' + (n[2] ? ' aria-current="true"' : "") + ">" + esc(n[0]) + "</a>";
    }).join("");
    var end = "";
    if (cfg.search) end += '<label class="s-search s-search--sm" data-shell-search>' + S.icon("search", 16) + '<span class="s-sr">Search</span><input type="search" placeholder="' + esc(cfg.search) + '" autocomplete="off"></label>';
    var hasCta = cfg.cta && cfg.cta[0];
    if (cfg.connect !== false) end += '<button class="s-btn ' + (hasCta ? "s-btn--ghost s-hide-sm" : "") + '" type="button" aria-label="Connect wallet" title="Connect wallet" data-demo="Wallet connection is not wired in this concept.">' + S.icon("wallet", 16) + '<span class="s-btn__txt">Connect<span class="s-btn__long"> wallet</span></span></button>';
    if (hasCta) end += '<a class="s-btn" href="' + esc(cfg.cta[1] || "#") + '"' + (cfg.cta[1] ? "" : ' data-demo=""') + ">" + (cfg.cta[2] ? S.icon(cfg.cta[2], 16) : "") + '<span class="s-btn__long">' + esc(cfg.cta[0]) + "</span></a>";
    var th = S.theme();
    end += '<button class="s-icon-btn s-icon-btn--bare s-theme-btn s-header__theme" type="button" aria-label="' + (th === "light" ? "Switch to dark theme" : "Switch to light theme") + '">' + S.icon(th === "light" ? "moon" : "sun", 16) + "</button>";
    end += appsHTML();
    return '<a class="s-skip" href="#main">Skip to content</a>' +
      '<header class="s-header"><div class="s-container s-header__in">' + '<div class="s-lockup">' + lock + "</div>" +
      (nav ? '<nav class="s-nav" aria-label="' + esc(product || "Seer") + '">' + nav + "</nav>" : "") +
      '<div class="s-header__end">' + end + "</div></div></header>";
  }

  function footerHTML() {
    var apps = S.apps.map(function (a) { return '<a href="' + S.url(a.path) + '">' + a.n + "&nbsp;&nbsp;" + esc(a.name) + "</a>"; }).join("");
    return '<footer class="s-footer"><div class="s-container s-footer__in">' +
      '<div class="s-footer__brand">' + S.logo("lockup") +
      '<p class="t-body" style="max-width:34ch">Information Finance: someone asks, markets price the answers, anyone reads the signal. One protocol beneath six interfaces.</p>' +
      '</div>' +
      '<div class="s-footer__cols">' +
      "<div><h4>Interfaces</h4>" + apps + "</div>" +
      '<div><h4>This concept</h4><a href="' + S.url("") + '">Overview and links</a><a href="' + S.url("") + '#design-notes">Design notes</a><a href="' + S.url("system/") + '">Design system</a></div>' +
      '<div><h4>Source</h4><a href="https://github.com/swiftbotlab/seer-six" rel="noopener">github.com/swiftbotlab/seer-six</a><p class="t-meta s-footer__fact">Static HTML, CSS and JS. No trackers.</p></div>' +
      '<div><h4>About the data</h4><p class="t-meta" style="line-height:1.55;color:var(--text-2)">Each app opens on Seer&rsquo;s own markets, read live from Seer&rsquo;s public APIs, with a snapshot refreshed every hour as the fallback (Deep: an hourly snapshot of deep.seer.pm). The walkthrough under them is sample data, made up to show the design and labelled. Nothing here is tradable. For agents: <a href="' + ROOT + 'llms.txt">llms.txt</a>.</p></div>' +
      "</div>" +
      '<div class="s-footer__base"><span class="s-footer__credit">Concept by Swift Bot Labs · not affiliated with Seer</span>' +
      '<span class="s-specs"><span>Concept, not tradable</span><span>@swiftbotlab</span></span></div>' +
      "</div></footer>";
  }

  if (cfg.shell !== false && doc.body) {
    doc.body.insertAdjacentHTML("afterbegin", headerHTML());
    // keep the shell's scripts first in DOM order but render chrome before content
  }
  var toastBox;
  function mountLate() {
    if (cfg.footer !== false && !doc.querySelector(".s-footer")) doc.body.insertAdjacentHTML("beforeend", footerHTML());
    toastBox = doc.createElement("div"); toastBox.className = "s-toasts"; toastBox.setAttribute("role", "status"); toastBox.setAttribute("aria-live", "polite");
    doc.body.appendChild(toastBox);
    var h = doc.querySelector(".s-header");
    if (h) {
      var onScroll = function () { h.classList.toggle("is-scrolled", window.scrollY > 4); };
      window.addEventListener("scroll", onScroll, { passive: true }); onScroll();
    }
    var nv = doc.querySelector(".s-nav");
    if (nv) { // edge fade only while links are actually cut off; is-end only once the nav has really been scrolled to its end
      var navCheck = function () { var over = nv.scrollWidth - nv.clientWidth > 4; nv.classList.toggle("is-clipped", over); nv.classList.toggle("is-end", over && nv.scrollLeft > 2 && nv.scrollLeft + nv.clientWidth >= nv.scrollWidth - 2); };
      var navTm; nv.addEventListener("scroll", function () { navCheck(); clearTimeout(navTm); navTm = setTimeout(navCheck, 240); }, { passive: true }); // the snap settles after the last scroll event
      window.addEventListener("resize", navCheck); window.addEventListener("load", navCheck);
      if (window.ResizeObserver) new ResizeObserver(navCheck).observe(nv); // fonts and late layout change the nav's width after first paint
      if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(navCheck); navCheck();
      var act = nv.querySelector(".is-active, a[aria-current=\"true\"]");
      if (act && act.scrollIntoView && nv.scrollWidth - nv.clientWidth > 4) { try { act.scrollIntoView({ inline: "center", block: "nearest" }); } catch (e) { /* older engines: fine */ } }
    }
    // phone folds (r6 item 9): <details data-sfold open> is open with its summary hidden above 640px and folded on phones
    // until opened; the page draws into it while it is open, then it folds here (DOMContentLoaded). A reader's own toggle
    // sticks until the layout crosses 640px; a #hash into it opens it (below).
    var mqFold = window.matchMedia ? window.matchMedia("(max-width: 640px)") : null;
    var syncFolds = function () {
      [].forEach.call(doc.querySelectorAll("details[data-sfold]"), function (d) {
        if (!d.dataset.sfBound) { d.dataset.sfBound = "1"; var su = d.querySelector("summary"); if (su) su.addEventListener("click", function () { d.dataset.touched = "1"; }); }
        if (!d.dataset.touched) d.open = !(mqFold && mqFold.matches);
      });
    };
    syncFolds();
    if (mqFold) { var refold = function () { [].forEach.call(doc.querySelectorAll("details[data-sfold]"), function (d) { delete d.dataset.touched; }); syncFolds(); };
      if (mqFold.addEventListener) mqFold.addEventListener("change", refold); else if (mqFold.addListener) mqFold.addListener(refold); }
    // F4: a hash that points inside (or at a section holding) a closed <details> opens it before the browser scrolls there
    var openDetails = function () {
      var id = location.hash.slice(1); if (!id) return; var t;
      try { t = doc.getElementById(decodeURIComponent(id)); } catch (e) { return; }
      if (!t) return;
      var opened = false, d = t.closest("details"); while (d) { if (!d.open) opened = true; d.open = true; d.dataset.touched = "1"; d = d.parentElement ? d.parentElement.closest("details") : null; }
      [].forEach.call(t.querySelectorAll("details.s-details"), function (x) { if (!x.open) opened = true; x.open = true; x.dataset.touched = "1"; });
      if (opened && t.scrollIntoView) { t.scrollIntoView(); if (doc.readyState !== "complete") window.addEventListener("load", function () { t.scrollIntoView(); }, { once: true }); } // the fold (and late fonts) change the layout under the browser's own jump
    };
    openDetails(); window.addEventListener("hashchange", openDetails);
    // a link to the hash already in the URL fires no hashchange: open its fold anyway
    doc.addEventListener("click", function (e) { var a = e.target.closest && e.target.closest('a[href^="#"]'); if (a && a.getAttribute("href") === location.hash) setTimeout(openDetails, 0); });
    [].forEach.call(doc.querySelectorAll(".s-table-wrap"), S.clipWatch);
    [].forEach.call(doc.querySelectorAll(".s-theme-btn"), function (tb) { tb.addEventListener("click", function () { S.setTheme(S.theme() === "light" ? "dark" : "light"); }); });
    // Apps menu: a disclosure. Opens on click, closes on Escape (focus back to the button), an outside click, or a link chosen
    var ab = doc.querySelector(".s-apps__btn"), ap = doc.getElementById("s-apps-panel");
    if (ab && ap) {
      var setOpen = function (open, focusBtn) {
        ab.setAttribute("aria-expanded", open ? "true" : "false"); ap.hidden = !open;
        if (open) { var f = ap.querySelector('[aria-current="page"]') || ap.querySelector("a"); if (f) f.focus({ preventScroll: true }); }
        else if (focusBtn) ab.focus();
      };
      ab.addEventListener("click", function () { setOpen(ap.hidden); });
      doc.addEventListener("keydown", function (e) { if (e.key === "Escape" && !ap.hidden) { setOpen(false, true); } });
      doc.addEventListener("click", function (e) { if (!ap.hidden && !e.target.closest("[data-apps]")) setOpen(false); });
      ap.addEventListener("focusout", function (e) { if (e.relatedTarget && !e.relatedTarget.closest("[data-apps]")) setOpen(false); });
    }
    // shell search: pages may listen for `seer:search`
    var si = doc.querySelector("[data-shell-search] input");
    if (si) {
      si.addEventListener("input", function () { doc.dispatchEvent(new CustomEvent("seer:search", { detail: { q: si.value } })); });
      doc.addEventListener("keydown", function (e) {
        if (e.key === "/" && !/input|textarea|select/i.test((doc.activeElement || {}).tagName || "")) { e.preventDefault(); si.focus(); }
      });
    }
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", mountLate); else mountLate();

  /* ---- toast ---- */
  S.toast = function (msg, icon) {
    if (!toastBox) return;
    var t = doc.createElement("div"); t.className = "s-toast";
    t.innerHTML = S.icon(icon || "info", 16);
    var span = doc.createElement("span"); span.textContent = msg; t.appendChild(span);
    toastBox.appendChild(t);
    setTimeout(function () { t.style.transition = "opacity .25s"; t.style.opacity = "0"; setTimeout(function () { t.remove(); }, 260); }, 2600);
  };

  /* ---- delegated behaviours ---- */
  doc.addEventListener("click", function (e) {
    var c = e.target.closest && e.target.closest("[data-copy]");
    if (c) {
      e.preventDefault();
      var text = c.getAttribute("data-copy");
      var done = function () {
        c.classList.add("is-done"); var old = c.innerHTML; c.innerHTML = S.icon("check", 13);
        setTimeout(function () { c.classList.remove("is-done"); c.innerHTML = old; }, 1200);
        S.toast("Copied " + (text.length > 18 ? text.slice(0, 8) + "…" + text.slice(-6) : text), "check");
      };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, done);
      else { var ta = doc.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; doc.body.appendChild(ta); ta.select(); try { doc.execCommand("copy"); } catch (x) { } ta.remove(); done(); }
      return;
    }
    var d = e.target.closest && e.target.closest("[data-demo]");
    if (d) {
      e.preventDefault();
      S.toast(d.getAttribute("data-demo") || "Concept demo: no transaction is sent.", "info");
    }
  });
})();
