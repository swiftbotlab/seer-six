# Security

Static site: HTML, CSS and vanilla JavaScript served from GitHub Pages.

- No backend, no accounts, no wallet connection, no forms that send data anywhere.
- No third-party scripts or CDNs; fonts are self-hosted. No analytics or cookies.
- Five pages read Seer's public APIs as they load; each page's Content-Security-Policy allows `connect-src`
  to that one host only:
  - Home: app.seer.pm markets-search, twice (the most liquid open, Kleros-verified market for the hero; the
    numeric `count` of open markets).
  - App: app.seer.pm markets-search for the "On Seer now" strip, its numeric `count` of every open market, the
    Markets explorer (one page of 24 per request, filters sent as the API's own fields, the previous request aborted,
    search debounced) and the numeric `count` of markets the asker has created. Every row goes through one
    `normalize()` (types, ranges, control/bidi stripped, clamped, textContent only); links are built from a validated
    chain id and 0x address (app.seer.pm market pages; Gnosisscan/Etherscan address pages).
  - Home also reads that `count` for the hero market's creator.
  - Opportunity: app.seer.pm markets-search for the three linked "AI Job Board Name" markets; ids, chain,
    parent links and "Other" positions must match what the page pins, or the answer is refused.
  - Futarchy: api.futarchy.seer.pm candles (EIP-8363's two conditional pools); numbers only, decimal strings
    checked by regex, no API string is rendered.
  - Risk: risk.seer.pm `/api/v1/risk-pricing` and `/markets`; asset names must be one of the 33 the board lists.
  Every request is `credentials: "omit"`, `referrerPolicy: "no-referrer"`, `redirect: "error"`, JSON only,
  size-capped and aborted after 12 s. Market titles and outcomes on Seer are user-created, so every field is
  type- and range-checked, stripped of control/bidi characters, clamped and set with `textContent`; links are
  built only from a validated chain id and 0x address. On any error, or after 4 s without an answer, the page
  keeps its dated snapshot (`assets/seer-snapshot.js`, `home/hero-snapshot.js`, `opportunity/snapshot.js`,
  `futarchy/eip8363-data.js`, `risk/snapshot.js`) and says so.
- Deep makes no runtime request (deep.seer.pm's feed sends no CORS header): `deep/round3.js` is a dated
  snapshot of it, validated again in the page the same way.
- The hourly refresh (`.github/workflows/refresh.yml` -> `tools/refresh.py`) runs on GitHub Actions with
  `permissions: contents: write` only and no secrets; its one action (`actions/checkout`) is pinned by commit SHA,
  and the script uses only the Python standard library (`python3 -I`). It reads the same Seer endpoints, plus
  deep.seer.pm's feed, with redirects refused, size caps, timeouts and the pages' own type, range, control/bidi
  and length checks, and writes data only (JSON-escaped). Each source fails closed: on any error its files stay
  as they were and `data/index.json` says "kept". Commits are authored by the repository's noreply address.
- `data/*.json` and `llms.txt` are static files for agents; no page fetches them.
- The hub (index.html) reads only the local snapshot (`assets/seer-snapshot.js`) and makes no network request.
- `localStorage` holds one value, the viewer's theme choice (`seer-theme`).
- Any CSV a viewer drops into a demo is parsed in the browser and never uploaded.
- All rendered text from data goes through `textContent`, not `innerHTML`.

Report an issue: open a GitHub issue on this repository.
