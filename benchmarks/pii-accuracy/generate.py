"""Builds a labelled test set for PII detection (seeded, so it is reproducible).

Every document is a sentence or two of business-style text. `gold` lists the character span and type of each real
piece of personal data; documents with an empty `gold` are hard negatives (look-alikes that are NOT personal data).
Run: python3 generate.py > dataset.json
"""
import json, random

random.seed(20261114)

FIRST = ["Priya", "Rahul", "Anita", "Vikram", "Sneha", "Arjun", "Meera", "Karan", "Divya", "Rohan", "Fatima", "Imran", "John", "Emily", "Michael", "Sarah", "David", "Laura", "Carlos", "Sofia", "Wei", "Yuki", "Ahmed", "Olga"]
LAST = ["Sharma", "Patel", "Iyer", "Reddy", "Nair", "Gupta", "Khan", "Singh", "Mehta", "Chawla", "Smith", "Johnson", "Brown", "Garcia", "Miller", "Chen", "Tanaka", "Hassan", "Petrov", "Rossi"]
CITIES = ["Mumbai", "Delhi", "Bengaluru", "Chennai", "Hyderabad", "Pune", "Kolkata", "London", "Berlin", "Austin", "Toronto", "Dubai"]
STREETS = ["MG Road", "Park Street", "Linking Road", "Elm Street", "Baker Street", "Hauptstrasse", "Main Street", "Residency Road"]
DOMAINS = ["example.com", "mail.in", "company.co.in", "gmail.com", "outlook.com", "corp.org"]
UPI_HANDLES = ["okaxis", "okhdfcbank", "okicici", "oksbi", "ybl", "paytm", "ibl", "apl"]
BANKS = ["HDFC", "ICIC", "SBIN", "UTIB", "PUNB", "KKBK"]
PAN_TYPE = "ABCFGHLJPT"
GSTCH = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"

D = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]]
P = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]]
INV = [0,4,3,2,1,5,6,7,8,9]

def verhoeff_check(s):
    c = 0
    for i, ch in enumerate(reversed(s)):
        c = D[c][P[(i + 1) % 8][int(ch)]]
    return str(INV[c])

def verhoeff_ok(s):
    c = 0
    for i, ch in enumerate(reversed(s)):
        c = D[c][P[i % 8][int(ch)]]
    return c == 0

def luhn_ok(s):
    t, alt = 0, False
    for ch in reversed(s):
        n = int(ch)
        if alt:
            n *= 2
            if n > 9: n -= 9
        t += n; alt = not alt
    return t % 10 == 0

def rd(n): return "".join(random.choice("0123456789") for _ in range(n))
def rl(n): return "".join(random.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ") for _ in range(n))

def name(): return f"{random.choice(FIRST)} {random.choice(LAST)}"
def email():
    n = f"{random.choice(FIRST)}.{random.choice(LAST)}".lower() if random.random() < .6 else f"{random.choice(FIRST).lower()}{random.randint(1,99)}"
    return f"{n}@{random.choice(DOMAINS)}"
def phone_us():
    a, b, c = random.randint(201, 989), random.randint(200, 999), rd(4)
    return random.choice([f"{a}-{b}-{c}", f"({a}) {b}-{c}", f"+1 {a}-{b}-{c}", f"{a}.{b}.{c}"])
def phone_in():
    d = random.choice("6789") + rd(4) + rd(5)
    return random.choice([f"+91 {d}", f"+91-{d[:5]} {d[5:]}", f"{d[:5]} {d[5:]}", d])
def ssn(): return f"{random.randint(100,899)}-{random.randint(10,99)}-{random.randint(1000,9999)}"
def card():
    while True:
        pre = random.choice(["4", "51", "52", "37", "6011"])
        n = pre + rd((15 if pre == "37" else 16) - len(pre))
        if luhn_ok(n):
            return f"{n[:4]} {n[4:8]} {n[8:12]} {n[12:]}" if len(n) == 16 else f"{n[:4]} {n[4:10]} {n[10:]}"
def aadhaar():
    base = str(random.randint(2, 9)) + rd(10)
    n = base + verhoeff_check(base)
    sep = random.choice([" ", "-"])
    return f"{n[:4]}{sep}{n[4:8]}{sep}{n[8:]}"
def pan(): return rl(3) + random.choice(PAN_TYPE) + rl(1) + rd(4) + rl(1)
def gstin():
    s = rd(2) + pan() + random.choice("123456789") + "Z"
    tot = 0
    for i, ch in enumerate(s):
        v = GSTCH.index(ch); pr = v * (1 if i % 2 == 0 else 2); tot += pr // 36 + pr % 36
    return s + GSTCH[(36 - tot % 36) % 36]
def upi(): return f"{random.choice(FIRST).lower()}{random.choice(['.', '', '_'])}{random.choice(LAST).lower()}@{random.choice(UPI_HANDLES)}"
def ifsc(): return random.choice(BANKS) + "0" + "".join(random.choice("0123456789ABCDEFGHJKLMNPQRSTUVWXYZ") for _ in range(6))
def address(): return f"{random.randint(1, 240)} {random.choice(STREETS)}, {random.choice(CITIES)}"
def city(): return random.choice(CITIES)

# (label, generator, templates). {} marks where the value goes.
POSITIVE = [
    ("EMAIL", email, ["Please send the invoice to {} by Friday.", "Contact: {}", "User {} reported the login problem.", "Reply to {} with the signed copy."]),
    ("PHONE", phone_us, ["Call me on {} after lunch.", "Customer phone: {}", "Reach the front desk at {}."]),
    ("PHONE", phone_in, ["Please call {} to confirm delivery.", "WhatsApp number: {}", "Mobile on file: {}"]),
    ("SSN", ssn, ["Employee SSN {} was submitted with the W-4.", "SSN: {}", "Verify identity using {}."]),
    ("CARD", card, ["Charge the card {} for the renewal.", "Card on file: {}", "The customer typed {} into the chat."]),
    ("AADHAAR", aadhaar, ["KYC document: Aadhaar {}", "Customer Aadhaar number is {}.", "Please verify {} against the UIDAI record."]),
    ("PAN", pan, ["PAN {} is required for the TDS certificate.", "Vendor PAN: {}", "Enter PAN {} in the form."]),
    ("GSTIN", gstin, ["Bill to GSTIN {}.", "Supplier GSTIN: {}", "The invoice shows {} as registration."]),
    ("UPI", upi, ["Pay the refund to {} today.", "UPI ID: {}", "Send Rs 500 to {}."]),
    ("IFSC", ifsc, ["Transfer to account 004512 with IFSC {}.", "Bank IFSC: {}", "Branch code {} was entered."]),
    ("PERSON", name, ["{} joined the call at ten.", "Meeting notes from {}.", "Assign the ticket to {}.", "The contract was signed by {} yesterday."]),
    ("LOCATION", address, ["Ship the parcel to {}.", "Registered office: {}", "He lives at {}."]),
    ("LOCATION", city, ["The team is based in {}.", "We open a new office in {} next year."]),
]

def fake_aadhaar():
    while True:
        s = str(random.randint(2, 9)) + rd(11)
        if not verhoeff_ok(s): return f"{s[:4]} {s[4:8]} {s[8:]}"
def fake_card():
    while True:
        s = random.choice(["4", "5"]) + rd(15)
        if not luhn_ok(s): return f"{s[:4]} {s[4:8]} {s[8:12]} {s[12:]}"

NEGATIVE = [
    ("order number {}", fake_aadhaar), ("Tracking ID {}", fake_card), ("invoice #{}", lambda: rd(10)),
    ("version {}", lambda: f"{random.randint(1,20)}.{random.randint(0,30)}.{random.randint(0,99)}"),
    ("SKU {}", lambda: rl(5) + rd(4) + rl(1)), ("released on {}", lambda: f"{random.randint(2020,2026)}-{random.randint(1,12):02d}-{random.randint(1,28):02d}"),
    ("build {}", lambda: rd(12)), ("ISBN 978-{}", lambda: f"{rd(1)}-{rd(4)}-{rd(4)}-{rd(1)}"),
    ("the handle @{} on the forum", lambda: random.choice(FIRST).lower()), ("ticket {}", lambda: f"{rl(4)}-{rd(5)}"),
    ("part number {}", lambda: f"{rl(3)}{rd(6)}"), ("{} tokens used", lambda: f"{random.randint(1000, 99999):,}"),
    ("code {}", lambda: rl(4) + "0" + rl(2) + rd(3)),
]

docs = []
for label, gen, templates in POSITIVE:
    for _ in range(45):
        v = gen(); t = random.choice(templates)
        text = t.replace("{}", v); i = text.index(v)
        docs.append({"text": text, "gold": [{"type": label, "start": i, "end": i + len(v)}]})
for _ in range(220):
    t, g = random.choice(NEGATIVE)
    docs.append({"text": ("Note: " + t.replace("{}", g()) + "."), "gold": []})
# mixed documents with several entities
for _ in range(60):
    n, e, p, c = name(), email(), phone_us(), city()
    text = f"{n} ({e}, {p}) works from {c}."
    gold = []
    for typ, v in [("PERSON", n), ("EMAIL", e), ("PHONE", p), ("LOCATION", c)]:
        i = text.index(v, gold[-1]["end"] if gold else 0) if False else text.index(v); gold.append({"type": typ, "start": i, "end": i + len(v)})
    docs.append({"text": text, "gold": gold})
random.shuffle(docs)
print(json.dumps(docs, ensure_ascii=False))
