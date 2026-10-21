# Seer · six interfaces, one protocol (concept)

A connected redesign of Seer's six interfaces on the Electric Foundation identity:
the homepage, the App explorer, Deep, Futarchy, Opportunity Markets and Risk Pricing.

Live demos: https://swiftbotlab.github.io/seer-six/

| # | Interface | Demo |
|---|---|---|
| 01 | Seer homepage | https://swiftbotlab.github.io/seer-six/home/ |
| 02 | Seer App (explorer) | https://swiftbotlab.github.io/seer-six/app/ |
| 03 | Deep | https://swiftbotlab.github.io/seer-six/deep/ |
| 04 | Futarchy | https://swiftbotlab.github.io/seer-six/futarchy/ |
| 05 | Opportunity Markets | https://swiftbotlab.github.io/seer-six/opportunity/ |
| 06 | Risk Pricing | https://swiftbotlab.github.io/seer-six/risk/ |

Design system: https://swiftbotlab.github.io/seer-six/system/

Plain HTML, CSS and JavaScript. No build step, no external scripts, no tracking.
Every figure is **sample data**, made up to show the design: organisations, proposals,
agents and assets are fictional, and every address starts with `0x5eed`.
The panels marked "On Seer" are real instead. The Home page's "Open on Seer now" count and the App's "On Seer now" strip read Seer's public markets API
(app.seer.pm) when the page loads and falls back to a dated snapshot (`assets/seer-snapshot.js`), saying which
one it shows. Deep, Futarchy and Risk each open with one dated snapshot of Seer's own app (deep.seer.pm,
futarchy.seer.pm, risk.seer.pm; 21 Oct 2026), and Opportunity with the settled Rebrand Contest from its market
page (20 Oct 2026). Each links to its source on Seer; none of those three pages makes a runtime request.

Concept by Swift Bot Labs. Not affiliated with Seer. The Seer name, mark and the
Electric Foundation identity belong to their owners and are used here only to present
this design concept. Stand-in fonts (Geist, Geist Mono) are under the
SIL Open Font License; see `assets/fonts/`.
