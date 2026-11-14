"""Scores prediction files against dataset.json. A prediction is correct when it has the same type as a gold span and overlaps it;
anything else is a false positive. Types a system does not claim to detect score recall 0 and are shown as 'n/a' for precision."""
import json, sys, os
here = os.path.dirname(os.path.abspath(__file__))
SET = os.environ.get("SET", "")  # "" = main set, "-unseen" = held-out names
docs = json.load(open(os.path.join(here, f"dataset{SET}.json")))
systems = sys.argv[1:]
TYPES = ["EMAIL", "PHONE", "SSN", "CARD", "AADHAAR", "PAN", "GSTIN", "UPI", "IFSC", "PERSON", "LOCATION", "CITY"]
# A predicted LOCATION (street address or place) also counts for a gold CITY.
def same(pt, gt): return pt == gt or (pt == "LOCATION" and gt == "CITY")
def overlap(a, b): return a["start"] < b["end"] and b["start"] < a["end"]
rows = {}
for name in systems:
    preds = json.load(open(os.path.join(here, f"predictions-{name}{SET}.json")))
    claimed = {p["type"] for doc in preds for p in doc}
    stat = {t: [0, 0, 0] for t in TYPES}  # tp, fp, fn
    for d, ps in zip(docs, preds):
        for g in d["gold"]:
            hit = any(same(p["type"], g["type"]) and overlap(p, g) for p in ps)
            stat[g["type"]][0 if hit else 2] += 1
        for p in ps:
            if p["type"] in stat and not any(same(p["type"], g["type"]) and overlap(p, g) for g in d["gold"]): stat[p["type"]][1] += 1
    rows[name] = (stat, claimed)
def fmt(x): return "n/a" if x is None else f"{x*100:5.1f}%"
print(f"{'type':9}" + "".join(f"| {n[:22]:22} P / R / F1        " for n in systems))
for t in TYPES:
    line = f"{t:9}"
    for n in systems:
        tp, fp, fn = rows[n][0][t]
        p = tp / (tp + fp) if tp + fp else None
        r = tp / (tp + fn) if tp + fn else None
        f = 2 * p * r / (p + r) if p and r else (0.0 if r is not None else None)
        line += f"| {fmt(p)} {fmt(r)} {fmt(f)}   " + " " * 12
    print(line)
tot = {}
for n in systems:
    tp = sum(v[0] for v in rows[n][0].values()); fp = sum(v[1] for v in rows[n][0].values()); fn = sum(v[2] for v in rows[n][0].values())
    p = tp / (tp + fp) if tp + fp else 0; r = tp / (tp + fn) if tp + fn else 0
    print(f"OVERALL {n}: precision {p*100:.1f}%  recall {r*100:.1f}%  false positives {fp}  missed {fn}  (true hits {tp})")
neg = [i for i, d in enumerate(docs) if not d["gold"]]
for n in systems:
    preds = json.load(open(os.path.join(here, f"predictions-{n}{SET}.json")))
    bad = sum(1 for i in neg if preds[i])
    print(f"look-alike documents wrongly flagged by {n}: {bad} of {len(neg)}")
