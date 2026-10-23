# Seer · six interfaces, one protocol (concept)

A connected redesign of Seer's six interfaces for Information Finance, on the Electric Foundation identity:
the homepage, the App explorer, Deep, Futarchy, Opportunity Markets and Risk Pricing. Someone asks a question,
traders price each possible answer, and whoever needs to know (a DAO, a grant team, a risk desk, an agent)
reads the signal; each first screen says who is asking, what the market prices and how to use the signal.

Updated 21-22 Oct 2026: every interface now opens on live Seer data (Deep: an hourly snapshot); the line
direction (one line in from the left, fanning out into many to the right, `Seer.motif.fan` in `assets/ui.js`)
and the Information Finance framing follow the Seer team's Part II brief.

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
Design rationale: https://swiftbotlab.github.io/seer-six/rationale/

Refined 23-24 Oct 2026, after Seer's extension post: the hub and homepage show the two sides of every market (the
information seeker's path beside the trader's); the App is an explorer across every Seer interface (Seer app, Futarchy,
Deep, Risk Pricing, Opportunity), read either as an information seeker or as a trader, with a detail for each real
market (`app/?market=<chain>:<address>`) that answers who is asking, what it prices and how to use the signal; the
rationale explains each decision and the Electric Foundation identity, logo included.

Plain HTML, CSS and JavaScript. No build step, no external scripts, no tracking.
Working on the site: the hourly job commits to `main`, so `git pull --rebase` before you push.
Each app page opens on Seer's own markets. Home (the most liquid open market and the open-market count),
the App ("On Seer now" and the Markets explorer, every market on Seer with its asker), Futarchy (EIP-8363's two conditional pools), Opportunity (the "AI Job Board Name"
market) and Risk (the Q3 2026 board) read Seer's public APIs (app.seer.pm, api.futarchy.seer.pm,
risk.seer.pm) when the page loads and fall back to a dated snapshot, saying which one they show. Deep opens
on a dated snapshot of Round 3 Originality from deep.seer.pm (its feed allows no cross-site reads).
Futarchy's nine closed proposals and Opportunity's settled Rebrand Contest are dated snapshots too.
Every snapshot, and Deep's Round 3 field, is refreshed every hour on the server by `tools/refresh.py`
(Python standard library only), run by `.github/workflows/refresh.yml` (GitHub Actions): it reads the same
public endpoints with the pages' own checks and keeps the last good copy of any source that fails. The same
data is published as JSON for agents in `data/*.json` (each with `source`, `fetchedAt` and `mode`), described
in [`llms.txt`](https://swiftbotlab.github.io/seer-six/llms.txt).
Everything under them is a **sample walkthrough**, labelled as such and made up to show the design:
organisations, proposals, agents and assets are fictional, and every sample address starts with `0x5eed`.

Concept by Swift Bot Labs. Not affiliated with Seer. The Seer name, mark and the
Electric Foundation identity belong to their owners and are used here only to present
this design concept. Stand-in fonts (Geist, Geist Mono) are under the
SIL Open Font License; see `assets/fonts/`.
