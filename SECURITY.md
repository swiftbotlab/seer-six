# Security

Static site: HTML, CSS and vanilla JavaScript served from GitHub Pages.

- No backend, no accounts, no wallet connection, no forms that send data anywhere.
- No third-party scripts or CDNs; fonts are self-hosted. No analytics or cookies.
- Two pages make one outbound request each, both to Seer's public markets API (app.seer.pm). The Home page
  asks for the number of open markets and uses only the numeric `count` (type- and range-checked, formatted
  locally, set with `textContent`; dated snapshot on any error or after 4 s). The App page POSTs for the "On Seer now"
  strip. Its Content-Security-Policy allows connections to that host only. Market titles and outcomes there
  are user-created, so the response is size-capped, type-checked, stripped of control/bidi characters,
  clamped and rendered with `textContent`; links are built only from a validated chain id and 0x address.
  On any error or after 4 s the strip shows the dated snapshot instead.
- `localStorage` holds one value, the viewer's theme choice (`seer-theme`).
- Any CSV a viewer drops into a demo is parsed in the browser and never uploaded.
- All rendered text from data goes through `textContent`, not `innerHTML`.

Report an issue: open a GitHub issue on this repository.
