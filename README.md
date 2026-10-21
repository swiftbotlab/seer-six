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
Each app page opens on Seer's own markets. Home (the most liquid open market and the open-market count),
the App ("On Seer now"), Futarchy (EIP-8363's two conditional pools), Opportunity (the "AI Job Board Name"
market) and Risk (the Q3 2026 board) read Seer's public APIs (app.seer.pm, api.futarchy.seer.pm,
risk.seer.pm) when the page loads and fall back to a dated snapshot, saying which one they show. Deep opens
on a dated snapshot of Round 3 Originality from deep.seer.pm (its feed allows no cross-site reads).
Futarchy's nine closed proposals and Opportunity's settled Rebrand Contest are dated snapshots too.
Everything under them is a **sample walkthrough**, labelled as such and made up to show the design:
organisations, proposals, agents and assets are fictional, and every sample address starts with `0x5eed`.

Concept by Swift Bot Labs. Not affiliated with Seer. The Seer name, mark and the
Electric Foundation identity belong to their owners and are used here only to present
this design concept. Stand-in fonts (Geist, Geist Mono) are under the
SIL Open Font License; see `assets/fonts/`.
