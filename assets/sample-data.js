/* Seer · SAMPLE DATA — illustrative only, not live.
   Concept by Swift Bot Labs. Not affiliated with Seer.

   One shared, deterministic dataset for all six interfaces, so the same market,
   address and proposal show up everywhere it should:

     Lattice Builders Grants · Round 4 (fictional grants programme, 40 proposals)
       Deep         #2841  agents forecast the human panel's score for each proposal
       Opportunity  #2842  traders forecast which proposals the panel will fund
       Futarchy     #2843  "Approve LIP-31?" + #2844/#2845 conditional LAT price markets
       App          every market above, plus general markets, in one explorer
       Risk         #2850  Q4 2026 probability-of-default board (fictional assets)

   Rules: organisations, proposals, teams, agents, traders and assets are FICTIONAL.
   Every address starts with 0x5eed so it can never be mistaken for a real contract.
   All times are relative to SEER_SAMPLE.now (a fixed snapshot), never Date.now(),
   so pages and screenshots are stable. Items marked source:"public" restate figures
   shown on Seer's own public pages (finalised results only). */
(function () {
  "use strict";
  var NOW = Date.parse("2026-10-19T12:00:00Z");
  var H = 3600e3, D = 24 * H;

  /* ---------- deterministic helpers ---------- */
  function hash(str) { // cyrb53 -> 2x32-bit
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0, ch; i < str.length; i++) { ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return [h1 >>> 0, h2 >>> 0];
  }
  function rng(seed) { // mulberry32 seeded from a string
    var a = hash(String(seed))[0];
    return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function hex(n, key) { var r = rng("hex:" + key), s = ""; while (s.length < n) s += Math.floor(r() * 16).toString(16); return s; }
  function addr(key) { return "0x5eed" + hex(36, key); }
  function bytes32(key) { return "0x5eed" + hex(60, key); }
  function txh(key) { return "0x5eed" + hex(60, "tx:" + key); }
  function round(x, d) { var m = Math.pow(10, d || 0); return Math.round(x * m) / m; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function iso(t) { return new Date(t).toISOString().replace(".000", ""); }
  function gauss(r) { var u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function logit(p) { p = clamp(p, 1e-4, 1 - 1e-4); return Math.log(p / (1 - p)); }
  function sigm(x) { return 1 / (1 + Math.exp(-x)); }

  /* ---------- protocol vocabulary ---------- */
  var chains = [
    { id: "ethereum", chainId: 1, name: "Ethereum", short: "ETH", mono: "E" },
    { id: "optimism", chainId: 10, name: "OP Mainnet", short: "OP", mono: "OP" },
    { id: "gnosis", chainId: 100, name: "Gnosis", short: "GNO", mono: "G" },
    { id: "base", chainId: 8453, name: "Base", short: "BASE", mono: "B" }
  ];
  var collateral = [
    { id: "sDAI", name: "Savings DAI", note: "Yield-bearing DAI. Default collateral on Gnosis and Ethereum." },
    { id: "xDAI", name: "xDAI", note: "Gnosis Chain native token; wrapped to sDAI when used as collateral." },
    { id: "sUSDS", name: "Savings USDS", note: "Earns the Sky savings rate. Used by Deep on OP Mainnet." }
  ];
  var marketTypes = [
    { id: "categorical", name: "Categorical", note: "One outcome wins. Prices sum to 1." },
    { id: "multi-categorical", name: "Multi-categorical", note: "Several outcomes can be true; the payout is split between them." },
    { id: "scalar", name: "Scalar", note: "A number in a range, traded as DOWN/UP tokens. A round can run one per item (Scalar × 40)." },
    { id: "multi-scalar", name: "Multi-scalar", note: "One token per item; each redeems its number's share of the total." }
  ];
  var states = [
    { id: "not-open", label: "Reports not open yet", note: "Trading. The oracle has not opened for answers." },
    { id: "open", label: "Reports open", note: "Anyone can submit the answer on Reality.eth, with a bond." },
    { id: "waiting", label: "Waiting for answer", note: "An answer is in; its challenge window is running." },
    { id: "dispute", label: "In dispute", note: "The answer was challenged and Kleros is arbitrating." },
    { id: "pending", label: "Pending execution", note: "Answer final. Resolution waits for one transaction." },
    { id: "closed", label: "Closed", note: "Resolved. Winning tokens can be redeemed." }
  ];
  var verification = [
    { id: "verified", label: "Verified", note: "Accepted on Kleros Curate." },
    { id: "verifying", label: "Verifying", note: "Submitted to Kleros Curate; challenge period running." },
    { id: "challenged", label: "Challenged", note: "A challenge is open on Kleros Curate." },
    { id: "none", label: "Not verified", note: "Not submitted to Kleros Curate." }
  ];
  var lifecycle = ["Created", "Trading", "Reports open", "Answer", "Dispute window", "Resolved", "Redeem"];
  var tiers = [
    { id: "elite", label: "Elite", min: 85 }, { id: "great", label: "Great", min: 70 }, { id: "good", label: "Good", min: 55 },
    { id: "average", label: "Average", min: 40 }, { id: "weak", label: "Weak", min: 0 }
  ];
  function tierOf(score) { for (var i = 0; i < tiers.length; i++) if (score >= tiers[i].min) return tiers[i]; return tiers[tiers.length - 1]; }

  /* ---------- Lattice Builders Grants · Round 4 (fictional) ---------- */
  var round4 = {
    id: "LBG-R4", name: "Lattice Builders Grants · Round 4", org: "Lattice DAO", budget: 250000, collateral: "sDAI",
    slots: 8, panelSize: 5, scoreScale: [0, 10],
    opens: iso(NOW - 12 * D), closes: iso(Date.parse("2026-11-07T23:59:00Z")), panelReveal: iso(Date.parse("2026-11-14T16:00:00Z")),
    note: "Five human reviewers score each proposal 0-10. Deep forecasts those scores; Opportunity forecasts the funded shortlist; Futarchy informs the vote on the budget."
  };
  var PROPOSALS = [
    ["Light-client sync for mobile wallets", "Tidewater Labs", "Infra", 48000],
    ["Open EVM test-vector library", "Northpaw", "Tooling", 22000],
    ["Gas profiler for Solidity test suites", "Quillwork", "Tooling", 18000],
    ["Formal spec for conditional token merges", "Ostrander & Vale", "Research", 36000],
    ["Public dataset: L2 fee history, 2021-2026", "Cartograph", "Data", 15000],
    ["Paymaster audit checklist and test kit", "Bastion Review", "Security", 26000],
    ["Reality.eth answer bot reference client", "Field Notes", "Infra", 30000],
    ["Plain-language course on prediction markets", "Commonplace", "Education", 12000],
    ["Kleros juror onboarding toolkit", "Ninefold", "Education", 14000],
    ["Indexer for ERC-1155 outcome positions", "Graphite Works", "Data", 34000],
    ["Fuzzing harness for AMM invariants", "Redline Security", "Security", 40000],
    ["Wallet UX study: signing in the wild", "Small Hours", "Research", 20000],
    ["Open-source oracle dispute simulator", "Prism Lab", "Research", 28000],
    ["Translation of core docs into 6 languages", "Lingua Commons", "Education", 9000],
    ["Account-abstraction session-key SDK", "Keystone", "Tooling", 38000],
    ["MEV-aware batch executor for small traders", "Lowtide", "Infra", 45000],
    ["Accessibility audit for DeFi front-ends", "Openframe", "Research", 16000],
    ["Market-maker bot reference (thin pools)", "Copperline", "Tooling", 32000],
    ["Grant-outcome tracker, 24 months", "Ledgerlight", "Data", 11000],
    ["Static analyser rules for upgradeable proxies", "Sable Audit", "Security", 30000],
    ["Community calls: monthly open office hours", "Hearth", "Community", 6000],
    ["Zero-knowledge reveal for sealed bids", "Cipher Garden", "Research", 52000],
    ["CSV toolkit for batch predictions", "Plainsight", "Tooling", 8000],
    ["Node operator guide for Gnosis validators", "Fernhill", "Education", 10000],
    ["Hackathon track: decision markets", "Signal Society", "Community", 25000],
    ["Benchmarks for forecasting agents", "Tessellate", "Research", 42000],
    ["Open design system for DAO tooling", "Studio Margin", "Tooling", 19000],
    ["Treasury dashboard templates", "Abacus Row", "Data", 13000],
    ["Bug-bounty triage playbook", "Watchtower", "Security", 9500],
    ["Cross-chain message tests for bridges", "Relay Bench", "Security", 47000],
    ["Local-first notes for DAO delegates", "Quiet Room", "Community", 7000],
    ["Calibration training game", "Brier & Co", "Education", 17000],
    ["Gas refunds for public-goods transactions", "Kindred", "Infra", 21000],
    ["Deterministic builds for wallet releases", "Reproducible", "Security", 24000],
    ["Research: futarchy outcomes, 2024-2026", "Ostrander & Vale", "Research", 23000],
    ["Mobile-first market explorer prototype", "Pocketline", "Tooling", 27000],
    ["Data commons for dependency graphs", "Rootmap", "Data", 31000],
    ["Mentorship cohort for first-time auditors", "Guildhall", "Education", 15500],
    ["Open telemetry for RPC providers", "Beacon Yard", "Infra", 29000],
    ["Meme-free newsletter on governance", "Dry Ink", "Community", 5000]
  ];
  var agentNames = ["Northstar", "Pollen", "Gauge", "Tessera", "Kite", "Meridian", "Lumen", "Halyard", "Sorrel", "Quorum", "Vesper", "Ballast"];
  var agents = agentNames.map(function (nm, i) {
    var r = rng("agent:" + nm), score = Math.round(clamp(92 - i * 5.5 + (r() - .5) * 8, 18, 97));
    return {
      id: "ag-" + (i + 1), name: nm + (r() > .5 ? "-v" + (2 + Math.floor(r() * 4)) : ""), operator: "@" + nm.toLowerCase() + ["labs", "hq", "-forecasts", "works"][i % 4],
      address: addr("agent:" + nm), traderScore: score, tier: tierOf(score).label,
      pnl: round((score - 50) * 42 + (r() - .5) * 600, 2), trades: Math.round(300 + r() * 2400), brier: round(.12 + (100 - score) / 520 + r() * .02, 3),
      lastActive: iso(NOW - Math.round(r() * 30) * 60e3)
    };
  });
  var proposals = PROPOSALS.map(function (p, i) {
    var id = "P-" + String(i + 1).padStart(2, "0"), r = rng("prop:" + id);
    var quality = i === 6 ? 8.14 : clamp(3.6 + r() * 5.4 + (i === 0 ? .7 : 0), 1.2, 9.4); // P-07 is the featured proposal, on the funding line
    var sd = round(.45 + r() * .9, 2);
    var forecasts = agents.slice(0, 8).map(function (a, k) {
      var rr = rng("fc:" + id + a.id);
      return { agent: a.id, mean: round(clamp(quality + gauss(rr) * (.25 + k * .06), 0, 10), 2), sd: round(sd * (.7 + rr() * .6), 2) };
    });
    return {
      id: id, title: p[0], team: p[1], category: p[2], ask: p[3], round: round4.id,
      proposer: addr("proposer:" + id),
      deep: { marketScore: round(quality, 2), up: round(quality / 10, 3), down: round(1 - quality / 10, 3), consensusSd: sd, forecasts: forecasts, panelScore: null },
      opp: { price: 0, pSelect: 0 } // filled below
    };
  });
  // Opportunity prices follow Deep's forecast: selection chance is a logistic around the funding cut-off.
  // Exactly 8 proposals get funded, so the chances must add up to 8. The slope below the line is solved
  // (bisection) so they do; above the line it stays 2.1, which keeps P-07 on the line at 50%.
  // A funded share redeems 1/8 sDAI, so price = chance / 8 x (1 - Invalid).
  (function () {
    var sorted = proposals.slice().sort(function (a, b) { return b.deep.marketScore - a.deep.marketScore; });
    var cut = (sorted[round4.slots - 1].deep.marketScore + sorted[round4.slots].deep.marketScore) / 2, INV = .006;
    function chance(p, kb) { var d = p.deep.marketScore - cut; return clamp(d > 0 ? sigm(d * 2.1) : Math.max(sigm(d * kb), .004 + .03 * Math.exp(d)), .004, .96); } // long shots keep a small, falling tail
    function total(kb) { return proposals.reduce(function (a, p) { return a + chance(p, kb); }, 0); }
    var lo = 1, hi = 12; for (var it = 0; it < 60; it++) { var mid = (lo + hi) / 2; if (total(mid) > round4.slots) lo = mid; else hi = mid; }
    proposals.forEach(function (p) { p.opp.pSelect = round(chance(p, (lo + hi) / 2), 3); p.opp.price = round(p.opp.pSelect / round4.slots * (1 - INV), 4); });
    sorted.forEach(function (p, k) { p.deep.rank = k + 1; });
  })();
  var featuredProposal = "P-07";

  /* ---------- Futarchy (fictional organisations) ---------- */
  var orgs = [
    { id: "lattice", name: "Lattice DAO", token: "LAT", chain: "gnosis", proposals: 4, note: "Runs Lattice Builders Grants." },
    { id: "harbor", name: "Harbor DAO", token: "HRB", chain: "gnosis", proposals: 3, note: "Maintains a cross-chain bridge." },
    { id: "kestrel", name: "Kestrel DAO", token: "KST", chain: "ethereum", proposals: 2, note: "Funds open research." },
    // real-shaped: GnosisDAO is real and runs its futarchy on Seer; the proposal below (GIP-S1) and its prices are sample data
    { id: "gnosisdao", name: "GnosisDAO", token: "GNO", chain: "gnosis", proposals: 1, note: "Governs Gnosis Chain. Real DAO, sample proposal.", sample: true }
  ];
  function twapSeries(key, yes, no, hours) {
    var r = rng("twap:" + key), out = [], y = yes * (1 - .03), n = no * (1 + .01);
    for (var h = hours; h >= 0; h--) {
      y += (yes - y) * .05 + gauss(r) * yes * .0011; n += (no - n) * .05 + gauss(r) * no * .0011;
      out.push([NOW - h * H, round(y, 4), round(n, 4)]);
    }
    out[out.length - 1][1] = yes; out[out.length - 1][2] = no;
    return out;
  }
  // Shift each branch so its trailing 5-day mean equals the stated TWAP; the shift tapers to 0 over the
  // last 12 hours so the last point is still the spot price.
  function calibrate(series, yesTwap, noTwap) {
    var n = series.length, w = Math.min(n, 5 * 24 + 1), sy = 0, sn = 0;
    for (var i = n - w; i < n; i++) { sy += series[i][1]; sn += series[i][2]; }
    var wt = function (i) { var left = n - 1 - i; return left >= 12 ? 1 : left / 12; }, sw = 0;
    for (var j = n - w; j < n; j++) sw += wt(j);
    var dy = (yesTwap * w - sy) / sw, dn = (noTwap * w - sn) / sw;
    return series.map(function (x, k) { var q = wt(k); return [x[0], round(x[1] + dy * q, 4), round(x[2] + dn * q, 4)]; });
  }
  function fprop(o) {
    o.impact = round((o.yesTwap - o.noTwap) / o.noTwap, 4);
    o.recommendation = o.impact > .01 ? "approve" : o.impact < -.01 ? "reject" : "neutral";
    o.series = calibrate(twapSeries(o.id, o.yesSpot, o.noSpot, 24 * 7), o.yesTwap, o.noTwap);
    return o;
  }
  var futarchyProposals = [
    fprop({ id: "LIP-31", org: "lattice", title: "Fund Lattice Builders Grants Round 4 at 250,000 sDAI", metric: "LAT price (sDAI), 5-day TWAP",
      status: "trading", marketId: "2843", yesMarketId: "2844", noMarketId: "2845", pair: "LAT/sDAI",
      yesSpot: 1.2861, noSpot: 1.2648, yesTwap: 1.2842, noTwap: 1.2627, volume: 48210, tvl: 61340,
      twapWindow: { start: iso(Date.parse("2026-11-02T00:00:00Z")), end: iso(Date.parse("2026-11-07T00:00:00Z")), days: 5 },
      vote: { platform: "Snapshot", opens: iso(Date.parse("2026-11-07T12:00:00Z")), closes: iso(Date.parse("2026-11-10T12:00:00Z")), state: "not started" },
      resolution: iso(Date.parse("2026-11-10T12:00:00Z")), linkedRound: round4.id }),
    fprop({ id: "LIP-30", org: "lattice", title: "Move 20% of treasury stablecoins into sDAI", metric: "LAT price (sDAI), 5-day TWAP",
      status: "resolved", approved: true, yesSpot: 1.2412, noSpot: 1.2389, yesTwap: 1.2418, noTwap: 1.2391, volume: 31480, tvl: 0,
      vote: { platform: "Snapshot", state: "closed", result: "approved" }, resolution: iso(NOW - 21 * D) }),
    fprop({ id: "LIP-29", org: "lattice", title: "Cut contributor stipends by 15%", metric: "LAT price (sDAI), 5-day TWAP",
      status: "resolved", approved: false, yesSpot: 1.1904, noSpot: 1.2266, yesTwap: 1.1932, noTwap: 1.2240, volume: 27760, tvl: 0,
      vote: { platform: "Snapshot", state: "closed", result: "rejected" }, resolution: iso(NOW - 48 * D) }),
    fprop({ id: "HIP-12", org: "harbor", title: "Add a 24-hour delay to bridge upgrades", metric: "HRB price (sDAI), 5-day TWAP",
      status: "trading", yesSpot: .8412, noSpot: .8345, yesTwap: .8398, noTwap: .8352, volume: 19020, tvl: 22900,
      vote: { platform: "Snapshot", state: "not started" }, resolution: iso(NOW + 9 * D) }),
    fprop({ id: "HIP-11", org: "harbor", title: "Sunset the legacy relayer", metric: "HRB price (sDAI), 5-day TWAP",
      status: "trading", yesSpot: .8291, noSpot: .8340, yesTwap: .8279, noTwap: .8337, volume: 12840, tvl: 15510,
      vote: { platform: "Snapshot", state: "not started" }, resolution: iso(NOW + 4 * D) }),
    fprop({ id: "KIP-7", org: "kestrel", title: "Open a second research fellowship cohort", metric: "KST price (sDAI), 5-day TWAP",
      status: "trading", yesSpot: 3.412, noSpot: 3.398, yesTwap: 3.409, noTwap: 3.401, volume: 8930, tvl: 10400,
      vote: { platform: "Snapshot", state: "not started" }, resolution: iso(NOW + 12 * D) }),
    fprop({ id: "GIP-S1", org: "gnosisdao", title: "Renew the Gnosis Chain builder grants for 2027 (sample)", metric: "GNO price (sDAI), 5-day TWAP",
      status: "trading", pair: "GNO/sDAI", yesSpot: 143.80, noSpot: 142.10, yesTwap: 143.62, noTwap: 141.95, volume: 64300, tvl: 88900,
      vote: { platform: "Snapshot", state: "not started" }, resolution: iso(NOW + 6 * D) })
  ];

  /* ---------- Risk Pricing · Q4 2026 board (fictional assets) ---------- */
  var RISK = [
    ["ETH", "Halo staked ETH", "hlETH", .0062], ["ETH", "Quarry restaked ETH", "qrETH", .0418], ["ETH", "Ember ETH", "emETH", .0093],
    ["ETH", "Tidal staked ETH", "tsETH", .0141], ["ETH", "Vale liquid ETH", "vlETH", .0277], ["ETH", "Orbit restaking token", "obETH", .1062], ["ETH", "Pike wrapped ETH", "pkETH", .0035],
    ["USD", "Harbor USD", "hrbUSD", .0021], ["USD", "Lumen Dollar", "lmUSD", .0044], ["USD", "Ferrous USD", "frrUSD", .0186], ["USD", "Plinth stable", "plUSD", .0007],
    ["USD", "Arcade dollar", "acUSD", .0612], ["USD", "Moss synthetic USD", "mosUSD", .0935], ["USD", "Keel USD", "klUSD", .0012], ["USD", "Saffron USD", "sfUSD", .0258],
    ["USD", "Vantage yield USD", "vyUSD", .1384], ["USD", "Corral USD", "corUSD", .0049], ["USD", "Delta-neutral dollar", "dnUSD", .0471], ["USD", "Ostrich USD", "ostUSD", .0096], ["USD", "Grove dollar", "grUSD", .0031],
    ["BTC", "Anchor wrapped BTC", "anBTC", .0028], ["BTC", "Cobalt BTC", "cobBTC", .0074], ["BTC", "Thread BTC", "thBTC", .0165], ["BTC", "Loom staked BTC", "lmBTC", .0389], ["BTC", "Kiln BTC", "knBTC", .0057], ["BTC", "Spindle BTC", "spBTC", .0723],
    ["Funds", "Meridian T-bill fund", "MTBF", .0011], ["Funds", "Cedar credit fund", "CCF-I", .0236], ["Funds", "Ridge treasury fund", "RTF", .0016], ["Funds", "Juniper loan fund", "JLF", .0542],
    ["Funds", "Atlas money market", "AMMF", .0019], ["Funds", "Basalt private credit", "BPC", .0811], ["Funds", "Willow short-duration", "WSD", .0064]
  ];
  var bands = [
    { id: "low", label: "Low", min: 0, max: .02 }, { id: "mod", label: "Moderate", min: .02, max: .05 },
    { id: "high", label: "High", min: .05, max: .10 }, { id: "crit", label: "Critical", min: .10, max: 1 }
  ];
  function bandOf(pd) { for (var i = 0; i < bands.length; i++) if (pd < bands[i].max) return bands[i]; return bands[bands.length - 1]; }
  function quarterly(pdAnnual) { return 1 - Math.pow(1 - pdAnnual, .25); }
  var riskAssets = RISK.map(function (a, i) {
    var r = rng("risk:" + a[2]), hist = [], v = a[3] * (1 + (r() - .3) * .5);
    for (var w = 11; w >= 0; w--) { v = clamp(v + (a[3] - v) * .25 + gauss(r) * a[3] * .06, .0002, .9); hist.push([NOW - w * 7 * D, round(v, 5)]); }
    hist[hist.length - 1][1] = a[3];
    return { id: a[2], group: a[0], name: a[1], symbol: a[2], pdAnnual: a[3], pdQuarterly: round(quarterly(a[3]), 5), band: bandOf(a[3]).id,
      outcomeToken: addr("risk-token:" + a[2]), liquidity: Math.round(800 + r() * 9000), history: hist };
  });
  var riskBoard = {
    id: "Q4-2026", marketId: "2850", title: "Yearly probability of default, Q4 2026", question: "What is the yearly probability of default (PD) for each of these DeFi assets during Q4 2026?",
    trading: { opens: iso(Date.parse("2026-10-01T00:00:00Z")), closes: iso(Date.parse("2026-12-31T23:59:00Z")) },
    groups: [{ id: "ETH", label: "ETH based" }, { id: "USD", label: "USD based" }, { id: "BTC", label: "BTC based" }, { id: "Funds", label: "Funds" }],
    archive: [{ id: "Q3-2026", label: "Q3 2026", state: "closed" }],
    note: "Asset names are fictional. Quarterly PD = 1 - (1 - annual PD)^(1/4)."
  };

  var RISK_INV = .002, RISK_NONE = riskAssets.reduce(function (acc, a) { return acc * (1 - a.pdQuarterly); }, 1);
  var RISK_SCALE = (1 - RISK_NONE - RISK_INV) / riskAssets.reduce(function (acc, a) { return acc + a.pdQuarterly; }, 0);

  /* ---------- markets (the App explorer's universe) ---------- */
  function mk(o) {
    var r = rng("mkt:" + o.id);
    o.address = addr("market:" + o.id);
    o.conditionId = bytes32("condition:" + o.id);
    o.questionId = bytes32("question:" + o.id);
    o.oracle = "Reality.eth"; o.arbitrator = "Kleros";
    o.creator = addr("creator:" + (o.creatorKey || o.id));
    o.wrapper = "ERC-1155 positions wrapped as ERC-20";
    o.outcomes = o.outcomes.map(function (x, k) {
      var q = typeof x === "string" ? { name: x } : x;
      q.index = k; q.token = addr("token:" + o.id + ":" + k);
      q.symbol = q.symbol || (o.type === "scalar" ? (k === 0 ? "DOWN" : "UP") : q.name.replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase());
      return q;
    });
    if ((o.type === "categorical" || o.type === "multi-categorical") && !o.noInvalid) {
      var inv = o.invalidPrice != null ? o.invalidPrice : .004;
      o.outcomes.push({ name: "Invalid", index: o.outcomes.length, token: addr("token:" + o.id + ":inv"), symbol: "INVALID", price: inv, invalid: true });
    }
    o.created = iso(NOW - (o.ageDays || 10) * D);
    o.openingDate = o.openingDate || iso(NOW + (o.opensInDays != null ? o.opensInDays : 20) * D);
    o.holders = o.holders || Math.round(40 + r() * 900);
    o.openInterest = o.openInterest || Math.round(o.liquidity * (1.2 + r() * 1.8));
    o.change24h = o.change24h != null ? o.change24h : round((r() - .5) * .08, 3);
    o.href = { app: "app/#m=" + o.id };
    if (o.appId && o.appId !== "app") o.href.specialist = o.appId + "/";
    return o;
  }
  var markets = [
    // A round of 40 scalar markets (one UP/DOWN pair per proposal, 0-10), listed as one record: "Scalar × 40".
    // outcome.token = the proposal's UP token, outcome.down = its DOWN token; UP redeems score ÷ 10.
    mk({ id: "2841", appId: "deep", type: "scalar", set: proposals.length, chain: "optimism", collateral: "sUSDS", category: "Grants",
      question: "Lattice Builders Grants R4: what will the panel score each proposal? (0-10)", short: "LBG R4 · panel scores",
      range: { min: 0, max: 10, unit: "/10" },
      state: "not-open", verify: "verified", liquidity: 18400, volume: 226900, ageDays: 12, opensInDays: 26, round: round4.id,
      outcomes: proposals.map(function (p) { var k = p.id.replace("-", ""); return { name: p.id + " · " + p.title, proposal: p.id, price: p.deep.up, value: p.deep.marketScore,
        symbol: "UP_" + k, downSymbol: "DOWN_" + k, downPrice: p.deep.down, down: addr("down-token:2841:" + p.id),
        conditionId: bytes32("condition:2841:" + p.id), questionId: bytes32("question:2841:" + p.id) }; }) }),
    mk({ id: "2842", appId: "opportunity", type: "multi-categorical", chain: "gnosis", collateral: "sDAI", category: "Grants",
      question: "Lattice Builders Grants R4: which proposals will the panel fund?", short: "LBG R4 · funded shortlist",
      state: "not-open", verify: "verified", liquidity: 6120, volume: 41870, ageDays: 11, opensInDays: 26, round: round4.id, invalidPrice: .006, slots: round4.slots,
      outcomes: proposals.map(function (p) { return { name: p.id + " · " + p.title, proposal: p.id, price: p.opp.price, chance: p.opp.pSelect, symbol: p.id.replace("-", "") }; }) }),
    mk({ id: "2843", appId: "futarchy", type: "categorical", chain: "gnosis", collateral: "sDAI", category: "Governance", futarchy: true,
      question: "Will Lattice DAO approve LIP-31 (fund Builders Grants Round 4 at 250,000 sDAI)?", short: "LIP-31 · decision",
      state: "not-open", verify: "verified", liquidity: 9800, volume: 18350, ageDays: 9, opensInDays: 22, proposal: "LIP-31", noInvalid: true, // futarchy: an invalid answer resolves as not approved
      outcomes: [{ name: "Yes", price: .644, symbol: "YES_sDAI" }, { name: "No", price: .356, symbol: "NO_sDAI" }] }),
    mk({ id: "2844", appId: "futarchy", type: "scalar", chain: "gnosis", collateral: "sDAI", category: "Governance", futarchy: true, conditional: true,
      parent: { id: "2843", outcome: "Yes" }, collSym: "YES_sDAI", range: { min: 0, max: 3, unit: "sDAI" }, value: 1.2861, branch: "yes",
      question: "LAT price if LIP-31 is approved: 30-day TWAP to 10 Dec 2026", short: "LIP-31 · LAT if approved",
      state: "not-open", verify: "verified", liquidity: 26100, volume: 15480, ageDays: 9, opensInDays: 52, proposal: "LIP-31",
      outcomes: [{ name: "DOWN", price: 1 - 1.2861 / 3 }, { name: "UP", price: 1.2861 / 3 }] }),
    mk({ id: "2845", appId: "futarchy", type: "scalar", chain: "gnosis", collateral: "sDAI", category: "Governance", futarchy: true, conditional: true,
      parent: { id: "2843", outcome: "No" }, collSym: "NO_sDAI", range: { min: 0, max: 3, unit: "sDAI" }, value: 1.2648, branch: "no",
      question: "LAT price if LIP-31 is not approved: 30-day TWAP to 10 Dec 2026", short: "LIP-31 · LAT if rejected",
      state: "not-open", verify: "verified", liquidity: 25240, volume: 14380, ageDays: 9, opensInDays: 52, proposal: "LIP-31",
      outcomes: [{ name: "DOWN", price: 1 - 1.2648 / 3 }, { name: "UP", price: 1.2648 / 3 }] }),
    // Multi-categorical, 34 outcomes + Invalid: 1 sDAI is split equally between the assets that default in the
    // quarter; No to All pays 1 sDAI if none do. A token is worth a little less than its quarterly PD because
    // the payout is shared when several default: price = quarterly PD x riskScale, so all prices sum to 1.
    mk({ id: "2850", appId: "risk", type: "multi-categorical", chain: "ethereum", collateral: "sDAI", category: "Risk",
      question: "Which of these 33 DeFi assets will default during Q4 2026? No to All pays if none do", short: "Q4 2026 · default board",
      state: "not-open", verify: "verified", liquidity: 72400, volume: 318200, ageDays: 18, opensInDays: 74, invalidPrice: RISK_INV, riskScale: RISK_SCALE,
      outcomes: riskAssets.map(function (a) { return { name: a.symbol + " · " + a.name, asset: a.id, price: round(a.pdQuarterly * RISK_SCALE, 4), chance: a.pdQuarterly, pdAnnual: a.pdAnnual, symbol: a.symbol.toUpperCase().slice(0, 6) }; })
        .concat([{ name: "No to All", noToAll: true, price: round(RISK_NONE, 4), chance: RISK_NONE, symbol: "NONE" }]) }),
    // general markets (App only)
    mk({ id: "2831", appId: "app", type: "categorical", chain: "ethereum", collateral: "sDAI", category: "Crypto", display: "binary",
      question: "Will ETH close above $5,000 on 31 Dec 2026?", state: "not-open", verify: "verified", liquidity: 54200, volume: 1284000, ageDays: 60, opensInDays: 73,
      outcomes: [{ name: "Yes", price: .338 }, { name: "No", price: .658 }] }),
    mk({ id: "2832", appId: "app", type: "categorical", chain: "gnosis", collateral: "sDAI", category: "Ethereum",
      question: "Which execution client will have the largest share of Ethereum nodes on 1 Jan 2027?", state: "not-open", verify: "verified", liquidity: 12800, volume: 96300, ageDays: 40, opensInDays: 74,
      outcomes: [{ name: "Geth", price: .512 }, { name: "Nethermind", price: .287 }, { name: "Reth", price: .118 }, { name: "Besu", price: .049 }, { name: "Erigon", price: .03 }] }),
    mk({ id: "2833", appId: "app", type: "scalar", chain: "gnosis", collateral: "xDAI", category: "Gnosis", display: "scalar",
      question: "Average daily transactions on Gnosis Chain in November 2026", range: { min: 0, max: 2000000, unit: "tx/day" }, value: 742000,
      state: "not-open", verify: "verifying", liquidity: 4300, volume: 22800, ageDays: 14, opensInDays: 43,
      outcomes: [{ name: "DOWN", price: 1 - .371 }, { name: "UP", price: .371 }] }),
    mk({ id: "2834", appId: "app", type: "multi-scalar", chain: "base", collateral: "sUSDS", category: "Seer",
      question: "How many Seer markets will be created on each chain in Q4 2026?", state: "not-open", verify: "verified", liquidity: 3900, volume: 15400, ageDays: 19, opensInDays: 74,
      outcomes: [{ name: "Gnosis", price: .41 }, { name: "Ethereum", price: .14 }, { name: "OP Mainnet", price: .27 }, { name: "Base", price: .18 }] }),
    mk({ id: "2835", appId: "app", type: "categorical", chain: "gnosis", collateral: "sDAI", category: "Weather", display: "three",
      question: "Berlin on 1 Nov 2026: rain, dry or snow?", state: "not-open", verify: "none", liquidity: 1200, volume: 6400, ageDays: 6, opensInDays: 13,
      outcomes: [{ name: "Rain", price: .47 }, { name: "Dry", price: .45 }, { name: "Snow", price: .076 }] }),
    mk({ id: "2836", appId: "app", type: "categorical", chain: "ethereum", collateral: "sDAI", category: "Crypto", conditional: true, parent: { id: "2831", outcome: "Yes" },
      question: "If ETH closes above $5,000 on 31 Dec 2026, will ETH/BTC be above 0.04 that day?", state: "not-open", verify: "verified", liquidity: 2600, volume: 9800, ageDays: 21, opensInDays: 73,
      outcomes: [{ name: "Yes", price: .57 }, { name: "No", price: .426 }] }),
    mk({ id: "2837", appId: "app", type: "categorical", chain: "gnosis", collateral: "sDAI", category: "Governance",
      question: "Will Lattice DAO ratify its 2027 budget before 15 Nov 2026?", state: "dispute", verify: "verified", liquidity: 2100, volume: 27400, ageDays: 33, opensInDays: -2,
      outcomes: [{ name: "Yes", price: .61 }, { name: "No", price: .386 }] }),
    mk({ id: "2838", appId: "app", type: "scalar", chain: "optimism", collateral: "sUSDS", category: "Weather", display: "scalar",
      question: "Highest temperature in Lisbon on 15 Oct 2026 (°C)", range: { min: 10, max: 35, unit: "°C" }, value: 23.4, answer: 23.4,
      state: "pending", verify: "verified", liquidity: 0, volume: 8100, ageDays: 30, opensInDays: -4,
      outcomes: [{ name: "DOWN", price: 1 - .536 }, { name: "UP", price: .536 }] }),
    mk({ id: "2839", appId: "app", type: "categorical", chain: "base", collateral: "sUSDS", category: "Crypto",
      question: "Will a Base transaction fee spike above $1 median before 1 Dec 2026?", state: "open", verify: "challenged", liquidity: 1700, volume: 11900, ageDays: 25, opensInDays: -1,
      outcomes: [{ name: "Yes", price: .12 }, { name: "No", price: .876 }] }),
    mk({ id: "2840", appId: "app", type: "categorical", chain: "gnosis", collateral: "sDAI", category: "Seer", display: "binary",
      question: "Will Seer's Opportunity Markets open to permissionless creation before 2027?", state: "not-open", verify: "verified", liquidity: 3400, volume: 21800, ageDays: 15, opensInDays: 73,
      outcomes: [{ name: "Yes", price: .44 }, { name: "No", price: .556 }] }),
    mk({ id: "2829", appId: "app", type: "categorical", chain: "gnosis", collateral: "sDAI", category: "Gnosis",
      question: "Will Gnosis Chain finalise every block on 30 Sep 2026?", state: "closed", verify: "verified", liquidity: 0, volume: 14200, ageDays: 70, opensInDays: -19, answer: "Yes",
      outcomes: [{ name: "Yes", price: 1 }, { name: "No", price: 0 }], invalidPrice: 0 }),
    mk({ id: "2830", appId: "app", type: "categorical", chain: "ethereum", collateral: "sDAI", category: "Ethereum",
      question: "Will Ethereum mainnet blob base fee average under 1 gwei in October 2026?", state: "waiting", verify: "verified", liquidity: 1900, volume: 13300, ageDays: 52, opensInDays: -3,
      outcomes: [{ name: "Yes", price: .81 }, { name: "No", price: .186 }] })
  ];
  var byId = {}; markets.forEach(function (m) { byId[m.id] = m; });

  /* ---------- Opportunity extras ---------- */
  var opportunity = {
    flow: ["Call for entries", "Traders set odds", "Price becomes triage", "Sponsor decides", "Traders earn on the decision"],
    live: [{ marketId: "2842", sponsor: "Lattice DAO", reviewers: 5, prize: "8 grants from 250,000 sDAI", entries: proposals.length }],
    archive: [
      { id: "seer-rebrand", title: "Seer Rebrand Contest", state: "closed", source: "public", entries: 16, images: 144, volume: 7197, liquidity: 1111,
        top: [{ name: "Electric Foundation", share: .801, winner: true }, { name: "Signal Convergence", share: .103 }, { name: "Signal Dark", share: .029 }],
        note: "Finalised result as published on Seer's Opportunity archive. Shown for context; not sample data." }
    ]
  };

  /* ---------- traders (fictional) for leaderboards ---------- */
  var traderNames = ["quietfox", "marrow.eth", "lindqvist", "0xpalette", "hollowpine", "sundial", "ravel", "tamsin", "kobold.eth", "parallax"];
  var traders = traderNames.map(function (n, i) {
    var r = rng("trader:" + n), score = Math.round(clamp(90 - i * 6 + (r() - .5) * 10, 20, 98));
    return { handle: n, address: addr("trader:" + n), traderScore: score, tier: tierOf(score).label, pnl: round((score - 45) * 61 + r() * 300, 2), volume: Math.round(5000 + r() * 90000), markets: Math.round(6 + r() * 80) };
  });

  /* ---------- generators (deterministic per id) ---------- */
  // Price history for one outcome, ending at its current price. Returns [[t, p], ...].
  function history(marketId, outcomeIndex, opt) {
    opt = opt || {}; var m = byId[marketId]; if (!m) return [];
    var o = m.outcomes[outcomeIndex || 0], end = o.price, days = opt.days || 30, n = opt.points || 120;
    var r = rng("hist:" + marketId + ":" + (outcomeIndex || 0) + ":" + days), out = [], x = logit(end) + (r() - .5) * 1.4;
    var vol = opt.vol || .09, step = days * D / (n - 1);
    for (var i = 0; i < n; i++) {
      var left = n - 1 - i; x += (logit(end) - x) * (left ? 1 / (left + 6) : 1) + (left ? gauss(r) * vol : 0);
      out.push([Math.round(NOW - left * step), round(sigm(x), 4)]);
    }
    out[n - 1][1] = end;
    return out;
  }
  // One smoothed hourly series per outcome over the market's whole life: a centred moving average that eases back to
  // the raw series at the end so it lands on the snapshot price. The App, Deep and Opportunity all read charts and
  // 24h moves from this one series, so a move reads the same in every interface.
  var SERIES = {};
  function series(marketId, outcomeIndex) {
    var k = outcomeIndex || 0, key = marketId + ":" + k; if (SERIES[key]) return SERIES[key];
    var m = byId[marketId]; if (!m) return [];
    var days = Math.max(2, m.ageDays || 30), n = Math.min(1441, Math.round(days * 24) + 1);
    var raw = history(marketId, k, { days: days, points: n, vol: (m.type === "scalar" ? (m.set ? .02 : .03) : .05) * Math.sqrt(120 / n) }), out = [], W = 9;
    for (var i = 0; i < raw.length; i++) {
      var a = 0, c = 0; for (var j = Math.max(0, i - W); j <= Math.min(raw.length - 1, i + W); j++) { a += raw[j][1]; c++; }
      var w = Math.exp(-(raw.length - 1 - i) / 5); out.push([raw[i][0], +(a / c * (1 - w) + raw[i][1] * w).toFixed(5)]);
    }
    return (SERIES[key] = out);
  }
  // The outcome's price `ms` milliseconds before the snapshot, read from that series.
  function priceAgo(marketId, outcomeIndex, ms) { var h = series(marketId, outcomeIndex), t = NOW - ms; for (var i = h.length - 1; i >= 0; i--) if (h[i][0] <= t) return h[i][1]; return h.length ? h[0][1] : 0; }
  var EVTS = ["Swap", "Swap", "Swap", "Split", "Merge", "Swap", "Add liquidity", "Swap", "Redeem"];
  function events(marketId, n) {
    var m = byId[marketId]; if (!m) return []; var r = rng("ev:" + marketId), out = [], t = NOW - Math.round(r() * 20) * 60e3;
    for (var i = 0; i < (n || 12); i++) {
      var kind = EVTS[Math.floor(r() * EVTS.length)]; if (m.state === "not-open" && kind === "Redeem") kind = "Swap";
      var oi = Math.floor(r() * Math.min(m.outcomes.length - (m.outcomes[m.outcomes.length - 1].invalid ? 1 : 0), 4));
      var amt = round(5 + Math.pow(r(), 2) * 2400, 2), px = m.outcomes[oi].price;
      out.push({ type: kind, outcome: m.outcomes[oi].name, side: r() > .45 ? "buy" : "sell", amount: amt, collateral: m.collateral,
        price: kind === "Swap" ? round(clamp(px + (r() - .5) * .02, .001, .999), 4) : null, from: addr("ev-from:" + marketId + ":" + i), tx: txh(marketId + ":" + i), time: iso(t), block: 41250000 - i * 37 });
      t -= Math.round(2 + r() * 70) * 60e3;
    }
    if (m.state === "dispute") out.unshift({ type: "Dispute", outcome: "Answer challenged", amount: 120, collateral: "xDAI", from: addr("disputer:" + marketId), tx: txh(marketId + ":d"), time: iso(NOW - 5 * H), block: 41250120 });
    if (m.state === "waiting" || m.state === "dispute" || m.state === "pending") out.unshift({ type: "Answer", outcome: "Reality.eth answer", amount: 10, collateral: "xDAI", from: addr("answerer:" + marketId), tx: txh(marketId + ":a"), time: iso(NOW - 26 * H), block: 41249800 });
    return out.sort(function (a, b) { return Date.parse(b.time) - Date.parse(a.time); });
  }
  function holders(marketId, n) {
    var m = byId[marketId]; if (!m) return []; var r = rng("ho:" + marketId), out = [], left = 1;
    for (var i = 0; i < (n || 10); i++) {
      var share = round(left * (.18 + r() * .22), 4); left -= share;
      var oi = Math.floor(r() * Math.min(m.outcomes.length, 3));
      var who = i < 3 && r() > .4 ? (agents[i] ? { name: agents[i].name, address: agents[i].address } : null) : null;
      out.push({ address: who ? who.address : addr("holder:" + marketId + ":" + i), label: who ? who.name : null, outcome: m.outcomes[oi].name, share: share, balance: round(share * (m.openInterest || 1000), 2) });
    }
    return out;
  }
  function noToAll(useQuarterly) { return riskAssets.reduce(function (acc, a) { return acc * (1 - (useQuarterly ? a.pdQuarterly : a.pdAnnual)); }, 1); }
  function lifecycleOf(m) {
    var idx = { "not-open": 1, open: 2, waiting: 3, dispute: 4, pending: 5, closed: 6 }[m.state] || 1;
    var times = [m.created, null, m.openingDate, null, null, null, null];
    return lifecycle.map(function (label, i) { return { label: label, done: i < idx, current: i === idx, time: times[i] }; });
  }

  window.SEER_SAMPLE = {
    meta: {
      label: "Sample data · illustrative, not live",
      note: "Every figure is made up to demonstrate the design. Organisations, proposals, teams, agents, traders and assets are fictional. Addresses start with 0x5eed and do not exist.",
      snapshot: iso(NOW), addressPrefix: "0x5eed"
    },
    now: NOW,
    chains: chains, collateral: collateral, marketTypes: marketTypes, states: states, verification: verification, lifecycle: lifecycle, tiers: tiers,
    markets: markets, round4: round4, proposals: proposals, featuredProposal: featuredProposal, agents: agents, traders: traders,
    orgs: orgs, futarchy: futarchyProposals, futarchyRule: { window: "5-day TWAP", approveAbove: .01, rejectBelow: -.01, note: "Information for the DAO, not the decision. The vote decides." },
    risk: riskBoard, riskAssets: riskAssets, bands: bands, opportunity: opportunity,
    // lookups + generators
    market: function (id) { return byId[id] || null; },
    marketsFor: function (appId) { return markets.filter(function (m) { return m.appId === appId; }); },
    proposal: function (id) { for (var i = 0; i < proposals.length; i++) if (proposals[i].id === id) return proposals[i]; return null; },
    chain: function (id) { for (var i = 0; i < chains.length; i++) if (chains[i].id === id) return chains[i]; return null; },
    state: function (id) { for (var i = 0; i < states.length; i++) if (states[i].id === id) return states[i]; return null; },
    tierOf: tierOf, bandOf: bandOf, quarterly: quarterly, noToAll: noToAll,
    history: history, series: series, priceAgo: priceAgo, events: events, holders: holders, lifecycleOf: lifecycleOf,
    rng: rng, addr: addr
  };
})();
