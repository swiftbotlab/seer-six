#!/usr/bin/env python3
"""tools/refresh.py [SITE_DIR]: the hourly server-side refresh of this site's Seer data.

Run by .github/workflows/refresh.yml (GitHub Actions, every hour) and by hand with `python3 -I tools/refresh.py .`.
It reads Seer's public endpoints, validates every field the same way the pages do in the browser, and rewrites:

  assets/seer-snapshot.js   App "On Seer now" strip, the App explorer's first page, open-market count and the askers'
                            market counts (app/live.js, app/explorer.js, home/live.js fallbacks)
  home/hero-snapshot.js     Home hero: the most liquid open, Kleros-verified categorical market (home/live.js rules)
  opportunity/snapshot.js   Opportunity hero: the three linked "AI Job Board Name" markets (opportunity/real.js rules)
  risk/snapshot.js          Risk hero: Seer Risk Pricing board (risk/page.js rules)
  futarchy/eip8363-data.js  Futarchy hero: EIP-8363 conditional pool closes (futarchy/eip8363.js rules)
  deep/round3.js            Deep hero: Round 3 Originality (deep.seer.pm sends no CORS header, so the page has no live read)
  data/*.json               the same data as JSON for agents and scripts (see llms.txt), with source, fetchedAt and mode

Every source is independent and fails closed: if a request fails, times out, redirects, is too large or anything in an
answer is off, that source's files stay exactly as they were (the last good copy) and data/index.json says "kept".
Everything Seer returns is untrusted: strings are type-checked, stripped of control and bidi characters and clamped;
numbers are range-checked; links are built here from a validated chain id and 0x address; output is JSON-escaped data.
Nothing from an answer is executed or written as markup. Standard library only, no secrets, no tokens.
"""
import datetime
import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.request

SITE_URL = "https://swiftbotlab.github.io/seer-six/"
UA = "seer-six-refresh/1 (+https://swiftbotlab.github.io/seer-six/)"
APP_API = "https://app.seer.pm/.netlify/functions/markets-search"
RISK_API = "https://risk.seer.pm/api/v1/risk-pricing"
FT_API = "https://api.futarchy.seer.pm/candles/graphql?chainId=1"
DEEP_FEED = "https://deep.seer.pm/.netlify/functions/get-originality-r3-v3-markets-data"

ZERO = "0x" + "0" * 40
ADDR = re.compile(r"^0x[0-9a-fA-F]{40}$")
# C0/C1 controls, zero-width marks, bidi embeddings/overrides/isolates, BOM (the same class as the pages' BAD)
BAD = re.compile("[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u2069\uFEFF]")
MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


class Fail(Exception):
    """A source answered something we will not publish; its last good files stay."""


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        raise Fail("redirect refused")


OPENER = urllib.request.build_opener(NoRedirect)


def fetch(url, body=None, max_bytes=2_000_000, json_ct=True, tries=3, timeout=45):
    assert url.startswith("https://")
    data = json.dumps(body).encode() if body is not None else None
    hdr = {"User-Agent": UA, "Accept": "application/json"}
    if data is not None:
        hdr["Content-Type"] = "application/json"
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers=hdr, method="POST" if data is not None else "GET")
            with OPENER.open(req, timeout=timeout) as r:
                if r.status != 200:
                    raise Fail("HTTP %d" % r.status)
                ct = r.headers.get("content-type") or ""
                if json_ct and "application/json" not in ct.lower():
                    raise Fail("not JSON")
                raw = r.read(max_bytes + 1)
            if len(raw) > max_bytes:
                raise Fail("answer too large")
            return json.loads(raw.decode("utf-8"))
        except Fail:
            raise
        except Exception as e:  # network errors, timeouts, bad JSON: retry, then give up
            last = e
            if i < tries - 1:
                time.sleep(10 * (i + 1))
    raise Fail("unreachable (%s)" % type(last).__name__)


def clean(s, n):
    if not isinstance(s, str):
        return ""
    s = re.sub(r"\s+", " ", BAD.sub(" ", s)).strip()
    return s[:n]


def fnum(x, lo, hi):
    """a finite JSON number in [lo, hi], else None (booleans are not numbers)"""
    if isinstance(x, bool) or not isinstance(x, (int, float)) or not math.isfinite(x) or x < lo or x > hi:
        return None
    return x


def jsround(x, nd=0):
    """Math.round-style rounding (half up), so the snapshot matches what the page computes"""
    m = 10 ** nd
    return math.floor(x * m + 0.5) / m


def stamp(t):
    return {"iso": t.strftime("%Y-%m-%dT%H:%M:%SZ"), "when": "%d %s %d, %02d:%02d UTC" % (t.day, MON[t.month - 1], t.year, t.hour, t.minute),
            "ms": int(t.timestamp()) * 1000}


def jdump(obj, **kw):
    """JSON for a .js data file: also escape < > & so no answer can ever read as markup, even if a file were inlined"""
    return json.dumps(obj, ensure_ascii=True, **kw).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")


def mlink(chain, mid):
    assert isinstance(chain, int) and ADDR.match(mid)
    return "https://app.seer.pm/markets/%d/%s" % (chain, mid.lower())


# ---------------------------------------------------------------------------------------------------------------------
# App strip + Home hero + open count (app.seer.pm markets-search)
CHAIN_NAMES = {1: "Ethereum", 10: "Optimism", 100: "Gnosis", 8453: "Base"}
SHOW, ASK, LIQ_MIN = 8, 48, 250
MONTHS = {m.lower() for m in MON} | {"january", "february", "march", "april", "june", "july", "august", "september",
                                      "sept", "october", "november", "december"}
EDGE = re.compile(r"^[^0-9A-Za-z\u00C0-\u024F]+|[^0-9A-Za-z\u00C0-\u024F]+$")
COLL = {(100, "0xaf204776c7245bf4147c2612bf6e5972ee483701"): "sDAI", (100, "0xe91d153e0b41518a2ce8dd3d7944fa863463a97d"): "xDAI",
        (1, "0x83f20f44975d03b1b09e64809b757c47f942beea"): "sDAI"}


def chain_ok(c):
    """a chain id we can name (JSON true is not chain 1)"""
    return isinstance(c, int) and not isinstance(c, bool) and c in CHAIN_NAMES


def stem(title):
    """the topic of a title, for 'one card per topic': its first capitalised word after the first (Polymarket, Knesset, GTA...)
    — the same rule as app/live.js stem()"""
    words = title.split(" ")
    for w in words[1:]:
        t = re.sub(r"['\u2019]s$", "", EDGE.sub("", w), flags=re.I)
        if t and re.match(r"[A-Z\u00C0-\u00DE]", t) and t.lower() not in MONTHS:
            return t.lower()
    return " ".join(words[:3]).lower()


def bound(s):  # Seer stores newer scalar bounds in wei (1e18), older ones as plain integers
    if not isinstance(s, str) or not re.fullmatch(r"\d{1,40}", s):
        return None
    n = float(int(s))
    return n / 1e18 if n > 1e10 else n


def strip_market(m):
    """API market -> the App strip's shape, or None (app/live.js normalize())"""
    if not isinstance(m, dict) or m.get("type") != "Generic":
        return None
    if not isinstance(m.get("parentMarket"), dict) or m["parentMarket"].get("id") != ZERO:
        return None
    if not chain_ok(m.get("chainId")) or not isinstance(m.get("id"), str) or not ADDR.match(m["id"]):
        return None
    title = clean(m.get("marketName"), 200)
    if len(title) < 8:
        return None
    liq = fnum(m.get("liquidityUSD"), 0, 1e10 - 1) or 0
    odds = m.get("odds") if isinstance(m.get("odds"), list) else []
    outs = m.get("outcomes") if isinstance(m.get("outcomes"), list) else []
    odds, outs = odds[:64], outs[:64]
    nq = len(m["questions"]) if isinstance(m.get("questions"), list) else 0
    o = {"id": m["id"].lower(), "chain": m["chainId"], "title": title, "liq": round(liq, 2)}
    if m.get("templateId") == "1" and nq == 1:
        lo, hi = bound(m.get("lowerBound")), bound(m.get("upperBound"))
        dn = fnum(odds[0], 0, 100) if len(odds) > 0 else None
        up = fnum(odds[1], 0, 100) if len(odds) > 1 else None
        if lo is None or hi is None or not hi > lo or dn is None or up is None:
            return None
        s = dn + up
        if s > 100:
            dn, up = dn / s * 100, up / s * 100
        unit, u = "", re.search(r"\[([^\]]{1,24})\]\s*$", title)
        if u:
            unit = u.group(1).strip()
            o["title"] = title[:u.start()].strip()
        o["scalar"] = {"value": jsround(dn * lo + up * hi) / 100, "min": lo, "max": hi, "unit": unit}
    elif m.get("templateId") in ("2", "3"):
        pairs = []
        for i, name in enumerate(outs):
            name = clean(name, 80)
            p = fnum(odds[i], 0, 100) if i < len(odds) else None
            if not name or name.lower() == "invalid" or p is None:
                continue
            pairs.append([name, p])
        if len(pairs) < 2:
            return None
        if len(pairs) > 3:
            pairs = sorted(pairs, key=lambda p: -p[1])[:3]
        o["outcomes"] = pairs
        if m["templateId"] == "3":
            o["multi"] = True
    else:
        return None
    o.update(asker(m))
    return o


def asker(m):
    """who asked: the creator's address and the creation block's time in ms (app/live.js and home/live.js read the same)"""
    o = {}
    c = m.get("creator")
    if isinstance(c, str) and ADDR.match(c) and c.lower() != ZERO:
        o["creator"] = c.lower()
    ts = m.get("blockTimestamp")
    if isinstance(ts, str) and re.fullmatch(r"\d{9,11}", ts):
        ts = int(ts)
    if isinstance(ts, int) and not isinstance(ts, bool) and 1.5e9 < ts and ts * 1000 < time.time() * 1000 + 864e5:
        o["created"] = ts * 1000
    return o


# the App explorer (app/explorer.js): its default query (every interface: no "type", so Generic and Futarchy markets), the
# first page of it kept as the snapshot fallback. Each market is pruned to the fields explorer.js reads and validated here;
# the page then runs its own normalize() on it, exactly as on a live answer, so the snapshot and the live explorer follow
# one set of rules.
EXPLORE_BODY = {"marketStatusList": ["not_open", "open", "answer_not_final", "in_dispute", "pending_execution"],
                "limit": 24, "page": 1}
VSTATUS = {"verified", "verifying", "challenged", "not_verified"}
HEX32 = re.compile(r"^0x[0-9a-fA-F]{64}$")


def explore_market(m):
    """API market -> the pruned, validated subset explorer.js reads, or None"""
    if not isinstance(m, dict) or m.get("type") not in ("Generic", "Futarchy"):
        return None
    if not chain_ok(m.get("chainId")) or not isinstance(m.get("id"), str) or not ADDR.match(m["id"]):
        return None
    title = clean(m.get("marketName"), 300)
    if len(title) < 4 or m.get("templateId") not in ("1", "2", "3"):
        return None

    def ts(x):
        return x if isinstance(x, int) and not isinstance(x, bool) and 0 <= x < 1e11 else None

    def usd(x):
        v = fnum(x, 0, 1e10 - 1)
        return round(v, 2) if v is not None else None
    outs = [clean(x, 120) for x in (m.get("outcomes") if isinstance(m.get("outcomes"), list) else [])[:64]]
    if len([x for x in outs if x]) < 2:
        return None
    odds = [fnum(x, 0, 100) for x in (m.get("odds") if isinstance(m.get("odds"), list) else [])[:64]]
    qs = [{"id": q["id"].lower()} for q in (m.get("questions") if isinstance(m.get("questions"), list) else [])[:64]
          if isinstance(q, dict) and isinstance(q.get("id"), str) and HEX32.match(q["id"])]
    pm = m.get("parentMarket") if isinstance(m.get("parentMarket"), dict) else {}
    pid = pm.get("id") if isinstance(pm.get("id"), str) and ADDR.match(pm["id"]) else ZERO
    v = m.get("verification") if isinstance(m.get("verification"), dict) else {}
    qa = m.get("questionsInArbitration")
    o = {"id": m["id"].lower(), "type": m["type"], "chainId": m["chainId"], "marketName": title, "templateId": m["templateId"],
         "outcomes": outs, "odds": odds, "questions": qs, "parentMarket": {"id": pid.lower()},
         "liquidityUSD": usd(m.get("liquidityUSD")), "volumeUSD": usd(m.get("volumeUSD")), "openInterestUSD": usd(m.get("openInterestUSD")),
         "openingTs": ts(m.get("openingTs")), "finalizeTs": ts(m.get("finalizeTs")), "hasAnswers": m.get("hasAnswers") is True,
         "payoutReported": m.get("payoutReported") is True,
         "questionsInArbitration": qa if isinstance(qa, str) and re.fullmatch(r"\d{1,6}", qa) else "0",
         "verification": {"status": v.get("status") if v.get("status") in VSTATUS else "not_verified"}}
    for k in ("lowerBound", "upperBound"):
        if isinstance(m.get(k), str) and re.fullmatch(r"\d{1,40}", m[k]):
            o[k] = m[k]
    if isinstance(m.get("collateralToken"), str) and ADDR.match(m["collateralToken"]):
        o["collateralToken"] = m["collateralToken"].lower()
    if isinstance(m.get("conditionId"), str) and HEX32.match(m["conditionId"]):
        o["conditionId"] = m["conditionId"].lower()
    a = asker(m)
    if "creator" in a:
        o["creator"] = a["creator"]
    if "created" in a:
        o["blockTimestamp"] = a["created"] // 1000
    return o


def creator_counts(addrs):
    """{address: how many Generic markets that address has created on Seer} for the askers the pages name (only the count
    is used; a failed read just leaves that address out)"""
    out = {}
    for a in addrs:
        if a in out or not (isinstance(a, str) and ADDR.match(a)):
            continue
        try:
            d = fetch(APP_API, {"creator": a, "type": "Generic", "limit": 1, "page": 1}, max_bytes=300_000, tries=2)
        except Fail:
            continue
        if isinstance(d, dict) and count_ok(d.get("count")):
            out[a] = d["count"]
    return out


def pick(lst):
    """app/live.js pick(): by liquidity, one card per title and per topic, a liquidity floor; plain order on a thin day"""
    lst = sorted(lst, key=lambda x: -x["liq"])
    out, seen_t, seen_s = [], set(), set()
    for m in lst:
        if len(out) >= SHOW:
            break
        k, s = m["title"].lower(), stem(m["title"])
        if k in seen_t or s in seen_s or m["liq"] < LIQ_MIN:
            continue
        seen_t.add(k), seen_s.add(s), out.append(m)
    if len(out) < 4:
        out, seen_t = [], set()
        for m in lst:
            if len(out) >= SHOW:
                break
            if m["title"].lower() in seen_t:
                continue
            seen_t.add(m["title"].lower()), out.append(m)
    return out


def hero_market(m):
    """API market -> the Home hero's shape (home/live.js heroShape()), or None"""
    if not isinstance(m, dict) or m.get("type") != "Generic":
        return None
    if not isinstance(m.get("parentMarket"), dict) or m["parentMarket"].get("id") != ZERO:
        return None
    if not chain_ok(m.get("chainId")) or not isinstance(m.get("id"), str) or not ADDR.match(m["id"]):
        return None
    if m.get("templateId") not in ("2", "3"):
        return None
    title = clean(m.get("marketName"), 200)
    if len(title) < 8:
        return None
    outs = (m.get("outcomes") if isinstance(m.get("outcomes"), list) else [])[:41]
    odds = (m.get("odds") if isinstance(m.get("odds"), list) else [])[:41]
    rows, inv = [], None
    for i, o in enumerate(outs):
        name = clean(o, 80)
        p = fnum(odds[i], 0, 100.0001) if i < len(odds) else None
        if name.lower() == "invalid":
            inv = p
            continue
        if not name or p is None:
            return None
        rows.append([name, jsround(p, 1)])
    if not 2 <= len(rows) <= 40:
        return None
    s = sum(r[1] for r in rows) + (inv or 0)
    if not 50 <= s <= 150:
        return None
    o = {"id": m["id"].lower(), "chain": m["chainId"], "title": title, "tpl": m["templateId"],
         "liq": round(fnum(m.get("liquidityUSD"), 0, 1e10 - 1) or 0, 2), "vol": round(fnum(m.get("volumeUSD"), 0, 1e10 - 1) or 0, 2),
         "outcomes": rows, "invalid": inv}
    c = COLL.get((m["chainId"], (m.get("collateralToken") or "").lower() if isinstance(m.get("collateralToken"), str) else ""))
    if c:
        o["coll"] = c
    o.update(asker(m))
    return o


def count_ok(c):
    return isinstance(c, int) and not isinstance(c, bool) and 1 <= c < 10_000_000


def refresh_app(site, out):
    t = datetime.datetime.now(datetime.timezone.utc)
    st = stamp(t)
    body = {"marketStatusList": ["open"], "verificationStatusList": ["verified"], "limit": ASK, "page": 1}
    d = fetch(APP_API, body, max_bytes=1_500_000)
    if not isinstance(d, dict) or not isinstance(d.get("markets"), list):
        raise Fail("bad shape")
    ms = d["markets"][:ASK]
    strip = pick([x for x in (strip_market(m) for m in ms) if x])
    if len(strip) < 4:
        raise Fail("too few usable markets")
    verified = d.get("count") if count_ok(d.get("count")) and d["count"] >= len(strip) else len(strip)
    heroes = sorted([x for x in (hero_market(m) for m in ms) if x], key=lambda x: -x["liq"])
    if not heroes:
        raise Fail("no hero market")
    o = fetch(APP_API, {"marketStatusList": ["open"], "limit": 1, "page": 1}, max_bytes=200_000)
    if not isinstance(o, dict) or not count_ok(o.get("count")):
        raise Fail("bad open count")
    opn = o["count"]
    x = fetch(APP_API, EXPLORE_BODY, max_bytes=1_500_000)
    if not isinstance(x, dict) or not isinstance(x.get("markets"), list) or not count_ok(x.get("count")):
        raise Fail("bad explorer answer")
    explore = [e for e in (explore_market(m) for m in x["markets"][:EXPLORE_BODY["limit"]]) if e]
    if len(explore) < 6:
        raise Fail("too few explorer markets")
    creators = creator_counts([heroes[0].get("creator"), strip[0].get("creator")])

    snap = {"source": "app.seer.pm", "when": st["when"], "at": st["ms"], "count": verified, "markets": strip,
            "open": {"count": opn, "when": st["when"], "at": st["ms"]}, "creators": creators,
            "explore": {"request": EXPLORE_BODY, "count": x["count"], "markets": explore},
            "rebrand": {"url": "https://app.seer.pm/markets/100/0xe7850b0d928aa40ab8732bd323fa4f6ef3c24b8a", "archive": "https://opportunity.seer.pm/archive"}}
    out["assets/seer-snapshot.js"] = (
        "/* Seer · dated snapshot of real markets, the App's fallback when Seer's public markets API can't be reached.\n"
        "   Read from app.seer.pm's public markets API (POST /.netlify/functions/markets-search, open + Kleros-verified, by liquidity)\n"
        "   on " + st["when"] + " by tools/refresh.py (hourly, GitHub Actions) with the same rules the live strip uses (app/live.js):\n"
        "   top-level markets only, one per title and per topic, liquidity of at least $" + str(LIQ_MIN) + ", Invalid shown apart.\n"
        "   Odds are Seer's own; \"liq\" is liquidity in USD. Links open the market on Seer. \"open\" is every open market\n"
        "   (no verification filter), the Home page's count. \"creator\"/\"created\": who asked a market and when (its creation block);\n"
        "   \"creators\": how many markets each of those addresses has created on Seer. \"explore\": the App explorer's first page\n"
        "   (its default request), each market pruned to the fields app/explorer.js validates. \"rebrand\": the settled Seer Rebrand\n"
        "   Contest (Opportunity). Data only. */\n"
        "window.SEER_SNAPSHOT = " + jdump(snap) + ";\n")
    hero = {"source": "app.seer.pm", "when": st["when"], "at": st["ms"], "verified": d.get("count") if count_ok(d.get("count")) else None,
            "market": heroes[0], "creators": {k: v for k, v in creators.items() if k == heroes[0].get("creator")}}
    out["home/hero-snapshot.js"] = (
        "/* Seer homepage · dated snapshot of the hero market, shown at once and kept if Seer's public API does not answer.\n"
        "   Read from app.seer.pm (POST /.netlify/functions/markets-search, open + Kleros-verified, top-level, sorted by liquidity) on\n"
        "   " + st["when"] + " with the same rules home/live.js uses live: the most liquid categorical or multi-categorical market,\n"
        "   every answer with Seer's own odds (percent), liquidity and volume in USD. Generated by tools/refresh.py (hourly).\n"
        "   page.js validates this object exactly like a live answer before drawing it. */\n"
        "window.HM_HERO_SNAPSHOT = " + jdump(hero, indent=1) + ";\n")

    def app_row(m):
        r = dict(m)
        r["url"] = mlink(m["chain"], m["id"])
        r["chainName"] = CHAIN_NAMES[m["chain"]]
        if "outcomes" in m and not m.get("multi") and len(m["outcomes"]) == 2:
            s = m["outcomes"][0][1] + m["outcomes"][1][1]
            if s < 99:
                r["invalidRest"] = round(100 - s, 1)
        return r
    out["data/app.json"] = {
        "app": "App (market explorer)", "page": SITE_URL + "app/", "fetchedAt": st["iso"], "mode": "hourly snapshot",
        "source": APP_API, "request": body,
        "note": "The App's 'On Seer now' strip: the most liquid open, Kleros-verified top-level market per topic. Odds in percent "
                "as Seer reports them; liq in USD. invalidRest: Yes + No add up to less than 99%, the rest is left to Invalid.",
        "verifiedOpen": verified, "open": opn, "markets": [app_row(m) for m in strip], "creators": creators,
        "explorer": {"note": "The App explorer's first page: markets of every type and interface that are not resolved yet, in Seer's own default order "
                             "(Kleros-verified first, then liquidity). count is Seer's total for this request; fields as Seer's API "
                             "names them, pruned and validated.", "request": EXPLORE_BODY, "count": x["count"],
                     "markets": [dict(e, url=mlink(e["chainId"], e["id"])) for e in explore]}}
    hm = dict(heroes[0])
    hm["url"] = mlink(hm["chain"], hm["id"])
    out["data/home.json"] = {
        "app": "Homepage", "page": SITE_URL + "home/", "fetchedAt": st["iso"], "mode": "hourly snapshot", "source": APP_API,
        "request": body, "note": "The hero: the most liquid open, Kleros-verified categorical or multi-categorical market on Seer. "
                                 "outcomes are [answer, odds %]; invalid is Seer's price of Invalid when it reports one.",
        "openMarkets": opn, "verifiedOpen": hero["verified"], "hero": hm, "creators": hero["creators"]}
    return st["iso"]


# ---------------------------------------------------------------------------------------------------------------------
# Opportunity: "Seer AI Job Board Name", three linked categorical markets on Gnosis (opportunity/real.js)
OPP_CHAIN = [("0x8b3c7f3f09f6a85353926d8ee0f12decc1c9a5e8", 78), ("0xf6a42af200c181df45e0f3fd49d58f5d57bb7d35", 78),
             ("0x144364db8edd6225248fe9d02f77ecc3ec0e4c4c", None)]
OPP_NONE = "None of the listed names"


def refresh_opportunity(site, out):
    t = datetime.datetime.now(datetime.timezone.utc)
    st = stamp(t)
    body = {"chainsList": ["100"], "marketIds": [c[0] for c in OPP_CHAIN], "limit": 3, "page": 1}
    d = fetch(APP_API, body, max_bytes=1_500_000)
    if not isinstance(d, dict) or not isinstance(d.get("markets"), list):
        raise Fail("bad shape")
    by = {m["id"].lower(): m for m in d["markets"][:10] if isinstance(m, dict) and isinstance(m.get("id"), str) and ADDR.match(m["id"])}
    rows, liq, vol, title = [], 0.0, 0.0, ""
    for lvl, (mid, other) in enumerate(OPP_CHAIN):
        m = by.get(mid)
        last = lvl == len(OPP_CHAIN) - 1
        if not m or m.get("chainId") != 100 or m.get("templateId") != "2" or m.get("type") != "Generic":
            raise Fail("market %d missing or changed" % lvl)
        parent = m.get("parentMarket") if isinstance(m.get("parentMarket"), dict) else {}
        want = ZERO if lvl == 0 else OPP_CHAIN[lvl - 1][0]
        if not isinstance(parent.get("id"), str) or parent["id"].lower() != want:
            raise Fail("market %d parent changed" % lvl)
        if lvl and str(m.get("parentOutcome")) != str(OPP_CHAIN[lvl - 1][1]):
            raise Fail("market %d parent outcome changed" % lvl)
        if m.get("payoutReported"):
            raise Fail("settled")  # the page's hero copy assumes an open market
        outs, odds = m.get("outcomes"), m.get("odds")
        if not isinstance(outs, list) or not isinstance(odds, list) or len(odds) != len(outs) or not 3 <= len(outs) <= 128:
            raise Fail("market %d outcomes" % lvl)
        n = len(outs)
        if lvl == 0:
            title = clean(m.get("marketName"), 200)
        liq += fnum(m.get("liquidityUSD"), 0, 1e10) or 0
        vol += fnum(m.get("volumeUSD"), 0, 1e10) or 0
        for c in range(n):
            if c == n - 1:
                continue  # Invalid
            if not last and c == other:
                continue  # the 'Other' outcome that funds the next market
            name = OPP_NONE if (last and c == n - 2) else clean(outs[c], 60)
            if not name:
                continue
            p = fnum(odds[c], 0, 100)
            rows.append([name, round(float(p), 1) if p is not None else None, lvl])
    if len(title) < 8 or len(rows) < 20:
        raise Fail("too few outcomes")
    order = sorted(range(len(rows)), key=lambda i: (-(rows[i][1] if rows[i][1] is not None else -1), i))
    top = [rows[i] for i in order[:400]]
    priced = [r[1] for r in rows if r[1] is not None]
    snap = {"source": "app.seer.pm", "when": st["when"], "at": st["iso"], "chain": 100, "ids": [c[0] for c in OPP_CHAIN],
            "title": title, "liq": round(liq, 2), "vol": round(vol, 2), "total": len(rows), "under1": sum(1 for p in priced if p < 1),
            "rows": top}
    out["opportunity/snapshot.js"] = (
        "/* Seer Opportunity · dated snapshot of a real market, the page's fallback when Seer's public markets API can't be reached.\n"
        "   \"Seer AI Job Board Name\": three linked categorical markets on Gnosis (each market's 'Other' outcome buys into the next),\n"
        "   read from app.seer.pm's public markets API (POST /.netlify/functions/markets-search, marketIds) on " + st["when"] + ",\n"
        "   merged the way opportunity.seer.pm lists them: Invalid dropped, the last 'Other' is 'None of the listed names'.\n"
        "   All " + str(len(top)) + " outcomes, by Seer's own odds; rows are [name, price %, market level 0-2].\n"
        "   Generated by tools/refresh.py (hourly, GitHub Actions). Data only, no code. */\n"
        "window.OP_SNAPSHOT = " + jdump(snap) + ";\n")
    out["data/opportunity.json"] = {
        "app": "Opportunity Markets", "page": SITE_URL + "opportunity/", "fetchedAt": st["iso"], "mode": "hourly snapshot",
        "source": APP_API, "request": body,
        "note": "Seer AI Job Board Name: three linked categorical markets on Gnosis, merged as opportunity.seer.pm lists them. "
                "rows are [name, price %, market level 0-2], highest first; price null = Seer reports no price.",
        "title": title, "markets": [mlink(100, c[0]) for c in OPP_CHAIN], "liquidityUSD": snap["liq"], "volumeUSD": snap["vol"],
        "total": snap["total"], "under1": snap["under1"], "rows": top}
    return st["iso"]


# ---------------------------------------------------------------------------------------------------------------------
# Risk Pricing (risk.seer.pm public API; risk/page.js)
RISK_NAMES = {"weETH", "stETH", "ETH+", "bsdETH", "rETH", "pufETH", "avETH", "PYUSD", "RLUSD", "USDC", "USD1", "USDS", "USDT", "RUSD",
              "USDF", "avUSD", "NUSD", "iUSD", "satUSD+", "USDO", "BTCB", "solvBTC", "tBTC", "cbBTC", "LBTC", "UBTC", "GACLO-1",
              "BUIDL-I", "JAAA", "JTRSY", "mF-ONE", "STAC", "U"}


def refresh_risk(site, out):
    t = datetime.datetime.now(datetime.timezone.utc)
    st = stamp(t)
    rp = fetch(RISK_API, max_bytes=500_000)
    mk = fetch(RISK_API + "/markets", max_bytes=200_000)
    if not isinstance(rp, dict) or rp.get("chainId") != 100 or not isinstance(rp.get("marketId"), str) or not ADDR.match(rp["marketId"]):
        raise Fail("bad board")
    if not isinstance(rp.get("assets"), list):
        raise Fail("bad assets")
    assets, seen = [], set()
    for a in rp["assets"][:60]:
        if not isinstance(a, dict):
            raise Fail("bad asset")
        n = a.get("name")
        if not isinstance(n, str) or n not in RISK_NAMES or n in seen:
            raise Fail("unknown or repeated asset")  # a new asset needs a look by hand before it is published
        seen.add(n)
        y, q, p = fnum(a.get("pdYearly"), 0, .999), fnum(a.get("pdQuarterly"), 0, .999), fnum(a.get("price"), 0, 1)
        if y is None or q is None or p is None or abs((1 - (1 - q) ** 4) - y) > 1e-6:
            raise Fail("asset numbers")
        assets.append([n, round(y, 8), round(q, 8), round(p, 8)])
    if len(assets) != 33:
        raise Fail("asset count")
    nta = fnum((rp.get("noToAll") or {}).get("probability") if isinstance(rp.get("noToAll"), dict) else None, 0, 1)
    if nta is None:
        raise Fail("no-to-all")
    if not isinstance(mk, dict) or mk.get("chainId") != 100 or not isinstance(mk.get("markets"), list):
        raise Fail("bad markets")
    mks = []
    for m in mk["markets"][:40]:
        if not isinstance(m, dict) or not isinstance(m.get("id"), str) or not ADDR.match(m["id"]):
            raise Fail("market id")
        if not isinstance(m.get("quarter"), str) or not re.fullmatch(r"\d{4}-Q[1-4]", m["quarter"]) or not isinstance(m.get("current"), bool):
            raise Fail("market quarter")
        s0, e0 = fnum(m.get("startTime"), 1.6e9, 2.2e9), fnum(m.get("endTime"), 1.6e9, 2.2e9)
        if s0 is None or e0 is None:
            raise Fail("market times")
        mks.append({"id": m["id"], "quarter": m["quarter"], "startTime": int(s0), "endTime": int(e0), "current": m["current"]})
    if not any(m["current"] and m["id"].lower() == rp["marketId"].lower() for m in mks):
        raise Fail("current market")
    snap = {"source": RISK_API, "fetchedAt": st["iso"], "chainId": 100, "marketId": rp["marketId"], "markets": mks,
            "noToAll": round(nta, 8), "assets": assets}
    out["risk/snapshot.js"] = (
        "/* Seer Risk Pricing: a dated snapshot of risk.seer.pm's public API (/api/v1/risk-pricing and /markets), validated and\n"
        "   written by tools/refresh.py (hourly, GitHub Actions). Data only; risk/page.js shows it while the live read loads or when\n"
        "   Seer can't be reached. Each asset: [name, default probability per year, per quarter, price]. */\n"
        "window.SEER_RISK_SNAPSHOT = " + jdump(snap, separators=(",", ":")) + ";\n")
    out["data/risk.json"] = {
        "app": "Risk Pricing", "page": SITE_URL + "risk/", "fetchedAt": st["iso"], "mode": "hourly snapshot",
        "source": [RISK_API, RISK_API + "/markets"],
        "note": "The current quarter's board on Gnosis: assets are [name, probability of default per year, per quarter, outcome "
                "price]; noToAll is the price that no asset defaults this quarter.",
        "market": mlink(100, rp["marketId"]), "markets": mks, "noToAll": snap["noToAll"], "assets": assets}
    return st["iso"]


# ---------------------------------------------------------------------------------------------------------------------
# Futarchy: EIP-8363 conditional pools on Ethereum (futarchy/eip8363.js)
FT_PROP = "0x0d78b95fca9f3e1b588271a330b0d6f731ec38aa"
FT_YES = "0xa95d30c125c20d001f6aed9f2eff1b8e5577dca3"
FT_NO = "0x7a3b5f6592186c5d121ec4e48fc9e5d020a0b2df"
FT_SINCE = 1791417600  # 8 Oct 2026 00:00 UTC
DEC = re.compile(r"^\d{1,7}(\.\d{1,40})?$")


def gql(q):
    d = fetch(FT_API, {"query": q}, max_bytes=3_000_000)
    if not isinstance(d, dict) or not isinstance(d.get("data"), dict) or d.get("errors"):
        raise Fail("graphql error")
    return d["data"]


def refresh_futarchy(site, out):
    fetched = int(time.time())
    prop = gql('{ proposal(id: "%s") { id pools { id type outcomeSide price isInverted } } }' % FT_PROP).get("proposal")
    if not isinstance(prop, dict) or not isinstance(prop.get("pools"), list):
        raise Fail("proposal")
    spot = {}
    for p in prop["pools"][:20]:
        if isinstance(p, dict) and p.get("id") in (FT_YES, FT_NO) and p.get("type") == "CONDITIONAL":
            if not isinstance(p.get("price"), str) or not DEC.match(p["price"]) or not 100 < float(p["price"]) < 1e6:
                raise Fail("pool price")
            spot[p["id"]] = round(float(p["price"]), 4)
    if FT_YES not in spot or FT_NO not in spot:
        raise Fail("pools")

    def candles(pool):
        rows, cursor = [], FT_SINCE
        for _ in range(10):
            d = gql('{ candles(first: 1000, where: {pool: "%s", period: 3600, periodStartUnix_gte: %d}, orderBy: periodStartUnix, '
                    'orderDirection: asc) { periodStartUnix close } }' % (pool, cursor)).get("candles")
            if not isinstance(d, list):
                raise Fail("candles")
            rows += d
            if len(d) < 1000:
                break
            cursor = int(d[-1]["periodStartUnix"]) + 1
        flat, seen = [], set()
        for r in rows:
            if not isinstance(r, dict) or not isinstance(r.get("close"), str) or not DEC.match(r["close"]):
                raise Fail("candle")
            ts = r.get("periodStartUnix")
            ts = int(ts) if isinstance(ts, (int, str)) and re.fullmatch(r"\d{9,11}", str(ts)) else None
            p = float(r["close"])
            if ts is None or ts % 3600 or not 100 < p < 1e6:
                raise Fail("candle values")
            if ts < FT_SINCE or ts in seen or ts > fetched:
                continue
            seen.add(ts)
            flat.append((ts, round(p * 100)))
        flat.sort()
        if len(flat) < 24:
            raise Fail("too few candles")
        return [v for pair in (((ts - FT_SINCE) // 3600, c) for ts, c in flat) for v in pair]
    y, n = candles(FT_YES), candles(FT_NO)
    g = time.gmtime(fetched)
    when = "%d %s %d, %02d:%02d UTC" % (g.tm_mday, MON[g.tm_mon - 1], g.tm_year, g.tm_hour, g.tm_min)
    out["futarchy/eip8363-data.js"] = (
        "/* EIP-8363 on futarchy.seer.pm, a dated snapshot (numbers only), the fallback for eip8363.js when Seer's candles API\n"
        "   doesn't answer. Read from api.futarchy.seer.pm/candles/graphql (chain 1) at %s. Hourly closes of the two\n"
        "   conditional pools since 8 Oct 2026 00:00 UTC as flat [hours after `since`, price x 100] pairs; py/pn = spot prices.\n"
        "   Generated by tools/refresh.py (hourly, GitHub Actions). */\n"
        "window.FT_EIP8363 = {\"at\":%d,\"when\":%s,\"since\":%d,\"py\":%s,\"pn\":%s,\n\"yes\":%s,\n\"no\":%s};\n") % (
        when, fetched * 1000, json.dumps(when), FT_SINCE, json.dumps(spot[FT_YES]), json.dumps(spot[FT_NO]),
        json.dumps(y, separators=(",", ":")), json.dumps(n, separators=(",", ":")))
    iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", g)
    out["data/futarchy.json"] = {
        "app": "Futarchy", "page": SITE_URL + "futarchy/", "fetchedAt": iso, "mode": "hourly snapshot", "source": FT_API,
        "note": "EIP-8363 on futarchy.seer.pm (Ethereum): the two conditional pools, priced in the base token. yesHourly / noHourly are "
                "[unix hour, close] pairs since 8 Oct 2026 00:00 UTC; spot = the pools' current prices.",
        "proposal": FT_PROP, "proposalPage": "https://futarchy.seer.pm/", "pools": {"yes": FT_YES, "no": FT_NO},
        "spot": {"yes": spot[FT_YES], "no": spot[FT_NO]},
        "yesHourly": [[FT_SINCE + y[i] * 3600, y[i + 1] / 100] for i in range(0, len(y), 2)],
        "noHourly": [[FT_SINCE + n[i] * 3600, n[i + 1] / 100] for i in range(0, len(n), 2)]}
    return iso


# ---------------------------------------------------------------------------------------------------------------------
# Deep: Round 3 Originality (deep.seer.pm's own data feed; deep/real.js)
REPO = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,59}/[A-Za-z0-9._-]{1,100}$")


def dprice(x):
    x = fnum(x, 0, 1.5)
    return None if x is None else round(min(1.0, float(x)), 4)


def refresh_deep(site, out):
    data = fetch(DEEP_FEED, max_bytes=3_000_000, json_ct=False, timeout=60)
    t = datetime.datetime.now(datetime.timezone.utc)
    st = stamp(t)
    md = data.get("marketsData") if isinstance(data, dict) else None
    if not isinstance(md, dict) or not 20 <= len(md) <= 400:
        raise Fail("unexpected feed shape")
    rows, seen = [], set()
    for k, v in md.items():
        if not isinstance(k, str) or not REPO.match(k) or not isinstance(v, dict):
            continue
        mid, up, dn = v.get("id"), dprice(v.get("upPrice")), dprice(v.get("downPrice"))
        if not isinstance(mid, str) or not ADDR.match(mid) or up is None or dn is None:
            continue
        mid = mid.lower()
        if mid in seen:
            continue
        seen.add(mid)
        rows.append([k, up, dn, mid])
    if len(rows) < 20:
        raise Fail("only %d valid rows" % len(rows))
    rows.sort(key=lambda r: (-r[1], r[0].lower()))
    s = data.get("parentMarketStatus")
    status = s if isinstance(s, str) and re.match(r"^[a-z_ ]{1,20}$", s) else ""
    snap = {"v": 1, "source": "https://deep.seer.pm/", "feed": DEEP_FEED, "fetchedAt": st["iso"], "round": "Round 3 · Originality",
            "chainId": 10, "collateral": "sUSDS", "status": status, "skipped": len(md) - len(rows), "repos": rows}
    out["deep/round3.js"] = (
        "/* Deep · Round 3 Originality, a dated snapshot of deep.seer.pm's own data feed (generated by tools/refresh.py, hourly;\n"
        "   do not edit by hand). Each row: [GitHub repo, UP price, DOWN price, market address on Optimism]. UP is the market's\n"
        "   estimate of the share of original work. Seer data is untrusted: validated here and again in real.js, rendered with\n"
        "   textContent only. */\n"
        "window.SEER_DEEP_R3 = " + jdump(snap, separators=(",", ":")) + ";\n")
    out["data/deep.json"] = {
        "app": "Deep", "page": SITE_URL + "deep/", "fetchedAt": st["iso"], "mode": "hourly snapshot", "source": DEEP_FEED,
        "note": "Seer Deep, Round 3 Originality on OP Mainnet: one scalar market per GitHub repo. repos are [repo, UP price, DOWN price, "
                "market]; UP (0-1) is the market's estimate of the share of original work. Highest UP first.",
        "round": snap["round"], "chainId": 10, "collateral": "sUSDS", "status": status,
        "repos": [{"repo": r[0], "up": r[1], "down": r[2], "market": r[3], "url": mlink(10, r[3])} for r in rows]}
    return st["iso"]


# ---------------------------------------------------------------------------------------------------------------------
SOURCES = [
    ("app", refresh_app, ["assets/seer-snapshot.js", "home/hero-snapshot.js", "data/app.json", "data/home.json"]),
    ("opportunity", refresh_opportunity, ["opportunity/snapshot.js", "data/opportunity.json"]),
    ("risk", refresh_risk, ["risk/snapshot.js", "data/risk.json"]),
    ("futarchy", refresh_futarchy, ["futarchy/eip8363-data.js", "data/futarchy.json"]),
    ("deep", refresh_deep, ["deep/round3.js", "data/deep.json"]),
]


def write(site, rel, content):
    path = os.path.join(site, rel)
    if isinstance(content, dict):
        content = json.dumps(content, ensure_ascii=False, indent=1) + "\n"
    if len(content) > 3_000_000:
        raise Fail("output too large: " + rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(content)
    os.replace(tmp, path)


def previous(site, rel):
    try:
        with open(os.path.join(site, rel), encoding="utf-8") as f:
            v = json.load(f).get("fetchedAt")
        return v if isinstance(v, str) and re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ", v) else None
    except Exception:
        return None


def main():
    site = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), ".."))
    if not os.path.isfile(os.path.join(site, "assets", "system.css")):
        raise SystemExit("not the site directory: " + site)
    only = set(sys.argv[2:])
    run = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    manifest = {"site": SITE_URL, "generatedAt": run, "generator": "tools/refresh.py (GitHub Actions, hourly)",
                "about": "Seer data behind each page of this concept, as JSON. mode 'hourly snapshot': read server side from Seer's "
                         "public endpoints and validated; the pages also read the same endpoints live in the browser where Seer "
                         "allows it. status 'kept': that hour's read failed validation, so the last good copy stays.",
                "sources": []}
    ok = 0
    for name, fn, files in SOURCES:
        if only and name not in only:
            continue
        out = {}
        try:
            at = fn(site, out)
            assert set(out) == set(files), (name, sorted(out))
            for rel in files:
                write(site, rel, out[rel])
            status, ok = "ok", ok + 1
            print("%-12s ok   %s" % (name, at))
        except (Fail, AssertionError, KeyError, TypeError, ValueError) as e:
            at = previous(site, files[-1])
            status = "kept: " + (str(e) if isinstance(e, Fail) else type(e).__name__)[:80]
            print("%-12s KEPT %s (last good %s)" % (name, status, at))
        manifest["sources"].append({"app": name, "json": files[-1] if name != "app" else "data/app.json",
                                    "pageData": files[0], "fetchedAt": at, "status": status})
    if not only:
        manifest["sources"].append({"app": "home", "json": "data/home.json", "pageData": "home/hero-snapshot.js",
                                    "fetchedAt": next((s["fetchedAt"] for s in manifest["sources"] if s["app"] == "app"), None),
                                    "status": next((s["status"] for s in manifest["sources"] if s["app"] == "app"), None)})
        write(site, "data/index.json", manifest)
    print("%d of %d sources refreshed" % (ok, len(SOURCES) if not only else len(only)))


if __name__ == "__main__":
    main()
