/* Seer · a one-time snapshot of real markets, copied by hand from the public app.seer.pm market list
   (Gnosis, chain 100) on 20 Oct 2026 at 13:45 UTC. Titles, outcomes and prices as displayed then; not live,
   never fetched at runtime. "oi" is the figure Seer's card labels "Open interest and liquidity". */
window.SEER_SNAPSHOT = {
  source: "app.seer.pm",
  when: "20 Oct 2026, 13:45 UTC",
  base: "https://app.seer.pm/markets/100/",
  markets: [
    { title: "Which party or joint electoral list will win the most seats in Israeli Knesset election in 2026?", slug: "which-party-or-joint-electoral-list-will-win-the-most-seats-in-israeli-knesset-e",
      outcomes: [["Yashar", 66], ["Likud", 33.3], ["Others", 0.7]], oi: "$27.67k" },
    { title: "Will Marine Le Pen be the National Rally’s candidate in the next French presidential election?", slug: "will-marine-le-pen-be-the-national-rallys-candidate-in-the-next-french-president",
      outcomes: [["Yes", 85.1], ["No", 14.9]], oi: "$7.17k" },
    { title: "How many seats in France’s National Assembly will [party bloc] win in the next French legislative election?", slug: "how-many-seats-in-frances-national-assembly-will-party-bloc-win-in-the-next-fren",
      outcomes: [["Left (UG, LFI, SOC, COM, VEC, RDG, DVG, EXG, …)", 36.9], ["Centre (ENS, REN, MDM, HOR, UDI, DVC, …)", 34], ["Far Right (RN, UXD, REC, DSV, EXD, ...)", 29.1]], oi: "$6.45k" },
    { title: "How many Polymarket clarification notes published before January 1, 2027 will cause a market price move of at least 25 percentage points within 24 hours?", slug: "how-many-polymarket-clarification-notes-published-before-january-1-2027-will-cau",
      scalar: { value: 21.23, unit: "notes", min: 10, max: 50 }, oi: "$1.11k" },
    { title: "Will a legally binding treaty or agreement transferring sovereignty over Greenland from Denmark to the United States enter into force in 2026?", slug: "will-a-legally-binding-treaty-or-agreement-transferring-sovereignty-over-greenla",
      outcomes: [["No", 95.2], ["Yes", 4.8]], oi: "$1.10k" },
    { title: "What will be the average Ethereum BASEFEE (in gwei) for the period 1–31 January 2027 (UTC), as calculated from Ethereum block data on Dune Analytics?", slug: "what-will-be-the-average-ethereum-basefee-in-gwei-for-the-period-131-january-202-4",
      scalar: { value: 9.092, unit: "gwei", min: 0.1, max: 120 }, oi: "$827.59" },
    { title: "Will GTA 6 achieve the highest first-day unit sales of any GTA game?", slug: "will-gta-6-achieve-the-highest-first-day-unit-sales-of-any-gta-game",
      outcomes: [["YES", 80.5], ["NO", 19.5]], oi: "$757.57" },
    { title: "Which party will win the most seats in the United States Senate elections in 2026?", slug: "which-party-will-win-the-most-seats-in-the-united-states-senate-elections-in-202",
      outcomes: [["Democratic Party", 63.6], ["Republican Party", 35.5], ["Other", 0.8]], oi: "$639.07" }
  ],
  // the settled Seer Rebrand Contest, read from its market page the same day
  rebrand: { url: "https://app.seer.pm/markets/100/0xe7850b0d928aa40ab8732bd323fa4f6ef3c24b8a", archive: "https://opportunity.seer.pm/archive" }
};
