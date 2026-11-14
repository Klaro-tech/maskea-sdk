# Changelog

## 1.2.0
- India identifiers for `pii()`, opt-in by name: `aadhaar` (Verhoeff check digit verified), `pan`, `gstin` (check character verified), `ifsc`, `upi`, `in_phone`.
- Opt-in rule-based `name` (after a title or label, or a common first name plus surname) and `address` (street addresses, PIN codes after "PIN"). They do not find unfamiliar names in plain text; see `benchmarks/pii-accuracy`.
- `pii({ detectors })`: plug in a trained detector or a Presidio service. Fails closed by default (`onDetectorError`).
- Credit cards now need a valid Luhn check digit, and the American Express 4-6-5 layout is matched. Look-alike 16-digit numbers are no longer masked.
- `detectPii(text, types?)` returns the type and range of each match without changing the text.
- `RedactionRule` accepts an optional `validate` check.
- PII accuracy benchmark against Microsoft Presidio in `benchmarks/pii-accuracy`.

## 1.1.0
Tripwire, honey records, drill, `holdAction`.
