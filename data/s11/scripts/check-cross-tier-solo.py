import json
import os
import re

root = os.path.join(os.path.dirname(__file__), "..")
fixtures = json.load(open(os.path.join(root, "fixtures.json"), encoding="utf-8"))
players = json.load(open(os.path.join(root, "players.json"), encoding="utf-8"))["players"]
tier_by = {(p.get("displayName") or "").strip(): (p.get("tier") or "").strip() for p in players}


def plan(r):
    rd = next((x for x in fixtures.get("rounds", []) if x.get("round") == r), None)
    return {s["slot"]: s for s in (rd or {}).get("slotPlan", [])}


mismatches = []
for f in sorted(os.listdir(os.path.join(root, "results"))):
    if not re.match(r"^s11-r\d+-m\d+\.json$", f):
        continue
    doc = json.load(open(os.path.join(root, "results", f), encoding="utf-8"))
    rnum = doc.get("round")
    pmap = plan(rnum)
    for mu in doc.get("matchups", []):
        for sl in mu.get("slots", []):
            sp = pmap.get(sl.get("slot"))
            if not sp or sp.get("format") != "1v1" or not sp.get("tierLine"):
                continue
            st = sp["tierLine"].strip()
            for side in ("teamA", "teamB"):
                for row in sl.get(side) or []:
                    name = (row.get("displayName") or row.get("playerName") or "").strip()
                    if not name:
                        continue
                    pt = tier_by.get(name, "")
                    if pt != st:
                        mismatches.append(
                            {
                                "file": f,
                                "fixtureId": mu.get("fixtureId"),
                                "round": rnum,
                                "slot": sl.get("slot"),
                                "slotTier": st,
                                "map": sp.get("map"),
                                "player": name,
                                "playerTier": pt or "(미등록)",
                            }
                        )

for m in mismatches:
    print(
        f"{m['round']}R #{m['slot']} {m['slotTier']}({m['map']}) | "
        f"{m['player']} 선수티어={m['playerTier']} | {m['fixtureId']}"
    )
print(f"--- 총 {len(mismatches)}건 ---")
