/* Seer · dated snapshot of real markets, the App's fallback when Seer's public markets API can't be reached.
   Read from app.seer.pm's public markets API (POST /.netlify/functions/markets-search, open + Kleros-verified,
   by liquidity) on 21 Oct 2026, 09:31 UTC, with the same filters the live strip uses (app/live.js): top-level markets only,
   one per title, no Invalid outcome. Odds are Seer's own; "liq" is liquidity in USD. Links open the market on Seer. */
window.SEER_SNAPSHOT = {
  source: "app.seer.pm",
  when: "21 Oct 2026, 09:31 UTC",
  count: 73,
  markets: [
    {"id": "0x31cb54c49479243333594eb7343d31f6bd1ddfd3", "chain": 100, "title": "Which party or joint electoral list will win the most seats in Israeli Knesset election in 2026?", "liq": 27595.96, "outcomes": [["Yashar", 66], ["Likud", 32.4], ["Others", 0.7]]},
    {"id": "0xfe8abb3b55acca31e74243349573801c379507b3", "chain": 100, "title": "Will Polymarket publicly release a fix for the negative-risk mint/merge share cost basis accounting issue before January 1, 2027?", "liq": 1180.83, "outcomes": [["Yes", 48.4], ["No", 51.6]]},
    {"id": "0x022f8516fb5af0a6a86a37d48494ceb407298bc2", "chain": 100, "title": "Will Polymarket's API allow retrieval of fees paid data per individual positions by January 1st 2027?", "liq": 1174.31, "outcomes": [["Yes", 48.9], ["No", 48.9]]},
    {"id": "0xbde8f9b2148e74431faea5d9cf2a815ef6518b42", "chain": 100, "title": "Will Polymarket use an oracle other than UMA to resolve at least one subjective market before January 1, 2027?", "liq": 1154.69, "outcomes": [["Yes", 34.2], ["No", 65.7]]},
    {"id": "0x38b161f9f6ffbda19a11c32dd73db3f61b00003a", "chain": 100, "title": "Will Polymarket's public API provide a documented endpoint providing total fees paid by individual user by January 1, 2027?", "liq": 1125.33, "outcomes": [["Yes", 29.6], ["No", 68.2]]},
    {"id": "0x736feaf877de6523ca001ab3e3a229e80d7af00b", "chain": 100, "title": "How many Polymarket clarification notes published before January 1, 2027 will cause a market price move of at least 25 percentage points within 24 hours?", "liq": 1112.03, "scalar": {"value": 21.23, "min": 10.0, "max": 50.0, "unit": "Note"}},
    {"id": "0xcef8554bad70c8f46b4242662286d0f03ce77899", "chain": 100, "title": "Will a court rule against Polymarket in a lawsuit over an incorrect market resolution by the end of 2026?", "liq": 1083.49, "outcomes": [["Yes", 10], ["No", 90]]},
    {"id": "0xe659d844b813ae908473e9d0f0981a5c33cf638f", "chain": 100, "title": "Will Polymarket distribute a transferable Polymarket cryptocurrency token to existing users before January 1st 2027?", "liq": 1028.23, "outcomes": [["Yes", 14.9], ["No", 85.1]]}
  ],
  // the settled Seer Rebrand Contest, read from its market page on 20 Oct 2026
  rebrand: { url: "https://app.seer.pm/markets/100/0xe7850b0d928aa40ab8732bd323fa4f6ef3c24b8a", archive: "https://opportunity.seer.pm/archive" }
};
