# PII detection accuracy: Maskea vs Microsoft Presidio (2026-11-14)

A small, reproducible test of how well each tool finds personal data in text. Everything here is synthetic and generated with a fixed seed
(`generate.py`), so anyone can rerun it. **It is a first test written by the Maskea team, not an independent benchmark**; read the limits below.

## Test set
865 short business-style documents: 605 contain one or more real items (825 labelled spans) and 220 are "look-alikes" that are *not*
personal data (order numbers that fail the Aadhaar check, 16-digit numbers that fail the card check, SKUs, version numbers, dates, ISBNs).
Types: email, phone (US and Indian), US SSN, card number, Aadhaar, PAN, GSTIN, UPI ID, IFSC, person name, location.

A prediction counts as correct when it has the right type and overlaps the labelled span. Anything else is a false positive.

## Systems
- **Maskea (all types on)**: `@nopeatech/maskea` `pii()` rules with the India types switched on (`detectPii`).
- **Maskea (defaults)**: the types on out of the box (email, US phone, SSN, card).
- **Presidio**: `presidio-analyzer` default recognizers with spaCy `en_core_web_sm`.
- **Presidio + India**: the same, with its Aadhaar, PAN and GSTIN recognizers added (they are not enabled by default).

## Results (precision / recall / F1)
| Type | Maskea, all types | Maskea, defaults | Presidio + India |
|---|---|---|---|
| Email | 100 / 100 / 100 | 100 / 100 / 100 | 100 / 100 / 100 |
| Phone | 96.8 / 100 / 98.4 | 100 / 70.0 / 82.4 | 86.3 / 96.7 / 91.2 |
| US SSN | 100 / 100 / 100 | 100 / 100 / 100 | 100 / 100 / 100 |
| Card | 100 / 100 / 100 | 100 / 100 / 100 | 100 / 100 / 100 |
| Aadhaar | 91.8 / 100 / 95.7 | not on | 83.3 / 100 / 90.9 |
| PAN | 84.9 / 100 / 91.8 | not on | 46.9 / 100 / 63.8 |
| GSTIN | 100 / 100 / 100 | not on | 100 / 24.4 / 39.3 |
| UPI ID | 100 / 100 / 100 | not on | not supported |
| IFSC | 100 / 100 / 100 | not on | not supported |
| Person name | **not supported** | not supported | 57.1 / 100 / 72.7 |
| Location / address | **not supported** | not supported | 89.7 / 86.7 / 88.1 |

| Overall | Precision | Recall | False positives | Missed | Look-alike documents wrongly flagged |
|---|---|---|---|---|---|
| Maskea, all types | 97.1% | 69.1% | 17 | 255 | 17 of 220 |
| Maskea, defaults | 100% | 36.4% | 0 | 525 | 0 of 220 |
| Presidio | 83.1% | 69.7% | 117 | 250 | 39 of 220 |
| Presidio + India | 79.2% | 81.9% | 177 | 149 | 69 of 220 |

## What it shows
- **Maskea is stricter.** Checksums (Luhn for cards, Verhoeff for Aadhaar, the GSTIN check character) keep look-alike numbers from being masked.
  Presidio flags more look-alikes (39 to 69 of 220 against 17) and has a lower precision.
- **Presidio finds names and addresses; Maskea does not.** That is the real gap and the main reason Presidio's recall is higher overall. Maskea cannot
  yet find a person's name or street address in free text. Fixing this is the biggest item on the Maskea list.
- **Defaults miss a lot of Indian data**, because the India types are off unless asked for.
- **A first run exposed two flaws in our own card detection** (no Luhn check, American Express 4-6-5 layout not matched). Both were fixed after this
  run started; the table above is after the fix (card was 75 / 80 before).

## Limits (read before quoting)
1. We wrote the test set, including types we built detectors for (UPI, IFSC), so those scores say little about the real world. Presidio does not claim them.
2. PAN and phone false positives come from look-alikes made deliberately hard (random SKUs that fit the PAN shape by chance, 10-digit invoice numbers that fit
   an Indian mobile number). Real text has fewer of them, or different ones.
3. Presidio ran with the small spaCy model. The large model usually improves names and locations.
4. 865 documents of one style; no non-English text, no long documents, no names in other scripts.
5. Not tested: Maskea's secrets and API-key detection, response redaction, speed. Lakera, LLM Guard and other tools are not covered.

## Rerun
```
python3 generate.py > dataset.json
npm run build   # in the repo root
node run-maskea.mjs dataset.json all && node run-maskea.mjs dataset.json default
pip install presidio-analyzer && python -m spacy download en_core_web_sm
python3 run-presidio.py dataset.json && python3 run-presidio.py dataset.json india
python3 score.py maskea-all maskea-default presidio presidio-india
```
